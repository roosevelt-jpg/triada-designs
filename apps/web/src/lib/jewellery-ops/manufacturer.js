/**
 * Manufacturer materials board + job push + low-stock Telegram alerts.
 * Materials come from admin manufacturer store — empty by default (no seed).
 */

import { sendTelegramAlert } from "@/lib/jewellery-ops/telegram-alerts";
import {
  listJewelleryOpsRecords,
  newJewelleryOpsId,
  upsertJewelleryOpsRecord,
} from "@/lib/jewellery-ops/store";
import {
  checkLowStock,
  ensureManufacturerMaterials,
} from "@/lib/manufacturer/materials";

/**
 * @param {{ alert?: boolean }} [opts]
 */
export async function getManufacturerOverview(opts = {}) {
  const materialsListed = await ensureManufacturerMaterials();
  const materials = materialsListed.data;

  const jobs = await listJewelleryOpsRecords({ kind: "manufacturer_job", limit: 100 });
  const openJobs = jobs.data.filter((j) =>
    ["queued", "in_progress", "open"].includes(String(j.status)),
  ).length;

  const lowStock = [];
  const low = await checkLowStock();
  for (const mat of low) {
    /** @type {object | null} */
    let alert = null;
    if (opts.alert === true) {
      alert = await sendTelegramAlert({
        alert_type: "low_stock",
        title: `Low stock: ${mat.display_name || mat.material_key}`,
        body: `${mat.stock_grams}g remaining (threshold ${mat.threshold || mat.low_stock_threshold_grams}g)`,
      });
    }
    lowStock.push({
      material_key: mat.material_key,
      display_name: mat.display_name,
      stock_grams: mat.stock_grams,
      low_stock_threshold_grams: mat.threshold || mat.low_stock_threshold_grams,
      alert,
    });
  }

  return {
    materials,
    open_jobs: openJobs,
    jobs: jobs.data.slice(0, 20),
    low_stock: lowStock,
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
      material_key: input.material_key || null,
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
