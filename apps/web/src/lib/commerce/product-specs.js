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
 *   photo_urls: string[],
 *   barcode: string | null,
 * }} ProductSpecs */

/**
 * Deduplicate and normalize a list of media URLs (order preserved).
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeProductMediaUrlList(raw) {
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  const push = (value) => {
    const n = normalizeProductMediaUrl(value);
    if (!n) return;
    const key = n.replace(/\?.*$/, "");
    if (seen.has(key)) return;
    seen.add(key);
    out.push(n);
  };
  if (Array.isArray(raw)) {
    for (const item of raw) push(item);
  } else if (typeof raw === "string" && raw.trim()) {
    // Allow comma/newline-separated legacy strings.
    if (raw.includes(",") || raw.includes("\n")) {
      for (const part of raw.split(/[,\n]/)) push(part);
    } else {
      push(raw);
    }
  }
  return out;
}

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
 * All image srcs from a Shopify Admin REST product payload (order preserved).
 * @param {Record<string, unknown> | null | undefined} remoteProduct
 * @returns {string[]}
 */
export function shopifyRemoteImageSrcs(remoteProduct) {
  if (!remoteProduct || typeof remoteProduct !== "object") return [];
  /** @type {unknown[]} */
  const images = Array.isArray(remoteProduct.images) ? remoteProduct.images : [];
  /** @type {string[]} */
  const fromList = [];
  for (const row of images) {
    if (!row || typeof row !== "object") continue;
    const src = /** @type {Record<string, unknown>} */ (row).src;
    const n = normalizeProductMediaUrl(src);
    if (n) fromList.push(n);
  }
  if (fromList.length) return normalizeProductMediaUrlList(fromList);
  const featured =
    remoteProduct.image && typeof remoteProduct.image === "object"
      ? /** @type {Record<string, unknown>} */ (remoteProduct.image).src
      : null;
  const one = normalizeProductMediaUrl(featured);
  return one ? [one] : [];
}

/**
 * First image src from a Shopify Admin REST product payload.
 * Prefers images[0].src, then featured image.src.
 * @param {Record<string, unknown> | null | undefined} remoteProduct
 * @returns {string | null}
 */
export function shopifyRemoteImageSrc(remoteProduct) {
  return shopifyRemoteImageSrcs(remoteProduct)[0] || null;
}

/**
 * All display/sync photos for a Triada catalog product.
 * Prefers metadata.photo_urls[]; falls back to photo_url / image_url.
 * @param {Record<string, unknown> | null | undefined} product
 * @returns {string[]}
 */
export function productPhotoUrls(product) {
  return extractProductSpecs(product || {}).photo_urls || [];
}

/**
 * Display/sync primary photo for a Triada catalog product (metadata.photo_url / specs).
 * @param {Record<string, unknown> | null | undefined} product
 * @returns {string | null}
 */
export function productPhotoUrl(product) {
  const urls = productPhotoUrls(product);
  return urls[0] || null;
}

/**
 * Absolute https URL Shopify can fetch (skips data: URLs).
 * Relative brand paths become dashboard-origin absolute URLs.
 * @param {string | null | undefined} url
 * @returns {string | null}
 */
export function absoluteMediaUrlForShopify(url) {
  const raw = normalizeProductMediaUrl(url);
  if (!raw) return null;
  if (/^data:/i.test(raw)) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = resolvePublicAppUrl().replace(/\/$/, "");
  return `${base}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

/**
 * Absolute https URL Shopify can fetch for the primary product photo.
 * @param {Record<string, unknown> | null | undefined} product
 * @returns {string | null}
 */
export function absoluteProductPhotoUrlForShopify(product) {
  return absoluteMediaUrlForShopify(productPhotoUrl(product));
}

/**
 * Absolute https URLs for every product photo Shopify should receive.
 * @param {Record<string, unknown> | null | undefined} product
 * @returns {string[]}
 */
export function absoluteProductPhotoUrlsForShopify(product) {
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const url of productPhotoUrls(product)) {
    const abs = absoluteMediaUrlForShopify(url);
    if (!abs) continue;
    const key = abs.replace(/\?.*$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(abs);
  }
  return out;
}

/**
 * Auto-assign a Triada SKU when the admin leaves SKU blank on create.
 * Format: TD-{TITLE_SLUG}-{4-char suffix} (matches seed style TD-RING-PRIEST-01).
 * @param {{ title?: unknown, id?: unknown, sku?: unknown } | null | undefined} input
 * @returns {string}
 */
export function generateProductSku(input = {}) {
  const existing = input?.sku != null ? String(input.sku).trim() : "";
  if (existing) return existing;

  const titleSlug = String(input?.title || "ITEM")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 28);
  const slug = titleSlug || "ITEM";

  const idRaw = String(input?.id || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  let suffix = idRaw.slice(-4);
  if (suffix.length < 4) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let rand = "";
    for (let i = 0; i < 4 - suffix.length; i += 1) {
      rand += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    suffix = `${rand}${suffix}`.slice(0, 4);
  }
  return `TD-${slug}-${suffix}`;
}

/**
 * True when compare-at is a real sale (higher than current price).
 * @param {unknown} price
 * @param {unknown} compareAt
 */
export function isSalePrice(price, compareAt) {
  const p = Number(price);
  const c = Number(compareAt);
  return Number.isFinite(p) && Number.isFinite(c) && c > p;
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

  const photoUrls = normalizeProductMediaUrlList([
    ...(Array.isArray(nested.photo_urls) ? nested.photo_urls : []),
    ...(Array.isArray(meta.photo_urls) ? meta.photo_urls : []),
    nested.photo_url,
    meta.photo_url,
    nested.image_url,
    meta.image_url,
    nested.image,
    meta.image,
    nested.featured_image,
    meta.featured_image,
    product?.photo_url,
  ]);

  return {
    category: pickString("category", "product_type") || "Jewellery",
    metal: pickString("metal"),
    weight_grams: pickNumber("weight_grams", "weight"),
    stone: pickString("stone", "gemstone"),
    size: pickString("size", "ring_size"),
    collection: pickString("collection"),
    compare_at_price: pickNumber("compare_at_price"),
    inventory_quantity: pickNumber("inventory_quantity", "qty", "stock"),
    photo_url: photoUrls[0] || null,
    photo_urls: photoUrls,
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
  assignString("barcode", specsInput.barcode);

  if (specsInput.photo_urls !== undefined || specsInput.photo_url !== undefined) {
    const mergedPhotos = normalizeProductMediaUrlList([
      ...(Array.isArray(specsInput.photo_urls) ? specsInput.photo_urls : []),
      specsInput.photo_url,
    ]);
    if (!mergedPhotos.length) {
      delete nextSpecs.photo_url;
      delete nextSpecs.photo_urls;
      delete base.photo_url;
      delete base.photo_urls;
    } else {
      nextSpecs.photo_urls = mergedPhotos;
      nextSpecs.photo_url = mergedPhotos[0];
      base.photo_urls = mergedPhotos;
      base.photo_url = mergedPhotos[0];
    }
  }

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
