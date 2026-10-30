/**
 * Smoke: Telegram inbound persists a trail visible to Unified Inbox list/detail shapes,
 * with greeting fast_path (same durable store + inbox shaping as WhatsApp #56 / TikTok).
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-inbox-telegram-trails.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import { normalizeTelegramInbound } from "@/lib/channels/normalize-inbound.js";
import { handleInboundSupportChannel } from "@/lib/agents/support-channel.js";
import {
  getConversation,
  listConversations,
} from "@/lib/crm/conversations-store.js";
import { shapeConversationForInbox } from "@/lib/crm/inbox-shape.js";
import { sendTelegramTextMessage } from "@/lib/integrations/telegram-bot-text.js";

const chatId = `tg${String(Date.now()).slice(-8)}`;
const extConv = `telegram:${chatId}`;
const msgId = `tg-inbox.${Date.now()}`;

const classic = normalizeTelegramInbound({
  update_id: 91001,
  message: {
    message_id: 42,
    from: { id: Number(chatId.replace(/\D/g, "").slice(0, 9)) || 555001, first_name: "Telegram", last_name: "Inbox Smoke", username: "tg_smoke" },
    chat: { id: Number(chatId.replace(/\D/g, "").slice(0, 9)) || 555001, type: "private" },
    text: "Hi",
  },
});
if (classic.length !== 1 || classic[0].channel !== "telegram") {
  throw new Error(`telegram classic normalize failed: ${JSON.stringify(classic)}`);
}

const flat = normalizeTelegramInbound({
  text: "Hi",
  chat_id: chatId,
  from: { id: chatId, first_name: "Flat" },
  message_id: `flat-${msgId}`,
  simulated: true,
});
if (flat.length !== 1 || flat[0].external_user_id !== chatId || flat[0].body !== "Hi") {
  throw new Error(`telegram flat normalize failed: ${JSON.stringify(flat)}`);
}

const callback = normalizeTelegramInbound({
  update_id: 91002,
  callback_query: {
    id: `cq-${msgId}`,
    from: { id: chatId, first_name: "Callback" },
    data: "Hi",
    message: { message_id: 9, chat: { id: chatId, type: "private" } },
  },
});
if (callback.length !== 1 || callback[0].body !== "Hi") {
  throw new Error(`telegram callback normalize failed: ${JSON.stringify(callback)}`);
}
console.log("ok telegram normalize", {
  classic: classic[0].external_user_id,
  flat: flat[0].external_user_id,
  callback: callback[0].metadata?.update_kind,
});

const started = Date.now();
const handled = await handleInboundSupportChannel({
  channel: "telegram",
  body: flat[0].body,
  external_user_id: chatId,
  external_conversation_id: extConv,
  provider_message_id: msgId,
  contact_name: "Telegram Inbox Smoke",
  metadata: flat[0].metadata,
  auto_reply: true,
  dry_run: false,
});
const elapsed = Date.now() - started;

if (!handled.ok) {
  throw new Error(`handleInboundSupportChannel failed: ${JSON.stringify(handled)}`);
}

const conversationId = handled.conversation?.id;
if (!conversationId) {
  throw new Error("missing conversation id after telegram ingest");
}
if (!handled.replied) {
  throw new Error(`expected telegram replied: ${JSON.stringify(handled)}`);
}
if (!handled.reply?.fast_path) {
  throw new Error(`expected telegram Hi fast_path: ${JSON.stringify(handled.reply)}`);
}
if (elapsed > 5_000) {
  throw new Error(`telegram Hi reply too slow locally: ${elapsed}ms`);
}
console.log("ok telegram ingest", conversationId, {
  replied: handled.replied,
  fast_path: handled.reply?.fast_path,
  elapsed_ms: elapsed,
  send_mode: handled.reply?.send?.mode,
});

const listed = await listConversations({ channel: "telegram" });
const hit = listed.find((c) => c.id === conversationId);
if (!hit) {
  throw new Error(
    `listConversations(telegram) missing ${conversationId}; got ${listed.map((c) => c.id).join(",")}`,
  );
}

const shaped = shapeConversationForInbox(hit);
if (!shaped.contact?.name || shaped.contact.name === "Unknown contact") {
  throw new Error(`inbox shape missing contact name: ${JSON.stringify(shaped.contact)}`);
}
if (!shaped.last_message_at) {
  throw new Error("inbox shape missing last_message_at");
}
if (shaped.channel !== "telegram") {
  throw new Error(`expected channel telegram, got ${shaped.channel}`);
}
if (!Array.isArray(shaped.messages) || shaped.messages.length < 1) {
  throw new Error("inbox shape missing messages");
}
const inbound = shaped.messages.find((m) => m.direction === "inbound");
if (!inbound?.sender_type || inbound.sender_type !== "customer") {
  throw new Error(`bad inbound sender_type: ${JSON.stringify(inbound)}`);
}

const fresh = await getConversation(conversationId);
const reshaped = shapeConversationForInbox(fresh);
const outbound = reshaped.messages.find((m) => m.direction === "outbound");
if (!outbound?.created_at) {
  throw new Error("expected outbound reply message on telegram conversation trail");
}
if (!String(outbound.body || "").includes("Triada")) {
  throw new Error(`outbound missing brand: ${JSON.stringify(outbound)}`);
}

console.log("ok inbox shape", {
  id: reshaped.id,
  contact: reshaped.contact.name,
  last_message_at: reshaped.last_message_at,
  messages: reshaped.messages.length,
  channel: reshaped.channel,
  inbound: Boolean(inbound),
  outbound: Boolean(outbound),
});

// Live Bot API when TELEGRAM_BOT_TOKEN present; otherwise local_sim (never print secrets).
const hadToken = Boolean(String(process.env.TELEGRAM_BOT_TOKEN || "").trim());
if (!hadToken) {
  const sim = await sendTelegramTextMessage({
    chat_id: chatId,
    body: "Triada smoke local_sim",
  });
  if (!sim.ok || sim.mode !== "local_sim") {
    throw new Error(`expected telegram local_sim without creds: ${JSON.stringify(sim)}`);
  }
  console.log("SMOKE_PASS telegram local_sim without creds");
} else {
  const live = await sendTelegramTextMessage({
    chat_id: "1",
    body: "Triada smoke live probe",
  });
  if (live.mode !== "live") {
    throw new Error(`expected telegram live mode with creds: ${JSON.stringify({
      ok: live.ok,
      mode: live.mode,
      error: live.error,
    })}`);
  }
  console.log("SMOKE_PASS telegram live outbound when creds present", {
    ok: live.ok,
    // fake chat id may fail at Bot API — mode still live
    error: live.error || null,
  });
}

console.log("SMOKE_PASS inbox telegram trails");
