/**
 * Smoke: Telegram / webchat / email / LinkedIn / TikTok → Support auto-reply.
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-channels-inbound-autoreply.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import {
  normalizeTelegramInbound,
  normalizeEmailInbound,
  normalizeTikTokInbound,
  normalizeWebchatInbound,
  normalizeLinkedInInbound,
} from "@/lib/channels/normalize-inbound.js";
import { handleInboundSupportChannel } from "@/lib/agents/support-channel.js";
import { SUPPORT_TEXT_CHANNELS } from "@/lib/crm/conversations-store.js";

const expected = ["telegram", "webchat", "email", "tiktok", "linkedin"];
for (const ch of expected) {
  if (!SUPPORT_TEXT_CHANNELS.includes(ch)) {
    throw new Error(`SUPPORT_TEXT_CHANNELS missing ${ch}`);
  }
}
console.log("ok SUPPORT_TEXT_CHANNELS", SUPPORT_TEXT_CHANNELS.join(","));

const tgNorm = normalizeTelegramInbound({
  update_id: 9001,
  message: {
    message_id: 42,
    from: { id: 555001, first_name: "Smoke", last_name: "Tester", username: "smoke" },
    chat: { id: 555001, type: "private" },
    text: "Hi",
  },
});
if (tgNorm.length !== 1 || tgNorm[0].channel !== "telegram") {
  throw new Error(`telegram normalize failed: ${JSON.stringify(tgNorm)}`);
}
const tgFlat = normalizeTelegramInbound({
  text: "Hi",
  chat_id: "555001",
  from: { id: 555001, first_name: "Smoke" },
  simulated: true,
});
if (
  tgFlat.length !== 1 ||
  tgFlat[0].external_user_id !== "555001" ||
  tgFlat[0].body !== "Hi"
) {
  throw new Error(`telegram flat normalize failed: ${JSON.stringify(tgFlat)}`);
}
const tgCb = normalizeTelegramInbound({
  update_id: 9002,
  callback_query: {
    id: "cq-smoke",
    from: { id: 555001, first_name: "Smoke" },
    data: "Hi",
    message: { chat: { id: 555001, type: "private" }, message_id: 7 },
  },
});
if (tgCb.length !== 1 || tgCb[0].body !== "Hi" || tgCb[0].metadata?.chat_id !== "555001") {
  throw new Error(`telegram callback normalize failed: ${JSON.stringify(tgCb)}`);
}
console.log("ok telegram normalize", tgNorm[0].external_user_id, "flat+callback");

const emailNorm = normalizeEmailInbound({
  from: "guest@example.com",
  subject: "Ring sizes",
  body: "Hi — what sizes do you carry?",
  message_id: `email-smoke-${Date.now()}`,
});
if (emailNorm.length !== 1 || emailNorm[0].channel !== "email") {
  throw new Error(`email normalize failed: ${JSON.stringify(emailNorm)}`);
}
console.log("ok email normalize", emailNorm[0].external_user_id);

const ttNorm = normalizeTikTokInbound({
  event: "im_receive_msg",
  event_id: `tt-smoke-${Date.now()}`,
  user_openid: "tt_user_1",
  content: JSON.stringify({ text: "Hi" }),
  simulated: true,
});
if (ttNorm.length !== 1 || ttNorm[0].channel !== "tiktok") {
  throw new Error(`tiktok normalize failed: ${JSON.stringify(ttNorm)}`);
}
if (ttNorm[0].external_user_id !== "tt_user_1" || ttNorm[0].body !== "Hi") {
  throw new Error(`tiktok normalize fields: ${JSON.stringify(ttNorm[0])}`);
}
console.log("ok tiktok normalize", ttNorm[0].external_user_id);

const wcNorm = normalizeWebchatInbound({
  token: "wc_smoke",
  body: "Hi",
  visitor_id: "v_smoke",
  name: "Web Guest",
});
if (wcNorm.length !== 1 || wcNorm[0].channel !== "webchat") {
  throw new Error(`webchat normalize failed: ${JSON.stringify(wcNorm)}`);
}
console.log("ok webchat normalize", wcNorm[0].external_user_id);

const liNorm = normalizeLinkedInInbound({
  eventType: "MESSAGE_RECEIVED",
  actor: "urn:li:person:li_smoke_user",
  message: {
    id: `li-norm-${Date.now()}`,
    body: { text: "Hi" },
    from: "urn:li:person:li_smoke_user",
  },
  simulated: true,
});
if (
  liNorm.length !== 1 ||
  liNorm[0].channel !== "linkedin" ||
  liNorm[0].external_user_id !== "li_smoke_user"
) {
  throw new Error(`linkedin normalize failed: ${JSON.stringify(liNorm)}`);
}
console.log("ok linkedin normalize", liNorm[0].external_user_id);

/** @type {Array<{ channel: string, input: Record<string, unknown> }>} */
const cases = [
  {
    channel: "telegram",
    input: {
      channel: "telegram",
      body: "Hi",
      external_user_id: "555001",
      external_conversation_id: "telegram:555001",
      provider_message_id: `tg-unit-${Date.now()}`,
      contact_name: "Smoke Tester",
      metadata: { chat_id: "555001" },
    },
  },
  {
    channel: "webchat",
    input: {
      channel: "webchat",
      body: "Hi",
      external_user_id: "v_smoke",
      external_conversation_id: "webchat:v_smoke",
      provider_message_id: `wc-unit-${Date.now()}`,
      contact_name: "Web Guest",
    },
  },
  {
    channel: "email",
    input: {
      channel: "email",
      body: "Ring sizes\n\nHi — what sizes do you carry?",
      subject: "Ring sizes",
      external_user_id: "guest@example.com",
      external_conversation_id: "email:guest@example.com",
      provider_message_id: `email-unit-${Date.now()}`,
      contact_name: "guest@example.com",
      metadata: { email: "guest@example.com" },
    },
  },
  {
    channel: "linkedin",
    input: {
      channel: "linkedin",
      body: "Hi — boutique wholesale intro",
      external_user_id: "li_smoke_user",
      external_conversation_id: "linkedin:li_smoke_user",
      provider_message_id: `li-unit-${Date.now()}`,
      contact_name: "Boutique Buyer",
    },
  },
  {
    channel: "tiktok",
    input: {
      channel: "tiktok",
      body: "Hi",
      external_user_id: "tt_user_1",
      external_conversation_id: "tiktok:tt_user_1",
      provider_message_id: `tt-unit-${Date.now()}`,
    },
  },
];

for (const { channel, input } of cases) {
  const handled = await handleInboundSupportChannel({
    ...input,
    auto_reply: true,
    dry_run: false,
  });
  if (!handled.replied && !handled.reply?.skipped) {
    throw new Error(`${channel} Support failed: ${JSON.stringify(handled)}`);
  }
  if (handled.reply?.send && handled.reply.send.ok !== true) {
    throw new Error(
      `${channel} send not ok: ${JSON.stringify(handled.reply.send)}`,
    );
  }
  const expectFast = String(input.body || "").trim() === "Hi";
  if (expectFast && !handled.reply?.fast_path) {
    throw new Error(
      `${channel} expected greeting fast_path: ${JSON.stringify(handled.reply)}`,
    );
  }
  console.log(`ok ${channel} support reply`, {
    replied: handled.replied,
    mode: handled.reply?.send?.mode || handled.reply?.mode,
    send_ok: handled.reply?.send?.ok,
    fast_path: handled.reply?.fast_path || false,
    preview: String(handled.reply?.reply || "").slice(0, 100),
  });
}

console.log("SMOKE_PASS channels inbound Support auto-reply");
