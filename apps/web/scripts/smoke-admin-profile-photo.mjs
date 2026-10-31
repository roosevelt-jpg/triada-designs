/**
 * Smoke: admin profile photo persist + Messenger persona_id on human reply.
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-admin-profile-photo.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import {
  getAdminProfileSettings,
  saveAdminProfileSettings,
  shapeAdminProfileSettings,
  publicHttpsAvatarUrl,
} from "@/lib/agents/admin-profile-settings.js";
import { syncAdminProfileToChannels } from "@/lib/agents/admin-profile-channel-sync.js";
import { ensureMessengerPersona } from "@/lib/integrations/meta-messenger-persona.js";
import { sendMessengerTextMessage } from "@/lib/integrations/meta-page-text.js";
import { ingestInboundDm } from "@/lib/crm/conversations-store.js";
import { sendHumanInboxReply } from "@/lib/crm/send-human-inbox-reply.js";
import { shapeMessageForInbox } from "@/lib/crm/inbox-shape.js";

const httpsPhoto =
  "https://triada-designs.com/wp-content/uploads/2025/07/TM_Schriftzug_vulcano.svg";

const shaped = shapeAdminProfileSettings({
  display_name: "Roosevelt A.",
  avatar_url: httpsPhoto,
});
if (shaped.display_name !== "Roosevelt A." || shaped.avatar_url !== httpsPhoto) {
  throw new Error(`shape failed: ${JSON.stringify(shaped)}`);
}
if (publicHttpsAvatarUrl("data:image/png;base64,aaa") !== null) {
  throw new Error("data URLs must not be treated as Meta-public");
}
if (publicHttpsAvatarUrl(httpsPhoto) !== httpsPhoto) {
  throw new Error("https avatar should pass");
}
console.log("ok shape");

const saved = await saveAdminProfileSettings({
  display_name: "Roosevelt A.",
  avatar_url: httpsPhoto,
});
if (!saved.avatar_url || saved.display_name !== "Roosevelt A.") {
  throw new Error(`save failed: ${JSON.stringify(saved)}`);
}
const loaded = await getAdminProfileSettings();
if (loaded.avatar_url !== httpsPhoto) {
  throw new Error(`load mismatch: ${JSON.stringify(loaded)}`);
}
console.log("ok persist", { storage: loaded.storage });

const synced = await syncAdminProfileToChannels(loaded);
if (!synced.admin_profile?.messenger_persona_id) {
  throw new Error(`expected messenger persona: ${JSON.stringify(synced)}`);
}
if (!synced.channel_sync?.instagram?.skipped) {
  throw new Error("Instagram must report skipped (account photo only)");
}
if (!synced.channel_sync?.whatsapp?.account_level && !synced.channel_sync?.whatsapp?.ok) {
  throw new Error(`WhatsApp sync missing account_level note: ${JSON.stringify(synced.channel_sync?.whatsapp)}`);
}
console.log("ok channel sync", {
  messenger: synced.channel_sync.messenger?.mode || synced.channel_sync.messenger?.reason,
  whatsapp: synced.channel_sync.whatsapp?.mode || synced.channel_sync.whatsapp?.reason,
  persona: synced.admin_profile.messenger_persona_id,
});

const persona = await ensureMessengerPersona(synced.admin_profile);
if (!persona.ok || !persona.persona_id) {
  throw new Error(`persona ensure failed: ${JSON.stringify(persona)}`);
}

const sent = await sendMessengerTextMessage({
  recipient_id: "smoke-psid-profile-photo",
  body: "Hello from admin with profile photo.",
  persona_id: persona.persona_id,
});
if (!sent.ok) {
  throw new Error(`messenger send failed: ${JSON.stringify(sent)}`);
}
if (!sent.raw?.persona_id && !sent.raw?.simulated) {
  // local_sim includes persona in payload spread
}
if (sent.mode === "local_sim" && sent.raw?.persona_id !== persona.persona_id) {
  throw new Error(
    `local sim should include persona_id: ${JSON.stringify(sent.raw)}`,
  );
}
console.log("ok messenger persona payload");

const uid = `profile-photo-${Date.now().toString(36)}`;
const inbound = await ingestInboundDm({
  channel: "messenger",
  external_user_id: uid,
  external_conversation_id: `PAGE_SMOKE:${uid}`,
  body: "Hi — need help with a ring.",
  contact_name: "Profile Photo Tester",
  provider_message_id: `mid.profile.${Date.now()}`,
});
const resolvedId = String(inbound?.id || "");
if (!resolvedId) {
  throw new Error(`inbound conversation missing: ${JSON.stringify(inbound)}`);
}

const replied = await sendHumanInboxReply({
  conversationId: resolvedId,
  body: "Happy to help — Roosevelt here.",
});
if (!replied.ok) {
  throw new Error(`human reply failed: ${JSON.stringify(replied)}`);
}
const trail = Array.isArray(replied.conversation?.messages)
  ? replied.conversation.messages
  : [];
const last = trail[trail.length - 1];
if (!last || last.agent_key !== "human") {
  throw new Error(`expected human trail: ${JSON.stringify(last)}`);
}
if (last.sender_avatar_url !== httpsPhoto) {
  throw new Error(
    `expected sender_avatar_url on trail: ${JSON.stringify(last)}`,
  );
}
const shapedMsg = shapeMessageForInbox(last);
if (shapedMsg?.sender_type !== "agent" || shapedMsg.sender_avatar_url !== httpsPhoto) {
  throw new Error(`inbox shape missing avatar: ${JSON.stringify(shapedMsg)}`);
}
console.log("ok inbox human reply avatar");

console.log("SMOKE_PASS admin-profile-photo");
