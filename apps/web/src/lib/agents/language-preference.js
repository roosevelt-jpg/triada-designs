/**
 * First-contact language preference for AI Support / channel auto-reply.
 * Pref: English greeting first, ask preferred language, lock subsequent
 * replies to that choice, still re-detect if the customer switches.
 */

import {
  detectCustomerLanguage,
  languageMeta,
  normalizeLangCode,
  SUPPORTED_CUSTOMER_LANGUAGES,
} from "./detect-language";
import { ensureBrandedOutboundText } from "@/lib/brand/wrap-message";
import { patchConversation } from "@/lib/crm/conversations-store";
import { getContact, upsertContacts } from "@/lib/crm/contacts-store";

/** Explicit language-name / code tokens customers may reply with. */
const NAME_TO_CODE = {
  english: "en",
  en: "en",
  eng: "en",
  arabic: "ar",
  ar: "ar",
  arab: "ar",
  العربية: "ar",
  عربي: "ar",
  عربى: "ar",
  romanian: "ro",
  romana: "ro",
  română: "ro",
  român: "ro",
  ro: "ro",
  german: "de",
  deutsch: "de",
  de: "de",
  french: "fr",
  français: "fr",
  francais: "fr",
  fr: "fr",
  russian: "ru",
  русский: "ru",
  русски: "ru",
  ru: "ru",
  spanish: "es",
  español: "es",
  espanol: "es",
  castellano: "es",
  es: "es",
  portuguese: "pt",
  português: "pt",
  portugues: "pt",
  pt: "pt",
  italian: "it",
  italiano: "it",
  it: "it",
  turkish: "tr",
  türkçe: "tr",
  turkce: "tr",
  tr: "tr",
  dutch: "nl",
  nederlands: "nl",
  nl: "nl",
  polish: "pl",
  polski: "pl",
  pl: "pl",
};

export const LANGUAGE_PREFERENCE_ASK_EN =
  "Which language do you prefer to chat in? Reply with English, Arabic, Romanian, German, French, Russian, Spanish, Portuguese — or simply write in your preferred language.";

const LOCKED_ACK = {
  en: "Perfect — we’ll continue in English. How can we help with Salt & Spirit or a custom piece today?",
  ar: "حسناً — سنكمل بالعربية. كيف يمكننا مساعدتك بخصوص Salt & Spirit أو قطعة مخصّصة اليوم؟",
  ro: "Perfect — continuăm în română. Cum vă putem ajuta cu Salt & Spirit sau o piesă personalizată azi?",
  de: "Perfekt — wir machen auf Deutsch weiter. Wie können wir Ihnen heute mit Salt & Spirit oder einem Einzelstück helfen?",
  fr: "Parfait — nous continuons en français. Comment pouvons-nous vous aider aujourd’hui pour Salt & Spirit ou une pièce sur mesure ?",
  ru: "Отлично — продолжим на русском. Чем помочь сегодня по Salt & Spirit или индивидуальному изделию?",
  es: "Perfecto — seguimos en español. ¿Cómo podemos ayudarte hoy con Salt & Spirit o una pieza a medida?",
  pt: "Perfeito — seguimos em português. Como podemos ajudar hoje com Salt & Spirit ou uma peça personalizada?",
};

const AI_DISCLOSE = {
  en: "I’m Triada’s AI Support — say if you’d like a person instead.",
  ar: "أنا دعم تريادا بالذكاء الاصطناعي — أخبرنا إن رغبت بالتحدث مع شخص.",
  ro: "Sunt AI Support Triada — spuneți dacă doriți o persoană.",
  de: "Ich bin Triadas KI-Support — sagen Sie Bescheid, wenn Sie eine Person möchten.",
  fr: "Je suis le Support IA Triada — dites-le si vous préférez une personne.",
  ru: "Я ИИ-поддержка Triada — скажите, если нужна живая помощь.",
  es: "Soy el Support con IA de Triada — diga si prefiere una persona.",
  pt: "Sou o Support com IA da Triada — diga se preferir uma pessoa.",
};

/**
 * @param {Record<string, unknown> | null | undefined} conversation
 */
function conversationMeta(conversation) {
  const meta =
    conversation && conversation.metadata && typeof conversation.metadata === "object"
      ? /** @type {Record<string, unknown>} */ (conversation.metadata)
      : {};
  return meta;
}

/**
 * @param {Record<string, unknown> | null | undefined} conversation
 */
export function hasPriorOutbound(conversation) {
  if (!conversation) return false;
  if (conversation.last_outbound_at) return true;
  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  return messages.some((m) => m && m.direction === "outbound");
}

/**
 * True when this thread/contact still needs the English first greeting + language ask.
 * @param {Record<string, unknown> | null | undefined} conversation
 * @param {{ contact?: Record<string, unknown> | null }} [opts]
 */
export function needsFirstContactLanguageAsk(conversation, opts = {}) {
  const meta = conversationMeta(conversation);
  if (meta.language_preference_locked === true) return false;
  if (meta.language_preference_asked === true) return false;

  const contact = opts.contact || null;
  const contactMeta =
    contact && contact.metadata && typeof contact.metadata === "object"
      ? /** @type {Record<string, unknown>} */ (contact.metadata)
      : {};
  if (contactMeta.language_preference_locked === true) return false;

  // Returning contact with an explicit non-default preferred language already locked
  // via CRM — skip re-ask; still re-detect on switch later.
  if (
    contact &&
    contactMeta.language_preference_confirmed === true &&
    normalizeLangCode(contact.preferred_language)
  ) {
    return false;
  }

  return !hasPriorOutbound(conversation);
}

/**
 * @param {Record<string, unknown> | null | undefined} conversation
 */
export function isLanguagePreferencePending(conversation) {
  const meta = conversationMeta(conversation);
  return (
    meta.language_preference_asked === true &&
    meta.language_preference_locked !== true
  );
}

/**
 * @param {Record<string, unknown> | null | undefined} conversation
 * @param {Record<string, unknown> | null | undefined} [contact]
 */
export function getLockedPreferredLanguage(conversation, contact) {
  const meta = conversationMeta(conversation);
  if (meta.language_preference_locked === true) {
    const code = normalizeLangCode(meta.preferred_language);
    if (code) return code;
  }
  const contactMeta =
    contact && contact.metadata && typeof contact.metadata === "object"
      ? /** @type {Record<string, unknown>} */ (contact.metadata)
      : {};
  if (
    contact &&
    (contactMeta.language_preference_locked === true ||
      contactMeta.language_preference_confirmed === true)
  ) {
    return normalizeLangCode(contact.preferred_language) || "";
  }
  return normalizeLangCode(meta.preferred_language) || "";
}

/**
 * Parse an explicit language preference from a short customer reply.
 * @param {string} text
 * @returns {{ code: string, name: string, rtl: boolean, method: string } | null}
 */
export function parseLanguagePreferenceChoice(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const compact = raw
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[.!?,;:]+$/g, "")
    .trim();

  // Whole-message match (e.g. "Arabic", "français", "العربية")
  const direct = NAME_TO_CODE[compact];
  if (direct) {
    const meta = languageMeta(direct);
    return {
      code: meta.code,
      name: meta.name,
      rtl: Boolean(meta.rtl),
      method: "explicit_name",
    };
  }

  // "I prefer Arabic" / "please reply in French" / "limba română"
  const preferMatch = compact.match(
    /(?:prefer(?:ed)?|preference|speak|in|limba|langue|idioma|sprache|язык|لغة)\s*[:\-]?\s*([a-z\u0400-\u04FF\u0600-\u06FFăâîșț]+)/i,
  );
  if (preferMatch) {
    const token = preferMatch[1].toLowerCase();
    const code = NAME_TO_CODE[token];
    if (code) {
      const meta = languageMeta(code);
      return {
        code: meta.code,
        name: meta.name,
        rtl: Boolean(meta.rtl),
        method: "explicit_phrase",
      };
    }
  }

  // Token scan for known language names inside short replies
  if (raw.length <= 64) {
    const tokens = compact.split(/[^a-z\u0400-\u04FF\u0600-\u06FFăâîșț]+/).filter(Boolean);
    for (const t of tokens) {
      const code = NAME_TO_CODE[t];
      if (code) {
        const meta = languageMeta(code);
        return {
          code: meta.code,
          name: meta.name,
          rtl: Boolean(meta.rtl),
          method: "explicit_token",
        };
      }
    }
  }

  return null;
}

/**
 * Resolve language for the preference-pending turn: explicit choice, else detect.
 * @param {string} message
 * @param {{ hint?: string }} [opts]
 */
export function resolveLanguagePreferenceFromReply(message, opts = {}) {
  const explicit = parseLanguagePreferenceChoice(message);
  if (explicit) return explicit;

  const detected = detectCustomerLanguage(message, {
    hint: opts.hint || "",
    fallback: "en",
  });
  return {
    code: detected.code,
    name: detected.name,
    rtl: Boolean(detected.rtl),
    method: detected.method || "detected",
    confidence: detected.confidence,
  };
}

/**
 * True when the message is only a language choice / short ack (no product question).
 * @param {string} text
 */
export function isLanguageChoiceOnly(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (parseLanguagePreferenceChoice(raw)) {
    return raw.length <= 48 && !/[?]/.test(raw);
  }
  return false;
}

/**
 * English first-contact greeting + language preference ask (fast path, no LLM).
 * @param {{ customerName?: string | null }} [input]
 */
export async function draftFirstContactLanguageAsk(input = {}) {
  const started = Date.now();
  const core = [
    "Thanks for writing Triada Designs. How can we help with Salt & Spirit or a custom piece today?",
    "",
    LANGUAGE_PREFERENCE_ASK_EN,
    "",
    AI_DISCLOSE.en,
  ].join("\n");

  const branded = await ensureBrandedOutboundText(core, {
    greetingKind: "first_touch",
    customerName: input.customerName || undefined,
    language: "en",
  });

  return {
    ok: true,
    text: branded.text,
    draft: branded.text,
    mode: "fast_path",
    provider: "fast_path",
    collaboration: false,
    collaborators: [],
    reviews: [],
    detected_language: "en",
    detected_language_name: "English",
    language_rtl: false,
    latency_ms: Date.now() - started,
    fast_path: true,
    first_contact_language_ask: true,
    language_preference_phase: "ask",
    conversation_patch: {
      language_preference_asked: true,
      language_preference_locked: false,
      preferred_language: "en",
    },
  };
}

/**
 * Short ack after locking a language preference.
 * @param {{
 *   language: string,
 *   customerName?: string | null,
 * }} input
 */
export async function draftLanguageLockedAck(input) {
  const started = Date.now();
  const code = normalizeLangCode(input.language) || "en";
  const meta = languageMeta(code);
  const body = [
    LOCKED_ACK[code] || LOCKED_ACK.en,
    "",
    AI_DISCLOSE[code] || AI_DISCLOSE.en,
  ].join("\n");

  const branded = await ensureBrandedOutboundText(body, {
    greetingKind: "default",
    customerName: input.customerName || undefined,
    language: code,
  });

  return {
    ok: true,
    text: branded.text,
    draft: branded.text,
    mode: "fast_path",
    provider: "fast_path",
    collaboration: false,
    collaborators: [],
    reviews: [],
    detected_language: meta.code,
    detected_language_name: meta.name,
    language_rtl: Boolean(meta.rtl),
    latency_ms: Date.now() - started,
    fast_path: true,
    language_preference_phase: "locked",
    conversation_patch: {
      language_preference_asked: true,
      language_preference_locked: true,
      preferred_language: meta.code,
    },
  };
}

/**
 * Persist language-preference flags on the conversation (+ contact when possible).
 * @param {{
 *   conversation?: Record<string, unknown> | null,
 *   patch: Record<string, unknown>,
 * }} input
 */
export async function persistLanguagePreferenceState(input) {
  const conversation = input.conversation || null;
  const id = conversation?.id ? String(conversation.id) : "";
  const patch = input.patch || {};
  if (!id || !Object.keys(patch).length) return null;

  const prev = conversationMeta(conversation);
  const nextMeta = {
    ...prev,
    ...patch,
  };

  const saved = await patchConversation(id, { metadata: nextMeta });

  const contactId = conversation?.contact_id
    ? String(conversation.contact_id)
    : "";
  if (contactId && patch.preferred_language) {
    try {
      const existing = await getContact(contactId);
      const base = existing || { id: contactId };
      const prevContactMeta =
        base.metadata && typeof base.metadata === "object" ? base.metadata : {};
      await upsertContacts([
        {
          ...base,
          id: contactId,
          preferred_language: String(patch.preferred_language),
          metadata: {
            ...prevContactMeta,
            language_preference_asked: Boolean(
              patch.language_preference_asked ?? prevContactMeta.language_preference_asked,
            ),
            language_preference_locked: Boolean(
              patch.language_preference_locked ?? prevContactMeta.language_preference_locked,
            ),
            language_preference_confirmed: Boolean(
              patch.language_preference_locked ||
                prevContactMeta.language_preference_confirmed,
            ),
          },
        },
      ]);
    } catch {
      /* non-blocking */
    }
  }

  return saved;
}

/**
 * Resolve reply language for a normal (post-preference) turn.
 * Locked preference is the hint; clear latest-message detection still wins (switch).
 * @param {{
 *   message: string,
 *   conversation?: Record<string, unknown> | null,
 *   contact?: Record<string, unknown> | null,
 *   languageHint?: string,
 * }} input
 */
export function resolveReplyLanguage(input) {
  const locked = getLockedPreferredLanguage(input.conversation, input.contact);
  const hint =
    normalizeLangCode(input.languageHint) ||
    locked ||
    normalizeLangCode(conversationMeta(input.conversation).preferred_language) ||
    "";

  const detected = detectCustomerLanguage(input.message || "", {
    hint,
    fallback: hint || "en",
  });

  // If locked and latest message is unclear, stay on locked preference.
  if (
    locked &&
    (detected.method === "hint_unclear" ||
      detected.method === "default_unclear" ||
      detected.method === "hint_empty_message" ||
      detected.method === "default_empty")
  ) {
    const meta = languageMeta(locked);
    return {
      code: meta.code,
      name: meta.name,
      rtl: Boolean(meta.rtl),
      confidence: 0.7,
      method: "locked_preference",
      switched: false,
      preferred_language: locked,
    };
  }

  const switched = Boolean(locked && detected.code !== locked);
  return {
    ...detected,
    switched,
    preferred_language: locked || detected.code,
  };
}

/**
 * Supported language list for prompts / docs.
 */
export function preferredLanguageOptions() {
  return SUPPORTED_CUSTOMER_LANGUAGES.map((l) => ({ ...l }));
}
