/**
 * Cart / sizing abandonment — track + process due (1-day reminder).
 * Sends WhatsApp (opt-in) or email via real delivery helpers.
 */

import { AI_DISCLOSURE } from "@/lib/jewellery-ops/knowledge";
import { deliverJewelleryMessage } from "@/lib/jewellery-ops/delivery";
import {
  listJewelleryOpsRecords,
  newJewelleryOpsId,
  upsertJewelleryOpsRecord,
} from "@/lib/jewellery-ops/store";

/**
 * @param {Record<string, unknown>} input
 */
export async function trackAbandonment(input = {}) {
  const eventType = String(input.event_type || "cart").toLowerCase() === "sizing"
    ? "sizing"
    : "cart";
  const remindAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const id = newJewelleryOpsId("abandon");
  const saved = await upsertJewelleryOpsRecord({
    id,
    kind: "abandonment",
    status: "open",
    run_at: remindAt,
    payload: {
      event_type: eventType,
      contact_id: input.contact_id || null,
      conversation_id: input.conversation_id || null,
      channel: input.channel || "webchat",
      context: input.context && typeof input.context === "object" ? input.context : {},
      quiet_since: new Date().toISOString(),
      whatsapp_opt_in: input.whatsapp_opt_in === true,
      phone: input.phone || input.to || null,
      email: input.email || null,
      customer_name: input.customer_name || null,
    },
  });

  return {
    ok: true,
    event: {
      id: saved.record.id,
      event_type: eventType,
      status: "open",
      remind_at: remindAt,
      whatsapp_opt_in: input.whatsapp_opt_in === true,
      ...saved.record.payload,
    },
    note: "One friendly reminder scheduled after 1 day if still quiet.",
    storage: saved.storage,
  };
}

/**
 * Process due abandonment reminders.
 * @param {{ limit?: number }} [opts]
 */
export async function processDueAbandonment(opts = {}) {
  const now = new Date().toISOString();
  const listed = await listJewelleryOpsRecords({
    kind: "abandonment",
    status: "open",
    due_before: now,
    limit: Math.min(Number(opts.limit) || 50, 50),
  });

  const processed = [];
  for (const row of listed.data) {
    const payload = row.payload || {};
    const eventType = String(payload.event_type || "cart");
    const optIn = payload.whatsapp_opt_in === true;
    const body =
      eventType === "sizing"
        ? `${AI_DISCLOSURE} Friendly note — still happy to help with sizing. A person can join anytime.`
        : `${AI_DISCLOSURE} Friendly reminder — your piece is still waiting. Happy to help with questions.`;

    const delivery = await deliverJewelleryMessage({
      channel: optIn ? "whatsapp" : String(payload.channel || "email"),
      whatsapp_opt_in: optIn,
      phone: payload.phone ? String(payload.phone) : undefined,
      to: payload.phone ? String(payload.phone) : undefined,
      email: payload.email ? String(payload.email) : undefined,
      body,
      subject: "Triada Designs — still here if you need us",
      template_name: optIn
        ? eventType === "sizing"
          ? "sizing_abandonment_nudge"
          : "cart_abandonment_nudge"
        : undefined,
    });

    const updated = await upsertJewelleryOpsRecord({
      ...row,
      status: "reminded",
      payload: {
        ...payload,
        reminded_at: now,
        reminder: {
          channel: delivery.channel,
          body,
          mode: delivery.mode,
          provider_message_id: delivery.provider_message_id || null,
          error: delivery.error || null,
          business_only: delivery.channel === "whatsapp",
        },
      },
    });

    processed.push({
      id: updated.record.id,
      status: "reminded",
      delivery,
    });
  }

  return {
    ok: true,
    worker: "abandonment",
    processed: processed.length,
    events: processed,
    storage: listed.storage,
  };
}

/** @returns {Promise<{ data: object[] }>} */
export async function listAbandonmentEvents() {
  const listed = await listJewelleryOpsRecords({ kind: "abandonment", limit: 100 });
  return {
    data: listed.data.map((r) => ({
      id: r.id,
      status: r.status,
      remind_at: r.run_at,
      ...r.payload,
    })),
    storage: listed.storage,
  };
}
