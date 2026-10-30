/**
 * Smoke: inbound DMs upsert CRM email/phone, inbox profile shape, human live reply.
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-crm-inbox-profiles.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import { handleInboundWhatsApp } from "@/lib/agents/support-whatsapp.js";
import { handleInboundSupportChannel } from "@/lib/agents/support-channel.js";
import { handleInboundPageMessaging } from "@/lib/agents/support-page-messaging.js";
import { getContact, listContacts } from "@/lib/crm/contacts-store.js";
import {
  getConversation,
  listConversations,
} from "@/lib/crm/conversations-store.js";
import { shapeConversationForInbox } from "@/lib/crm/inbox-shape.js";
import { sendHumanInboxReply } from "@/lib/crm/send-human-inbox-reply.js";
import { extractContactFieldsFromInbound } from "@/lib/crm/extract-contact-fields.js";

const stamp = Date.now().toString(36);

// --- extract helpers ---
const extracted = extractContactFieldsFromInbound({
  channel: "telegram",
  body: "Please email me at guest.crm+" + stamp + "@example.com or call +1 (555) 010-9988",
  contact_name: "CRM Smoke Guest",
  metadata: {},
});
if (!extracted.email || !extracted.email.includes(stamp)) {
  throw new Error(`expected email from body, got ${extracted.email}`);
}
if (!extracted.phone) {
  throw new Error(`expected phone from body, got ${extracted.phone}`);
}
console.log("ok extract", extracted.email, extracted.phone);

// --- WhatsApp phone → CRM ---
const waId = `1555010${String(Date.now()).slice(-4)}`;
const waHandled = await handleInboundWhatsApp({
  body: "Hi — my email is wa.crm+" + stamp + "@example.com",
  external_user_id: waId,
  external_conversation_id: `PHONE_CRM:${waId}`,
  provider_message_id: `wamid.crm.${stamp}`,
  contact_name: "WA CRM Smoke",
  auto_reply: false,
});
if (!waHandled.ok || !waHandled.conversation?.id) {
  throw new Error(`WA ingest failed: ${JSON.stringify(waHandled)}`);
}
await new Promise((r) => setTimeout(r, 80));
const waFresh = await getConversation(waHandled.conversation.id);
if (!waFresh?.contact_id) {
  throw new Error("WA conversation missing contact_id after CRM link");
}
const waContact = await getContact(waFresh.contact_id);
if (!waContact?.phone) {
  throw new Error(`WA contact missing phone: ${JSON.stringify(waContact)}`);
}
if (!waContact.email || !String(waContact.email).includes(stamp)) {
  throw new Error(`WA contact missing email from body: ${JSON.stringify(waContact)}`);
}
console.log("ok wa crm", waContact.id, waContact.phone, waContact.email);

// --- Email channel → CRM ---
const emailAddr = `inbox.crm+${stamp}@example.com`;
const emailHandled = await handleInboundSupportChannel({
  channel: "email",
  body: "Looking for a custom wedding band. Phone +15550108877",
  subject: "Wedding band",
  external_user_id: emailAddr,
  external_conversation_id: `email:${emailAddr}`,
  provider_message_id: `email.crm.${stamp}`,
  contact_name: "Email CRM Smoke",
  metadata: { email: emailAddr, contact_name: "Email CRM Smoke" },
  auto_reply: false,
});
if (!emailHandled.ok || !emailHandled.conversation?.id) {
  throw new Error(`email ingest failed: ${JSON.stringify(emailHandled)}`);
}
await new Promise((r) => setTimeout(r, 80));
const emailFresh = await getConversation(emailHandled.conversation.id);
if (!emailFresh?.contact_id) {
  throw new Error("email conversation missing contact_id");
}
const emailContact = await getContact(emailFresh.contact_id);
if (!emailContact?.email || emailContact.email !== emailAddr) {
  throw new Error(`email contact bad email: ${JSON.stringify(emailContact)}`);
}
if (!emailContact.phone) {
  throw new Error(`email contact missing phone from body: ${JSON.stringify(emailContact)}`);
}
console.log("ok email crm", emailContact.id, emailContact.email, emailContact.phone);

// --- Instagram page messaging → CRM + profile shape ---
const igPsid = `ig-psid-${stamp}`;
const igHandled = await handleInboundPageMessaging({
  channel: "instagram",
  body: "Love the Salt & Spirit line — reach me at ig.crm+" + stamp + "@example.com",
  external_user_id: igPsid,
  external_conversation_id: `instagram:${igPsid}`,
  provider_message_id: `mid.crm.${stamp}`,
  metadata: {
    contact_name: "IG CRM Smoke",
    avatar_url: "https://triada-designs.com/favicon.ico",
  },
  auto_reply: false,
});
if (!igHandled.ok || !igHandled.conversation?.id) {
  throw new Error(`IG ingest failed: ${JSON.stringify(igHandled)}`);
}
await new Promise((r) => setTimeout(r, 80));
const igFresh = await getConversation(igHandled.conversation.id);
const igContact = igFresh?.contact_id
  ? await getContact(igFresh.contact_id)
  : null;
const igShaped = shapeConversationForInbox(igFresh, igContact);
if (!igShaped.contact?.email || !igShaped.contact.email.includes(stamp)) {
  throw new Error(`IG profile missing email: ${JSON.stringify(igShaped.contact)}`);
}
if (!igShaped.contact?.picture) {
  throw new Error(`IG profile missing picture: ${JSON.stringify(igShaped.contact)}`);
}
if (!igShaped.contact?.name || igShaped.contact.name === "Unknown contact") {
  throw new Error(`IG profile missing name: ${JSON.stringify(igShaped.contact)}`);
}
console.log("ok ig profile", igShaped.contact);

// --- Unified Inbox lists all channels ---
const listed = await listConversations({});
const ids = new Set(listed.map((c) => c.id));
for (const id of [
  waHandled.conversation.id,
  emailHandled.conversation.id,
  igHandled.conversation.id,
]) {
  if (!ids.has(id)) {
    throw new Error(`Unified Inbox missing conversation ${id}`);
  }
}
console.log("ok inbox list covers WA/email/IG");

// --- Human admin reply delivers live (local_sim) ---
const human = await sendHumanInboxReply({
  conversationId: waHandled.conversation.id,
  body: "Thanks — Triada Designs here. Happy to help with the pendant.",
});
if (!human.ok || !human.conversation) {
  throw new Error(`human reply failed: ${JSON.stringify(human)}`);
}
if (human.conversation.automation_mode !== "human") {
  throw new Error("expected automation_mode=human after admin reply");
}
const outbound = (human.conversation.messages || []).find(
  (m) => m.direction === "outbound" && m.agent_key === "human",
);
if (!outbound) {
  throw new Error("missing human outbound trail message");
}
if (!human.send || human.send.ok !== true) {
  throw new Error(`expected send ok (local_sim): ${JSON.stringify(human.send)}`);
}
console.log("ok human live reply", {
  mode: human.send.mode,
  provider_message_id: human.send.provider_message_id,
});

const contacts = await listContacts({ q: stamp });
if (!contacts.data.length) {
  throw new Error("listContacts q=stamp returned empty");
}
console.log("ok crm search", contacts.data.length);

console.log("SMOKE OK crm-inbox-profiles");
