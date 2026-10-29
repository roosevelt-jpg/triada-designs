/**
 * Smoke: customer asks for a person → Support handoff with admin numbers.
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-human-handoff.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import { detectsHumanRequest } from "@/lib/agents/human-handoff.js";
import {
  getHumanHandoffSettings,
  saveHumanHandoffSettings,
} from "@/lib/agents/human-handoff-settings.js";
import { handleInboundWhatsApp } from "@/lib/agents/support-whatsapp.js";
import { getConversation } from "@/lib/crm/conversations-store.js";

const phrase = "I want to speak with a person";
if (!detectsHumanRequest(phrase)) {
  throw new Error("detectsHumanRequest missed WhatsApp phrase");
}
if (detectsHumanRequest("What size is the Priest Ring?")) {
  throw new Error("detectsHumanRequest false positive on product question");
}
console.log("ok detect");

const saved = await saveHumanHandoffSettings({
  enabled: true,
  whatsapp_number: "+40 768 407 242",
  call_number: "+49 157 7119 1097",
});
if (!saved.whatsapp_number || !saved.call_number) {
  throw new Error(`saveHumanHandoffSettings failed: ${JSON.stringify(saved)}`);
}
const loaded = await getHumanHandoffSettings();
console.log("ok settings", {
  storage: loaded.storage,
  wa: loaded.whatsapp_number,
  call: loaded.call_number,
});

const uid = `1555${String(Date.now()).slice(-7)}`;
const handled = await handleInboundWhatsApp({
  body: phrase,
  external_user_id: uid,
  external_conversation_id: `PHONE_HANDOFF:${uid}`,
  provider_message_id: `wamid.handoff.${Date.now()}`,
  contact_name: "Handoff Tester",
  auto_reply: true,
  dry_run: false,
});

if (!handled.replied) {
  throw new Error(`expected reply: ${JSON.stringify(handled)}`);
}
if (!handled.reply?.human_handoff) {
  throw new Error(`expected human_handoff flag: ${JSON.stringify(handled.reply)}`);
}
const text = String(handled.reply?.reply || "");
if (!/whatsapp/i.test(text) || !/40768407242|768.?407.?242/.test(text.replace(/\s/g, ""))) {
  throw new Error(`reply missing WhatsApp number: ${text}`);
}
if (!/4915771191097|157.?7119.?1097/.test(text.replace(/\s/g, ""))) {
  throw new Error(`reply missing call number: ${text}`);
}

const conv = await getConversation(String(handled.conversation?.id || handled.reply?.conversation_id || ""));
const mode = conv?.automation_mode || handled.conversation?.automation_mode;
if (mode !== "human") {
  // conversation may be under reply.conversation
  const patchedId = handled.reply?.conversation?.id || handled.conversation?.id;
  const again = patchedId ? await getConversation(String(patchedId)) : null;
  if (again?.automation_mode !== "human") {
    throw new Error(
      `expected automation_mode human, got ${again?.automation_mode || mode}: ${JSON.stringify({ handled, again })}`,
    );
  }
}

console.log("ok handoff reply", {
  preview: text.slice(0, 180),
  mode: "human",
});
console.log("SMOKE_PASS human handoff");
