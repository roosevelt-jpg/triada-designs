/**
 * Smoke: first-contact English greeting + language ask, then lock.
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-language-preference.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import {
  draftFirstContactLanguageAsk,
  draftLanguageLockedAck,
  isLanguageChoiceOnly,
  needsFirstContactLanguageAsk,
  parseLanguagePreferenceChoice,
  resolveLanguagePreferenceFromReply,
  LANGUAGE_PREFERENCE_ASK_EN,
} from "@/lib/agents/language-preference.js";
import { draftInboundSupportReply } from "@/lib/agents/support-draft.js";
import { handleInboundSupportChannel } from "@/lib/agents/support-channel.js";
import { handleInboundWhatsApp } from "@/lib/agents/support-whatsapp.js";
import { handleInboundPageMessaging } from "@/lib/agents/support-page-messaging.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Unit: first contact detection
assert(
  needsFirstContactLanguageAsk({ last_outbound_at: null, messages: [] }),
  "new conversation needs first-contact ask",
);
assert(
  !needsFirstContactLanguageAsk({
    metadata: { language_preference_locked: true, preferred_language: "ar" },
  }),
  "locked preference skips ask",
);
assert(
  !needsFirstContactLanguageAsk({
    metadata: { language_preference_asked: true },
  }),
  "already asked skips first ask",
);

// Unit: English ask always
const ask = draftFirstContactLanguageAsk({ customerName: "Alex" });
assert(ask.detected_language === "en", "ask language must be en");
assert(ask.first_contact_language_ask === true, "ask flag");
assert(String(ask.text).includes(LANGUAGE_PREFERENCE_ASK_EN), "ask copy present");
assert(/warm greetings|Hello/i.test(ask.text), "English greeting present");
assert(!/كيف يمكننا|Mulțumim|Danke, dass/i.test(ask.text), "must not localize first ask");
console.log("ok first-contact English ask");

// Unit: parse choices
for (const [raw, code] of [
  ["Arabic", "ar"],
  ["français", "fr"],
  ["Română", "ro"],
  ["I prefer German", "de"],
  ["русский", "ru"],
  ["es", "es"],
  ["Portuguese", "pt"],
]) {
  const parsed = parseLanguagePreferenceChoice(raw);
  assert(parsed?.code === code, `parse "${raw}" → ${code}, got ${parsed?.code}`);
}
console.log("ok parseLanguagePreferenceChoice");

assert(isLanguageChoiceOnly("Arabic"), "Arabic is choice-only");
assert(!isLanguageChoiceOnly("Arabic — what ring sizes do you have?"), "question not choice-only");

const resolved = resolveLanguagePreferenceFromReply("Hola, ¿tienen anillos?");
assert(resolved.code === "es", `detect Spanish from reply, got ${resolved.code}`);
console.log("ok resolve from reply");

const ack = draftLanguageLockedAck({ language: "ar", customerName: "Alex" });
assert(ack.detected_language === "ar", "ack ar");
assert(/العربية|حسناً/i.test(ack.text), "Arabic ack body");
console.log("ok locked ack");

// Draft path: first contact even when inbound is Arabic
const draftAsk = await draftInboundSupportReply({
  message: "مرحبا",
  customerName: "Guest",
  channel: "webchat",
  conversation: {
    id: `conv-lang-ask-${Date.now()}`,
    channel: "webchat",
    last_outbound_at: null,
    messages: [{ direction: "inbound", body: "مرحبا" }],
    metadata: {},
  },
  dry_run: true,
});
assert(draftAsk.first_contact_language_ask === true, "draft first ask");
assert(draftAsk.detected_language === "en", "draft ask stays English");
assert(String(draftAsk.text || draftAsk.draft).includes("Which language"), "draft ask text");
console.log("ok draftInboundSupportReply first ask (Arabic inbound)");

// Channel: WhatsApp first message
const waId = `1555${String(Date.now()).slice(-7)}`;
const wa = await handleInboundWhatsApp({
  body: "Hi",
  external_user_id: waId,
  external_conversation_id: `PHONE_LANG:${waId}`,
  provider_message_id: `wamid.lang.${Date.now()}`,
  contact_name: "Lang Tester",
  auto_reply: true,
  dry_run: false,
});
assert(wa.replied, `WA replied: ${JSON.stringify(wa)}`);
const waText = String(wa.reply?.reply || "");
assert(/Which language/i.test(waText), `WA ask missing: ${waText.slice(0, 200)}`);
assert(wa.reply?.fast_path === true || /Which language/i.test(waText), "WA fast path ask");
console.log("ok WhatsApp first-contact English ask");

// Channel: Telegram
const tgUser = `tg_lang_${Date.now()}`;
const tg = await handleInboundSupportChannel({
  channel: "telegram",
  body: "Bonjour",
  external_user_id: tgUser,
  external_conversation_id: `telegram:${tgUser}`,
  provider_message_id: `tg-lang-${Date.now()}`,
  contact_name: "TG Lang",
  auto_reply: true,
});
assert(tg.replied, `TG replied: ${JSON.stringify(tg)}`);
const tgText = String(tg.reply?.reply || "");
assert(/Which language/i.test(tgText), `TG ask missing: ${tgText.slice(0, 200)}`);
console.log("ok Telegram first-contact English ask (French inbound)");

// Channel: Messenger
const psid = `psid_lang_${Date.now()}`;
const ig = await handleInboundPageMessaging({
  channel: "messenger",
  body: "Hola",
  external_user_id: psid,
  external_conversation_id: `messenger:${psid}`,
  provider_message_id: `mid.lang.${Date.now()}`,
  contact_name: "FB Lang",
  page_or_account_id: "PAGE_LANG",
  auto_reply: true,
});
assert(ig.replied, `Messenger replied: ${JSON.stringify(ig)}`);
const igText = String(ig.reply?.reply || "");
assert(/Which language/i.test(igText), `Messenger ask missing: ${igText.slice(0, 200)}`);
console.log("ok Messenger first-contact English ask");

// Second turn: lock Arabic on same WA conversation
const wa2 = await handleInboundWhatsApp({
  body: "Arabic",
  external_user_id: waId,
  external_conversation_id: `PHONE_LANG:${waId}`,
  provider_message_id: `wamid.lang2.${Date.now()}`,
  contact_name: "Lang Tester",
  auto_reply: true,
  dry_run: false,
});
assert(wa2.replied, `WA2 replied: ${JSON.stringify(wa2)}`);
const wa2Text = String(wa2.reply?.reply || "");
assert(
  /العربية|حسناً|Salt & Spirit/i.test(wa2Text),
  `WA2 Arabic lock ack missing: ${wa2Text.slice(0, 240)}`,
);
assert(!/Which language/i.test(wa2Text), "locked turn must not re-ask");
console.log("ok WhatsApp language lock ack (Arabic)");

console.log("ALL OK smoke-language-preference");
