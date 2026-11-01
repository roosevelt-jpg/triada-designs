/**
 * Smoke: Meta webhook subscribe helpers (no live Graph / no secrets).
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-meta-webhook-subscribe.mjs
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import assert from "node:assert/strict";
import {
  INSTAGRAM_WEBHOOK_FIELDS,
  PAGE_MESSAGING_SUBSCRIBED_FIELDS,
  subscribeMetaMessagingWebhooks,
} from "@/lib/meta/page-webhook-subscribe.js";

assert.ok(PAGE_MESSAGING_SUBSCRIBED_FIELDS.includes("messages"));
assert.ok(PAGE_MESSAGING_SUBSCRIBED_FIELDS.includes("standby"));
assert.ok(INSTAGRAM_WEBHOOK_FIELDS.includes("messages"));
assert.ok(INSTAGRAM_WEBHOOK_FIELDS.includes("messaging_postbacks"));

const local = await subscribeMetaMessagingWebhooks({
  channel: "instagram",
  subscribed: true,
});
assert.equal(local.mode, "local_sim");
assert.equal(local.ok, false);
assert.ok(String(local.message || "").length > 0);
assert.ok(Array.isArray(local.next_steps));

console.log("SMOKE_PASS meta webhook subscribe field lists + local gate");
