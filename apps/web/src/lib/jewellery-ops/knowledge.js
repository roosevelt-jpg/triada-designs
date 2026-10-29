/**
 * Jewellery policies for answer-bot.
 * Catalog text (materials, care, shipping, make time) comes from admin Knowledge
 * when present. Safety rules stay code-owned (never invent prices / approvals).
 */

import { publishedKnowledgeForBot } from "@/lib/knowledge/knowledge-store";

export const AI_DISCLOSURE =
  "I'm Triada Designs' AI assistant. I can help with the collection and policies, and I can connect you to a person anytime.";

/** Sync fallback when store is unavailable — empty catalog fields. */
export function jewelleryPolicies() {
  return {
    materials: "",
    make_time_days: 7,
    make_time_copy: "",
    care: "",
    size_guide_url: "https://triada-designs.com/size-guide",
    shipping: "",
    pricing_rule:
      "Never invent prices — use the approved product price list only. Custom quotes require human approval.",
    whatsapp_rule:
      "WhatsApp: business messages only (orders, products, support) to opted-in customers.",
    approval_rule:
      "A person approves posts, broadcasts, and custom quotes before they go out.",
    outreach_rule:
      "No bulk unsolicited WhatsApp. Use email, LinkedIn, or Instagram with consent and opt-out.",
    ai_disclosure: AI_DISCLOSURE,
  };
}

/**
 * Merge admin Knowledge FAQs/policies into jewellery policy map.
 * @returns {Promise<Record<string, string | number>>}
 */
export async function resolveJewelleryPolicies() {
  const base = jewelleryPolicies();
  try {
    const fromKb = await publishedKnowledgeForBot();
    if (fromKb.materials) base.materials = fromKb.materials;
    if (fromKb.making) base.make_time_copy = fromKb.making;
    if (fromKb.care) base.care = fromKb.care;
    if (fromKb.shipping) base.shipping = fromKb.shipping;
    // First matching FAQ body also fills empty slots by title keywords
    for (const row of fromKb.policies || []) {
      const hay = `${row.title} ${row.tags.join(" ")}`.toLowerCase();
      if (!base.materials && /material|gold|silver|metal/.test(hay)) {
        base.materials = row.body;
      }
      if (!base.care && /care|clean|plating/.test(hay)) {
        base.care = row.body;
      }
      if (!base.shipping && /ship|deliver/.test(hay)) {
        base.shipping = row.body;
      }
      if (!base.make_time_copy && /make|lead|timing|days/.test(hay)) {
        base.make_time_copy = row.body;
      }
    }
  } catch {
    /* keep base */
  }
  return base;
}

/**
 * @param {string} message
 * @param {Record<string, string | number>} [policies]
 * @returns {string | null}
 */
export function answerFaq(message, policies) {
  const q = String(message || "").toLowerCase();
  const p = policies || jewelleryPolicies();

  if (q.includes("size") || q.includes("sizing")) {
    return `${p.ai_disclosure} Ring sizes follow our published size guide (${p.size_guide_url}). Share your usual size and we will note it — we never guess fit.`;
  }
  if (
    q.includes("material") ||
    q.includes("gold") ||
    q.includes("silver") ||
    q.includes("14k") ||
    q.includes("18k")
  ) {
    if (!p.materials) {
      return `${p.ai_disclosure} Materials are confirmed from the approved catalog. Ask a specialist for this piece.`;
    }
    return `${p.ai_disclosure} ${p.materials} A specialist confirms metal and lead time for gold-on-request pieces.`;
  }
  if (q.includes("care") || q.includes("clean")) {
    if (!p.care) {
      return `${p.ai_disclosure} Care guidance is set by the studio — a person can confirm for your piece.`;
    }
    return `${p.ai_disclosure} Care: ${p.care}`;
  }
  if (
    q.includes("ship") ||
    q.includes("deliver") ||
    q.includes("make") ||
    q.includes("lead")
  ) {
    const copy = p.make_time_copy || p.shipping;
    if (!copy) {
      return `${p.ai_disclosure} Make time and shipping are confirmed at checkout — we never invent dates.`;
    }
    return `${p.ai_disclosure} ${copy}`;
  }
  if (q.includes("price") || q.includes("cost") || q.includes("aed")) {
    return `${p.ai_disclosure} ${p.pricing_rule} Tell me which piece (or SKU) you mean.`;
  }
  return null;
}
