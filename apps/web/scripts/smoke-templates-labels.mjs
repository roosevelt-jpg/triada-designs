/**
 * Smoke: Channel Templates UI helpers never echo snake_case to admins.
 */
import assert from "node:assert/strict";
import {
  platformLabel,
  publishModeLabel,
  templateDisplayName,
  templateStatusLabel,
} from "../src/lib/templates/labels.js";
import {
  normalizeTemplateCategory,
  templateCategoryLabel,
} from "../src/lib/templates/categories.js";

assert.equal(platformLabel("whatsapp"), "WhatsApp");
assert.equal(platformLabel("webchat"), "Web chat");
assert.equal(templateStatusLabel("pending_approval"), "Pending approval");
assert.equal(templateStatusLabel("published"), "Published");
assert.equal(publishModeLabel("local_sim"), "Local");
assert.equal(publishModeLabel("live"), "Live");
assert.equal(templateDisplayName("jewellery_follow_up"), "Jewellery follow-up");
assert.equal(templateDisplayName("cart_abandonment_remind"), "Cart reminder");
assert.equal(templateDisplayName("ig_welcome"), "Instagram welcome");
assert.equal(
  templateCategoryLabel(normalizeTemplateCategory("MARKETING")),
  "Marketing",
);
assert.equal(templateCategoryLabel("product_inquiry"), "Product inquiry");
assert.equal(templateCategoryLabel("follow_up"), "Follow-up");

for (const sample of [
  templateDisplayName("jewellery_order_in_production"),
  platformLabel("linkedin"),
  templateStatusLabel("pending_approval"),
  publishModeLabel("local_sim"),
  templateCategoryLabel("comment_dm"),
]) {
  assert.equal(sample.includes("_"), false, `label leaked underscore: ${sample}`);
}

console.log("smoke-templates-labels: pass");
