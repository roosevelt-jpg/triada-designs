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

// Instagram Platform / Graph webhooks reference uses entry.changes[field=messages].
const igChangesPayload = {
  object: "instagram",
  entry: [
    {
      id: "IG_SMOKE_ACCOUNT",
      time: Date.now(),
      changes: [
        {
          field: "messages",
          value: {
            sender: { id: "IG_CHANGES_USER" },
            recipient: { id: "IG_SMOKE_ACCOUNT" },
            timestamp: Date.now(),
            message: {
              mid: `mid.ig.changes.${Date.now()}`,
              text: "Hi from changes",
            },
          },
        },
      ],
    },
  ],
};
const igChangesNorm = normalizeMetaInboundMessages(igChangesPayload);
if (
  igChangesNorm.length !== 1 ||
  igChangesNorm[0].channel !== "instagram" ||
  igChangesNorm[0].body !== "Hi from changes"
) {
  throw new Error(
    `IG changes normalize failed: ${JSON.stringify(igChangesNorm)}`,
  );
}
console.log("ok IG changes normalize", igChangesNorm[0].external_user_id);

const igStandbyPayload = {
  object: "instagram",
  entry: [
    {
      id: "IG_SMOKE_ACCOUNT",
      time: Date.now(),
      standby: [
        {
          sender: { id: "IG_STANDBY_USER" },
          recipient: { id: "IG_SMOKE_ACCOUNT" },
          timestamp: Date.now(),
          message: {
            mid: `mid.ig.standby.${Date.now()}`,
            text: "Hi from standby",
          },
        },
      ],
    },
  ],
};
const igStandbyNorm = normalizeMetaInboundMessages(igStandbyPayload);
if (
  igStandbyNorm.length !== 1 ||
  igStandbyNorm[0].channel !== "instagram" ||
  igStandbyNorm[0].body !== "Hi from standby"
) {
  throw new Error(
    `IG standby normalize failed: ${JSON.stringify(igStandbyNorm)}`,
  );
}
console.log("ok IG standby normalize", igStandbyNorm[0].external_user_id);

const igChangesIngested = await ingestMetaWebhook({
  payload: igChangesPayload,
  rawBody: JSON.stringify(igChangesPayload),
  headers: {},
});
if (!igChangesIngested.ok || !(igChangesIngested.replied >= 1)) {
  throw new Error(
    `IG changes webhook ingest failed: ${JSON.stringify(igChangesIngested)}`,
  );
}
if (igChangesIngested.automations?.[0]?.agent_key !== "ai_support") {
  throw new Error(
    `IG changes agent not Support: ${JSON.stringify(igChangesIngested.automations)}`,
  );
}
console.log("ok IG changes webhook ingest", {
  replied: igChangesIngested.replied,
  agent: igChangesIngested.automations?.[0]?.agent_key,
  fast_path: igChangesIngested.automations?.[0]?.fast_path,
});

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
if (!igHandled.reply?.fast_path) {
  throw new Error(`IG expected fast_path on Hi: ${JSON.stringify(igHandled.reply)}`);
}
console.log("ok IG support reply", {
  replied: igHandled.replied,
  mode: igHandled.reply?.mode || igHandled.reply?.send?.mode,
  send_ok: igHandled.reply?.send?.ok,
  fast_path: igHandled.reply?.fast_path,
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
if (!igIngested.automations?.[0]?.fast_path) {
  throw new Error(
    `IG webhook expected fast_path: ${JSON.stringify(igIngested.automations)}`,
  );
}
console.log("ok IG webhook ingest", {
  storage: igIngested.storage,
  replied: igIngested.replied,
  agent: igIngested.automations?.[0]?.agent_key,
  send_mode: igIngested.automations?.[0]?.send_mode,
  fast_path: igIngested.automations?.[0]?.fast_path,
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
if (!msgrHandled.reply?.fast_path) {
  throw new Error(
    `Messenger expected fast_path on Hi: ${JSON.stringify(msgrHandled.reply)}`,
  );
}
console.log("ok Messenger support reply", {
  replied: msgrHandled.replied,
  mode: msgrHandled.reply?.mode || msgrHandled.reply?.send?.mode,
  send_ok: msgrHandled.reply?.send?.ok,
  fast_path: msgrHandled.reply?.fast_path,
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
if (!msgrIngested.automations?.[0]?.fast_path) {
  throw new Error(
    `Messenger webhook expected fast_path: ${JSON.stringify(msgrIngested.automations)}`,
  );
}
console.log("ok Messenger webhook ingest", {
  storage: msgrIngested.storage,
  replied: msgrIngested.replied,
  agent: msgrIngested.automations?.[0]?.agent_key,
  send_mode: msgrIngested.automations?.[0]?.send_mode,
  fast_path: msgrIngested.automations?.[0]?.fast_path,
});

console.log("SMOKE_PASS instagram + messenger inbound Support auto-reply");
