/**
 * Custom / bespoke piece collection + human quote approval + Telegram alert.
 */

import { AI_DISCLOSURE } from "@/lib/jewellery-ops/knowledge";
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
export async function collectCustomPiece(input = {}) {
  const piece = String(input.piece || input.piece_type || "").trim();
  const size = String(input.size || "").trim();
  const metal = String(input.metal || "").trim();
  const budget = input.budget != null ? Number(input.budget) : null;

  const missing = [];
  if (!piece) missing.push("piece");
  if (!size) missing.push("size");
  if (!metal) missing.push("metal");

  const briefReady = missing.length === 0;
  const designBrief = briefReady
    ? [
        AI_DISCLOSURE,
        `Custom request: ${piece}`,
        size ? `Size: ${size}` : null,
        metal ? `Metal: ${metal}` : null,
        input.stone_colour ? `Stone/colour: ${input.stone_colour}` : null,
        input.engraving_text ? `Engraving: ${input.engraving_text}` : null,
        budget != null ? `Budget hint: ${budget} AED (not a quote)` : null,
        input.deadline ? `Deadline: ${input.deadline}` : null,
        "Quoted price requires human approval — never invent pricing.",
      ]
        .filter(Boolean)
        .join("\n")
    : null;

  const id = input.id ? String(input.id) : newJewelleryOpsId("custom");
  const status = briefReady ? "brief_ready" : "collecting";
  const saved = await upsertJewelleryOpsRecord({
    id,
    kind: "custom_piece",
    status,
    payload: {
      request_type: input.request_type || "custom",
      piece: piece || null,
      size: size || null,
      metal: metal || null,
      stone_colour: input.stone_colour || null,
      engraving_text: input.engraving_text || null,
      budget,
      deadline: input.deadline || null,
      consultation_mode: input.consultation_mode || null,
      consultation_at: input.consultation_at || null,
      design_brief: designBrief,
      story_answers: input.story_answers || {},
      photo_refs: Array.isArray(input.photo_refs) ? input.photo_refs : [],
      contact_id: input.contact_id || null,
      conversation_id: input.conversation_id || null,
      quoted_price: null,
      human_approved: false,
      ask_next: missing,
    },
  });

  let alert = null;
  if (briefReady) {
    alert = await sendTelegramAlert({
      alert_type: "custom",
      title: `Custom piece brief ready — ${piece}`,
      body: designBrief || "",
    });
  }

  return {
    ok: true,
    request: { id: saved.record.id, status, ...saved.record.payload },
    ask_next: missing,
    alert,
    disclosure: AI_DISCLOSURE,
    storage: saved.storage,
  };
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} input
 */
export async function approveCustomQuote(id, input = {}) {
  const existing = await getJewelleryOpsRecord(id);
  if (!existing.record || existing.record.kind !== "custom_piece") {
    return { ok: false, error: "not_found" };
  }
  const price = Number(input.quoted_price ?? input.price);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: "quoted_price_required" };
  }
  if (input.human_approved !== true && input.approved !== true) {
    return { ok: false, error: "human_approval_required" };
  }

  const saved = await upsertJewelleryOpsRecord({
    ...existing.record,
    status: "approved",
    payload: {
      ...existing.record.payload,
      quoted_price: price,
      human_approved: true,
      approved_at: new Date().toISOString(),
      approved_by: input.approved_by || "admin",
    },
  });

  return {
    ok: true,
    request: { id: saved.record.id, status: "approved", ...saved.record.payload },
    storage: saved.storage,
  };
}

export async function listCustomPieces() {
  const listed = await listJewelleryOpsRecords({ kind: "custom_piece", limit: 100 });
  return {
    data: listed.data.map((r) => ({ id: r.id, status: r.status, ...r.payload })),
    storage: listed.storage,
  };
}
