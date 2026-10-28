/**
 * Shopify Admin REST helpers for product create/update (Next dual-run).
 * Live only when SHOPIFY_* credentials are present; otherwise local_sim.
 * Never logs or returns secret values.
 */

import {
  envPresent,
  hasShopifyEnv,
  integrationRuntimeMode,
} from "@/lib/integrations/env-presence";

const DEFAULT_SHOP = "jwtjzw-nu.myshopify.com";
const DEFAULT_API_VERSION = "2025-01";

export function shopifyShopDomain() {
  const raw =
    (process.env.SHOPIFY_SHOP_DOMAIN || "").trim() ||
    (process.env.SHOPIFY_STORE_DOMAIN || "").trim() ||
    DEFAULT_SHOP;
  return raw
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

function shopifyAccessToken() {
  return (
    (process.env.SHOPIFY_ACCESS_TOKEN || "").trim() ||
    (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim()
  );
}

function shopifyApiVersion() {
  return (process.env.SHOPIFY_API_VERSION || "").trim() || DEFAULT_API_VERSION;
}

/** True when Admin API token is present (domain defaults to Triada store). */
export function shopifyCredentialsReady() {
  return hasShopifyEnv();
}

export function shopifyRuntime() {
  const ready = shopifyCredentialsReady();
  const mode = integrationRuntimeMode(ready);
  if (!ready) {
    return {
      ready: false,
      mode: "local",
      status: "awaiting_credentials",
      shop_domain: shopifyShopDomain(),
      message: "Waiting for Shopify Admin API credentials on Vercel.",
    };
  }
  return {
    ready: true,
    mode,
    status: mode === "live" ? "connected" : "connected",
    shop_domain: shopifyShopDomain(),
    message:
      mode === "live"
        ? "Shopify Admin API credentials are present."
        : "Shopify Admin API credentials are present (host).",
  };
}

/**
 * @param {string} method
 * @param {string} path  e.g. products.json
 * @param {Record<string, unknown> | null} [body]
 */
async function adminRequest(method, path, body = null) {
  const shop = shopifyShopDomain();
  const token = shopifyAccessToken();
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
  return { ok: response.ok, status: response.status, json, text };
}

/**
 * Map Triada product → Shopify Admin product payload.
 * @param {import("./products-store.js").ProductRecord} product
 */
export function toShopifyProductPayload(product) {
  const status =
    product.published_status === "published" || product.published_status === "active"
      ? "active"
      : "draft";
  const price =
    product.price != null && Number.isFinite(Number(product.price))
      ? Number(product.price).toFixed(2)
      : "0.00";
  const bodyHtml = product.description
    ? `<p>${escapeHtml(product.description)}</p>`
    : "";
  const category =
    product.metadata && typeof product.metadata.category === "string"
      ? product.metadata.category
      : "Jewellery";

  return {
    product: {
      title: product.title,
      body_html: bodyHtml,
      vendor: "Triada Designs",
      product_type: category,
      status,
      tags: Array.isArray(product.approved_claims)
        ? product.approved_claims.join(", ")
        : "",
      variants: [
        {
          price,
          sku: product.sku || undefined,
          inventory_management: null,
        },
      ],
    },
  };
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Create or update a Shopify product for a Triada catalog row.
 * @param {import("./products-store.js").ProductRecord} product
 * @returns {Promise<import("./products-store.js").ChannelSyncState>}
 */
export async function upsertShopifyProduct(product) {
  const runtime = shopifyRuntime();
  if (!runtime.ready) {
    return {
      status: "awaiting_credentials",
      external_id: product.channel_sync?.shopify?.external_id || null,
      link: null,
      synced_at: null,
      mode: "local",
      message: runtime.message,
    };
  }

  const payload = toShopifyProductPayload(product);
  const existingId = product.channel_sync?.shopify?.external_id;

  try {
    let result;
    if (existingId && !String(existingId).startsWith("local-")) {
      result = await adminRequest(
        "PUT",
        `products/${encodeURIComponent(String(existingId))}.json`,
        payload,
      );
    } else {
      result = await adminRequest("POST", "products.json", payload);
    }

    if (!result.ok) {
      return {
        status: "error",
        external_id: existingId || null,
        link: null,
        synced_at: new Date().toISOString(),
        mode: runtime.mode,
        message: `Shopify Admin API HTTP ${result.status}`,
      };
    }

    const remote = result.json?.product || {};
    const remoteId = remote.id != null ? String(remote.id) : existingId || null;
    const handle = remote.handle ? String(remote.handle) : null;
    const link = handle
      ? `https://${runtime.shop_domain}/products/${handle}`
      : null;

    return {
      status: "synced",
      external_id: remoteId,
      link,
      synced_at: new Date().toISOString(),
      mode: runtime.mode,
      message: existingId ? "Updated on Shopify." : "Created on Shopify.",
    };
  } catch (err) {
    return {
      status: "error",
      external_id: existingId || null,
      link: null,
      synced_at: new Date().toISOString(),
      mode: runtime.mode,
      message: err instanceof Error ? err.message : "Shopify request failed",
    };
  }
}

/**
 * Pull products from Shopify Admin (or local seed when awaiting).
 * @param {number} [limit]
 */
export async function listShopifyRemoteProducts(limit = 50) {
  const runtime = shopifyRuntime();
  if (!runtime.ready) {
    return {
      mode: "local_sim",
      status: "awaiting_credentials",
      products: localSimProducts(),
      message: runtime.message,
    };
  }

  try {
    const result = await adminRequest(
      "GET",
      `products.json?limit=${Math.min(250, Math.max(1, limit))}`,
    );
    if (!result.ok) {
      return {
        mode: runtime.mode,
        status: "error",
        products: [],
        message: `Shopify list failed: HTTP ${result.status}`,
      };
    }
    return {
      mode: runtime.mode,
      status: "synced",
      products: Array.isArray(result.json?.products) ? result.json.products : [],
      message: "Shopify products listed.",
    };
  } catch (err) {
    return {
      mode: runtime.mode,
      status: "error",
      products: [],
      message: err instanceof Error ? err.message : "Shopify list failed",
    };
  }
}

function localSimProducts() {
  return [
    {
      id: "local-sim-priest",
      title: "The Priest Ring",
      body_html: "Sculptural Salt & Spirit ring.",
      status: "active",
      variants: [{ sku: "TD-RING-PRIEST-01", price: "1450.00", inventory_quantity: 3 }],
    },
  ];
}

/** Presence-only shopify status for Integrations (no secrets). */
export function shopifyStatusPayload() {
  const runtime = shopifyRuntime();
  return {
    connected: runtime.ready,
    has_access_token: runtime.ready,
    has_shop_domain:
      envPresent("SHOPIFY_SHOP_DOMAIN") ||
      envPresent("SHOPIFY_STORE_DOMAIN") ||
      Boolean(DEFAULT_SHOP),
    store: runtime.shop_domain,
    shop_domain: runtime.shop_domain,
    status: runtime.ready ? "connected" : "awaiting_credentials",
    status_label: runtime.ready ? "Connected" : "Waiting credentials",
    mode: runtime.mode,
    summary: runtime.message,
    honesty:
      "Shopify stays Waiting credentials until SHOPIFY_ACCESS_TOKEN (or SHOPIFY_ADMIN_ACCESS_TOKEN) is set on Vercel.",
  };
}
