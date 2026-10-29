/**
 * Catalog-backed gift finder — approved product list only (never invent prices).
 */

import { listProducts } from "@/lib/commerce/products-store";
import { AI_DISCLOSURE } from "@/lib/jewellery-ops/knowledge";
import {
  newJewelleryOpsId,
  upsertJewelleryOpsRecord,
} from "@/lib/jewellery-ops/store";

/**
 * @param {string} band
 * @param {Record<string, unknown>} input
 * @returns {[number | null, number | null]}
 */
function parseBudget(band, input) {
  if (input.budget_min != null || input.budget_max != null) {
    return [
      input.budget_min != null ? Number(input.budget_min) : null,
      input.budget_max != null ? Number(input.budget_max) : null,
    ];
  }
  const b = String(band || "").toLowerCase();
  const range = b.match(/(\d+)\s*[-–to]+\s*(\d+)/);
  if (range) return [Number(range[1]), Number(range[2])];
  if (b.includes("under") || b.includes("<")) {
    const m = b.match(/(\d+)/);
    if (m) return [null, Number(m[1])];
  }
  const single = b.match(/(\d+)/);
  if (single) {
    const v = Number(single[1]);
    return [Math.max(0, v * 0.7), v * 1.3];
  }
  return [null, null];
}

/**
 * @param {Record<string, unknown>} input
 */
export async function suggestGifts(input = {}) {
  const recipient = String(input.recipient || input.who || "").trim();
  const occasion = String(input.occasion || "").trim();
  const budgetBand = String(input.budget || input.budget_band || "").trim();
  const [min, max] = parseBudget(budgetBand, input);

  const listed = await listProducts();
  const published = listed.data.filter(
    (p) => String(p.published_status || "") === "published",
  );
  const catalog = published.length ? published : listed.data;

  let filtered = catalog.filter((p) => {
    const price = p.price == null ? null : Number(p.price);
    if (price == null || !Number.isFinite(price)) return true;
    if (min != null && price < min) return false;
    if (max != null && price > max) return false;
    return true;
  });
  if (!filtered.length) filtered = catalog.slice(0, 3);

  const suggestions = filtered.slice(0, 3).map((p) => {
    const meta = p.metadata && typeof p.metadata === "object" ? p.metadata : {};
    return {
      sku: p.sku || p.id,
      title: p.title,
      price: p.price == null ? null : Number(p.price),
      currency: p.currency || "AED",
      product_url: p.product_url || "https://triada-designs.com/",
      photo_url:
        meta.photo_url ||
        `${p.product_url || "https://triada-designs.com/"}?view=image`,
      reason: [
        recipient ? `For ${recipient}` : "Gift pick",
        occasion || null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });

  const missing = [];
  if (!recipient) missing.push("who");
  if (!occasion) missing.push("occasion");
  if (!budgetBand && min == null && max == null) missing.push("budget");

  const sessionId = newJewelleryOpsId("gift");
  const saved = await upsertJewelleryOpsRecord({
    id: sessionId,
    kind: "gift_session",
    status: suggestions.length ? "suggested" : "collecting",
    payload: {
      recipient: recipient || null,
      occasion: occasion || null,
      budget_band: budgetBand || null,
      budget_min: min,
      budget_max: max,
      suggestions,
      contact_id: input.contact_id || null,
      conversation_id: input.conversation_id || null,
      disclosure: AI_DISCLOSURE,
    },
  });

  return {
    ok: true,
    session: saved.record,
    session_id: saved.record.id,
    suggestions,
    ask_next: missing,
    prompt: missing.length
      ? `To find the right gift I need: ${missing.join(", ")}.`
      : `${AI_DISCLOSURE} Here are 2–3 pieces from our approved collection with photo and link.`,
    disclosure: AI_DISCLOSURE,
    mode: "catalog",
    storage: saved.storage,
  };
}
