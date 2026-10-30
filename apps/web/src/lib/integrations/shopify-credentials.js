/**
 * Shopify Admin API credentials for Integrations.
 * Same persist path as Meta/Anthropic: Supabase table → Auth app_metadata → local mock.
 * Never logs or returns secret values.
 *
 * Client Credentials grant tokens expire (~24h). When client_id + client_secret
 * are stored, resolveShopifyAccessToken() refreshes before expiry.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { ADMIN_EMAIL } from "@/lib/auth/supabase-auth";
import { connectionLabel } from "./brand-labels";
import { decryptSecret, encryptSecret } from "./credential-crypto";
import {
  envPresent,
  envPresentAny,
  hasShopifyEnv,
  integrationRuntimeMode,
} from "./env-presence";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getLocalDataDir } from "@/lib/local-data-dir";

const TABLE = "integration_secrets";
const WORKSPACE_ID = "triada-ops";
const PROVIDER = "shopify";
const SECRET_TYPE = "credentials";
const DEFAULT_SHOP = "jwtjzw-nu.myshopify.com";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "integration-secrets.json");
/** Refresh this many seconds before Shopify's expires_in. */
const REFRESH_SKEW_SECONDS = 120;

/**
 * @typedef {{
 *   access_token?: string,
 *   client_id?: string,
 *   client_secret?: string,
 *   shop_domain?: string,
 *   expires_at?: string,
 *   scope?: string,
 * }} ShopifyCredentialFields
 */

/**
 * @typedef {{
 *   connected: boolean,
 *   has_access_token: boolean,
 *   has_client_id: boolean,
 *   has_client_secret: boolean,
 *   has_shop_domain: boolean,
 *   store: string,
 *   shop_domain: string,
 *   status: string,
 *   status_label: string,
 *   mode: string,
 *   summary: string,
 *   honesty: string,
 *   source?: string,
 *   scope?: string | null,
 *   expires_at?: string | null,
 *   can_refresh?: boolean,
 * }} ShopifyStatusPayload
 */

/** @param {unknown} value */
function nonempty(value) {
  return Boolean(value && String(value).trim());
}

function envAccessToken() {
  return (
    (process.env.SHOPIFY_ACCESS_TOKEN || "").trim() ||
    (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim()
  );
}

function envClientId() {
  return (
    (process.env.SHOPIFY_CLIENT_ID || "").trim() ||
    (process.env.SHOPIFY_API_KEY || "").trim()
  );
}

function envClientSecret() {
  return (
    (process.env.SHOPIFY_CLIENT_SECRET || "").trim() ||
    (process.env.SHOPIFY_API_SECRET || "").trim()
  );
}

export function normalizeShopifyShopDomain(raw) {
  const value =
    String(raw || "").trim() ||
    (process.env.SHOPIFY_SHOP_DOMAIN || "").trim() ||
    (process.env.SHOPIFY_STORE_DOMAIN || "").trim() ||
    DEFAULT_SHOP;
  return value
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

/**
 * @param {ShopifyCredentialFields} [fields]
 */
export function shopifyPresenceFromFields(fields = {}) {
  const has_access_token = nonempty(fields.access_token) || hasShopifyEnv();
  const has_client_id = nonempty(fields.client_id) || nonempty(envClientId());
  const has_client_secret =
    nonempty(fields.client_secret) || nonempty(envClientSecret());
  const shop_domain = normalizeShopifyShopDomain(fields.shop_domain);
  const has_shop_domain =
    envPresent("SHOPIFY_SHOP_DOMAIN") ||
    envPresent("SHOPIFY_STORE_DOMAIN") ||
    nonempty(fields.shop_domain) ||
    Boolean(DEFAULT_SHOP);
  const can_refresh = has_client_id && has_client_secret;
  const connected = has_access_token || can_refresh;

  return {
    has_access_token,
    has_client_id,
    has_client_secret,
    has_shop_domain,
    shop_domain,
    can_refresh,
    connected,
  };
}

/**
 * @param {ReturnType<typeof shopifyPresenceFromFields> & {
 *   source?: string,
 *   summary?: string,
 *   scope?: string | null,
 *   expires_at?: string | null,
 * }} opts
 * @returns {ShopifyStatusPayload}
 */
export function shopifyStatusPayloadFromPresence(opts) {
  const status = opts.connected ? "connected" : "awaiting_credentials";
  const mode = integrationRuntimeMode(opts.connected);
  const summary =
    opts.summary ||
    (opts.connected
      ? "Shopify is Connected."
      : "Waiting credentials.");
  return {
    connected: Boolean(opts.connected),
    has_access_token: Boolean(opts.has_access_token),
    has_client_id: Boolean(opts.has_client_id),
    has_client_secret: Boolean(opts.has_client_secret),
    has_shop_domain: Boolean(opts.has_shop_domain),
    store: opts.shop_domain,
    shop_domain: opts.shop_domain,
    status,
    status_label: connectionLabel(status, {
      hasCredentials: Boolean(opts.connected),
    }),
    mode,
    summary,
    honesty: summary,
    source: opts.source || (opts.connected ? "stored" : "none"),
    scope: opts.scope || null,
    expires_at: opts.expires_at || null,
    can_refresh: Boolean(opts.can_refresh),
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
  const blob = data.user.app_metadata?.triada_secrets?.shopify;
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
  if (error || !data?.user) {
    return { ok: false, reason: error?.message || "user_read_failed" };
  }

  const prevMeta = { ...(data.user.app_metadata || {}) };
  const prevSecrets =
    prevMeta.triada_secrets && typeof prevMeta.triada_secrets === "object"
      ? { ...prevMeta.triada_secrets }
      : {};

  if (!payload) {
    delete prevSecrets.shopify;
  } else {
    prevSecrets.shopify = {
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
 * @returns {ShopifyCredentialFields}
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

/** @returns {Promise<ShopifyCredentialFields>} */
async function loadStoredFields() {
  const stored = await readStoredRow();
  if (!stored?.ciphertext) return {};
  return decryptFields(stored.ciphertext);
}

/**
 * Persist encrypted fields. Returns storage label.
 * @param {ShopifyCredentialFields} fields
 */
async function persistFields(fields) {
  const ciphertext = encryptSecret(JSON.stringify(fields));
  const meta = {
    provider: PROVIDER,
    has_credentials: true,
    has_access_token: nonempty(fields.access_token),
    has_client_id: nonempty(fields.client_id),
    has_client_secret: nonempty(fields.client_secret),
    shop_domain: normalizeShopifyShopDomain(fields.shop_domain),
    scope: fields.scope || null,
    expires_at: fields.expires_at || null,
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

  return { storage, ciphertext };
}

/**
 * @param {string} shopDomain
 * @param {string} clientId
 * @param {string} clientSecret
 * @returns {Promise<{ ok: true, access_token: string, expires_in: number, scope: string } | { ok: false, status: number, message: string }>}
 */
async function exchangeClientCredentials(shopDomain, clientId, clientSecret) {
  const shop = normalizeShopifyShopDomain(shopDomain);
  const url = `https://${shop}/admin/oauth/access_token`;
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
    });
  } catch (err) {
    return {
      ok: false,
      status: 502,
      message:
        err instanceof Error
          ? "Shopify token exchange network error."
          : "Shopify token exchange failed.",
    };
  }

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  const token =
    json && typeof json.access_token === "string"
      ? json.access_token.trim()
      : "";
  if (!response.ok || !token) {
    return {
      ok: false,
      status: response.status || 502,
      message: `Shopify client_credentials failed (HTTP ${response.status}).`,
    };
  }

  const expiresIn =
    typeof json.expires_in === "number" && Number.isFinite(json.expires_in)
      ? json.expires_in
      : 86399;
  const scope = typeof json.scope === "string" ? json.scope : "";

  return { ok: true, access_token: token, expires_in: expiresIn, scope };
}

function tokenNeedsRefresh(expiresAt) {
  if (!expiresAt) return false;
  const ms = Date.parse(String(expiresAt));
  if (!Number.isFinite(ms)) return false;
  return ms <= Date.now() + REFRESH_SKEW_SECONDS * 1000;
}

/**
 * Server-only: resolve a usable Admin API access token (env → stored → refresh).
 * Never serialize into client payloads.
 * @returns {Promise<{
 *   accessToken: string,
 *   shopDomain: string,
 *   tokenSource: 'env' | 'stored' | 'refreshed' | 'none',
 *   ready: boolean,
 *   scope: string | null,
 *   expiresAt: string | null,
 *   canRefresh: boolean,
 * }>}
 */
export async function resolveShopifyAccessToken() {
  const fields = await loadStoredFields();
  const shopDomain = normalizeShopifyShopDomain(fields.shop_domain);
  const envToken = envAccessToken();
  const clientId = String(fields.client_id || "").trim() || envClientId();
  const clientSecret =
    String(fields.client_secret || "").trim() || envClientSecret();
  const canRefresh = Boolean(clientId && clientSecret);

  let accessToken = String(fields.access_token || "").trim();
  let tokenSource = accessToken ? "stored" : "none";
  let expiresAt = fields.expires_at || null;
  let scope = fields.scope || null;

  if (envToken && (!accessToken || tokenSource === "none")) {
    accessToken = envToken;
    tokenSource = "env";
  } else if (envToken && !fields.access_token) {
    accessToken = envToken;
    tokenSource = "env";
  }

  if (canRefresh && (!accessToken || tokenNeedsRefresh(expiresAt))) {
    const exchanged = await exchangeClientCredentials(
      shopDomain,
      clientId,
      clientSecret,
    );
    if (exchanged.ok) {
      accessToken = exchanged.access_token;
      scope = exchanged.scope || scope;
      expiresAt = new Date(
        Date.now() + exchanged.expires_in * 1000,
      ).toISOString();
      tokenSource = "refreshed";
      // Persist refreshed token when we have a store (or create one from env+refresh).
      const merged = {
        access_token: accessToken,
        client_id: clientId,
        client_secret: clientSecret,
        shop_domain: shopDomain,
        expires_at: expiresAt,
        scope: scope || "",
      };
      try {
        await persistFields(merged);
      } catch {
        // Refresh succeeded even if persist failed — caller can still use token this request.
      }
    } else if (!accessToken) {
      return {
        accessToken: "",
        shopDomain,
        tokenSource: "none",
        ready: false,
        scope: null,
        expiresAt: null,
        canRefresh,
      };
    }
  }

  // Prefer non-expired stored token over env when both exist and stored is fresh.
  if (!accessToken && envToken) {
    accessToken = envToken;
    tokenSource = "env";
  }

  return {
    accessToken,
    shopDomain,
    tokenSource,
    ready: Boolean(accessToken),
    scope,
    expiresAt,
    canRefresh,
  };
}

/**
 * Presence-only Shopify status (env + Integrations store). Never returns secrets.
 * @returns {Promise<ShopifyStatusPayload>}
 */
export async function getShopifyStatus() {
  const fields = await loadStoredFields();
  const stored = await readStoredRow();
  const presence = shopifyPresenceFromFields(fields);
  const envReady = hasShopifyEnv();

  let source = "none";
  if (presence.connected) {
    if (envReady && stored?.ciphertext) source = "env+stored";
    else if (envReady) source = "env";
    else source = stored?.storage || "stored";
  }

  // If only client id/secret are stored, attempt a quiet refresh so Connected
  // reflects a usable Admin token (not just refresh capability).
  if (!presence.has_access_token && presence.can_refresh) {
    const resolved = await resolveShopifyAccessToken();
    if (resolved.ready) {
      return shopifyStatusPayloadFromPresence({
        ...shopifyPresenceFromFields({
          ...fields,
          access_token: "present",
          shop_domain: resolved.shopDomain,
          expires_at: resolved.expiresAt || undefined,
          scope: resolved.scope || undefined,
        }),
        source: resolved.tokenSource === "refreshed" ? stored?.storage || "stored" : source,
        scope: resolved.scope,
        expires_at: resolved.expiresAt,
        summary: "Shopify is Connected.",
      });
    }
  }

  return shopifyStatusPayloadFromPresence({
    ...presence,
    source,
    scope: fields.scope || null,
    expires_at: fields.expires_at || null,
  });
}

/**
 * @param {ShopifyCredentialFields & { api_key?: string, api_secret?: string, admin_access_token?: string }} input
 * @returns {Promise<{ ok: true, shopify: ShopifyStatusPayload, storage: string } | { ok: false, status: number, message: string }>}
 */
export async function saveShopifyCredentials(input) {
  const incoming = {
    access_token: String(
      input?.access_token || input?.admin_access_token || "",
    ).trim(),
    client_id: String(input?.client_id || input?.api_key || "").trim(),
    client_secret: String(
      input?.client_secret || input?.api_secret || "",
    ).trim(),
    shop_domain: String(input?.shop_domain || "").trim(),
    expires_at: String(input?.expires_at || "").trim(),
    scope: String(input?.scope || "").trim(),
  };

  const existing = await loadStoredFields();
  /** @type {ShopifyCredentialFields} */
  const merged = {
    access_token: incoming.access_token || existing.access_token || "",
    client_id: incoming.client_id || existing.client_id || envClientId() || "",
    client_secret:
      incoming.client_secret ||
      existing.client_secret ||
      envClientSecret() ||
      "",
    shop_domain: normalizeShopifyShopDomain(
      incoming.shop_domain || existing.shop_domain,
    ),
    expires_at: incoming.expires_at || existing.expires_at || "",
    scope: incoming.scope || existing.scope || "",
  };

  const anyIncoming = Object.values(incoming).some(Boolean);
  if (!anyIncoming && !shopifyPresenceFromFields(merged).connected && !hasShopifyEnv()) {
    return {
      ok: false,
      status: 422,
      message:
        "Provide Shopify Admin access token and/or Client ID + Client Secret.",
    };
  }

  // If we have client credentials but no access token, exchange now.
  if (!merged.access_token && merged.client_id && merged.client_secret) {
    const exchanged = await exchangeClientCredentials(
      merged.shop_domain,
      merged.client_id,
      merged.client_secret,
    );
    if (!exchanged.ok) {
      return {
        ok: false,
        status: exchanged.status || 422,
        message: exchanged.message,
      };
    }
    merged.access_token = exchanged.access_token;
    merged.scope = exchanged.scope || merged.scope;
    merged.expires_at = new Date(
      Date.now() + exchanged.expires_in * 1000,
    ).toISOString();
  }

  // If token provided without expiry and client creds present, leave expiry blank
  // (static Admin API tokens from Dev Dashboard don't expire the same way).
  if (
    incoming.access_token &&
    !incoming.expires_at &&
    !merged.expires_at &&
    incoming.client_id
  ) {
    // client_credentials tokens should set expires; if caller didn't, leave unset.
  }

  const presence = shopifyPresenceFromFields(merged);
  if (!presence.connected && !hasShopifyEnv()) {
    return {
      ok: false,
      status: 422,
      message:
        "Provide Shopify Admin access token (shpat_…) or Client ID + Client Secret.",
    };
  }

  const { storage } = await persistFields(merged);

  return {
    ok: true,
    shopify: shopifyStatusPayloadFromPresence({
      ...presence,
      source: storage,
      scope: merged.scope || null,
      expires_at: merged.expires_at || null,
      summary: "Shopify credentials saved. Store marked Connected.",
    }),
    storage,
  };
}

/**
 * Clear Integrations-stored Shopify credentials (env unaffected).
 * @returns {Promise<{ ok: true, shopify: ShopifyStatusPayload, storage: string }>}
 */
export async function clearShopifyCredentials() {
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

  const presence = shopifyPresenceFromFields({});
  return {
    ok: true,
    shopify: shopifyStatusPayloadFromPresence({
      ...presence,
      source: presence.connected ? "env" : "none",
      summary: presence.connected
        ? "Stored credentials cleared. Shopify remains Connected."
        : "Shopify disconnected.",
    }),
    storage,
  };
}

/** Env-only sync helper kept for seed builders. */
export function shopifyEnvReady() {
  return hasShopifyEnv() || envPresentAny("SHOPIFY_CLIENT_ID", "SHOPIFY_API_KEY");
}
