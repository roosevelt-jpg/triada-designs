/**
 * Manufacturer materials catalog (metal $/g, making charge, stock).
 */

import {
  WORKSPACE_ID,
  listManufacturerRows,
  newManufacturerId,
  nowIso,
  upsertManufacturerRow,
} from "@/lib/manufacturer/persistence";

const TABLE = "manufacturer_materials";

export const DEFAULT_MATERIALS = [
  {
    material_key: "silver_gold_plate",
    display_name: "Silver with gold plating",
    unit: "g",
    metal_price_per_gram: 2.4,
    making_charge_per_gram: 8.5,
    stock_grams: 420,
    low_stock_threshold_grams: 80,
    currency: "AED",
  },
  {
    material_key: "14k",
    display_name: "14K gold",
    unit: "g",
    metal_price_per_gram: 185,
    making_charge_per_gram: 22,
    stock_grams: 35,
    low_stock_threshold_grams: 40,
    currency: "AED",
  },
  {
    material_key: "18k",
    display_name: "18K gold",
    unit: "g",
    metal_price_per_gram: 245,
    making_charge_per_gram: 28,
    stock_grams: 22,
    low_stock_threshold_grams: 25,
    currency: "AED",
  },
];

/**
 * @param {Partial<object>} input
 */
export function shapeManufacturerMaterial(input = {}) {
  return {
    id: String(input.id || newManufacturerId("mfrmat")),
    workspace_id: String(input.workspace_id || WORKSPACE_ID),
    material_key: String(input.material_key || "silver_gold_plate"),
    display_name: String(input.display_name || input.material_key || "Material"),
    unit: String(input.unit || "g"),
    metal_price_per_gram:
      input.metal_price_per_gram != null ? Number(input.metal_price_per_gram) : null,
    making_charge_per_gram:
      input.making_charge_per_gram != null ? Number(input.making_charge_per_gram) : null,
    stock_grams: input.stock_grams != null ? Number(input.stock_grams) : null,
    low_stock_threshold_grams:
      input.low_stock_threshold_grams != null
        ? Number(input.low_stock_threshold_grams)
        : null,
    currency: String(input.currency || "AED"),
    price_as_of: input.price_as_of ? String(input.price_as_of) : nowIso(),
    metadata:
      input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    created_at: String(input.created_at || nowIso()),
    updated_at: String(input.updated_at || nowIso()),
  };
}

export async function ensureManufacturerMaterials() {
  const listed = await listManufacturerRows(TABLE, {
    limit: 50,
    orderBy: "display_name",
    ascending: true,
  });
  if (listed.data.length) {
    return {
      data: listed.data.map((r) => shapeManufacturerMaterial(r)),
      storage: listed.storage,
    };
  }
  for (const mat of DEFAULT_MATERIALS) {
    await upsertManufacturerRow(
      TABLE,
      shapeManufacturerMaterial({
        id: `mfrmat-${mat.material_key}`,
        ...mat,
      }),
    );
  }
  const again = await listManufacturerRows(TABLE, {
    limit: 50,
    orderBy: "display_name",
    ascending: true,
  });
  return {
    data: again.data.map((r) => shapeManufacturerMaterial(r)),
    storage: again.storage,
  };
}

/**
 * @param {string} materialKey
 * @param {number} grams
 */
export async function estimateManufacturerCost(materialKey, grams) {
  const materials = await ensureManufacturerMaterials();
  const key = String(materialKey || "silver_gold_plate");
  const g = Number(grams || 8) || 8;
  const material =
    materials.data.find((m) => m.material_key === key) ||
    materials.data.find((m) => m.material_key === "silver_gold_plate") ||
    null;
  if (!material) return { cost: round2(g * 12), material: null };
  const metal = Number(material.metal_price_per_gram || 0) * g;
  const making = Number(material.making_charge_per_gram || 0) * g;
  return { cost: round2(metal + making), material, grams: g };
}

/**
 * @param {number} n
 */
function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * @returns {Promise<object[]>}
 */
export async function checkLowStock() {
  const materials = await ensureManufacturerMaterials();
  /** @type {object[]} */
  const low = [];
  for (const m of materials.data) {
    if (
      m.stock_grams != null &&
      m.low_stock_threshold_grams != null &&
      Number(m.stock_grams) <= Number(m.low_stock_threshold_grams)
    ) {
      low.push({
        material_key: m.material_key,
        display_name: m.display_name,
        stock_grams: Number(m.stock_grams),
        threshold: Number(m.low_stock_threshold_grams),
        low_stock_threshold_grams: Number(m.low_stock_threshold_grams),
      });
    }
  }
  return low;
}
