/**
 * Jeweller-style metal / stone colour presets for Size×Color stock variants.
 * Admin picks swatches or a custom hex; Shopify Color option uses the plain name.
 */

/**
 * @typedef {{ name: string, hex: string }} JewelleryColor
 */

/** @type {JewelleryColor[]} */
export const JEWELLERY_COLOR_SWATCHES = [
  { name: "Yellow Gold", hex: "#C5A028" },
  { name: "Rose Gold", hex: "#B76E79" },
  { name: "White Gold", hex: "#E8E6E1" },
  { name: "Silver", hex: "#C0C0C0" },
  { name: "Platinum", hex: "#E5E4E2" },
  { name: "Black", hex: "#1A1A1A" },
  { name: "Diamond", hex: "#F5F5F0" },
  { name: "Emerald", hex: "#046307" },
  { name: "Sapphire", hex: "#0F52BA" },
  { name: "Ruby", hex: "#9B111E" },
  { name: "Amethyst", hex: "#9966CC" },
  { name: "Pearl", hex: "#F8F4E8" },
];

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeHex(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  if (!s.startsWith("#")) s = `#${s}`;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return "";
  return s.toUpperCase();
}

/**
 * @param {unknown} raw
 * @returns {JewelleryColor | null}
 */
export function shapeJewelleryColor(raw) {
  if (typeof raw === "string") {
    const name = raw.trim();
    if (!name) return null;
    const preset = JEWELLERY_COLOR_SWATCHES.find(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );
    return { name: preset?.name || name, hex: preset?.hex || "#C4A882" };
  }
  if (!raw || typeof raw !== "object") return null;
  const row = /** @type {Record<string, unknown>} */ (raw);
  const name = String(row.name || row.color || row.label || "").trim();
  if (!name) return null;
  const hex =
    normalizeHex(row.hex || row.color_hex || row.value) ||
    JEWELLERY_COLOR_SWATCHES.find((s) => s.name.toLowerCase() === name.toLowerCase())
      ?.hex ||
    "#C4A882";
  return { name, hex };
}

/**
 * @param {unknown} raw
 * @returns {JewelleryColor[]}
 */
export function normalizeJewelleryColors(raw) {
  /** @type {JewelleryColor[]} */
  const out = [];
  const seen = new Set();
  const parts = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
      : [];
  for (const part of parts) {
    const shaped = shapeJewelleryColor(part);
    if (!shaped) continue;
    const key = shaped.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(shaped);
  }
  return out;
}

/**
 * Plain names for Shopify Color option / matrix expansion.
 * @param {JewelleryColor[]} colors
 * @returns {string[]}
 */
export function jewelleryColorNames(colors) {
  return normalizeJewelleryColors(colors).map((c) => c.name);
}

/**
 * Hex lookup by color name (case-insensitive).
 * @param {JewelleryColor[]} colors
 * @param {string} name
 */
export function hexForColorName(colors, name) {
  const needle = String(name || "").trim().toLowerCase();
  if (!needle) return null;
  const match = normalizeJewelleryColors(colors).find(
    (c) => c.name.toLowerCase() === needle,
  );
  return match?.hex || null;
}
