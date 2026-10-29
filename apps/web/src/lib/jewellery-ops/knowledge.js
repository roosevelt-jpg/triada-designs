/**
 * Approved Triada jewellery policies — bots must never invent beyond this list.
 */

export const AI_DISCLOSURE =
  "I'm Triada Designs' AI assistant. I can help with the collection and policies, and I can connect you to a person anytime.";

/** @returns {Record<string, string | number>} */
export function jewelleryPolicies() {
  return {
    materials: "Silver with gold plating; 14K and 18K gold available on request.",
    make_time_days: 7,
    make_time_copy:
      "About 7 days to make each piece. Shipping estimates confirmed at checkout.",
    care: "Store dry, avoid harsh chemicals and perfume on metal, gently wipe with a soft cloth.",
    size_guide_url: "https://triada-designs.com/size-guide",
    shipping:
      "Shipping estimates are confirmed at checkout for supported regions. Do not invent dates.",
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
 * @param {string} message
 * @returns {string | null}
 */
export function answerFaq(message) {
  const q = String(message || "").toLowerCase();
  const p = jewelleryPolicies();

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
    return `${p.ai_disclosure} ${p.materials} A specialist confirms metal and lead time for gold-on-request pieces.`;
  }
  if (q.includes("care") || q.includes("clean")) {
    return `${p.ai_disclosure} Care: ${p.care}`;
  }
  if (
    q.includes("ship") ||
    q.includes("deliver") ||
    q.includes("make") ||
    q.includes("lead")
  ) {
    return `${p.ai_disclosure} ${p.make_time_copy}`;
  }
  if (q.includes("price") || q.includes("cost") || q.includes("aed")) {
    return `${p.ai_disclosure} ${p.pricing_rule} Tell me which piece (or SKU) you mean.`;
  }
  return null;
}
