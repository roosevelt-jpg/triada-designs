/**
 * Smoke: Telegram inbound persists a trail visible to Unified Inbox list/detail shapes,
 * with greeting fast_path (same durable store + inbox shaping as WhatsApp #56).
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-inbox-telegram-trails.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import { handleInboundSupportChannel } from "@/lib/agents/support-channel.js";
import {
  getConversation,
  listConversations,
} from "@/lib/crm/conversations-store.js";
import { shapeConversationForInbox } from "@/lib/crm/inbox-shape.js";

const chatId = `tg${String(Date.now()).slice(-8)}`;
const extConv = `telegram:${chatId}`;
const msgId = `tg-inbox.${Date.now()}`;

const started = Date.now();
const handled = await handleInboundSupportChannel({
  channel: "telegram",
  body: "Hi",
  external_user_id: chatId,
  external_conversation_id: extConv,
  provider_message_id: msgId,
  contact_name: "Telegram Inbox Smoke",
  metadata: { chat_id: chatId },
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

console.log("SMOKE_PASS inbox telegram trails");
