/**
 * Human-readable labels for Channel Templates admin UI.
 * Technical keys (snake_case / Meta API names) stay under the hood.
 */

/** @type {{ value: string, label: string }[]} */
export const TEMPLATE_PLATFORMS = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "tiktok", label: "TikTok" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "email", label: "Email" },
  { value: "webchat", label: "Web chat" },
  { value: "telegram", label: "Telegram" },
  { value: "shopify", label: "Shopify" },
];

/** Catalog Meta / seed names → admin-facing titles. */
const TEMPLATE_NAME_LABELS = {
  jewellery_follow_up: "Jewellery follow-up",
  jewellery_order_update: "Order update",
  jewellery_order_confirmed: "Order confirmed",
  jewellery_order_in_production: "Order in production",
  jewellery_order_shipped: "Order shipped",
  jewellery_order_delivered: "Order delivered",
  jewellery_consultation_invite: "Consultation invite",
  new_piece_preview: "New piece preview",
  promo_product_spotlight: "Product spotlight",
  cart_abandonment_remind: "Cart reminder",
  sizing_abandonment_remind: "Sizing reminder",
  waitlist_back_in_stock: "Waitlist — back in stock",
  vip_drop_first_access: "VIP first access",
  after_sale_care_tips: "After-sale care tips",
  after_sale_review_request: "Review request",
  after_sale_complete_the_set: "Complete the set",
  ugc_tag_invite: "UGC tag invite",
  ig_welcome: "Instagram welcome",
  welcome_triada: "Welcome",
};

const STATUS_LABELS = {
  draft: "Draft",
  pending_approval: "Pending approval",
  pending: "Pending approval",
  approved: "Approved",
  published: "Published",
  rejected: "Rejected",
  disabled: "Disabled",
  paused: "Paused",
};

const PUBLISH_MODE_LABELS = {
  live: "Live",
  local: "Local",
  local_sim: "Local",
  local_seed: "Local",
};

/**
 * Title-case a machine key without echoing underscores.
 * @param {unknown} value
 */
function humanizeKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * @param {unknown} value
 */
export function platformLabel(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  const hit = TEMPLATE_PLATFORMS.find((p) => p.value === key);
  if (hit) return hit.label;
  if (!key) return "Channel";
  return humanizeKey(key);
}

/**
 * @param {unknown} value
 */
export function templateStatusLabel(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  if (!key) return "Draft";
  // Never echo snake_case machine status strings.
  if (key.includes("_")) return humanizeKey(key);
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Soft publish-mode badge. Hides unknown plumbing strings.
 * @param {unknown} value
 * @returns {string | null}
 */
export function publishModeLabel(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  if (PUBLISH_MODE_LABELS[key]) return PUBLISH_MODE_LABELS[key];
  if (key.includes("_")) return null;
  return humanizeKey(key);
}

/**
 * Admin-facing template title from Meta / seed API name.
 * @param {unknown} name
 */
export function templateDisplayName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "Untitled template";
  const key = raw.toLowerCase().replace(/\s+/g, "_");
  if (TEMPLATE_NAME_LABELS[key]) return TEMPLATE_NAME_LABELS[key];
  // Already human (spaces, no underscores) — keep as typed.
  if (!/[_-]/.test(raw) && /\s/.test(raw)) return raw;
  if (!/[_-]/.test(raw)) {
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  return humanizeKey(raw);
}

/**
 * Value for the Name input: prefer a readable label; Meta API keys stay for submit.
 * @param {unknown} name
 */
export function templateNameFieldValue(name) {
  return templateDisplayName(name);
}
