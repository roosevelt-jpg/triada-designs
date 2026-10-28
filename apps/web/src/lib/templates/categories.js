/**
 * Fixed template Category list for Channel templates (dropdown only — not free text).
 * Values match jewellery ops / ChannelTemplateSeeder vocabulary.
 */

export const TEMPLATE_CATEGORIES = [
  { value: "product_inquiry", label: "Product inquiry" },
  { value: "follow_up", label: "Follow-up" },
  { value: "order", label: "Order" },
  { value: "utility", label: "Utility" },
  { value: "marketing", label: "Marketing" },
  { value: "authentication", label: "Authentication" },
  { value: "comment_dm", label: "Comment → DM" },
  { value: "social_post", label: "Social post" },
  { value: "general", label: "General" },
];

const ALLOWED = new Set(TEMPLATE_CATEGORIES.map((c) => c.value));

/** @param {unknown} value */
export function isTemplateCategory(value) {
  return typeof value === "string" && ALLOWED.has(value);
}

/**
 * Normalize unknown / legacy category to a fixed-list value.
 * @param {unknown} value
 * @param {string} [fallback]
 */
export function normalizeTemplateCategory(value, fallback = "general") {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (ALLOWED.has(raw)) return raw;

  const aliases = {
    marketing: "marketing",
    utility: "utility",
    authentication: "authentication",
    auth: "authentication",
    product: "product_inquiry",
    inquiry: "product_inquiry",
    followup: "follow_up",
    "follow-up": "follow_up",
    order_update: "order",
    orders: "order",
    comment: "comment_dm",
    dm: "comment_dm",
    social: "social_post",
    post: "social_post",
  };
  if (aliases[raw]) return aliases[raw];
  return ALLOWED.has(fallback) ? fallback : "general";
}

/**
 * Map fixed-list category → Meta WhatsApp Cloud API category.
 * @param {unknown} value
 * @returns {"MARKETING" | "UTILITY" | "AUTHENTICATION"}
 */
export function mapTemplateCategoryToMeta(value) {
  const cat = normalizeTemplateCategory(value, "marketing");
  if (cat === "authentication") return "AUTHENTICATION";
  if (cat === "marketing" || cat === "social_post") return "MARKETING";
  return "UTILITY";
}

/** @param {string} value */
export function templateCategoryLabel(value) {
  const hit = TEMPLATE_CATEGORIES.find((c) => c.value === value);
  return hit?.label || value;
}
