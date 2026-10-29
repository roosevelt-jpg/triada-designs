/**
 * UGC tag capture, permission request, repost queue + Telegram tag alert.
 */

import { AI_DISCLOSURE } from "@/lib/jewellery-ops/knowledge";
import { deliverJewelleryMessage } from "@/lib/jewellery-ops/delivery";
import { sendTelegramAlert } from "@/lib/jewellery-ops/telegram-alerts";
import {
  getJewelleryOpsRecord,
  listJewelleryOpsRecords,
  newJewelleryOpsId,
  upsertJewelleryOpsRecord,
} from "@/lib/jewellery-ops/store";

/**
 * @param {Record<string, unknown>} input
 */
export async function recordUgcTag(input = {}) {
  const id = newJewelleryOpsId("ugc");
  const handle = String(input.handle || input.username || "@guest").trim();
  const saved = await upsertJewelleryOpsRecord({
    id,
    kind: "ugc",
    status: "pending_permission",
    payload: {
      handle,
      channel: input.channel || "instagram",
      caption: input.caption || "",
      media_url: input.media_url || null,
      contact_id: input.contact_id || null,
      item_type: input.item_type || "tag",
      reward_offer:
        input.reward_offer ||
        "Thank-you discount or feature on our page (subject to approval).",
      phone: input.phone || null,
      email: input.email || null,
      whatsapp_opt_in: input.whatsapp_opt_in === true,
    },
  });

  const alert = await sendTelegramAlert({
    alert_type: "tag",
    title: `UGC tag from ${handle}`,
    body: String(input.caption || "New tagged post candidate"),
  });

  return {
    ok: true,
    item: { id: saved.record.id, status: "pending_permission", ...saved.record.payload },
    alert,
    storage: saved.storage,
  };
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} [input]
 */
export async function requestUgcPermission(id, input = {}) {
  const existing = await getJewelleryOpsRecord(id);
  if (!existing.record || existing.record.kind !== "ugc") {
    return { ok: false, error: "not_found" };
  }
  const payload = existing.record.payload || {};
  const body = `${AI_DISCLOSURE} We loved your post tagging Triada Designs — may we reshare it (with credit)? A small thank-you is available when you say yes.`;
  const delivery = await deliverJewelleryMessage({
    channel: payload.whatsapp_opt_in === true ? "whatsapp" : "email",
    whatsapp_opt_in: payload.whatsapp_opt_in === true,
    phone: payload.phone ? String(payload.phone) : undefined,
    to: payload.phone ? String(payload.phone) : undefined,
    email: payload.email ? String(payload.email) : input.email ? String(input.email) : undefined,
    body,
    subject: "Triada Designs — may we reshare your post?",
    template_name: payload.whatsapp_opt_in === true ? "ugc_permission_request" : undefined,
  });

  const saved = await upsertJewelleryOpsRecord({
    ...existing.record,
    status: "permission_requested",
    payload: {
      ...payload,
      permission_requested_at: new Date().toISOString(),
      delivery: {
        channel: delivery.channel,
        mode: delivery.mode,
        provider_message_id: delivery.provider_message_id || null,
      },
    },
  });

  return {
    ok: true,
    item_id: saved.record.id,
    status: "permission_requested",
    delivery,
    storage: saved.storage,
  };
}

export async function listUgcItems() {
  const listed = await listJewelleryOpsRecords({ kind: "ugc", limit: 100 });
  return {
    data: listed.data.map((r) => ({
      id: r.id,
      handle: r.payload?.handle || "@guest",
      channel: r.payload?.channel || "instagram",
      status: r.status,
      caption: r.payload?.caption || "",
    })),
    storage: listed.storage,
  };
}

export async function listUgcRepostQueue() {
  const listed = await listJewelleryOpsRecords({ kind: "ugc", limit: 100 });
  const data = listed.data
    .filter((r) =>
      ["permission_granted", "approved_repost", "permission_requested"].includes(r.status),
    )
    .map((r) => ({ id: r.id, status: r.status, ...r.payload }));
  return { data, storage: listed.storage };
}
