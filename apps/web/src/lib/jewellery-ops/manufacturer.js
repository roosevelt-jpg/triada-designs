/**
 * Manufacturer materials board + job push + low-stock Telegram alerts.
 */

import { sendTelegramAlert } from "@/lib/jewellery-ops/telegram-alerts";
import {
  listJewelleryOpsRecords,
  newJewelleryOpsId,
  upsertJewelleryOpsRecord,
} from "@/lib/jewellery-ops/store";

const DEFAULT_MATERIALS = [
  {
    material_key: "silver_gold_plate",
    display_name: "Silver with gold plating",
    stock_grams: 420,
    low_stock_threshold_grams: 80,
  },
  {
    material_key: "14k",
    display_name: "14K gold",
    stock_grams: 35,
    low_stock_threshold_grams: 40,
  },
  {
    material_key: "18k",
    display_name: "18K gold",
    stock_grams: 22,
    low_stock_threshold_grams: 25,
  },
];

async function ensureMaterialsSeeded() {
  const listed = await listJewelleryOpsRecords({ kind: "manufacturer_material", limit: 50 });
  if (listed.data.length) return listed;
  for (const mat of DEFAULT_MATERIALS) {
    await upsertJewelleryOpsRecord({
      id: `mfr-mat-${mat.material_key}`,
      kind: "manufacturer_material",
      status: "active",
      payload: mat,
    });
  }
  return listJewelleryOpsRecords({ kind: "manufacturer_material", limit: 50 });
}

/**
 * @param {{ alert?: boolean }} [opts]
 */
export async function getManufacturerOverview(opts = {}) {
  const materialsListed = await ensureMaterialsSeeded();
  const materials = materialsListed.data.map((r) => ({
    id: r.id,
    ...DEFAULT_MATERIALS.find((d) => d.material_key === r.payload?.material_key),
    ...r.payload,
  }));

  const jobs = await listJewelleryOpsRecords({ kind: "manufacturer_job", limit: 100 });
  const openJobs = jobs.data.filter((j) =>
    ["queued", "in_progress", "open"].includes(String(j.status)),
  ).length;

  const lowStock = [];
  for (const mat of materials) {
    const stock = Number(mat.stock_grams ?? 0);
    const threshold = Number(mat.low_stock_threshold_grams ?? 0);
    if (stock < threshold) {
      /** @type {object | null} */
      let alert = null;
      if (opts.alert === true) {
        alert = await sendTelegramAlert({
          alert_type: "low_stock",
          title: `Low stock: ${mat.display_name || mat.material_key}`,
          body: `${stock}g remaining (threshold ${threshold}g)`,
        });
      }
      lowStock.push({
        material_key: mat.material_key,
        stock_grams: stock,
        low_stock_threshold_grams: threshold,
        alert,
      });
    }
  }

  return {
    materials,
    open_jobs: openJobs,
    low_stock_alerts: lowStock,
    honesty: "Manufacturer board — stock and open jobs.",
    storage: materialsListed.storage,
  };
}

/**
 * @param {Record<string, unknown>} input
 */
export async function pushManufacturerOrder(input = {}) {
  const id = newJewelleryOpsId("mfrjob");
  const saved = await upsertJewelleryOpsRecord({
    id,
    kind: "manufacturer_job",
    status: "queued",
    payload: {
      order_id: input.order_id || null,
      material_key: input.material_key || "silver_gold_plate",
      piece: input.piece || input.title || "Custom piece",
      quantity: Number(input.quantity || 1) || 1,
      notes: input.notes || "",
      delivery_mode: "queued",
      pushed_at: new Date().toISOString(),
    },
  });
  return {
    ok: true,
    job: { id: saved.record.id, status: "queued", ...saved.record.payload },
    storage: saved.storage,
  };
}
