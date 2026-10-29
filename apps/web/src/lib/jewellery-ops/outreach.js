/**
 * Outreach CRM — email / IG / LinkedIn drafts; human approve before send.
 * Never bulk WhatsApp.
 */

import { AI_DISCLOSURE } from "@/lib/jewellery-ops/knowledge";
import { deliverJewelleryMessage } from "@/lib/jewellery-ops/delivery";
import {
  getJewelleryOpsRecord,
  listJewelleryOpsRecords,
  newJewelleryOpsId,
  upsertJewelleryOpsRecord,
} from "@/lib/jewellery-ops/store";

const ALLOWED_CHANNELS = new Set(["email", "instagram", "linkedin"]);

/**
 * @param {Record<string, unknown>} input
 */
export async function upsertOutreachProspect(input = {}) {
  const channel = String(input.channel || "email").toLowerCase();
  if (channel === "whatsapp") {
    return {
      ok: false,
      error: "whatsapp_outreach_forbidden",
      message: "No bulk unsolicited WhatsApp. Use email, LinkedIn, or Instagram.",
    };
  }
  const id = input.id ? String(input.id) : newJewelleryOpsId("prospect");
  const saved = await upsertJewelleryOpsRecord({
    id,
    kind: "outreach_prospect",
    status: String(input.status || "new"),
    payload: {
      name: input.name || "Prospect",
      channel: ALLOWED_CHANNELS.has(channel) ? channel : "email",
      email: input.email || null,
      handle: input.handle || null,
      company: input.company || null,
      notes: input.notes || "",
      consent: input.consent === true,
    },
  });
  return {
    ok: true,
    prospect: { id: saved.record.id, status: saved.record.status, ...saved.record.payload },
    storage: saved.storage,
  };
}

/**
 * @param {string} prospectId
 * @param {Record<string, unknown>} [input]
 */
export async function draftOutreachMessage(prospectId, input = {}) {
  const prospect = await getJewelleryOpsRecord(prospectId);
  if (!prospect.record || prospect.record.kind !== "outreach_prospect") {
    return { ok: false, error: "prospect_not_found" };
  }
  const channel = String(prospect.record.payload?.channel || "email");
  if (channel === "whatsapp") {
    return { ok: false, error: "whatsapp_outreach_forbidden" };
  }

  const body =
    String(input.body || "").trim() ||
    `${AI_DISCLOSURE}\n\nHello ${prospect.record.payload?.name || ""} — Triada Designs Salt & Spirit collection for your buyers. Happy to share lookbook details if useful.`;

  const id = newJewelleryOpsId("om");
  const saved = await upsertJewelleryOpsRecord({
    id,
    kind: "outreach_message",
    status: "draft",
    payload: {
      prospect_id: prospectId,
      channel,
      body,
      subject: input.subject || "Triada Designs — Salt & Spirit",
      to: prospect.record.payload?.email || input.to || null,
      human_approved: false,
    },
  });

  return {
    ok: true,
    message: {
      id: saved.record.id,
      prospect_id: prospectId,
      status: "draft",
      body,
      channel,
    },
    storage: saved.storage,
  };
}

/**
 * @param {string} messageId
 * @param {Record<string, unknown>} [input]
 */
export async function approveOutreachMessage(messageId, input = {}) {
  const existing = await getJewelleryOpsRecord(messageId);
  if (!existing.record || existing.record.kind !== "outreach_message") {
    return { ok: false, error: "not_found" };
  }
  if (input.human_approved !== true && input.approved !== true) {
    return { ok: false, error: "human_approval_required" };
  }

  const payload = existing.record.payload || {};
  const channel = String(payload.channel || "email");
  if (channel === "whatsapp") {
    return { ok: false, error: "whatsapp_outreach_forbidden" };
  }

  let delivery = { ok: true, mode: "local_sim", channel };
  if (channel === "email" && payload.to) {
    delivery = await deliverJewelleryMessage({
      channel: "email",
      email: String(payload.to),
      to: String(payload.to),
      subject: String(payload.subject || "Triada Designs"),
      body: String(payload.body || ""),
    });
  } else {
    // IG / LinkedIn: mark approved for manual send / future Graph path
    delivery = {
      ok: true,
      mode: "awaiting_channel_send",
      channel,
      note: "Approved — send via connected channel tooling.",
    };
  }

  const saved = await upsertJewelleryOpsRecord({
    ...existing.record,
    status: "approved",
    payload: {
      ...payload,
      human_approved: true,
      approved_at: new Date().toISOString(),
      delivery,
    },
  });

  return {
    ok: true,
    message_id: saved.record.id,
    status: "approved",
    delivery,
    storage: saved.storage,
  };
}

export async function listOutreachProspects() {
  const listed = await listJewelleryOpsRecords({ kind: "outreach_prospect", limit: 100 });
  return {
    data: listed.data.map((r) => ({ id: r.id, status: r.status, ...r.payload })),
    storage: listed.storage,
  };
}

export async function listOutreachMessages() {
  const listed = await listJewelleryOpsRecords({ kind: "outreach_message", limit: 100 });
  return {
    data: listed.data.map((r) => ({ id: r.id, status: r.status, ...r.payload })),
    storage: listed.storage,
  };
}
