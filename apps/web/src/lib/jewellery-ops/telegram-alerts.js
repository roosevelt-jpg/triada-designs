/**
 * Priority Telegram ops alerts (wholesale, custom, big order, tags, …).
 */

import { deliverTelegramOpsAlert } from "@/lib/jewellery-ops/delivery";
import {
  listJewelleryOpsRecords,
  newJewelleryOpsId,
  upsertJewelleryOpsRecord,
} from "@/lib/jewellery-ops/store";

export const PRIORITY_ALERT_TYPES = [
  "wholesale",
  "boutique",
  "stylist",
  "interior",
  "corporate",
  "custom",
  "big_order",
  "tag",
  "drop",
  "popup",
  "low_stock",
  "ugc",
];

/**
 * @param {string} message
 * @returns {string | null}
 */
export function detectAlertType(message) {
  const q = String(message || "").toLowerCase();
  if (q.includes("wholesale")) return "wholesale";
  if (q.includes("boutique")) return "boutique";
  if (q.includes("stylist")) return "stylist";
  if (q.includes("interior")) return "interior";
  if (q.includes("corporate") || q.includes("gifting")) return "corporate";
  if (q.includes("custom") || q.includes("bespoke") || q.includes("engrav")) return "custom";
  if (q.includes("big order") || /\b(20|50|100)\+?\s*(pieces|units)\b/.test(q)) {
    return "big_order";
  }
  return null;
}

/**
 * @param {Record<string, unknown>} input
 */
export async function sendTelegramAlert(input = {}) {
  const alertType = String(input.alert_type || input.type || "ops");
  const title = String(input.title || `Triada ${alertType} alert`);
  const body = input.body != null ? String(input.body) : "";
  const priority = [
    "wholesale",
    "boutique",
    "stylist",
    "interior",
    "corporate",
    "custom",
    "big_order",
  ].includes(alertType)
    ? "high"
    : "normal";

  const delivery = await deliverTelegramOpsAlert({
    alert_type: alertType,
    title,
    body,
    chat_id: input.chat_id ? String(input.chat_id) : undefined,
  });

  const id = newJewelleryOpsId("tgalert");
  const saved = await upsertJewelleryOpsRecord({
    id,
    kind: "telegram_alert",
    status: delivery.status || (delivery.mode === "live" ? "sent" : "local_sim"),
    payload: {
      alert_type: alertType,
      priority,
      title,
      body,
      delivery_mode: delivery.mode,
      external_message_id: delivery.provider_message_id || null,
      error: delivery.error || null,
      sent_at: new Date().toISOString(),
      ...(input.payload && typeof input.payload === "object" ? input.payload : {}),
    },
  });

  return {
    ok: true,
    alert: {
      id: saved.record.id,
      alert_type: alertType,
      priority,
      title,
      body,
      status: saved.record.status,
      delivery_mode: delivery.mode,
    },
    mode: delivery.mode,
    storage: saved.storage,
  };
}

export async function listTelegramAlerts() {
  const listed = await listJewelleryOpsRecords({ kind: "telegram_alert", limit: 100 });
  return {
    data: listed.data.map((r) => ({ id: r.id, status: r.status, ...r.payload })),
    storage: listed.storage,
  };
}
