/**
 * Detect customer language from the latest inbound message.
 * Script-first (Arabic / Cyrillic), then Latin stopword scoring.
 * Default: English when unclear.
 */

/** @typedef {{ code: string, name: string, confidence: number, rtl: boolean, method: string }} DetectedLanguage */

export const SUPPORTED_CUSTOMER_LANGUAGES = [
  { code: "ar", name: "Arabic", rtl: true },
  { code: "ro", name: "Romanian", rtl: false },
  { code: "de", name: "German", rtl: false },
  { code: "fr", name: "French", rtl: false },
  { code: "ru", name: "Russian", rtl: false },
  { code: "es", name: "Spanish", rtl: false },
  { code: "pt", name: "Portuguese", rtl: false },
  { code: "en", name: "English", rtl: false },
];

const LANG_META = Object.fromEntries(
  SUPPORTED_CUSTOMER_LANGUAGES.map((l) => [l.code, l]),
);

/** Extra Latin languages we can still match when the customer writes them. */
const EXTRA_LATIN = {
  it: { code: "it", name: "Italian", rtl: false },
  tr: { code: "tr", name: "Turkish", rtl: false },
  nl: { code: "nl", name: "Dutch", rtl: false },
  pl: { code: "pl", name: "Polish", rtl: false },
};

const STOPWORDS = {
  ar: [
    "مرحبا",
    "السلام",
    "عليكم",
    "أريد",
    "ارجو",
    "من فضلك",
    "شكرا",
    "هل",
    "ما",
    "هذا",
    "هذه",
    "كيف",
    "سعر",
    "طلب",
    "شحن",
    "ذهب",
    "فضة",
    "خاتم",
    "عقد",
  ],
  ru: [
    "привет",
    "здравствуйте",
    "пожалуйста",
    "спасибо",
    "хочу",
    "нужен",
    "сколько",
    "цена",
    "заказ",
    "доставка",
    "кольцо",
    "золото",
    "серебро",
    "это",
    "как",
    "можно",
  ],
  ro: [
    "buna",
    "bună",
    "salut",
    "va",
    "vă",
    "rog",
    "multumesc",
    "mulțumesc",
    "cat",
    "cât",
    "costa",
    "costă",
    "pret",
    "preț",
    "comanda",
    "comandă",
    "livrare",
    "inel",
    "aur",
    "argint",
    "va rog",
    "dumneavoastra",
    "dumneavoastră",
  ],
  de: [
    "hallo",
    "guten",
    "bitte",
    "danke",
    "wie",
    "viel",
    "kostet",
    "preis",
    "bestellung",
    "lieferung",
    "ring",
    "gold",
    "silber",
    "ich",
    "möchte",
    "moechte",
    "und",
    "nicht",
    "für",
    "fuer",
  ],
  fr: [
    "bonjour",
    "bonsoir",
    "salut",
    "merci",
    "s'il",
    "vous",
    "plait",
    "plaît",
    "combien",
    "prix",
    "commande",
    "livraison",
    "bague",
    "or",
    "argent",
    "je",
    "voudrais",
    "avec",
    "pour",
    "une",
    "des",
  ],
  es: [
    "hola",
    "buenos",
    "dias",
    "días",
    "gracias",
    "por",
    "favor",
    "cuanto",
    "cuánto",
    "cuesta",
    "precio",
    "pedido",
    "envio",
    "envío",
    "anillo",
    "oro",
    "plata",
    "quiero",
    "necesito",
    "una",
    "para",
  ],
  pt: [
    "ola",
    "olá",
    "obrigado",
    "obrigada",
    "por",
    "favor",
    "quanto",
    "custa",
    "preco",
    "preço",
    "pedido",
    "entrega",
    "anel",
    "ouro",
    "prata",
    "quero",
    "preciso",
    "uma",
    "para",
    "voce",
    "você",
  ],
  en: [
    "hello",
    "hi",
    "please",
    "thanks",
    "thank",
    "how",
    "much",
    "price",
    "order",
    "shipping",
    "delivery",
    "ring",
    "gold",
    "silver",
    "want",
    "need",
    "the",
    "and",
    "for",
    "with",
    "what",
    "when",
  ],
  it: [
    "ciao",
    "buongiorno",
    "grazie",
    "per",
    "favore",
    "quanto",
    "costa",
    "prezzo",
    "ordine",
    "spedizione",
    "anello",
    "oro",
    "argento",
    "vorrei",
  ],
  tr: [
    "merhaba",
    "selam",
    "lutfen",
    "lütfen",
    "tesekkur",
    "teşekkür",
    "fiyat",
    "siparis",
    "sipariş",
    "kargo",
    "yuzuk",
    "yüzük",
    "altin",
    "altın",
    "gumuş",
    "gümüş",
  ],
  nl: [
    "hallo",
    "goedemorgen",
    "alstublieft",
    "dank",
    "hoeveel",
    "prijs",
    "bestelling",
    "levering",
    "ring",
    "goud",
    "zilver",
    "graag",
  ],
  pl: [
    "czesc",
    "cześć",
    "dzien",
    "dzień",
    "prosze",
    "proszę",
    "dziekuje",
    "dziękuję",
    "ile",
    "kosztuje",
    "cena",
    "zamowienie",
    "zamówienie",
    "dostawa",
    "pierscionek",
    "pierścionek",
    "zloto",
    "złoto",
  ],
};

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const CYRILLIC_RE = /[\u0400-\u04FF]/;
const LATIN_RE = /[A-Za-zÀ-ÿĂăÂâÎîȘșȚț]/;

/**
 * @param {string} code
 * @returns {{ code: string, name: string, rtl: boolean }}
 */
export function languageMeta(code) {
  const c = normalizeLangCode(code);
  return (
    LANG_META[c] ||
    EXTRA_LATIN[c] || {
      code: c || "en",
      name: c ? c.toUpperCase() : "English",
      rtl: c === "ar" || c === "he" || c === "fa" || c === "ur",
    }
  );
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeLangCode(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (!s) return "";
  const base = s.split("-")[0];
  if (base === "arb" || base === "ara") return "ar";
  if (base === "ron" || base === "rum") return "ro";
  if (base === "ger" || base === "deu") return "de";
  if (base === "fre" || base === "fra") return "fr";
  if (base === "rus") return "ru";
  if (base === "spa" || base === "castellano") return "es";
  if (base === "por" || base === "pt-br" || base === "ptbr") return "pt";
  if (base === "eng") return "en";
  return base;
}

/**
 * Detect language from the customer's latest message text.
 * @param {string} text
 * @param {{ fallback?: string, hint?: string }} [opts]
 * @returns {DetectedLanguage}
 */
export function detectCustomerLanguage(text, opts = {}) {
  const raw = String(text || "").trim();
  const hint = normalizeLangCode(opts.hint);
  const fallback = normalizeLangCode(opts.fallback) || "en";

  if (!raw) {
    const meta = languageMeta(hint || fallback);
    return {
      code: meta.code,
      name: meta.name,
      confidence: hint ? 0.55 : 0.2,
      rtl: Boolean(meta.rtl),
      method: hint ? "hint_empty_message" : "default_empty",
    };
  }

  const letters = raw.replace(/\s+/g, "");
  const arabic = (raw.match(new RegExp(ARABIC_RE.source, "g")) || []).length;
  const cyrillic = (raw.match(new RegExp(CYRILLIC_RE.source, "g")) || []).length;
  const latin = (raw.match(new RegExp(LATIN_RE.source, "g")) || []).length;
  const totalScript = arabic + cyrillic + latin || 1;

  if (arabic / totalScript >= 0.35 || (arabic >= 3 && arabic >= latin)) {
    return {
      code: "ar",
      name: "Arabic",
      confidence: Math.min(0.99, 0.7 + arabic / Math.max(letters.length, 1)),
      rtl: true,
      method: "script_arabic",
    };
  }

  if (cyrillic / totalScript >= 0.35 || (cyrillic >= 3 && cyrillic >= latin)) {
    return {
      code: "ru",
      name: "Russian",
      confidence: Math.min(0.99, 0.68 + cyrillic / Math.max(letters.length, 1)),
      rtl: false,
      method: "script_cyrillic",
    };
  }

  const tokens = tokenize(raw);
  /** @type {Record<string, number>} */
  const scores = {};
  for (const [code, words] of Object.entries(STOPWORDS)) {
    let score = 0;
    for (const w of words) {
      if (tokens.includes(normalizeToken(w))) score += w.includes(" ") ? 2 : 1;
    }
    // Diacritic / orthography bonuses
    if (code === "ro" && /[ăâîșțĂÂÎȘȚ]/.test(raw)) score += 3;
    if (code === "de" && /[äöüßÄÖÜ]/.test(raw)) score += 2;
    if (code === "fr" && /[àâçéèêëïîôùûüÿœæ]/i.test(raw)) score += 2;
    if (code === "es" && /[ñáéíóúü¿¡]/i.test(raw)) score += 2;
    if (code === "pt" && /[ãõáéíóúç]/i.test(raw)) score += 2;
    if (code === "pl" && /[ąćęłńóśźż]/i.test(raw)) score += 2;
    if (code === "tr" && /[çğıöşü]/i.test(raw)) score += 2;
    scores[code] = score;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestCode, bestScore] = ranked[0] || ["en", 0];
  const second = ranked[1]?.[1] || 0;

  if (bestScore <= 0) {
    if (hint) {
      const meta = languageMeta(hint);
      return {
        code: meta.code,
        name: meta.name,
        confidence: 0.45,
        rtl: Boolean(meta.rtl),
        method: "hint_unclear",
      };
    }
    const meta = languageMeta(fallback);
    return {
      code: meta.code,
      name: meta.name,
      confidence: 0.25,
      rtl: Boolean(meta.rtl),
      method: "default_unclear",
    };
  }

  // Prefer latest-message winner. Only keep hint when it IS the best code
  // (never let preferred_language block a clear customer language switch).
  if (hint && hint === bestCode) {
    const meta = languageMeta(hint);
    return {
      code: meta.code,
      name: meta.name,
      confidence: Math.min(0.9, 0.6 + bestScore * 0.06),
      rtl: Boolean(meta.rtl),
      method: "hint_confirm",
    };
  }

  const meta = languageMeta(bestCode);
  const confidence =
    bestScore >= second + 2
      ? Math.min(0.95, 0.55 + bestScore * 0.08)
      : Math.min(0.75, 0.45 + bestScore * 0.06);

  return {
    code: meta.code,
    name: meta.name,
    confidence,
    rtl: Boolean(meta.rtl),
    method: "stopwords",
  };
}

/**
 * @param {string} text
 */
function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKC")
    .split(/[^a-zA-ZÀ-ÿăâîșțĂÂÎȘȚ0-9\u0400-\u04FF\u0600-\u06FF']+/)
    .map(normalizeToken)
    .filter((t) => t.length >= 2);
}

/**
 * @param {string} t
 */
function normalizeToken(t) {
  return String(t || "")
    .toLowerCase()
    .normalize("NFKC")
    .trim();
}

/**
 * Build the language-matching system block for a detected language.
 * Expands LANGUAGE_MATCHING_HOOK with an explicit reply-language directive.
 * @param {DetectedLanguage | { code?: string, name?: string, rtl?: boolean }} detected
 * @param {string} baseHook
 */
export function buildLanguageMatchingBlock(detected, baseHook) {
  const code = normalizeLangCode(detected?.code) || "en";
  const meta = languageMeta(code);
  const name = detected?.name || meta.name;
  const rtl = detected?.rtl ?? meta.rtl;
  const arabicRules = code === "ar"
    ? [
        "- Arabic replies: write proper Arabic script (not Latin transliteration).",
        "- Use natural RTL-friendly phrasing and punctuation; keep brand names (Triada Designs) as written.",
      ].join("\n")
    : "";

  return [
    baseHook,
    "",
    `Detected customer language for this turn: ${name} (${code}).`,
    `- LANGUAGE LOCK: reply entirely in ${name}. Never switch to another language unless the customer's latest message switches.`,
    `- Greetings, answers, follow-ups, escalation outlines, lead notes, and marketing chat must all be in ${name}.`,
    "- If the customer mixed languages in the latest message — mirror their mix; otherwise stay monolingual in the detected language.",
    "- Shared memory / internal notes may stay in English; all customer-facing text must match the customer.",
    rtl
      ? "- This language is RTL: prefer natural right-to-left phrasing; do not force Latin script."
      : "",
    arabicRules,
  ]
    .filter(Boolean)
    .join("\n");
}
