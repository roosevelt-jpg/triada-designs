/**
 * Detect “speak with a person” intent and hand off with admin-configured
 * WhatsApp / call numbers. Used by Support (and Social Media Manager) reply paths.
 */

import { detectCustomerLanguage } from "@/lib/agents/detect-language";
import {
  getHumanHandoffSettings,
  whatsappMeLink,
} from "@/lib/agents/human-handoff-settings";
import { setSharedKv } from "@/lib/agents/shared-memory";
import { ensureBrandedOutboundText } from "@/lib/brand/wrap-message";
import {
  getConversation,
  patchConversation,
} from "@/lib/crm/conversations-store";

/**
 * Phrase / pattern lists for human-request intent (customer languages).
 * Keep conservative — prefer clear requests for a person / agent / call.
 */
const HUMAN_REQUEST_PATTERNS = [
  // English
  /\b(speak|talk|chat)\s+with\s+(a\s+)?(person|human|someone|agent|representative|advisor|specialist)\b/i,
  /\b(speak|talk)\s+to\s+(a\s+)?(person|human|someone|agent|representative|real\s+person)\b/i,
  /\b(want|need|like)\s+(to\s+)?(speak|talk|chat)\s+(with|to)\b/i,
  /\b(real|live)\s+(person|human|agent|support)\b/i,
  /\b(human|live)\s+agent\b/i,
  /\bconnect\s+me\s+(to|with)\s+(an?\s+)?(person|human|agent)\b/i,
  /\btransfer\s+(me\s+)?to\s+(an?\s+)?(person|human|agent)\b/i,
  /\bcall\s+me\b/i,
  /\bphone\s+(call|number|support)\b/i,
  /\bi\s+want\s+a\s+(person|human)\b/i,
  // Romanian
  /\b(vreau|doresc)\s+(s[aă]\s+)?(vorbesc|discut)\s+cu\s+(o\s+)?persoan/i,
  /\bvorbesc\s+cu\s+(o\s+)?(persoan|operator|consultant)/i,
  /\boperator\s+uman\b/i,
  // German
  /\b(mit\s+(einem?\s+)?(menschen|mitarbeiter|berater)\s+sprechen)\b/i,
  /\b(echte[rn]?\s+person|live\s+support)\b/i,
  // French
  /\b(parler\s+(à|a|avec)\s+(une?\s+)?(personne|humain|conseiller|agent))\b/i,
  /\b(un\s+vrai\s+humain|assistance\s+humaine)\b/i,
  // Spanish
  /\b(hablar\s+con\s+(una?\s+)?(persona|humano|agente|asesor))\b/i,
  /\b(quiero\s+hablar\s+con\s+alguien)\b/i,
  // Portuguese
  /\b(falar\s+com\s+(uma?\s+)?(pessoa|humano|agente|atendente))\b/i,
  // Russian (Cyrillic)
  /поговорить\s+с\s+(человеком|оператором|консультантом)/i,
  /живой\s+(человек|оператор)/i,
  /хочу\s+(поговорить|связаться)/i,
  // Arabic
  /أريد\s+(التحدث|التكلم|الكلام)\s+مع\s+(شخص|إنسان|موظف)/,
  /تحدث\s+مع\s+(شخص|إنسان|موظف)/,
  /اتصل\s+بي/,
];

/**
 * @param {unknown} text
 * @returns {boolean}
 */
export function detectsHumanRequest(text) {
  const body = String(text || "").trim();
  if (!body || body.length > 2000) return false;
  return HUMAN_REQUEST_PATTERNS.some((re) => re.test(body));
}

/**
 * Localized handoff body (numbers filled in by caller).
 * @param {string} lang
 * @param {{ whatsapp_number?: string, call_number?: string, wa_link?: string|null }} contacts
 */
export function buildHumanHandoffBody(lang, contacts) {
  const wa = String(contacts.whatsapp_number || "").trim();
  const call = String(contacts.call_number || "").trim();
  const link = contacts.wa_link || (wa ? whatsappMeLink(wa) : null);

  const lines = [];
  const code = String(lang || "en").toLowerCase().slice(0, 2);

  const openers = {
    en: "Of course — I’m connecting you with a person from our team.",
    ar: "بالتأكيد — سأوصلك بشخص من فريقنا.",
    ro: "Desigur — vă conectăm cu o persoană din echipa noastră.",
    de: "Natürlich — ich verbinde Sie mit einer Person aus unserem Team.",
    fr: "Bien sûr — je vous mets en relation avec une personne de notre équipe.",
    ru: "Конечно — соединяю вас с человеком из нашей команды.",
    es: "Por supuesto — le conectamos con una persona de nuestro equipo.",
    pt: "Claro — vamos ligá-lo a uma pessoa da nossa equipa.",
  };

  const waLabels = {
    en: "WhatsApp (live chat)",
    ar: "واتساب (دردشة مباشرة)",
    ro: "WhatsApp (chat live)",
    de: "WhatsApp (Live-Chat)",
    fr: "WhatsApp (chat en direct)",
    ru: "WhatsApp (живой чат)",
    es: "WhatsApp (chat en vivo)",
    pt: "WhatsApp (chat ao vivo)",
  };

  const callLabels = {
    en: "Call",
    ar: "اتصال",
    ro: "Apel",
    de: "Anruf",
    fr: "Appel",
    ru: "Звонок",
    es: "Llamada",
    pt: "Chamada",
  };

  const closers = {
    en: "A teammate will take it from here. You’re welcome to reach us on WhatsApp or by phone anytime.",
    ar: "سيتولى أحد أعضاء الفريق من هنا. يمكنك التواصل معنا عبر واتساب أو الهاتف في أي وقت.",
    ro: "Un coleg preia conversația de aici. Ne puteți scrie pe WhatsApp sau suna oricând.",
    de: "Ein Teammitglied übernimmt ab hier. Sie erreichen uns jederzeit per WhatsApp oder telefonisch.",
    fr: "Un membre de l’équipe prend le relais. Écrivez-nous sur WhatsApp ou appelez-nous quand vous voulez.",
    ru: "Коллега продолжит с этого места. Пишите в WhatsApp или звоните в любое время.",
    es: "Un compañero continúa desde aquí. Escríbanos por WhatsApp o llámenos cuando quiera.",
    pt: "Um colega continua a partir daqui. Escreva no WhatsApp ou ligue quando quiser.",
  };

  const missing = {
    en: "A teammate has been notified and will reach out shortly.",
    ar: "تم إشعار أحد أعضاء الفريق وسيتواصل معك قريباً.",
    ro: "Un coleg a fost notificat și vă va contacta în curând.",
    de: "Ein Teammitglied wurde benachrichtigt und meldet sich in Kürze.",
    fr: "Un membre de l’équipe a été prévenu et vous contactera sous peu.",
    ru: "Коллега уведомлён и скоро свяжется с вами.",
    es: "Un compañero ha sido avisado y se pondrá en contacto en breve.",
    pt: "Um colega foi avisado e entrará em contacto em breve.",
  };

  lines.push(openers[code] || openers.en);

  if (wa) {
    lines.push(`${waLabels[code] || waLabels.en}: ${wa}`);
    if (link) lines.push(link);
  }
  if (call && call !== wa) {
    lines.push(`${callLabels[code] || callLabels.en}: ${call}`);
  } else if (call && !wa) {
    lines.push(`${callLabels[code] || callLabels.en}: ${call}`);
  }

  if (!wa && !call) {
    lines.push(missing[code] || missing.en);
  } else {
    lines.push(closers[code] || closers.en);
  }

  return lines.join("\n");
}

/**
 * Build branded handoff reply text from inbound + settings.
 * @param {{ inbound: string, settings?: Awaited<ReturnType<typeof getHumanHandoffSettings>> }} input
 */
export async function composeHumanHandoffReply(input) {
  const settings = input.settings || (await getHumanHandoffSettings());
  const detected = detectCustomerLanguage(input.inbound || "");
  const lang = detected?.code || "en";
  const body = buildHumanHandoffBody(lang, {
    whatsapp_number: settings.enabled ? settings.whatsapp_number : "",
    call_number: settings.enabled ? settings.call_number : "",
    wa_link: settings.enabled ? whatsappMeLink(settings.whatsapp_number) : null,
  });
  const branded = ensureBrandedOutboundText(body, {
    greetingKind: "default",
    language: lang,
  });
  return {
    text: branded.text || body,
    language: lang,
    settings,
    whatsapp_number: settings.whatsapp_number,
    call_number: settings.call_number,
  };
}

/**
 * If inbound asks for a person, return handoff reply payload; else null.
 * Does not send or mutate conversation — caller does that.
 * @param {string} inbound
 */
export async function maybeHumanHandoffReply(inbound) {
  if (!detectsHumanRequest(inbound)) return null;
  return composeHumanHandoffReply({ inbound });
}

/**
 * Mark conversation as human takeover + record handoff package in shared memory.
 * @param {{
 *   conversation_id: string,
 *   channel: string,
 *   inbound: string,
 *   reply: string,
 *   agent_key?: string,
 *   whatsapp_number?: string,
 *   call_number?: string,
 * }} input
 */
export async function finalizeHumanHandoff(input) {
  const conversationId = String(input.conversation_id || "").trim();
  const agentKey = input.agent_key || "ai_support";
  let patched = null;
  if (conversationId) {
    const existing = await getConversation(conversationId).catch(() => null);
    const prevMeta =
      existing?.metadata && typeof existing.metadata === "object"
        ? /** @type {Record<string, unknown>} */ (existing.metadata)
        : {};
    patched = await patchConversation(conversationId, {
      automation_mode: "human",
      metadata: {
        ...prevMeta,
        human_handoff_at: new Date().toISOString(),
        human_handoff_reason: "customer_requested_person",
      },
    }).catch(() => null);
  }

  await setSharedKv({
    key: "collab.last_handoff",
    value: {
      reason: "customer_requested_person",
      channel: input.channel,
      conversation_id: conversationId || null,
      inbound_preview: String(input.inbound || "").slice(0, 240),
      reply_preview: String(input.reply || "").slice(0, 240),
      whatsapp_number: input.whatsapp_number || null,
      call_number: input.call_number || null,
      agent_key: agentKey,
      at: new Date().toISOString(),
    },
    written_by: agentKey,
    tags: ["handoff", "human", String(input.channel || "support")],
  }).catch(() => null);

  await setSharedKv({
    key: "collab.active_thread",
    value: {
      channel: input.channel,
      conversation_id: conversationId || null,
      agent_key: agentKey,
      automation_mode: "human",
      last_reply_preview: String(input.reply || "").slice(0, 240),
      updated_at: new Date().toISOString(),
    },
    written_by: agentKey,
    tags: [String(input.channel || "support"), "support", "human_handoff"],
  }).catch(() => null);

  return patched;
}
