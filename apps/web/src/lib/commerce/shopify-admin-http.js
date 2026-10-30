/**
 * Shared Shopify Admin REST + GraphQL transport.
 * Never logs or returns secret values.
 */

import {
  normalizeShopifyShopDomain,
  resolveShopifyAccessToken,
} from "@/lib/integrations/shopify-credentials";

const DEFAULT_SHOP = "jwtjzw-nu.myshopify.com";
const DEFAULT_API_VERSION = "2025-01";

export function shopifyApiVersion() {
  return (process.env.SHOPIFY_API_VERSION || "").trim() || DEFAULT_API_VERSION;
}

export function shopifyShopDomainFallback() {
  return normalizeShopifyShopDomain(
    (process.env.SHOPIFY_SHOP_DOMAIN || "").trim() ||
      (process.env.SHOPIFY_STORE_DOMAIN || "").trim() ||
      DEFAULT_SHOP,
  );
}

/**
 * @param {string} method
 * @param {string} path  e.g. products.json
 * @param {Record<string, unknown> | null} [body]
 */
export async function shopifyAdminRequest(method, path, body = null) {
  const resolved = await resolveShopifyAccessToken();
  const shop = resolved.shopDomain || shopifyShopDomainFallback();
  const token = resolved.accessToken;
  if (!token) {
    return {
      ok: false,
      status: 401,
      json: { errors: "Missing Shopify access token" },
      text: "",
      shop,
      scope: resolved.scope,
    };
  }
  const version = shopifyApiVersion();
  const url = `https://${shop}/admin/api/${version}/${path.replace(/^\//, "")}`;

  /** @type {Record<string, string>} */
  const headers = {
    "X-Shopify-Access-Token": token,
    Accept: "application/json",
  };
  /** @type {RequestInit} */
  const init = { method, headers };
  if (body != null) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    json,
    text,
    shop,
    scope: resolved.scope,
  };
}

/**
 * @param {string} query
 * @param {Record<string, unknown>} [variables]
 */
export async function shopifyAdminGraphql(query, variables = undefined) {
  const resolved = await resolveShopifyAccessToken();
  const shop = resolved.shopDomain || shopifyShopDomainFallback();
  const token = resolved.accessToken;
  if (!token) {
    return {
      ok: false,
      status: 401,
      json: { errors: [{ message: "Missing Shopify access token" }] },
      shop,
      scope: resolved.scope,
    };
  }
  const version = shopifyApiVersion();
  const url = `https://${shop}/admin/api/${version}/graphql.json`;
  /** @type {Record<string, unknown>} */
  const body = { query };
  if (variables && typeof variables === "object") body.variables = variables;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  const gqlErrors = Array.isArray(json?.errors) ? json.errors : [];
  const accessDenied = gqlErrors.some(
    (e) =>
      String(e?.extensions?.code || "").toUpperCase() === "ACCESS_DENIED" ||
      /access denied|required access/i.test(String(e?.message || "")),
  );
  return {
    ok: response.ok && gqlErrors.length === 0,
    status: response.status,
    json,
    text,
    shop,
    scope: resolved.scope,
    access_denied: accessDenied,
    errors: gqlErrors,
  };
}

/**
 * Live granted scopes from currentAppInstallation (presence only).
 * @returns {Promise<{ ok: boolean, scopes: string[], scope_csv: string, message?: string }>}
 */
export async function listGrantedShopifyScopes() {
  const result = await shopifyAdminGraphql(`{
    currentAppInstallation {
      accessScopes { handle }
    }
  }`);
  if (!result.ok) {
    return {
      ok: false,
      scopes: [],
      scope_csv: "",
      message: result.access_denied
        ? "Unable to read installation scopes."
        : `Scope probe HTTP ${result.status}`,
    };
  }
  const rows = result.json?.data?.currentAppInstallation?.accessScopes;
  const scopes = Array.isArray(rows)
    ? rows.map((r) => String(r?.handle || "").trim()).filter(Boolean)
    : [];
  return {
    ok: true,
    scopes,
    scope_csv: scopes.join(","),
  };
}

/**
 * @param {string[]} granted
 * @param {string | string[]} needed  any-of list
 */
export function hasAnyShopifyScope(granted, needed) {
  const set = new Set((granted || []).map((s) => String(s).trim()));
  const need = Array.isArray(needed) ? needed : [needed];
  return need.some((s) => set.has(String(s).trim()));
}

/**
 * Build a sync-state row for missing credentials / scopes / errors.
 * @param {{
 *   status?: string,
 *   mode?: string,
 *   message?: string,
 *   external_id?: string | null,
 *   link?: string | null,
 * }} [opts]
 */
export function shopifySyncState(opts = {}) {
  return {
    status: opts.status || "awaiting_credentials",
    external_id: opts.external_id ?? null,
    link: opts.link ?? null,
    synced_at:
      opts.status === "synced" || opts.status === "error"
        ? new Date().toISOString()
        : null,
    mode: opts.mode || "local",
    message: opts.message || "Waiting credentials.",
  };
}

/** Detect scope / approval failures from REST bodies. */
export function isShopifyScopeFailure(result) {
  if (!result || result.ok) return false;
  if (result.status === 403) return true;
  if (result.access_denied) return true;
  const err = result.json?.errors ?? result.json?.error ?? "";
  const text =
    typeof err === "string"
      ? err
      : Array.isArray(err)
        ? err.map((e) => (typeof e === "string" ? e : e?.message)).join(" ")
        : JSON.stringify(err || "");
  return /requires merchant approval|access scope|ACCESS_DENIED|not approved/i.test(
    text,
  );
}
