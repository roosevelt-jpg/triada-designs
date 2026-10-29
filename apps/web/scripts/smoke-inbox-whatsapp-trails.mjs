/**
 * Smoke: WhatsApp inbound persists a trail visible to Unified Inbox list/detail shapes.
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-inbox-whatsapp-trails.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import { handleInboundWhatsApp } from "@/lib/agents/support-whatsapp.js";
import {
  getConversation,
  listConversations,
} from "@/lib/crm/conversations-store.js";
import { shapeConversationForInbox } from "@/lib/crm/inbox-shape.js";

const waId = `1555${String(Date.now()).slice(-7)}`;
const extConv = `PHONE_INBOX:${waId}`;
const wamid = `wamid.inbox.${Date.now()}`;

const handled = await handleInboundWhatsApp({
  body: "Hi — do you have the Salt & Spirit pendant?",
  external_user_id: waId,
  external_conversation_id: extConv,
  provider_message_id: wamid,
  contact_name: "Inbox Smoke",
  auto_reply: true,
  dry_run: false,
});

if (!handled.ok) {
  throw new Error(`handleInboundWhatsApp failed: ${JSON.stringify(handled)}`);
}

const conversationId = handled.conversation?.id;
if (!conversationId) {
  throw new Error("missing conversation id after ingest");
}
console.log("ok ingest", conversationId, {
  replied: handled.replied,
});

const listed = await listConversations({ channel: "whatsapp" });
const hit = listed.find((c) => c.id === conversationId);
if (!hit) {
  throw new Error(
    `listConversations(whatsapp) missing ${conversationId}; got ${listed.map((c) => c.id).join(",")}`,
  );
}

const shaped = shapeConversationForInbox(hit);
if (!shaped.contact?.name || shaped.contact.name === "Unknown contact") {
  throw new Error(`inbox shape missing contact name: ${JSON.stringify(shaped.contact)}`);
}
if (!shaped.last_message_at) {
  throw new Error("inbox shape missing last_message_at");
}
if (!Array.isArray(shaped.messages) || shaped.messages.length < 1) {
  throw new Error("inbox shape missing messages");
}
const inbound = shaped.messages.find((m) => m.direction === "inbound");
if (!inbound?.sender_type || inbound.sender_type !== "customer") {
  throw new Error(`bad inbound sender_type: ${JSON.stringify(inbound)}`);
}
if (handled.replied) {
  const outbound = shaped.messages.find((m) => m.direction === "outbound");
  if (!outbound?.created_at) {
    // reply may still be appending — re-read
    const fresh = await getConversation(conversationId);
    const reshaped = shapeConversationForInbox(fresh);
    const out = reshaped.messages.find((m) => m.direction === "outbound");
    if (!out) {
      throw new Error("expected outbound reply message on conversation trail");
    }
  }
}

console.log("ok inbox shape", {
  id: shaped.id,
  contact: shaped.contact.name,
  last_message_at: shaped.last_message_at,
  messages: shaped.messages.length,
  channel: shaped.channel,
});

console.log("SMOKE_PASS inbox whatsapp trails");
