/**
 * Jewellery product specs helpers — shared by dashboard form and Shopify mapping.
 * Specs live under product.metadata (and metadata.specs) so the catalog stays flexible.
 */

import { DEFAULT_CURRENCY } from "@/lib/locale/preferred-currency";
import { resolvePublicAppUrl } from "@/lib/public-app-url";

/** @typedef {{
 *   category: string | null,
 *   metal: string | null,
 *   weight_grams: number | null,
 *   stone: string | null,
 *   size: string | null,
 *   collection: string | null,
 *   compare_at_price: number | null,
 *   inventory_quantity: number | null,
 *   photo_url: string | null,
 *   barcode: string | null,
 * }} ProductSpecs */

/**
 * Normalize a stored product media URL for browser / Shopify use.
 * Handles protocol-relative Shopify CDN (`//cdn.shopify.com/...`),
 * absolute http(s), same-origin relative paths, and data URLs.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeProductMediaUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (s.startsWith("//")) return `https:${s}`;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^data:/i.test(s)) return s;
  if (s.startsWith("/")) return s;
  // Bare Shopify CDN hosts without scheme
  if (/^(cdn\.shopify\.com|cdn\.shopifycdn\.net)\//i.test(s)) {
    return `https://${s}`;
  }
  return s;
}

/**
 * First image src from a Shopify Admin REST product payload.
 * Prefers images[0].src, then featured image.src.
 * @param {Record<string, unknown> | null | undefined} remoteProduct
 * @returns {string | null}
 */
export function shopifyRemoteImageSrc(remoteProduct) {
  if (!remoteProduct || typeof remoteProduct !== "object") return null;
  const images = Array.isArray(remoteProduct.images) ? remoteProduct.images : [];
  const fromList =
    images[0] && typeof images[0] === "object"
      ? /** @type {Record<string, unknown>} */ (images[0]).src
      : null;
  const featured =
    remoteProduct.image && typeof remoteProduct.image === "object"
      ? /** @type {Record<string, unknown>} */ (remoteProduct.image).src
      : null;
  return normalizeProductMediaUrl(fromList || featured || null);
}

/**
 * Display/sync photo for a Triada catalog product (metadata.photo_url / specs).
 * @param {Record<string, unknown> | null | undefined} product
 * @returns {string | null}
 */
export function productPhotoUrl(product) {
  return normalizeProductMediaUrl(extractProductSpecs(product || {}).photo_url);
}

/**
 * Absolute https URL Shopify can fetch (skips data: URLs).
 * Relative brand paths become dashboard-origin absolute URLs.
 * @param {Record<string, unknown> | null | undefined} product
 * @returns {string | null}
 */
export function absoluteProductPhotoUrlForShopify(product) {
  const url = productPhotoUrl(product);
  if (!url) return null;
  if (/^data:/i.test(url)) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = resolvePublicAppUrl().replace(/\/$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * @param {Record<string, unknown> | null | undefined} product
 * @returns {ProductSpecs}
 */
export function extractProductSpecs(product = {}) {
  const meta =
    product && product.metadata && typeof product.metadata === "object"
      ? /** @type {Record<string, unknown>} */ (product.metadata)
      : {};
  const nested =
    meta.specs && typeof meta.specs === "object"
      ? /** @type {Record<string, unknown>} */ (meta.specs)
      : {};

  const pickString = (...keys) => {
    for (const key of keys) {
      const raw = nested[key] ?? meta[key] ?? product?.[key];
      if (raw == null) continue;
      const s = String(raw).trim();
      if (s) return s;
    }
    return null;
  };

  const pickNumber = (...keys) => {
    for (const key of keys) {
      const raw = nested[key] ?? meta[key] ?? product?.[key];
      if (raw === null || raw === undefined || raw === "") continue;
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  return {
    category: pickString("category", "product_type") || "Jewellery",
    metal: pickString("metal"),
    weight_grams: pickNumber("weight_grams", "weight"),
    stone: pickString("stone", "gemstone"),
    size: pickString("size", "ring_size"),
    collection: pickString("collection"),
    compare_at_price: pickNumber("compare_at_price"),
    inventory_quantity: pickNumber("inventory_quantity", "qty", "stock"),
    photo_url: normalizeProductMediaUrl(
      pickString("photo_url", "image_url", "image", "featured_image"),
    ),
    barcode: pickString("barcode", "gtin"),
  };
}

/**
 * Merge form/API specs into metadata without dropping unrelated keys.
 * @param {Record<string, unknown> | null | undefined} metadata
 * @param {Partial<ProductSpecs> & Record<string, unknown>} specsInput
 */
export function mergeSpecsIntoMetadata(metadata = {}, specsInput = {}) {
  const base =
    metadata && typeof metadata === "object"
      ? { ...metadata }
      : {};
  const priorSpecs =
    base.specs && typeof base.specs === "object"
      ? { .../** @type {Record<string, unknown>} */ (base.specs) }
      : {};

  /** @type {Record<string, unknown>} */
  const nextSpecs = { ...priorSpecs };

  const assignString = (key, value) => {
    if (value === undefined) return;
    if (value === null || String(value).trim() === "") {
      delete nextSpecs[key];
      delete base[key];
      return;
    }
    const s = String(value).trim();
    nextSpecs[key] = s;
    base[key] = s;
  };

  const assignNumber = (key, value) => {
    if (value === undefined) return;
    if (value === null || value === "") {
      delete nextSpecs[key];
      delete base[key];
      return;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    nextSpecs[key] = n;
    base[key] = n;
  };

  assignString("category", specsInput.category);
  assignString("metal", specsInput.metal);
  assignNumber("weight_grams", specsInput.weight_grams);
  assignString("stone", specsInput.stone);
  assignString("size", specsInput.size);
  assignString("collection", specsInput.collection);
  assignNumber("compare_at_price", specsInput.compare_at_price);
  assignNumber("inventory_quantity", specsInput.inventory_quantity);
  assignString("photo_url", specsInput.photo_url);
  assignString("barcode", specsInput.barcode);

  base.specs = nextSpecs;
  return base;
}

/**
 * Shopify variant price string (always 2 decimal places).
 * @param {unknown} price
 */
export function formatShopifyPrice(price) {
  if (price === null || price === undefined || price === "") return "0.00";
  const n = Number(price);
  if (!Number.isFinite(n) || n < 0) return "0.00";
  return n.toFixed(2);
}

/**
 * @param {Record<string, unknown>} product
 */
export function productCurrency(product) {
  const raw = product?.currency;
  if (raw != null && String(raw).trim()) return String(raw).trim().toUpperCase();
  return DEFAULT_CURRENCY;
}

/**
 * Specs rows for HTML / metafields (label → value).
 * @param {ProductSpecs} specs
 * @param {Record<string, unknown>} product
 * @returns {Array<{ key: string, label: string, value: string }>}
 */
export function specsDisplayRows(specs, product = {}) {
  /** @type {Array<{ key: string, label: string, value: string }>} */
  const rows = [];
  const push = (key, label, value) => {
    if (value == null || String(value).trim() === "") return;
    rows.push({ key, label, value: String(value).trim() });
  };

  push("sku", "SKU", product.sku ? String(product.sku) : null);
  push(
    "price",
    "Price",
    product.price != null
      ? `${productCurrency(product)} ${formatShopifyPrice(product.price)}`
      : null,
  );
  if (specs.compare_at_price != null) {
    push(
      "compare_at_price",
      "Compare at",
      `${productCurrency(product)} ${formatShopifyPrice(specs.compare_at_price)}`,
    );
  }
  push("category", "Category", specs.category);
  push("collection", "Collection", specs.collection);
  push("metal", "Metal", specs.metal);
  if (specs.weight_grams != null) {
    push("weight_grams", "Weight", `${specs.weight_grams} g`);
  }
  push("stone", "Stone", specs.stone);
  push("size", "Size", specs.size);
  push("barcode", "Barcode", specs.barcode);

  return rows;
}
