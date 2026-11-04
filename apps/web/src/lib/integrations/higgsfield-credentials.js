/**
 * Higgsfield API Key ID + Secret for Integrations.
 * Prefer Vercel env (HIGGSFIELD_API_KEY_ID / HIGGSFIELD_API_KEY_SECRET + HF_* aliases).
 * When Vercel upsert is unavailable, persist encrypted in Supabase like Anthropic/Shopify.
 * Never logs or returns secret values. Status-only UI (no dashboard paste fields).
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { ADMIN_EMAIL } from "@/lib/auth/supabase-auth";
import { connectionLabel } from "./brand-labels";
import { decryptSecret, encryptSecret } from "./credential-crypto";
import { hasHiggsfieldEnv } from "./env-presence";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getLocalDataDir } from "@/lib/local-data-dir";

const TABLE = "integration_secrets";
const WORKSPACE_ID = "triada-ops";
const PROVIDER = "higgsfield";
const SECRET_TYPE = "credentials";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "integration-secrets.json");

/**
 * @typedef {{ key_id?: string, key_secret?: string }} HiggsfieldCredentialFields
 */

/** @param {unknown} value */
function nonempty(value) {
  return Boolean(value && String(value).trim());
}

/** Key ID from Console — UUID-ish or opaque alphanumeric. */
export function isValidHiggsfieldKeyId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9_-]{8,128}$/.test(id);
}

/** Key Secret — hex or opaque token, min length. */
export function isValidHiggsfieldKeySecret(value) {
  const secret = String(value || "").trim();
  return /^[A-Za-z0-9_-]{16,256}$/.test(secret);
}

function envKeyId() {
  return (
    (process.env.HIGGSFIELD_API_KEY_ID || "").trim() ||
    (process.env.HF_API_KEY_ID || "").trim()
  );
}

function envKeySecret() {
  return (
    (process.env.HIGGSFIELD_API_KEY_SECRET || "").trim() ||
    (process.env.HF_API_KEY_SECRET || "").trim()
  );
}

/**
 * Presence-only status (never includes secrets).
 * @param {{ has_credentials: boolean, source?: string, summary?: string }} opts
 */
export function higgsfieldStatusPayload(opts) {
  const has = Boolean(opts.has_credentials);
  const status = has ? "connected" : "awaiting_credentials";
  const summary =
    opts.summary ||
    (has ? "Higgsfield is connected." : "Waiting credentials.");
  return {
    provider: PROVIDER,
    display_name: "Higgsfield",
    status,
    status_label: connectionLabel(status, { hasCredentials: has }),
    has_credentials: has,
    mode: has ? "live" : "local",
    source: opts.source || (has ? "stored" : "none"),
    summary,
    honesty: summary,
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
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function readAppMetadataSecret(supabase) {
  const userId = await findAdminUserId(supabase);
  if (!userId) return null;
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  const blob = data.user.app_metadata?.triada_secrets?.higgsfield;
  if (!blob || typeof blob !== "object") return null;
  if (typeof blob.ciphertext !== "string" || !blob.ciphertext) return null;
  return {
    ciphertext: blob.ciphertext,
    storage: "supabase_app_metadata",
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ ciphertext: string } | null} payload
 */
async function writeAppMetadataSecret(supabase, payload) {
  const userId = await findAdminUserId(supabase);
  if (!userId) return { ok: false, reason: "admin_user_missing" };
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    return { ok: false, reason: error?.message || "user_read_failed" };
  }

  const prevMeta = { ...(data.user.app_metadata || {}) };
  const prevSecrets =
    prevMeta.triada_secrets && typeof prevMeta.triada_secrets === "object"
      ? { ...prevMeta.triada_secrets }
      : {};

  if (!payload) {
    delete prevSecrets.higgsfield;
  } else {
    prevSecrets.higgsfield = {
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

/** @returns {Promise<{ ciphertext?: string, storage: string } | null>} */
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
 * Normalize stored JSON / aliases to Key ID + Secret (never logs values).
 * Accepts key_id / key_secret (canonical), api_key_* input aliases, and camelCase.
 * @param {Record<string, unknown>} fields
 * @returns {{ key_id: string, key_secret: string }}
 */
function normalizeCredentialFields(fields) {
  const raw = fields && typeof fields === "object" ? fields : {};
  const keyId = String(
    raw.key_id ||
      raw.api_key_id ||
      raw.keyId ||
      raw.apiKeyId ||
      raw.hf_api_key_id ||
      "",
  ).trim();
  const keySecret = String(
    raw.key_secret ||
      raw.api_key_secret ||
      raw.keySecret ||
      raw.apiKeySecret ||
      raw.hf_api_key_secret ||
      "",
  ).trim();
  return { key_id: keyId, key_secret: keySecret };
}

/**
 * @param {string} ciphertext
 * @returns {HiggsfieldCredentialFields}
 */
function decryptFields(ciphertext) {
  try {
    const raw = decryptSecret(ciphertext);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return normalizeCredentialFields(
      /** @type {Record<string, unknown>} */ (parsed),
    );
  } catch {
    return {};
  }
}

/** @returns {Promise<HiggsfieldCredentialFields>} */
async function loadStoredFields() {
  const stored = await readStoredRow();
  if (!stored?.ciphertext) return {};
  return decryptFields(stored.ciphertext);
}

/**
 * Resolve Key ID + Secret from env first, then Integrations store
 * (supabase_table → app_metadata → local) — same pattern as Anthropic/Shopify.
 * Creative image gen must use this path; Vercel env is optional when store Connected.
 * @returns {Promise<{ keyId: string, keySecret: string, source: string } | null>}
 */
export async function resolveHiggsfieldCredentialsAsync() {
  const envId = envKeyId();
  const envSecret = envKeySecret();
  if (envId && envSecret) {
    return { keyId: envId, keySecret: envSecret, source: "env" };
  }

  const stored = await readStoredRow();
  if (!stored?.ciphertext) return null;

  const fields = decryptFields(stored.ciphertext);
  if (nonempty(fields.key_id) && nonempty(fields.key_secret)) {
    return {
      keyId: String(fields.key_id).trim(),
      keySecret: String(fields.key_secret).trim(),
      source: stored.storage || "stored",
    };
  }
  return null;
}

/** @returns {Promise<boolean>} */
export async function hasHiggsfieldCredentials() {
  if (hasHiggsfieldEnv()) return true;
  const creds = await resolveHiggsfieldCredentialsAsync();
  return Boolean(creds?.keyId && creds?.keySecret);
}

/**
 * Presence-only credential source for Creative status / asset metadata.
 * Never returns secret values.
 * @returns {Promise<{ has_credentials: boolean, source: string }>}
 */
export async function getHiggsfieldCredentialSource() {
  const creds = await resolveHiggsfieldCredentialsAsync();
  if (!creds) return { has_credentials: false, source: "none" };
  return { has_credentials: true, source: creds.source };
}

/** @returns {Promise<ReturnType<typeof higgsfieldStatusPayload>>} */
export async function getHiggsfieldStatus() {
  if (hasHiggsfieldEnv()) {
    return higgsfieldStatusPayload({
      has_credentials: true,
      source: "env",
      summary: "Higgsfield is connected.",
    });
  }

  const stored = await readStoredRow();
  if (stored?.ciphertext) {
    const fields = decryptFields(stored.ciphertext);
    if (nonempty(fields.key_id) && nonempty(fields.key_secret)) {
      return higgsfieldStatusPayload({
        has_credentials: true,
        source: stored.storage,
        summary: "Higgsfield is connected.",
      });
    }
  }

  return higgsfieldStatusPayload({ has_credentials: false });
}

/**
 * Persist Key ID + Secret (agent/API path; Integrations UI stays status-only).
 * @param {{ key_id?: string, key_secret?: string, api_key_id?: string, api_key_secret?: string }} input
 */
export async function saveHiggsfieldCredentials(input) {
  const keyId = String(
    input?.key_id || input?.api_key_id || "",
  ).trim();
  const keySecret = String(
    input?.key_secret || input?.api_key_secret || "",
  ).trim();

  if (keyId && !isValidHiggsfieldKeyId(keyId)) {
    return {
      ok: false,
      status: 422,
      message: "Invalid Higgsfield API Key ID format.",
    };
  }
  if (keySecret && !isValidHiggsfieldKeySecret(keySecret)) {
    return {
      ok: false,
      status: 422,
      message: "Invalid Higgsfield API Key Secret format.",
    };
  }

  const existing = await loadStoredFields();
  const next = {
    key_id: keyId || existing.key_id || "",
    key_secret: keySecret || existing.key_secret || "",
  };

  if (!nonempty(next.key_id) || !nonempty(next.key_secret)) {
    if (hasHiggsfieldEnv()) {
      return {
        ok: true,
        higgsfield: higgsfieldStatusPayload({
          has_credentials: true,
          source: "env",
        }),
        storage: "env",
      };
    }
    return {
      ok: false,
      status: 422,
      message: "Provide both Higgsfield API Key ID and Secret.",
    };
  }

  const ciphertext = encryptSecret(JSON.stringify(next));
  const meta = {
    provider: PROVIDER,
    has_credentials: true,
    has_key_id: true,
    has_key_secret: true,
    source: "integrations_api",
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
    higgsfield: higgsfieldStatusPayload({
      has_credentials: true,
      source: storage,
      summary: "Higgsfield is connected.",
    }),
    storage,
  };
}

/** Clear Integrations-stored Higgsfield keys (env unaffected). */
export async function clearHiggsfieldCredentials() {
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
  if (local?.[PROVIDER]) {
    delete local[PROVIDER];
    await writeLocalStore(local);
    if (storage === "none") storage = "local_mock";
  }

  return {
    ok: true,
    higgsfield: await getHiggsfieldStatus(),
    storage,
  };
}
