/**
 * Smoke: LinkedIn inbound persists a trail visible to Unified Inbox list/detail shapes,
 * with greeting fast_path (same durable store + inbox shaping as Telegram #58).
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-inbox-linkedin-trails.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import { normalizeLinkedInInbound } from "@/lib/channels/normalize-inbound.js";
import { handleInboundSupportChannel } from "@/lib/agents/support-channel.js";
import {
  getConversation,
  listConversations,
} from "@/lib/crm/conversations-store.js";
import { shapeConversationForInbox } from "@/lib/crm/inbox-shape.js";

const personId = `li${String(Date.now()).slice(-8)}`;
const extConv = `linkedin:${personId}`;
const msgId = `li-inbox.${Date.now()}`;

const norm = normalizeLinkedInInbound({
  eventType: "MESSAGE_RECEIVED",
  actor: `urn:li:person:${personId}`,
  message: {
    id: msgId,
    body: { text: "Hi" },
    from: `urn:li:person:${personId}`,
  },
  contact_name: "LinkedIn Inbox Smoke",
});
if (norm.length !== 1 || norm[0].channel !== "linkedin") {
  throw new Error(`linkedin normalize failed: ${JSON.stringify(norm)}`);
}
if (norm[0].external_user_id !== personId) {
  throw new Error(`expected person id strip: ${JSON.stringify(norm[0])}`);
}
console.log("ok linkedin normalize", norm[0].external_user_id);

const started = Date.now();
const handled = await handleInboundSupportChannel({
  channel: "linkedin",
  body: norm[0].body,
  external_user_id: norm[0].external_user_id,
  external_conversation_id: extConv,
  provider_message_id: msgId,
  contact_name: "LinkedIn Inbox Smoke",
  metadata: norm[0].metadata,
  auto_reply: true,
  dry_run: false,
});
const elapsed = Date.now() - started;

if (!handled.ok) {
  throw new Error(`handleInboundSupportChannel failed: ${JSON.stringify(handled)}`);
}

const conversationId = handled.conversation?.id;
if (!conversationId) {
  throw new Error("missing conversation id after linkedin ingest");
}
if (!handled.replied) {
  throw new Error(`expected linkedin replied: ${JSON.stringify(handled)}`);
}
if (!handled.reply?.fast_path) {
  throw new Error(`expected linkedin Hi fast_path: ${JSON.stringify(handled.reply)}`);
}
if (elapsed > 5_000) {
  throw new Error(`linkedin Hi reply too slow locally: ${elapsed}ms`);
}
console.log("ok linkedin ingest", conversationId, {
  replied: handled.replied,
  fast_path: handled.reply?.fast_path,
  elapsed_ms: elapsed,
  send_mode: handled.reply?.send?.mode,
});

const listed = await listConversations({ channel: "linkedin" });
const hit = listed.find((c) => c.id === conversationId);
if (!hit) {
  throw new Error(
    `listConversations(linkedin) missing ${conversationId}; got ${listed.map((c) => c.id).join(",")}`,
  );
}

const shaped = shapeConversationForInbox(hit);
if (!shaped.contact?.name || shaped.contact.name === "Unknown contact") {
  throw new Error(`inbox shape missing contact name: ${JSON.stringify(shaped.contact)}`);
}
if (!shaped.last_message_at) {
  throw new Error("inbox shape missing last_message_at");
}
if (shaped.channel !== "linkedin") {
  throw new Error(`expected channel linkedin, got ${shaped.channel}`);
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
  throw new Error("expected outbound reply message on linkedin conversation trail");
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

console.log("SMOKE_PASS inbox linkedin trails");
