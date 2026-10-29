/**
 * Smoke: Meta Instagram + Messenger webhook → Support auto-reply (local_sim).
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-ig-messenger-inbound-autoreply.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import { normalizeMetaInboundMessages } from "@/lib/meta/normalize-inbound.js";
import { handleInboundPageMessaging } from "@/lib/agents/support-page-messaging.js";
import { ingestMetaWebhook } from "@/lib/meta/webhook-ingest.js";

function igPayload(text = "Hi") {
  const mid = `mid.ig.smoke.${Date.now()}`;
  return {
    object: "instagram",
    entry: [
      {
        id: "IG_SMOKE_ACCOUNT",
        time: Date.now(),
        messaging: [
          {
            sender: { id: "IG_SMOKE_USER" },
            recipient: { id: "IG_SMOKE_ACCOUNT" },
            timestamp: Date.now(),
            message: { mid, text },
          },
        ],
      },
    ],
  };
}

function messengerPayload(text = "Hi") {
  const mid = `mid.msgr.smoke.${Date.now()}`;
  return {
    object: "page",
    entry: [
      {
        id: "PAGE_SMOKE",
        time: Date.now(),
        messaging: [
          {
            sender: { id: "MSGR_SMOKE_USER" },
            recipient: { id: "PAGE_SMOKE" },
            timestamp: Date.now(),
            message: { mid, text },
          },
        ],
      },
    ],
  };
}

const igSample = igPayload("Hi");
const igNorm = normalizeMetaInboundMessages(igSample);
if (igNorm.length !== 1 || igNorm[0].channel !== "instagram") {
  throw new Error(`IG normalize failed: ${JSON.stringify(igNorm)}`);
}
console.log("ok IG normalize", igNorm[0].body, igNorm[0].external_user_id);

const igHandled = await handleInboundPageMessaging({
  channel: "instagram",
  body: "Hi",
  external_user_id: "IG_SMOKE_USER",
  external_conversation_id: "IG_SMOKE_ACCOUNT:IG_SMOKE_USER",
  provider_message_id: `mid.ig.unit.${Date.now()}`,
  page_or_account_id: "IG_SMOKE_ACCOUNT",
  auto_reply: true,
  dry_run: false,
});
if (!igHandled.replied && !igHandled.reply?.skipped) {
  throw new Error(`IG Support failed: ${JSON.stringify(igHandled)}`);
}
console.log("ok IG support reply", {
  replied: igHandled.replied,
  mode: igHandled.reply?.mode || igHandled.reply?.send?.mode,
  send_ok: igHandled.reply?.send?.ok,
  preview: String(igHandled.reply?.reply || "").slice(0, 120),
});

const igIngested = await ingestMetaWebhook({
  payload: igSample,
  rawBody: JSON.stringify(igSample),
  headers: {},
});
if (!igIngested.ok || !(igIngested.replied >= 1)) {
  throw new Error(`IG webhook ingest failed: ${JSON.stringify(igIngested)}`);
}
if (igIngested.automations?.[0]?.agent_key !== "ai_support") {
  throw new Error(`IG agent not Support: ${JSON.stringify(igIngested.automations)}`);
}
console.log("ok IG webhook ingest", {
  storage: igIngested.storage,
  replied: igIngested.replied,
  agent: igIngested.automations?.[0]?.agent_key,
  send_mode: igIngested.automations?.[0]?.send_mode,
});

const msgrSample = messengerPayload("Hi");
const msgrNorm = normalizeMetaInboundMessages(msgrSample);
if (msgrNorm.length !== 1 || msgrNorm[0].channel !== "messenger") {
  throw new Error(`Messenger normalize failed: ${JSON.stringify(msgrNorm)}`);
}
console.log(
  "ok Messenger normalize",
  msgrNorm[0].body,
  msgrNorm[0].external_user_id,
);

const msgrHandled = await handleInboundPageMessaging({
  channel: "messenger",
  body: "Hi",
  external_user_id: "MSGR_SMOKE_USER",
  external_conversation_id: "PAGE_SMOKE:MSGR_SMOKE_USER",
  provider_message_id: `mid.msgr.unit.${Date.now()}`,
  page_or_account_id: "PAGE_SMOKE",
  auto_reply: true,
  dry_run: false,
});
if (!msgrHandled.replied && !msgrHandled.reply?.skipped) {
  throw new Error(`Messenger Support failed: ${JSON.stringify(msgrHandled)}`);
}
console.log("ok Messenger support reply", {
  replied: msgrHandled.replied,
  mode: msgrHandled.reply?.mode || msgrHandled.reply?.send?.mode,
  send_ok: msgrHandled.reply?.send?.ok,
  preview: String(msgrHandled.reply?.reply || "").slice(0, 120),
});

const msgrIngested = await ingestMetaWebhook({
  payload: msgrSample,
  rawBody: JSON.stringify(msgrSample),
  headers: {},
});
if (!msgrIngested.ok || !(msgrIngested.replied >= 1)) {
  throw new Error(
    `Messenger webhook ingest failed: ${JSON.stringify(msgrIngested)}`,
  );
}
if (msgrIngested.automations?.[0]?.agent_key !== "ai_support") {
  throw new Error(
    `Messenger agent not Support: ${JSON.stringify(msgrIngested.automations)}`,
  );
}
console.log("ok Messenger webhook ingest", {
  storage: msgrIngested.storage,
  replied: msgrIngested.replied,
  agent: msgrIngested.automations?.[0]?.agent_key,
  send_mode: msgrIngested.automations?.[0]?.send_mode,
});

console.log("SMOKE_PASS instagram + messenger inbound Support auto-reply");
