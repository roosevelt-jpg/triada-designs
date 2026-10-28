import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { ADMIN_EMAIL } from "@/lib/auth/supabase-auth";
import { connectionLabel, providerNickname } from "./brand-labels";
import { decryptSecret, encryptSecret } from "./credential-crypto";
import {
  hasMetaAppId,
  hasMetaPageToken,
  hasWhatsAppBusinessId,
  hasWhatsAppPhoneId,
  hasWhatsAppToken,
} from "./env-presence";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TABLE = "integration_secrets";
const WORKSPACE_ID = "triada-ops";
const PROVIDER = "meta";
const SECRET_TYPE = "credentials";
const LOCAL_DIR = path.join(process.cwd(), ".triada-local");
const LOCAL_FILE = path.join(LOCAL_DIR, "integration-secrets.json");

/**
 * @typedef {{
 *   app_id?: string,
 *   app_secret?: string,
 *   page_access_token?: string,
 *   wa_access_token?: string,
 *   wa_phone_number_id?: string,
 *   wa_business_account_id?: string,
 *   verify_token?: string,
 * }} MetaCredentialFields
 */

/**
 * @typedef {{
 *   has_app_id: boolean,
 *   has_app_secret: boolean,
 *   has_page_access_token: boolean,
 *   has_wa_access_token: boolean,
 *   has_wa_phone_number_id: boolean,
 *   has_wa_business_account_id: boolean,
 *   has_verify_token: boolean,
 *   facebook_ready: boolean,
 *   messenger_ready: boolean,
 *   instagram_ready: boolean,
 *   whatsapp_ready: boolean,
 *   connected: boolean,
 *   status: string,
 *   status_label: string,
 *   source?: string,
 *   summary?: string,
 * }} MetaStatusPayload
 */

/** @param {unknown} value */
function nonempty(value) {
  return Boolean(value && String(value).trim());
}

/**
 * Presence flags from a decrypted fields object (never expose values).
 * @param {MetaCredentialFields} [fields]
 */
export function metaPresenceFromFields(fields = {}) {
  const has_app_id = nonempty(fields.app_id) || hasMetaAppId();
  const has_app_secret = nonempty(fields.app_secret);
  const has_page_access_token = nonempty(fields.page_access_token) || hasMetaPageToken();
  const has_wa_access_token = nonempty(fields.wa_access_token) || hasWhatsAppToken();
  const has_wa_phone_number_id =
    nonempty(fields.wa_phone_number_id) || hasWhatsAppPhoneId();
  const has_wa_business_account_id =
    nonempty(fields.wa_business_account_id) || hasWhatsAppBusinessId();
  const has_verify_token = nonempty(fields.verify_token);

  // FB / Messenger / IG share Page Graph credentials: App ID + page token.
  const pageReady = has_app_id && has_page_access_token;
  // WhatsApp Cloud: access token (phone id preferred when saving via UI).
  const whatsapp_ready = has_wa_access_token;

  return {
    has_app_id,
    has_app_secret,
    has_page_access_token,
    has_wa_access_token,
    has_wa_phone_number_id,
    has_wa_business_account_id,
    has_verify_token,
    facebook_ready: pageReady,
    messenger_ready: pageReady,
    instagram_ready: pageReady,
    whatsapp_ready,
    connected: pageReady || whatsapp_ready,
  };
}

/**
 * @param {ReturnType<typeof metaPresenceFromFields> & { source?: string, summary?: string }} opts
 * @returns {MetaStatusPayload}
 */
export function metaStatusPayload(opts) {
  const status = opts.connected ? "connected" : "awaiting_credentials";
  const summary =
    opts.summary ||
    (opts.connected
      ? "Meta messaging credentials are connected for dashboard ops."
      : "Add Meta App ID, Page token, and WhatsApp Cloud credentials on Integrations.");
  return {
    has_app_id: Boolean(opts.has_app_id),
    has_app_secret: Boolean(opts.has_app_secret),
    has_page_access_token: Boolean(opts.has_page_access_token),
    has_wa_access_token: Boolean(opts.has_wa_access_token),
    has_wa_phone_number_id: Boolean(opts.has_wa_phone_number_id),
    has_wa_business_account_id: Boolean(opts.has_wa_business_account_id),
    has_verify_token: Boolean(opts.has_verify_token),
    facebook_ready: Boolean(opts.facebook_ready),
    messenger_ready: Boolean(opts.messenger_ready),
    instagram_ready: Boolean(opts.instagram_ready),
    whatsapp_ready: Boolean(opts.whatsapp_ready),
    connected: Boolean(opts.connected),
    status,
    status_label: connectionLabel(status, { hasCredentials: Boolean(opts.connected) }),
    source: opts.source || (opts.connected ? "stored" : "none"),
    summary,
  };
}

async function readLocalStore() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** @param {Record<string, unknown>} data */
async function writeLocalStore(data) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(data, null, 2), "utf8");
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function findAdminUserId(supabase) {
  const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listed.error) return null;
  const hit = (listed.data?.users || []).find(
    (u) => (u.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase(),
  );
  return hit?.id || null;
}

/**
 * @returns {Promise<{ ciphertext?: string, storage: string } | null>}
 */
async function readStoredRow() {
  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("ciphertext, metadata, key_version")
        .eq("workspace_id", WORKSPACE_ID)
        .eq("provider", PROVIDER)
        .eq("secret_type", SECRET_TYPE)
        .maybeSingle();

      if (!error && data?.ciphertext) {
        return { ciphertext: data.ciphertext, storage: "supabase_table" };
      }

      const fromMeta = await readAppMetadataSecret(supabase);
      if (fromMeta) return fromMeta;
    }
  }

  const local = await readLocalStore();
  const row = local?.[PROVIDER];
  if (row && typeof row === "object" && typeof row.ciphertext === "string") {
    return { ciphertext: row.ciphertext, storage: "local_mock" };
  }
  return null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function readAppMetadataSecret(supabase) {
  const userId = await findAdminUserId(supabase);
  if (!userId) return null;
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  const blob = data.user.app_metadata?.triada_secrets?.meta;
  if (!blob || typeof blob !== "object") return null;
  if (typeof blob.ciphertext !== "string" || !blob.ciphertext) return null;
  return { ciphertext: blob.ciphertext, storage: "supabase_app_metadata" };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ ciphertext: string } | null} payload
 */
async function writeAppMetadataSecret(supabase, payload) {
  const userId = await findAdminUserId(supabase);
  if (!userId) return { ok: false, reason: "admin_user_missing" };
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) return { ok: false, reason: error?.message || "user_read_failed" };

  const prevMeta = { ...(data.user.app_metadata || {}) };
  const prevSecrets =
    prevMeta.triada_secrets && typeof prevMeta.triada_secrets === "object"
      ? { ...prevMeta.triada_secrets }
      : {};

  if (!payload) {
    delete prevSecrets.meta;
  } else {
    prevSecrets.meta = {
      ciphertext: payload.ciphertext,
      has_credentials: true,
      key_version: "v1",
      updated_at: new Date().toISOString(),
    };
  }

  const updated = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...prevMeta,
      triada_secrets: prevSecrets,
    },
  });
  if (updated.error) return { ok: false, reason: updated.error.message };
  return { ok: true, storage: "supabase_app_metadata" };
}

/**
 * @param {string} ciphertext
 * @returns {MetaCredentialFields}
 */
function decryptFields(ciphertext) {
  try {
    const raw = decryptSecret(ciphertext);
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * @returns {Promise<MetaCredentialFields>}
 */
async function loadStoredFields() {
  const stored = await readStoredRow();
  if (!stored?.ciphertext) return {};
  return decryptFields(stored.ciphertext);
}

/**
 * Presence-only Meta status (env + Integrations store). Never returns secrets.
 * @returns {Promise<MetaStatusPayload>}
 */
export async function getMetaStatus() {
  const fields = await loadStoredFields();
  const presence = metaPresenceFromFields(fields);
  const stored = await readStoredRow();
  const source = presence.connected
    ? hasMetaAppId() || hasMetaPageToken() || hasWhatsAppToken()
      ? stored?.ciphertext
        ? "env+stored"
        : "env"
      : stored?.storage || "stored"
    : "none";
  return metaStatusPayload({
    ...presence,
    source,
  });
}

/**
 * @param {MetaCredentialFields} input
 * @returns {Promise<{ ok: true, meta: MetaStatusPayload, storage: string } | { ok: false, status: number, message: string }>}
 */
export async function saveMetaCredentials(input) {
  const incoming = {
    app_id: String(input?.app_id || "").trim(),
    app_secret: String(input?.app_secret || "").trim(),
    page_access_token: String(input?.page_access_token || "").trim(),
    wa_access_token: String(input?.wa_access_token || "").trim(),
    wa_phone_number_id: String(input?.wa_phone_number_id || "").trim(),
    wa_business_account_id: String(input?.wa_business_account_id || "").trim(),
    verify_token: String(input?.verify_token || "").trim(),
  };

  const existing = await loadStoredFields();
  /** @type {MetaCredentialFields} */
  const merged = {
    app_id: incoming.app_id || existing.app_id || "",
    app_secret: incoming.app_secret || existing.app_secret || "",
    page_access_token: incoming.page_access_token || existing.page_access_token || "",
    wa_access_token: incoming.wa_access_token || existing.wa_access_token || "",
    wa_phone_number_id: incoming.wa_phone_number_id || existing.wa_phone_number_id || "",
    wa_business_account_id:
      incoming.wa_business_account_id || existing.wa_business_account_id || "",
    verify_token: incoming.verify_token || existing.verify_token || "",
  };

  const presence = metaPresenceFromFields(merged);
  const anyIncoming = Object.values(incoming).some(Boolean);
  if (!anyIncoming && !presence.connected) {
    return {
      ok: false,
      status: 422,
      message:
        "Provide Meta App ID + Page access token (Facebook / Instagram / Messenger) and/or WhatsApp Cloud credentials.",
    };
  }

  // Soft validation: page messaging needs both app id and page token once any page field is touched.
  const pageTouched = Boolean(
    incoming.app_id || incoming.page_access_token || incoming.app_secret,
  );
  if (pageTouched && !(presence.has_app_id && presence.has_page_access_token)) {
    return {
      ok: false,
      status: 422,
      message:
        "Facebook / Instagram / Messenger need both Meta App ID and Page access token.",
    };
  }

  const waTouched = Boolean(
    incoming.wa_access_token ||
      incoming.wa_phone_number_id ||
      incoming.wa_business_account_id,
  );
  if (waTouched && !presence.has_wa_access_token) {
    return {
      ok: false,
      status: 422,
      message: "WhatsApp Cloud API needs an access token (META_WA_ACCESS_TOKEN).",
    };
  }

  if (!presence.connected) {
    return {
      ok: false,
      status: 422,
      message:
        "Provide Meta App ID + Page access token and/or a WhatsApp Cloud access token.",
    };
  }

  const ciphertext = encryptSecret(JSON.stringify(merged));
  const meta = {
    provider: PROVIDER,
    has_credentials: true,
    facebook_ready: presence.facebook_ready,
    messenger_ready: presence.messenger_ready,
    instagram_ready: presence.instagram_ready,
    whatsapp_ready: presence.whatsapp_ready,
    source: "integrations_ui",
    updated_at: new Date().toISOString(),
  };

  let storage = "local_mock";

  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      const { error } = await supabase.from(TABLE).upsert(
        {
          workspace_id: WORKSPACE_ID,
          provider: PROVIDER,
          secret_type: SECRET_TYPE,
          ciphertext,
          key_version: "v1",
          metadata: meta,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,provider,secret_type" },
      );

      if (!error) {
        storage = "supabase_table";
      } else {
        const metaWrite = await writeAppMetadataSecret(supabase, { ciphertext });
        if (metaWrite.ok) {
          storage = "supabase_app_metadata";
        } else {
          const local = await readLocalStore();
          local[PROVIDER] = { ciphertext, key_version: "v1", ...meta };
          await writeLocalStore(local);
          storage = "local_mock";
        }
      }
    }
  } else {
    const local = await readLocalStore();
    local[PROVIDER] = { ciphertext, key_version: "v1", ...meta };
    await writeLocalStore(local);
    storage = "local_mock";
  }

  return {
    ok: true,
    meta: metaStatusPayload({
      ...presence,
      source: storage,
      summary: "Meta messaging credentials saved. Channels will show Connected.",
    }),
    storage,
  };
}

/**
 * Clear Integrations-stored Meta credentials (env unaffected).
 * @returns {Promise<{ ok: true, meta: MetaStatusPayload, storage: string }>}
 */
export async function clearMetaCredentials() {
  let storage = "none";

  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      await supabase
        .from(TABLE)
        .delete()
        .eq("workspace_id", WORKSPACE_ID)
        .eq("provider", PROVIDER)
        .eq("secret_type", SECRET_TYPE);
      await writeAppMetadataSecret(supabase, null);
      storage = "supabase";
    }
  }

  const local = await readLocalStore();
  if (local[PROVIDER]) {
    delete local[PROVIDER];
    await writeLocalStore(local);
    if (storage === "none") storage = "local_mock";
  }

  const presence = metaPresenceFromFields({});
  return {
    ok: true,
    meta: metaStatusPayload({
      ...presence,
      source: presence.connected ? "env" : "none",
      summary: presence.connected
        ? "Stored Meta credentials cleared. Host env credentials remain connected."
        : "Stored Meta credentials cleared.",
    }),
    storage,
  };
}

/**
 * Channel health helper used by seed dual-run builders.
 * @param {string} key
 * @param {boolean} ready
 */
export function metaChannelHealth(key, ready) {
  return {
    status: ready ? "connected" : "awaiting_credentials",
    status_label: connectionLabel(ready ? "connected" : "awaiting_credentials"),
    health: {
      status: ready ? "healthy" : "awaiting_credentials",
      status_label: connectionLabel(ready ? "healthy" : "awaiting_credentials"),
      message: ready
        ? `${providerNickname(key === "messenger" ? "facebook" : key)} is connected.`
        : `${providerNickname(key === "messenger" ? "facebook" : key)} needs setup on Integrations.`,
    },
  };
}
