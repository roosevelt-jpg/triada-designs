/**
 * Sold-out waitlist + VIP Telegram drops.
 */

import { AI_DISCLOSURE } from "@/lib/jewellery-ops/knowledge";
import {
  deliverJewelleryMessage,
  deliverTelegramOpsAlert,
} from "@/lib/jewellery-ops/delivery";
import {
  listJewelleryOpsRecords,
  newJewelleryOpsId,
  upsertJewelleryOpsRecord,
} from "@/lib/jewellery-ops/store";

/**
 * @param {Record<string, unknown>} input
 */
export async function joinWaitlist(input = {}) {
  const id = newJewelleryOpsId("wait");
  const saved = await upsertJewelleryOpsRecord({
    id,
    kind: "waitlist",
    status: "waiting",
    payload: {
      contact_id: input.contact_id || null,
      product_id: input.product_id || null,
      sku: input.sku || null,
      size: input.size || null,
      colour: input.colour || null,
      channel: input.channel || "webchat",
      notify_via: input.notify_via || (input.whatsapp_opt_in ? "whatsapp" : "email"),
      vip: input.vip === true,
      whatsapp_opt_in: input.whatsapp_opt_in === true,
      phone: input.phone || null,
      email: input.email || null,
      chat_id: input.chat_id || null,
    },
  });
  return { ok: true, entry: { id: saved.record.id, status: "waiting", ...saved.record.payload }, storage: saved.storage };
}

/**
 * @param {Record<string, unknown>} input
 */
export async function notifyWaitlistRestock(input = {}) {
  const sku = input.sku ? String(input.sku) : "";
  const listed = await listJewelleryOpsRecords({ kind: "waitlist", status: "waiting", limit: 100 });
  const targets = listed.data.filter((r) => {
    if (!sku) return true;
    return String(r.payload?.sku || "") === sku || String(r.payload?.product_id || "") === String(input.product_id || "");
  });

  const notified = [];
  const body = `${AI_DISCLOSURE} Good news — a piece on your waitlist is available again${sku ? ` (${sku})` : ""}. Reply if you'd like help securing it.`;

  for (const row of targets.slice(0, 40)) {
    const payload = row.payload || {};
    const via = String(payload.notify_via || "email");
    const delivery = await deliverJewelleryMessage({
      channel: via === "whatsapp" ? "whatsapp" : via === "telegram" ? "telegram" : "email",
      whatsapp_opt_in: payload.whatsapp_opt_in === true || via === "whatsapp",
      phone: payload.phone ? String(payload.phone) : undefined,
      to: payload.phone ? String(payload.phone) : undefined,
      email: payload.email ? String(payload.email) : undefined,
      chat_id: payload.chat_id ? String(payload.chat_id) : undefined,
      body,
      subject: "Triada Designs — waitlist restock",
      template_name:
        via === "whatsapp" || payload.whatsapp_opt_in === true
          ? "waitlist_restock"
          : undefined,
    });
    await upsertJewelleryOpsRecord({
      ...row,
      status: "notified",
      payload: {
        ...payload,
        notified_at: new Date().toISOString(),
        delivery: {
          channel: delivery.channel,
          mode: delivery.mode,
          provider_message_id: delivery.provider_message_id || null,
        },
      },
    });
    notified.push({ id: row.id, delivery });
  }

  return { ok: true, notified: notified.length, entries: notified };
}

/**
 * @param {Record<string, unknown>} input
 */
export async function announceVipDrop(input = {}) {
  const title = String(input.title || "VIP drop");
  const body = String(
    input.body ||
      `${AI_DISCLOSURE} Exclusive Triada Designs VIP preview — limited pieces. A person can help you reserve.`,
  );
  const alert = await deliverTelegramOpsAlert({
    alert_type: "drop",
    title,
    body,
    chat_id: input.chat_id ? String(input.chat_id) : undefined,
  });

  const dropId = newJewelleryOpsId("vip");
  const saved = await upsertJewelleryOpsRecord({
    id: dropId,
    kind: "vip_drop",
    status: alert.mode === "live" ? "sent" : "local_sim",
    payload: {
      title,
      body,
      delivery: alert,
      list_name: input.list_name || "vip",
    },
  });

  // Also message VIP waitlist contacts when opted in.
  const wait = await listJewelleryOpsRecords({ kind: "waitlist", status: "waiting", limit: 100 });
  const vips = wait.data.filter((r) => r.payload?.vip === true);
  const customerSends = [];
  for (const row of vips.slice(0, 20)) {
    const payload = row.payload || {};
    const delivery = await deliverJewelleryMessage({
      channel: payload.whatsapp_opt_in === true ? "whatsapp" : "email",
      whatsapp_opt_in: payload.whatsapp_opt_in === true,
      phone: payload.phone ? String(payload.phone) : undefined,
      to: payload.phone ? String(payload.phone) : undefined,
      email: payload.email ? String(payload.email) : undefined,
      body,
      subject: title,
      template_name: payload.whatsapp_opt_in === true ? "vip_drop_announce" : undefined,
    });
    customerSends.push({ id: row.id, delivery });
  }

  return {
    ok: true,
    drop: saved.record,
    telegram: alert,
    vip_notified: customerSends.length,
    customer_sends: customerSends,
    storage: saved.storage,
  };
}

export async function listWaitlist() {
  const listed = await listJewelleryOpsRecords({ kind: "waitlist", limit: 100 });
  return {
    data: listed.data.map((r) => ({ id: r.id, status: r.status, ...r.payload })),
    storage: listed.storage,
  };
}
