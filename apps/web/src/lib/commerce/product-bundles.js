/**
 * Jewellery product bundle helpers — component kits for catalog + Shopify.
 * Bundle metadata lives under product.metadata.bundle (and top-level mirrors).
 */

/**
 * @typedef {{
 *   product_id: string,
 *   title: string,
 *   price: number | null,
 *   currency: string | null,
 *   qty: number,
 * }} BundleComponent
 */

/**
 * @typedef {{
 *   metal: string,
 *   price: number | null,
 * }} BundleMetalVariant
 */

/**
 * @typedef {{
 *   is_bundle: boolean,
 *   components: BundleComponent[],
 *   components_sum: number | null,
 *   metal_variants: BundleMetalVariant[],
 *   price_tba: boolean,
 * }} ProductBundle
 */

/**
 * @param {unknown} raw
 * @returns {number | null}
 */
function toFiniteNumber(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
function cleanString(raw) {
  return raw == null ? "" : String(raw).trim();
}

/**
 * Normalize one component row from form/API/metadata.
 * @param {unknown} raw
 * @returns {BundleComponent | null}
 */
export function normalizeBundleComponent(raw) {
  if (!raw || typeof raw !== "object") return null;
  const row = /** @type {Record<string, unknown>} */ (raw);
  const productId = cleanString(row.product_id ?? row.id);
  if (!productId) return null;
  const qtyRaw = toFiniteNumber(row.qty ?? row.quantity ?? 1);
  const qty = qtyRaw != null && qtyRaw > 0 ? Math.min(99, Math.round(qtyRaw)) : 1;
  return {
    product_id: productId,
    title: cleanString(row.title || row.name) || productId,
    price: toFiniteNumber(row.price),
    currency: cleanString(row.currency) || null,
    qty,
  };
}

/**
 * @param {unknown} raw
 * @returns {BundleComponent[]}
 */
export function normalizeBundleComponents(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {BundleComponent[]} */
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const row = normalizeBundleComponent(item);
    if (!row) continue;
    if (seen.has(row.product_id)) continue;
    seen.add(row.product_id);
    out.push(row);
  }
  return out;
}

/**
 * Sum of component list prices × qty (null when no priced parts).
 * @param {BundleComponent[]} components
 * @returns {number | null}
 */
export function sumBundleComponentPrices(components) {
  const rows = normalizeBundleComponents(components);
  if (!rows.length) return null;
  let sum = 0;
  let any = false;
  for (const row of rows) {
    if (row.price == null) continue;
    sum += row.price * (row.qty || 1);
    any = true;
  }
  return any ? Math.round(sum * 100) / 100 : null;
}

/**
 * Suggested combo title from component names.
 * @param {BundleComponent[]} components
 * @returns {string}
 */
export function suggestBundleTitle(components) {
  const titles = normalizeBundleComponents(components)
    .map((c) => c.title)
    .filter(Boolean);
  if (!titles.length) return "";
  return titles.join(" + ");
}

/**
 * @param {unknown} raw
 * @returns {BundleMetalVariant[]}
 */
export function normalizeBundleMetalVariants(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {BundleMetalVariant[]} */
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = /** @type {Record<string, unknown>} */ (item);
    const metal = cleanString(row.metal || row.name || row.option);
    if (!metal) continue;
    const key = metal.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      metal,
      price: toFiniteNumber(row.price),
    });
  }
  return out;
}

/**
 * Metal variants that have a real sell price (for Shopify options).
 * @param {BundleMetalVariant[]} variants
 * @returns {BundleMetalVariant[]}
 */
export function pricedMetalVariants(variants) {
  return normalizeBundleMetalVariants(variants).filter(
    (v) => v.price != null && v.price >= 0,
  );
}

/**
 * True when this catalog row is a jewellery set/bundle.
 * @param {Record<string, unknown> | null | undefined} product
 */
export function isProductBundle(product) {
  return Boolean(extractProductBundle(product)?.is_bundle);
}

/**
 * Read bundle metadata from a product record.
 * @param {Record<string, unknown> | null | undefined} product
 * @returns {ProductBundle | null}
 */
export function extractProductBundle(product = {}) {
  const meta =
    product && product.metadata && typeof product.metadata === "object"
      ? /** @type {Record<string, unknown>} */ (product.metadata)
      : {};
  const nested =
    meta.bundle && typeof meta.bundle === "object"
      ? /** @type {Record<string, unknown>} */ (meta.bundle)
      : null;

  const components = normalizeBundleComponents(
    nested?.components ?? meta.components ?? meta.bundle_items,
  );
  const metalVariants = normalizeBundleMetalVariants(
    nested?.metal_variants ?? meta.metal_variants,
  );
  const flagged =
    nested?.is_bundle === true ||
    meta.is_bundle === true ||
    meta.product_mode === "bundle" ||
    components.length > 0;

  if (!flagged && !metalVariants.length) return null;

  const sum =
    toFiniteNumber(nested?.components_sum ?? meta.components_sum) ??
    sumBundleComponentPrices(components);

  const hasPricedMetals = pricedMetalVariants(metalVariants).length > 0;
  const blankBasePrice =
    product?.price == null || product?.price === "";
  const draftish =
    product?.published_status === "draft" ||
    product?.published_status === "pending";
  const priceTba =
    nested?.price_tba === true ||
    meta.price_tba === true ||
    (blankBasePrice && !hasPricedMetals && draftish);

  return {
    is_bundle: true,
    components,
    components_sum: sum,
    metal_variants: metalVariants,
    price_tba: Boolean(priceTba),
  };
}

/**
 * Merge bundle fields into product metadata without dropping unrelated keys.
 * @param {Record<string, unknown> | null | undefined} metadata
 * @param {{
 *   is_bundle?: boolean,
 *   components?: unknown,
 *   metal_variants?: unknown,
 *   price_tba?: boolean,
 * } | null | undefined} bundleInput
 */
export function mergeBundleIntoMetadata(metadata = {}, bundleInput = null) {
  const base =
    metadata && typeof metadata === "object" ? { ...metadata } : {};

  if (!bundleInput || bundleInput.is_bundle !== true) {
    delete base.is_bundle;
    delete base.components;
    delete base.bundle_items;
    delete base.components_sum;
    delete base.metal_variants;
    delete base.price_tba;
    delete base.product_mode;
    delete base.bundle;
    return base;
  }

  const components = normalizeBundleComponents(bundleInput.components);
  const metalVariants = normalizeBundleMetalVariants(bundleInput.metal_variants);
  const componentsSum = sumBundleComponentPrices(components);
  const priceTba = Boolean(bundleInput.price_tba);

  /** @type {ProductBundle} */
  const bundle = {
    is_bundle: true,
    components,
    components_sum: componentsSum,
    metal_variants: metalVariants,
    price_tba: priceTba,
  };

  base.bundle = bundle;
  base.is_bundle = true;
  base.product_mode = "bundle";
  base.components = components;
  base.components_sum = componentsSum;
  base.metal_variants = metalVariants;
  if (priceTba) base.price_tba = true;
  else delete base.price_tba;

  return base;
}

/**
 * Draft bundle with no sell price yet — keep local only until priced.
 * @param {Record<string, unknown> | null | undefined} product
 */
export function isBundlePriceTba(product) {
  const bundle = extractProductBundle(product);
  if (!bundle?.is_bundle) return false;
  const pricedMetals = pricedMetalVariants(bundle.metal_variants);
  if (pricedMetals.length) return false;
  const price = toFiniteNumber(product?.price);
  if (price != null) return false;
  if (bundle.price_tba) return true;
  return true;
}

/**
 * Whether Shopify auto-sync should run for this product save.
 * TBA drafts without a price stay local so Shopify never gets 0.00.
 * @param {Record<string, unknown> | null | undefined} product
 */
export function shouldSyncProductToShopify(product) {
  if (!product) return false;
  // TBA drafts without a sell price stay local so Shopify never gets 0.00.
  if (isBundlePriceTba(product)) return false;
  return true;
}

/**
 * Short SKU metal suffix.
 * @param {string} metal
 */
export function metalSkuSuffix(metal) {
  const slug = cleanString(metal)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 8);
  return slug || "METAL";
}

/**
 * Catalog picker rows from existing products (exclude self / nested kits).
 * @param {Array<Record<string, unknown>>} products
 * @param {{ excludeId?: string | null, q?: string }} [opts]
 */
export function filterBundleComponentCandidates(products, opts = {}) {
  const excludeId = opts.excludeId != null ? String(opts.excludeId) : null;
  const q = cleanString(opts.q).toLowerCase();
  const list = Array.isArray(products) ? products : [];
  return list.filter((p) => {
    if (!p || typeof p !== "object") return false;
    const id = cleanString(p.id);
    if (!id) return false;
    if (excludeId && id === excludeId) return false;
    if (isProductBundle(p)) return false;
    if (!q) return true;
    const hay = [
      p.title,
      p.sku,
      p.description,
      extractProductBundle(p)?.components?.map((c) => c.title).join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}
