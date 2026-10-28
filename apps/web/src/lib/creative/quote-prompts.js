/**
 * Jewellery Quote / Inspiration prompts (server-side only).
 * Learns from Training Docs for tone / niche / customer language.
 * Do not surface provider names in product UI.
 */

export const QUOTE_PROMPT_VERSION = 1;

/**
 * Claude system prompt for Triada inspirational quote cards.
 * @param {string} [trainingContext]
 */
export function quoteInspirationSystemPrompt(trainingContext = "") {
  const training = String(trainingContext || "").trim();
  return [
    "You are Triada Designs' Inspiration copywriter for luxury jewellery brand content.",
    "Write short, warm, editorial inspirational quotes that feel native to a jewellery house",
    "(Salt & Spirit, Gulf light, quiet luxury, meaningful adornment) — never generic hustle quotes.",
    "Return compact JSON only with keys: quote, attribution, caption, theme, cta, hashtags, visual_mood.",
    "",
    "Rules:",
    "- Quote body: 8–22 words, poetic but clear, one idea.",
    "- Attribution: optional short line (e.g. Triada Designs, Salt & Spirit, or empty).",
    "- Caption: 1–2 soft lines for WhatsApp / social; warm greeting tone without hard sell.",
    "- Soft CTA only (e.g. Wear what grounds you / Discover Triada). No fake scarcity or invented discounts.",
    "- Never invent prices, stock, reviews, medical claims, or celebrity endorsements.",
    "- Match Training Docs for tone, niche, and customer language when provided — no off-brand fabrication.",
    "- Human approval is required before broadcast.",
    training
      ? `\nTraining Docs (authoritative — stay within this voice):\n${training}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * @param {{
 *   theme?: string,
 *   language?: string,
 *   niche_hint?: string,
 *   customer_hint?: string,
 * }} [context]
 */
export function quoteInspirationUserPrompt(context = {}) {
  const theme = String(context.theme || "everyday quiet luxury").trim();
  const language = String(context.language || "en").trim();
  const niche = String(context.niche_hint || "jewellery, adornment, presence").trim();
  const customer = String(
    context.customer_hint || "women who choose meaningful pieces for Gulf light and daily ritual",
  ).trim();

  return [
    `Theme: ${theme}`,
    `Language: ${language} (write the quote and caption in this language)`,
    `Niche: ${niche}`,
    `Customers: ${customer}`,
    'JSON only: {"quote":"...","attribution":"Triada Designs","caption":"...","theme":"...","cta":"...","hashtags":["TriadaDesigns"],"visual_mood":"..."}',
  ].join("\n");
}

/**
 * Image prompt for a designed quote card (jewellery atmosphere + legible text space).
 * @param {string} quote
 * @param {Record<string, unknown>} [context]
 */
export function forQuoteCardImage(quote, context = {}) {
  const mood = String(
    context.visual_mood ||
      context.mood ||
      "warm ivory champagne neutrals, soft Gulf window light, quiet luxury",
  );
  const theme = String(context.theme || "inspiration");
  const quoteClean = String(quote || "")
    .replace(/\s+/g, " ")
    .trim();

  return [
    "Designed inspirational quote card for Triada Designs jewellery brand.",
    "Square social card 1080×1080: elegant negative space for large centered serif quote text.",
    `Theme: ${theme}.`,
    `Mood: ${mood}.`,
    "Background: soft jewellery atmosphere — brushed metal hint, pearl glow, or linen/sand texture — not busy.",
    "Leave a clear center band for typography; avoid covering the quote area with objects.",
    "Subtle Triada brand restraint; no neon, purple glow, fake badges, or watermark spam.",
    quoteClean ? `Quote to honour visually: “${quoteClean}”` : "",
    "Style: editorial jewellery inspiration card, warm neutrals, tactile luxury.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Deterministic local fallback when Claude is not keyed.
 * @param {Record<string, unknown>} [context]
 */
export function localQuotePackage(context = {}) {
  const theme = String(context.theme || "presence");
  const catalog = [
    {
      quote: "Wear what steadies you — light on the skin, strength in the day.",
      attribution: "Triada Designs",
      caption: "A quiet piece for the light you keep. Soft luxury, made to last.",
      cta: "Discover Triada",
      visual_mood: "soft Gulf window light, champagne metal, linen calm",
    },
    {
      quote: "Adornment is a ritual — choose presence over noise.",
      attribution: "Salt & Spirit",
      caption: "Jewellery that feels like a breath between the rush.",
      cta: "Explore the collection",
      visual_mood: "warm ivory, pearl glow, editorial restraint",
    },
    {
      quote: "Gold remembers every soft hour you choose yourself.",
      attribution: "Triada Designs",
      caption: "Quiet luxury for everyday Gulf light.",
      cta: "Wear your light",
      visual_mood: "brushed gold hint, sand neutrals, shallow depth",
    },
  ];
  const pick = catalog[Math.abs(theme.length) % catalog.length];
  return {
    quote: pick.quote,
    attribution: pick.attribution,
    caption: pick.caption,
    theme,
    cta: pick.cta,
    hashtags: ["TriadaDesigns", "SaltAndSpirit", "QuietLuxury"],
    visual_mood: pick.visual_mood,
    mode: "local_sim",
    prompt_version: QUOTE_PROMPT_VERSION,
  };
}
