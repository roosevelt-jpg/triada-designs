/**
 * Size / Color stock variants for catalogue pieces.
 * Admin sees plain Size + Color + Qty — no Shopify option JSON.
 * Bundles keep Metal pricing variants separately (product-bundles.js).
 */

/**
 * @typedef {{
 *   size: string,
 *   color: string,
 *   color_hex: string | null,
 *   sku: string | null,
 *   inventory_quantity: number | null,
 *   price: number | null,
 *   shopify_variant_id: string | null,
 * }} StockVariant
 */

/**
 * Split comma / newline option lists into unique trimmed values.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeOptionValues(raw) {
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  const parts =
    typeof raw === "string"
      ? raw.split(/[,\n]/)
      : Array.isArray(raw)
        ? raw
        : [];
  for (const part of parts) {
    const v = String(part || "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {StockVariant[]}
 */
export function normalizeStockVariants(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {StockVariant[]} */
  const out = [];
  const seen = new Set();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = /** @type {Record<string, unknown>} */ (row);
    const size = String(r.size || r.Size || "").trim();
    const color = String(r.color || r.Color || r.colour || "").trim();
    if (!size && !color) continue;
    const key = `${size.toLowerCase()}::${color.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const qtyRaw = r.inventory_quantity ?? r.qty ?? r.quantity;
    const qty =
      qtyRaw === null || qtyRaw === undefined || qtyRaw === ""
        ? null
        : Math.max(0, Math.floor(Number(qtyRaw)));
    const priceRaw = r.price;
    const price =
      priceRaw === null || priceRaw === undefined || priceRaw === ""
        ? null
        : Number(priceRaw);
    const sku = String(r.sku || "").trim() || null;
    const shopifyId =
      r.shopify_variant_id != null && String(r.shopify_variant_id).trim()
        ? String(r.shopify_variant_id).trim()
        : null;
    let colorHex = null;
    const hexRaw = r.color_hex ?? r.hex;
    if (typeof hexRaw === "string" && /^#?[0-9a-fA-F]{3,8}$/.test(hexRaw.trim())) {
      colorHex = hexRaw.trim().startsWith("#")
        ? hexRaw.trim().toUpperCase()
        : `#${hexRaw.trim().toUpperCase()}`;
    }
    out.push({
      size,
      color,
      color_hex: colorHex,
      sku,
      inventory_quantity: Number.isFinite(qty) ? qty : null,
      price: Number.isFinite(price) ? price : null,
      shopify_variant_id: shopifyId,
    });
  }
  return out;
}

/**
 * Build Size × Color matrix, preserving qty/sku from existing rows.
 * @param {{
 *   sizes?: unknown,
 *   colors?: unknown,
 *   existing?: unknown,
 * }} input
 * @returns {StockVariant[]}
 */
export function expandVariantMatrix(input = {}) {
  const sizes = normalizeOptionValues(input.sizes);
  const colors = normalizeOptionValues(input.colors);
  const existing = normalizeStockVariants(input.existing);
  /** @type {Map<string, StockVariant>} */
  const byKey = new Map();
  for (const row of existing) {
    byKey.set(`${row.size.toLowerCase()}::${row.color.toLowerCase()}`, row);
  }

  /** @type {StockVariant[]} */
  const out = [];

  if (!sizes.length && !colors.length) {
    return existing;
  }

  const sizeList = sizes.length ? sizes : [""];
  const colorList = colors.length ? colors : [""];

  for (const size of sizeList) {
    for (const color of colorList) {
      if (!size && !color) continue;
      const key = `${size.toLowerCase()}::${color.toLowerCase()}`;
      const prior = byKey.get(key);
      out.push(
        prior || {
          size,
          color,
          color_hex: null,
          sku: null,
          inventory_quantity: null,
          price: null,
          shopify_variant_id: null,
        },
      );
    }
  }
  return out;
}

/**
 * Unique size / color lists from variant rows.
 * @param {StockVariant[]} variants
 */
export function optionListsFromVariants(variants) {
  const rows = normalizeStockVariants(variants);
  return {
    sizes: normalizeOptionValues(rows.map((r) => r.size).filter(Boolean)),
    colors: normalizeOptionValues(rows.map((r) => r.color).filter(Boolean)),
  };
}

/**
 * Total on-hand across variant rows (null if none set).
 * @param {StockVariant[]} variants
 * @returns {number | null}
 */
export function sumVariantInventory(variants) {
  const rows = normalizeStockVariants(variants);
  let total = 0;
  let any = false;
  for (const row of rows) {
    if (row.inventory_quantity == null) continue;
    any = true;
    total += row.inventory_quantity;
  }
  return any ? total : null;
}

/**
 * @param {Record<string, unknown> | null | undefined} product
 * @returns {StockVariant[]}
 */
export function extractProductStockVariants(product) {
  if (!product || typeof product !== "object") return [];
  const meta =
    product.metadata && typeof product.metadata === "object"
      ? /** @type {Record<string, unknown>} */ (product.metadata)
      : {};
  const specs =
    meta.specs && typeof meta.specs === "object"
      ? /** @type {Record<string, unknown>} */ (meta.specs)
      : {};
  const raw =
    meta.stock_variants ??
    meta.variants ??
    specs.stock_variants ??
    product.stock_variants ??
    product.variants;
  return normalizeStockVariants(raw);
}

/**
 * Merge size/color stock variants into product metadata.
 * @param {Record<string, unknown> | null | undefined} metadata
 * @param {{
 *   sizes?: unknown,
 *   colors?: unknown,
 *   variants?: unknown,
 * }} input
 */
export function mergeStockVariantsIntoMetadata(metadata, input = {}) {
  const base =
    metadata && typeof metadata === "object"
      ? { ...metadata }
      : /** @type {Record<string, unknown>} */ ({});
  const specs =
    base.specs && typeof base.specs === "object"
      ? { .../** @type {Record<string, unknown>} */ (base.specs) }
      : {};

  const sizes = normalizeOptionValues(input.sizes);
  const colors = normalizeOptionValues(input.colors);
  const variants = expandVariantMatrix({
    sizes: sizes.length ? sizes : optionListsFromVariants(input.variants).sizes,
    colors: colors.length
      ? colors
      : optionListsFromVariants(input.variants).colors,
    existing: input.variants,
  });

  if (!variants.length) {
    delete base.stock_variants;
    delete base.variants;
    delete specs.stock_variants;
    delete specs.size_options;
    delete specs.color_options;
    base.specs = specs;
    return base;
  }

  base.stock_variants = variants;
  // Keep a friendly singular size/color for tags when only one value.
  if (sizes.length === 1) specs.size = sizes[0];
  else if (sizes.length > 1) specs.size = sizes.join(", ");
  if (colors.length === 1) specs.color = colors[0];
  else if (colors.length > 1) specs.color = colors.join(", ");
  specs.size_options = sizes;
  specs.color_options = colors;
  const colorSwatches = variants
    .filter((v) => v.color && v.color_hex)
    .map((v) => ({ name: v.color, hex: v.color_hex }));
  if (colorSwatches.length) {
    /** @type {Map<string, { name: string, hex: string }>} */
    const byName = new Map();
    for (const sw of colorSwatches) {
      byName.set(sw.name.toLowerCase(), { name: sw.name, hex: /** @type {string} */ (sw.hex) });
    }
    base.color_swatches = [...byName.values()];
    specs.color_swatches = [...byName.values()];
  }
  const total = sumVariantInventory(variants);
  if (total != null) {
    base.inventory_quantity = total;
    specs.inventory_quantity = total;
  }
  base.specs = specs;
  return base;
}

/**
 * Match key for Shopify option1/option2 ↔ local size/color.
 * @param {string} size
 * @param {string} color
 */
export function variantOptionKey(size, color) {
  return `${String(size || "").trim().toLowerCase()}::${String(color || "").trim().toLowerCase()}`;
}

/**
 * Whether this product should publish Size/Color Shopify options
 * (not when bundle metal multi-variants take precedence).
 * @param {StockVariant[]} variants
 */
export function hasSizeColorOptions(variants) {
  const rows = normalizeStockVariants(variants);
  if (!rows.length) return false;
  const { sizes, colors } = optionListsFromVariants(rows);
  return sizes.length + colors.length > 0;
}

/**
 * Build Shopify Admin option + variant rows for Size/Color.
 * @param {{
 *   product: { sku?: string | null, price?: number | null },
 *   variants: StockVariant[],
 *   compareAt?: string | null,
 *   weightGrams?: number | null,
 *   barcode?: string | null,
 *   variantIdsByKey?: Record<string, string | number>,
 * }} input
 */
export function toShopifySizeColorVariantRows(input) {
  const rows = normalizeStockVariants(input.variants);
  const { sizes, colors } = optionListsFromVariants(rows);
  /** @type {Array<{ name: string, values: string[] }>} */
  const options = [];
  if (sizes.length) options.push({ name: "Size", values: sizes });
  if (colors.length) options.push({ name: "Color", values: colors });

  const baseSku = input.product?.sku ? String(input.product.sku) : "";
  const basePrice =
    input.product?.price != null && Number.isFinite(Number(input.product.price))
      ? Number(input.product.price)
      : null;

  const variants = rows.map((row) => {
    /** @type {Record<string, unknown>} */
    const variant = {
      inventory_management: "shopify",
      requires_shipping: true,
    };
    if (sizes.length && colors.length) {
      variant.option1 = row.size;
      variant.option2 = row.color;
    } else if (sizes.length) {
      variant.option1 = row.size;
    } else if (colors.length) {
      variant.option1 = row.color;
    }
    const price =
      row.price != null && Number.isFinite(row.price) ? row.price : basePrice;
    if (price != null) variant.price = Number(price).toFixed(2);
    const sku =
      row.sku ||
      (baseSku
        ? [baseSku, row.size, row.color]
            .filter(Boolean)
            .join("-")
            .replace(/\s+/g, "")
        : undefined);
    if (sku) variant.sku = sku;
    if (input.barcode) variant.barcode = input.barcode;
    if (row.inventory_quantity != null) {
      variant.inventory_quantity = row.inventory_quantity;
    }
    if (input.compareAt != null) variant.compare_at_price = input.compareAt;
    if (input.weightGrams != null && Number.isFinite(input.weightGrams)) {
      variant.weight = input.weightGrams;
      variant.weight_unit = "g";
    }
    const key = variantOptionKey(row.size, row.color);
    const prior =
      input.variantIdsByKey &&
      (input.variantIdsByKey[key] ??
        input.variantIdsByKey[`${row.size}::${row.color}`]);
    if (prior != null && String(prior).trim()) {
      variant.id = Number(prior) || prior;
    }
    return variant;
  });

  return { options, variants };
}
