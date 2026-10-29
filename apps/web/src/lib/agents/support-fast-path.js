/**
 * Latency helpers for inbound Support auto-reply.
 * Simple greetings skip Anthropic + collaborator reviews so webhook→Graph
 * stays inside Meta/Vercel budgets (avoids cold-start “Hi” black holes).
 */

import { detectCustomerLanguage } from "./detect-language";
import { ensureBrandedOutboundText } from "@/lib/brand/wrap-message";

/** Short greeting / ack patterns across supported languages. */
const GREETING_RE =
  /^(hi+|hii+|hello|hey+|hola|hallo|salut|bonjour|bonsoir|ciao|olá|ola|oi+|привет|здравств(уйте|уй)|مرحبا|أهلا|اهلا|السلام\s*عليكم|مرحباً|bun[aă]\s*(ziua|seara)?|servus|moin|yo|sup|good\s*(morning|afternoon|evening)|صباح\s*الخير|مساء\s*الخير)([\s,.!?…]|👋|🙏|😊|🙂)*$/iu;

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isSimpleSupportGreeting(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (raw.length <= 48 && GREETING_RE.test(raw)) return true;

  // Email / wrapped inbound often stores "Subject\n\nBody". Treat as greeting
  // when the last paragraph is a short greeting and earlier lines look like a
  // short subject (no question mark).
  const paras = raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paras.length < 2) return false;
  const last = paras[paras.length - 1];
  if (!last || last.length > 48 || !GREETING_RE.test(last)) return false;
  return paras.slice(0, -1).every(
    (p) => p.length <= 80 && !/[?]/.test(p) && p.split(/\s+/).length <= 12,
  );
}

/**
 * Instant branded Support reply — no Anthropic, no QC/Compliance LLM.
 * @param {{
 *   message: string,
 *   customerName?: string | null,
 *   languageHint?: string,
 *   languageOverride?: string,
 * }} input
 */
export function draftFastSupportReply(input) {
  const started = Date.now();
  const message = String(input.message || "").trim() || "Hi";
  const detected = detectCustomerLanguage(message, {
    hint: input.languageHint || "",
    fallback: input.languageHint || "en",
  });
  const lang = String(input.languageOverride || detected.code || "en")
    .trim()
    .toLowerCase() || "en";
  const cores = FAST_GREETING_CORE[lang] || FAST_GREETING_CORE.en;
  const body = `${cores}\n\n${FAST_HUMAN[lang] || FAST_HUMAN.en}`;
  const branded = ensureBrandedOutboundText(body, {
    greetingKind: "default",
    customerName: input.customerName || undefined,
    language: lang,
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
    detected_language: lang,
    detected_language_name: detected.name,
    language_rtl: detected.rtl,
    latency_ms: Date.now() - started,
    fast_path: true,
  };
}

const FAST_GREETING_CORE = {
  en: "Thanks for writing Triada Designs. How can we help with Salt & Spirit or a custom piece today?",
  ar: "شكراً لتواصلك مع تريادا ديزاينز. كيف يمكننا مساعدتك بخصوص Salt & Spirit أو قطعة مخصّصة اليوم؟",
  ro: "Mulțumim că ne-ați scris la Triada Designs. Cum vă putem ajuta cu Salt & Spirit sau o piesă personalizată azi?",
  de: "Danke, dass Sie Triada Designs schreiben. Wie können wir Ihnen heute mit Salt & Spirit oder einem Einzelstück helfen?",
  fr: "Merci d’écrire à Triada Designs. Comment pouvons-nous vous aider aujourd’hui pour Salt & Spirit ou une pièce sur mesure ?",
  ru: "Спасибо, что написали в Triada Designs. Чем помочь сегодня по Salt & Spirit или индивидуальному изделию?",
  es: "Gracias por escribir a Triada Designs. ¿Cómo podemos ayudarte hoy con Salt & Spirit o una pieza a medida?",
  pt: "Obrigado por escrever à Triada Designs. Como podemos ajudar hoje com Salt & Spirit ou uma peça personalizada?",
};

const FAST_HUMAN = {
  en: "I’m Triada’s AI Support — say if you’d like a person instead.",
  ar: "أنا دعم تريادا بالذكاء الاصطناعي — أخبرنا إن رغبت بالتحدث مع شخص.",
  ro: "Sunt AI Support Triada — spuneți dacă doriți o persoană.",
  de: "Ich bin Triadas KI-Support — sagen Sie Bescheid, wenn Sie eine Person möchten.",
  fr: "Je suis le Support IA Triada — dites-le si vous préférez une personne.",
  ru: "Я ИИ-поддержка Triada — скажите, если нужна живая помощь.",
  es: "Soy el Support con IA de Triada — diga si prefiere una persona.",
  pt: "Sou o Support com IA da Triada — diga se preferir uma pessoa.",
};
