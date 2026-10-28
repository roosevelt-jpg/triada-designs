/**
 * WordPress REST publish for marketing-site product posts (Next dual-run).
 * Live when WORDPRESS_* Application Password creds are present; else awaiting.
 * Never logs or returns secret values.
 */

import {
  envPresent,
  hasWordpressEnv,
  integrationRuntimeMode,
} from "@/lib/integrations/env-presence";

function wordpressBaseUrl() {
  const raw =
    (process.env.WORDPRESS_BASE_URL || "").trim() ||
    (process.env.WP_BASE_URL || "").trim() ||
    "https://triada-designs.com";
  return raw.replace(/\/$/, "");
}

function wordpressUsername() {
  return (
    (process.env.WORDPRESS_USERNAME || "").trim() ||
    (process.env.WP_USERNAME || "").trim()
  );
}

function wordpressAppPassword() {
  return (
    (process.env.WORDPRESS_APPLICATION_PASSWORD || "").trim() ||
    (process.env.WP_APPLICATION_PASSWORD || "").trim() ||
    (process.env.WORDPRESS_APP_PASSWORD || "").trim()
  );
}

export function wordpressCredentialsReady() {
  return hasWordpressEnv();
}

export function wordpressRuntime() {
  const ready = wordpressCredentialsReady();
  const mode = integrationRuntimeMode(ready);
  if (!ready) {
    return {
      ready: false,
      mode: "local",
      status: "awaiting_credentials",
      base_url: wordpressBaseUrl(),
      message: "Waiting credentials.",
    };
  }
  return {
    ready: true,
    mode,
    status: "connected",
    base_url: wordpressBaseUrl(),
    message: "WordPress is Connected.",
  };
}

/**
 * @param {import("./products-store.js").ProductRecord} product
 */
export function toWordpressPostPayload(product) {
  const status =
    product.published_status === "published" || product.published_status === "active"
      ? "publish"
      : "draft";
  const priceLine =
    product.price != null
      ? `<p><strong>Price:</strong> ${escapeHtml(String(product.currency || "AED"))} ${escapeHtml(String(product.price))}</p>`
      : "";
  const claims =
    Array.isArray(product.approved_claims) && product.approved_claims.length
      ? `<ul>${product.approved_claims.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>`
      : "";
  const sku = product.sku
    ? `<p><strong>SKU:</strong> ${escapeHtml(product.sku)}</p>`
    : "";
  const content = [
    product.description ? `<p>${escapeHtml(product.description)}</p>` : "",
    priceLine,
    sku,
    claims,
    product.product_url
      ? `<p><a href="${escapeAttr(product.product_url)}">View on Triada Designs</a></p>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    title: product.title,
    content,
    excerpt: product.description
      ? String(product.description).slice(0, 180)
      : product.title,
    status,
    meta: {
      triada_product_id: product.id,
      triada_sku: product.sku || "",
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

/** @param {string} s */
function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

/**
 * @param {string} method
 * @param {string} path
 * @param {Record<string, unknown> | null} [body]
 */
async function wpRequest(method, path, body = null) {
  const base = wordpressBaseUrl();
  const user = wordpressUsername();
  const pass = wordpressAppPassword();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");

  /** @type {Record<string, string>} */
  const headers = {
    Authorization: `Basic ${auth}`,
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
  return { ok: response.ok, status: response.status, json };
}

/**
 * Create or update a marketing post for the product on WordPress.
 * @param {import("./products-store.js").ProductRecord} product
 * @returns {Promise<import("./products-store.js").ChannelSyncState>}
 */
export async function upsertWordpressProductPost(product) {
  const runtime = wordpressRuntime();
  if (!runtime.ready) {
    return {
      status: "awaiting_credentials",
      external_id: product.channel_sync?.wordpress?.external_id || null,
      link: null,
      synced_at: null,
      mode: "local",
      message: runtime.message,
    };
  }

  const payload = toWordpressPostPayload(product);
  const existingId = product.channel_sync?.wordpress?.external_id;

  try {
    let result;
    if (existingId && !String(existingId).startsWith("local-") && !String(existingId).startsWith("seed-")) {
      result = await wpRequest(
        "POST",
        `/wp-json/wp/v2/posts/${encodeURIComponent(String(existingId))}`,
        payload,
      );
    } else {
      result = await wpRequest("POST", "/wp-json/wp/v2/posts", payload);
    }

    if (!result.ok) {
      return {
        status: "error",
        external_id: existingId || null,
        link: null,
        synced_at: new Date().toISOString(),
        mode: runtime.mode,
        message: `WordPress REST HTTP ${result.status}`,
      };
    }

    const remote = result.json || {};
    const remoteId = remote.id != null ? String(remote.id) : existingId || null;
    const link = remote.link ? String(remote.link) : null;

    return {
      status: "synced",
      external_id: remoteId,
      link,
      synced_at: new Date().toISOString(),
      mode: runtime.mode,
      message: existingId
        ? "Updated on WordPress marketing site."
        : "Published to WordPress marketing site.",
    };
  } catch (err) {
    return {
      status: "error",
      external_id: existingId || null,
      link: null,
      synced_at: new Date().toISOString(),
      mode: runtime.mode,
      message: err instanceof Error ? err.message : "WordPress request failed",
    };
  }
}

/** Presence-only WordPress status (no secrets). */
export function wordpressStatusPayload() {
  const runtime = wordpressRuntime();
  return {
    connected: runtime.ready,
    configured: runtime.ready,
    has_base_url: envPresent("WORDPRESS_BASE_URL") || envPresent("WP_BASE_URL"),
    base_url: runtime.base_url,
    status: runtime.ready ? "connected" : "awaiting_credentials",
    status_label: runtime.ready ? "Connected" : "Waiting credentials",
    mode: runtime.mode,
    message: runtime.message,
  };
}
