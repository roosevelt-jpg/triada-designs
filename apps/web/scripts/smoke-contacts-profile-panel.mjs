/**
 * Smoke: contact profile detail includes CRM fields + channel trails.
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-contacts-profile-panel.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import { handleInboundWhatsApp } from "@/lib/agents/support-whatsapp.js";
import { getContact, listContacts, upsertContacts } from "@/lib/crm/contacts-store.js";
import { getConversation } from "@/lib/crm/conversations-store.js";
import { shapeConversationForInbox } from "@/lib/crm/inbox-shape.js";

const stamp = Date.now().toString(36);

const upserted = await upsertContacts([
  {
    name: `Profile Panel ${stamp}`,
    email: `profile.panel+${stamp}@example.com`,
    phone: "+15550107766",
    preferred_language: "en",
    lifecycle_status: "lead",
    source: "smoke_profile_panel",
    metadata: {
      avatar_url: "https://example.com/avatar-profile-panel.png",
    },
  },
]);
const contact = upserted.upserted[0];
if (!contact?.id) throw new Error("upsert failed");
if (!contact.email || !contact.phone_e164) {
  throw new Error(`CRM fields missing after upsert: ${JSON.stringify(contact)}`);
}
if (!contact.avatar_url) {
  throw new Error(`avatar_url missing after upsert: ${JSON.stringify(contact)}`);
}
console.log("ok upsert", contact.id, contact.email, contact.phone_e164);

const waId = contact.phone_normalized || "15550107766";
const waHandled = await handleInboundWhatsApp({
  body: `Hi from profile panel smoke ${stamp}`,
  external_user_id: waId,
  external_conversation_id: `PHONE_PROFILE:${waId}`,
  provider_message_id: `wamid.profile.${stamp}`,
  contact_name: contact.name,
  auto_reply: false,
});
if (!waHandled.ok || !waHandled.conversation?.id) {
  throw new Error(`WA ingest failed: ${JSON.stringify(waHandled)}`);
}
await new Promise((r) => setTimeout(r, 80));
const waFresh = await getConversation(waHandled.conversation.id);
if (!waFresh) throw new Error("conversation missing after ingest");

// Link conversation to our contact if handler created/resolved another id
const linkedContactId = waFresh.contact_id || contact.id;
const listed = await listContacts({});
const found = listed.data.find((c) => c.id === linkedContactId) || (await getContact(linkedContactId));
if (!found) throw new Error("contact not found in list/get");

const trail = shapeConversationForInbox(waFresh, found);
if (!trail.channel) throw new Error("trail missing channel");
if (!trail.contact?.name && !trail.contact?.email && !trail.contact?.phone) {
  throw new Error(`trail contact empty: ${JSON.stringify(trail.contact)}`);
}
console.log("ok trail", trail.id, trail.channel, trail.contact.email || trail.contact.phone);

// Simulate GET /v1/contacts/:id enrichment
const all = listed.data;
const detail = all.find((c) => c.id === found.id) || found;
const conversations = [trail];
const payload = { ...detail, conversations };
if (!payload.name && !payload.email && !payload.phone_e164) {
  throw new Error("profile payload empty");
}
if (!Array.isArray(payload.conversations) || payload.conversations.length < 1) {
  throw new Error("profile payload missing conversations");
}
console.log(
  "ok profile payload",
  payload.id,
  payload.avatar_url ? "photo" : "no-photo",
  payload.conversations.length,
  "trails",
);

console.log("SMOKE_PASS contacts-profile-panel");
