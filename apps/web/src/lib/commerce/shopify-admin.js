/**
 * Shopify Admin REST helpers for product create/update (Next dual-run).
 * Live when SHOPIFY_* env or Integrations store credentials are present;
 * otherwise local_sim. Never logs or returns secret values.
 */

import {
  envPresent,
  hasShopifyEnv,
  integrationRuntimeMode,
} from "@/lib/integrations/env-presence";
import {
  getShopifyStatus,
  normalizeShopifyShopDomain,
  resolveShopifyAccessToken,
} from "@/lib/integrations/shopify-credentials";
import {
  absoluteProductPhotoUrlForShopify,
  absoluteProductPhotoUrlsForShopify,
  extractProductSpecs,
  formatShopifyPrice,
  productCurrency,
  shopifyRemoteImageSrc,
  shopifyRemoteImageSrcs,
  specsDisplayRows,
} from "./product-specs.js";

const DEFAULT_SHOP = "jwtjzw-nu.myshopify.com";
const DEFAULT_API_VERSION = "2025-01";
const META_NAMESPACE = "triada";

export function shopifyShopDomain() {
  return normalizeShopifyShopDomain(
    (process.env.SHOPIFY_SHOP_DOMAIN || "").trim() ||
      (process.env.SHOPIFY_STORE_DOMAIN || "").trim() ||
      DEFAULT_SHOP,
  );
}

function shopifyApiVersion() {
  return (process.env.SHOPIFY_API_VERSION || "").trim() || DEFAULT_API_VERSION;
}

/** Env-only readiness (sync). Prefer getShopifyRuntime() for live paths. */
export function shopifyCredentialsReady() {
  return hasShopifyEnv();
}

/** Sync env-only runtime — used by seed builders. Prefer getShopifyRuntime(). */
export function shopifyRuntime() {
  const ready = shopifyCredentialsReady();
  const mode = integrationRuntimeMode(ready);
  if (!ready) {
    return {
      ready: false,
      mode: "local",
      status: "awaiting_credentials",
      shop_domain: shopifyShopDomain(),
      message: "Waiting credentials.",
    };
  }
  return {
    ready: true,
    mode,
    status: "connected",
    shop_domain: shopifyShopDomain(),
    message: "Shopify is Connected.",
  };
}

/**
 * Async runtime: env + Integrations store (+ client_credentials refresh).
 * @returns {Promise<ReturnType<typeof shopifyRuntime> & { source?: string }>}
 */
export async function getShopifyRuntime() {
  const resolved = await resolveShopifyAccessToken();
  if (!resolved.ready) {
    return {
      ready: false,
      mode: "local",
      status: "awaiting_credentials",
      shop_domain: resolved.shopDomain || shopifyShopDomain(),
      message: "Waiting credentials.",
      source: "none",
    };
  }
  const mode = integrationRuntimeMode(true);
  return {
    ready: true,
    mode,
    status: "connected",
    shop_domain: resolved.shopDomain || shopifyShopDomain(),
    message: "Shopify is Connected.",
    source: resolved.tokenSource,
  };
}

/**
 * @param {string} method
 * @param {string} path  e.g. products.json
 * @param {Record<string, unknown> | null} [body]
 */
async function adminRequest(method, path, body = null) {
  const resolved = await resolveShopifyAccessToken();
  const shop = resolved.shopDomain || shopifyShopDomain();
  const token = resolved.accessToken;
  if (!token) {
    return {
      ok: false,
      status: 401,
      json: { errors: "Missing Shopify access token" },
      text: "",
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
  return { ok: response.ok, status: response.status, json, text };
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
 * Build body_html with description + aligned price/specs table.
 * @param {import("./products-store.js").ProductRecord} product
 * @param {ReturnType<typeof extractProductSpecs>} specs
 */
export function buildShopifyBodyHtml(product, specs) {
  const parts = [];
  if (product.description) {
    parts.push(`<p>${escapeHtml(product.description)}</p>`);
  }

  const rows = specsDisplayRows(specs, product);
  if (rows.length) {
    const tr = rows
      .map(
        (row) =>
          `<tr><th style="text-align:left;padding:4px 12px 4px 0;vertical-align:top">${escapeHtml(row.label)}</th><td style="padding:4px 0">${escapeHtml(row.value)}</td></tr>`,
      )
      .join("");
    parts.push(
      `<h3>Specifications</h3><table class="triada-specs">${tr}</table>`,
    );
  }

  if (Array.isArray(product.approved_claims) && product.approved_claims.length) {
    const lis = product.approved_claims
      .map((c) => `<li>${escapeHtml(String(c))}</li>`)
      .join("");
    parts.push(`<h3>Approved claims</h3><ul>${lis}</ul>`);
  }

  if (product.product_url) {
    parts.push(
      `<p><a href="${escapeHtml(String(product.product_url))}">View on Triada Designs</a></p>`,
    );
  }

  return parts.join("\n");
}

/**
 * Tag list aligned to claims + jewellery specs (Shopify comma-separated).
 * @param {import("./products-store.js").ProductRecord} product
 * @param {ReturnType<typeof extractProductSpecs>} specs
 */
export function buildShopifyTags(product, specs) {
  const tags = [];
  const push = (v) => {
    if (v == null) return;
    const s = String(v).trim();
    if (!s) return;
    if (!tags.includes(s)) tags.push(s);
  };

  if (Array.isArray(product.approved_claims)) {
    for (const c of product.approved_claims) push(c);
  }
  push(specs.category);
  push(specs.collection);
  push(specs.metal);
  push(specs.stone);
  push(`currency:${productCurrency(product)}`);
  if (product.availability_status) {
    push(String(product.availability_status));
  }
  return tags.join(", ");
}

/**
 * Metafields for price currency + jewellery specs (namespace triada).
 * @param {import("./products-store.js").ProductRecord} product
 * @param {ReturnType<typeof extractProductSpecs>} specs
 */
export function buildShopifyMetafields(product, specs) {
  /** @type {Array<{ namespace: string, key: string, type: string, value: string }>} */
  const fields = [];
  const add = (key, value, type = "single_line_text_field") => {
    if (value == null || String(value).trim() === "") return;
    fields.push({
      namespace: META_NAMESPACE,
      key,
      type,
      value: String(value),
    });
  };

  add("product_id", product.id);
  add("currency", productCurrency(product));
  if (product.price != null && Number.isFinite(Number(product.price))) {
    add("price", formatShopifyPrice(product.price));
  }
  add("sku", product.sku);
  add("category", specs.category);
  add("collection", specs.collection);
  add("metal", specs.metal);
  if (specs.weight_grams != null) {
    add("weight_grams", String(specs.weight_grams), "number_decimal");
  }
  add("stone", specs.stone);
  add("size", specs.size);
  add("barcode", specs.barcode);
  if (specs.compare_at_price != null) {
    add("compare_at_price", formatShopifyPrice(specs.compare_at_price));
  }
  add("availability", product.availability_status);
  if (product.product_url) add("product_url", String(product.product_url), "url");

  return fields;
}

/**
 * Map Triada product → Shopify Admin product payload.
 * Pass variantId on updates so price/sku overwrite the existing variant.
 * @param {import("./products-store.js").ProductRecord} product
 * @param {{ variantId?: string | number | null, includeMetafields?: boolean }} [opts]
 */
export function toShopifyProductPayload(product, opts = {}) {
  const specs = extractProductSpecs(product);
  const status =
    product.published_status === "published" || product.published_status === "active"
      ? "active"
      : "draft";
  const price = formatShopifyPrice(product.price);
  const compareAt =
    specs.compare_at_price != null
      ? formatShopifyPrice(specs.compare_at_price)
      : null;

  /** @type {Record<string, unknown>} */
  const variant = {
    price,
    sku: product.sku ? String(product.sku) : undefined,
    barcode: specs.barcode || undefined,
    inventory_management: null,
    requires_shipping: true,
  };
  if (opts.variantId != null && String(opts.variantId).trim()) {
    variant.id = Number(opts.variantId) || opts.variantId;
    // Explicit null on update clears a prior Shopify compare-at when sale ends.
    variant.compare_at_price = compareAt;
  } else if (compareAt != null) {
    variant.compare_at_price = compareAt;
  }
  if (specs.weight_grams != null && Number.isFinite(specs.weight_grams)) {
    variant.weight = specs.weight_grams;
    variant.weight_unit = "g";
  }

  /** @type {Record<string, unknown>} */
  const productBody = {
    title: product.title,
    body_html: buildShopifyBodyHtml(product, specs),
    vendor: "Triada Designs",
    product_type: specs.category || "Jewellery",
    status,
    tags: buildShopifyTags(product, specs),
    variants: [variant],
  };

  // Attach all images on create (update path uses products/{id}/images.json).
  const photoHttpsList = absoluteProductPhotoUrlsForShopify(product);
  if (photoHttpsList.length && !opts.variantId) {
    productBody.images = photoHttpsList.map((src) => ({ src }));
  }

  if (opts.includeMetafields !== false && !opts.variantId) {
    const metafields = buildShopifyMetafields(product, specs);
    if (metafields.length) productBody.metafields = metafields;
  }

  return { product: productBody };
}

/**
 * Ensure Shopify product has every dashboard photo.
 * Posts missing srcs via Admin REST products/{id}/images.json (append-only; no churn).
 * @param {string} productId
 * @param {string[]} photoHttpsList
 * @param {Record<string, unknown> | null | undefined} remoteProduct
 */
async function ensureShopifyProductImages(productId, photoHttpsList, remoteProduct) {
  if (!productId || !Array.isArray(photoHttpsList) || !photoHttpsList.length) {
    return { ok: true, attached: 0 };
  }
  const existing = shopifyRemoteImageSrcs(remoteProduct).map((src) =>
    src.replace(/\?.*$/, ""),
  );
  const existingSet = new Set(existing);
  let attached = 0;
  let ok = true;
  for (const photoHttps of photoHttpsList) {
    if (!photoHttps || !/^https?:\/\//i.test(photoHttps)) continue;
    const key = photoHttps.replace(/\?.*$/, "");
    if (existingSet.has(key)) continue;
    const result = await adminRequest(
      "POST",
      `products/${encodeURIComponent(String(productId))}/images.json`,
      { image: { src: photoHttps } },
    );
    if (result.ok) {
      attached += 1;
      existingSet.add(key);
    } else {
      ok = false;
    }
  }
  return { ok, attached };
}

/**
 * Upsert triada.* metafields on an existing product (create or update by key).
 * @param {string} productId
 * @param {Array<{ namespace: string, key: string, type: string, value: string }>} desired
 */
async function syncProductMetafields(productId, desired) {
  if (!desired.length) return { ok: true, updated: 0 };

  const listed = await adminRequest(
    "GET",
    `products/${encodeURIComponent(String(productId))}/metafields.json`,
  );
  /** @type {Array<Record<string, unknown>>} */
  const existing = Array.isArray(listed.json?.metafields)
    ? listed.json.metafields
    : [];

  let updated = 0;
  for (const field of desired) {
    const match = existing.find(
      (row) =>
        String(row.namespace) === field.namespace &&
        String(row.key) === field.key,
    );
    if (match && match.id != null) {
      const result = await adminRequest(
        "PUT",
        `metafields/${encodeURIComponent(String(match.id))}.json`,
        {
          metafield: {
            id: match.id,
            type: field.type,
            value: field.value,
          },
        },
      );
      if (result.ok) updated += 1;
    } else {
      const result = await adminRequest(
        "POST",
        `products/${encodeURIComponent(String(productId))}/metafields.json`,
        { metafield: field },
      );
      if (result.ok) updated += 1;
    }
  }
  return { ok: true, updated };
}

/**
 * Create or update a Shopify product for a Triada catalog row.
 * Aligns price, currency metafield, SKU, weight, and jewellery specs.
 * @param {import("./products-store.js").ProductRecord} product
 * @returns {Promise<import("./products-store.js").ChannelSyncState>}
 */
export async function upsertShopifyProduct(product) {
  const runtime = await getShopifyRuntime();
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

  const existingId = product.channel_sync?.shopify?.external_id;
  const isRemoteId =
    existingId && !String(existingId).startsWith("local-");

  try {
    /** @type {string | number | null} */
    let variantId = null;
    if (isRemoteId) {
      const current = await adminRequest(
        "GET",
        `products/${encodeURIComponent(String(existingId))}.json`,
      );
      if (current.ok) {
        const variants = current.json?.product?.variants;
        if (Array.isArray(variants) && variants[0]?.id != null) {
          variantId = variants[0].id;
        }
      }
    }

    const payload = toShopifyProductPayload(product, {
      variantId,
      includeMetafields: !isRemoteId,
    });

    let result;
    if (isRemoteId) {
      // Include product id for clear PUT semantics.
      payload.product.id = Number(existingId) || existingId;
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
    const photoHttpsList = absoluteProductPhotoUrlsForShopify(product);
    const photoHttps = photoHttpsList[0] || absoluteProductPhotoUrlForShopify(product);

    if (remoteId && isRemoteId) {
      const specs = extractProductSpecs(product);
      await syncProductMetafields(
        String(remoteId),
        buildShopifyMetafields(product, specs),
      ).catch(() => {});
      await ensureShopifyProductImages(
        String(remoteId),
        photoHttpsList,
        remote,
      ).catch(() => {});
    }

    const handle = remote.handle ? String(remote.handle) : null;
    const link = handle
      ? `https://${runtime.shop_domain}/products/${handle}`
      : null;

    const remoteVariant = Array.isArray(remote.variants)
      ? remote.variants[0]
      : null;
    const remotePrice =
      remoteVariant?.price != null
        ? formatShopifyPrice(remoteVariant.price)
        : formatShopifyPrice(product.price);

    const remoteImages = shopifyRemoteImageSrcs(remote);
    const remoteImage =
      remoteImages[0] || photoHttps || null;
    const mergedPhotos = remoteImages.length
      ? remoteImages
      : photoHttpsList.length
        ? photoHttpsList
        : remoteImage
          ? [remoteImage]
          : [];

    return {
      status: "synced",
      external_id: remoteId,
      link,
      synced_at: new Date().toISOString(),
      mode: runtime.mode,
      message: isRemoteId
        ? `Updated on Shopify · ${productCurrency(product)} ${remotePrice}`
        : `Created on Shopify · ${productCurrency(product)} ${remotePrice}`,
      photo_url: remoteImage,
      photo_urls: mergedPhotos,
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
  const runtime = await getShopifyRuntime();
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
      product_type: "Rings",
      tags: "18K gold, currency:AED",
      variants: [
        {
          sku: "TD-RING-PRIEST-01",
          price: "1450.00",
          weight: 8.2,
          weight_unit: "g",
          inventory_quantity: 3,
        },
      ],
    },
  ];
}

/** Sync env-only status (seed builders). Prefer getShopifyStatusPayload(). */
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
    honesty: runtime.message,
  };
}

/** Presence-only shopify status for Integrations (env + store, no secrets). */
export async function getShopifyStatusPayload() {
  return getShopifyStatus();
}
