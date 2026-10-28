/**
 * Triada Creative Studio prompts (server-side only).
 * Under the hood: Claude = copy/scripts/storyboards; Gemini = image + video pixels.
 * Do not surface provider names or dual-path jargon in product UI.
 */

export const CREATIVE_PROMPT_VERSION = 2;

/** Channels Creative optimizes for. */
export const CREATIVE_CHANNELS = [
  "instagram",
  "facebook",
  "tiktok",
  "whatsapp",
  "meta",
];

/**
 * Claude system prompt for viral jewellery UGC scripts + conversion copy.
 */
export function ugcScriptSystemPrompt() {
  return [
    "You are Triada Designs' Creative copywriter for luxury jewellery (UAE / Gulf light aesthetic, Salt & Spirit collections).",
    "Write HIGH-CONVERTING, viral-ready UGC-style creative for Meta (Facebook/Instagram), TikTok, and WhatsApp Status/broadcasts.",
    "Return compact JSON only with keys: hook, script, storyboard, cta, caption, hashtags, platform_notes.",
    "",
    "Conversion rules:",
    "- Hook in the first 1–2 seconds / first line — pattern interrupt, sensory, or soft POV. No clickbait lies.",
    "- One core desire per piece (everyday glow, gift that feels personal, quiet Gulf luxury).",
    "- Soft CTA toward shop / DM / WhatsApp — never fake scarcity, countdown, or invented discounts.",
    "- Authentic creator voice: handheld, natural, conversational — not studio hard-sell or celebrity polish.",
    "- Captions: scannable, 1–3 short lines + optional emoji sparingly; hashtags 3–6 brand-safe max.",
    "- Materials truth only when stated: silver with gold plating; 14K/18K gold on request; ~7 day make time.",
    "- Never invent prices, stock, reviews, celebrity endorsements, or medical/wellness claims.",
    "- Human approval is always required before public publish.",
    "- You write text packages only. Do not claim you rendered video or image pixels.",
  ].join("\n");
}

/**
 * Claude system prompt for feed captions / carousels / WhatsApp short copy.
 */
export function captionCopySystemPrompt() {
  return [
    "You are Triada Designs' Content creator for luxury jewellery marketing.",
    "Write high-converting social copy for Instagram, Facebook, TikTok, and WhatsApp.",
    "Return JSON only: {\"caption\":\"...\",\"hook\":\"...\",\"cta\":\"...\",\"hashtags\":[\"...\"],\"alt_variants\":[\"...\"]}.",
    "Brand: refined, warm, editorial, trustworthy — Gulf-light luxury without neon or fake urgency.",
    "One message per draft. Prefer sensory specifics over empty adjectives.",
    "Never invent prices, stock, discounts, or social proof. Human approval before publish.",
  ].join("\n");
}

/**
 * Creative agent roster policy (stored on Content creator / Creative).
 */
export function creativeAgentSystemPrompt() {
  return [
    "You are Content creator / Creative for Triada Designs — luxury jewellery for Meta, Instagram, TikTok, and WhatsApp.",
    "Mission: draft viral, high-converting UGC-style creative that earns attention in the first second and invites a soft purchase next step.",
    "",
    "Always:",
    "- Lead with a scroll-stopping hook (POV, sensory close-up, gift moment, or quiet Gulf-light luxury).",
    "- One core message per draft; editorial brand voice — warm, refined, human.",
    "- Optimize for vertical UGC (9:16) and feed variants; platform-native captions for IG/FB/TikTok/WA.",
    "- Propose scripts, storyboards, captions, CTAs, and creative briefs only — never auto-publish.",
    "- Soft CTAs (Shop / DM / WhatsApp). No fake scarcity, fake reviews, or invented discounts.",
    "- Ground materials and policies in training docs / catalog only (silver + gold plating; 14K/18K on request; ~7 day make).",
    "- Share briefs in shared memory for Marketing and QC. QC/Compliance must review before live.",
    "",
    "Under the hood (never mention to customers or in dashboard copy): write conversion copy/scripts/storyboards; media generation uses the studio image/video path for pixels.",
  ].join("\n");
}

/**
 * @param {string} caption
 * @param {Record<string, unknown>} [context]
 */
export function forImage(caption, context = {}) {
  const objective = String(context.objective || "conversion");
  const product = String(
    context.product || context.product_name || "Triada Designs jewellery",
  );
  const materials = String(
    context.materials || "precious metals, refined stones, Gulf-light luxury finish",
  );
  const mood = String(
    context.mood ||
      "calm editorial, warm neutrals, tactile luxury, soft Gulf natural light",
  );
  const channel = String(context.channel || "instagram");
  const style = String(context.style || "ugc").toLowerCase();
  const captionClean = String(caption || "")
    .replace(/\s+/g, " ")
    .trim();

  const ugcLine =
    style === "ugc"
      ? "Look: authentic UGC / creator phone still — natural desk or soft window light, jewellery hero, lived-in elegance, not glossy catalog hard-sell."
      : "Look: refined editorial product photography — photoreal or high-end studio, restrained luxury.";

  return [
    "Premium jewellery visual for Triada Designs — high-converting social creative.",
    `Piece/focus: ${product}.`,
    `Materials: ${materials}.`,
    `Campaign objective: ${objective} (drive saves, DMs, soft shop intent).`,
    `Channel: ${channel} (Meta/IG/TikTok/WhatsApp ready crop).`,
    `Mood: ${mood}.`,
    ugcLine,
    "Composition: jewellery dominates frame; shallow depth; tactile metal/stone detail; warm ivory–champagne neutrals.",
    "Avoid: neon, purple glow, fake badges, invented logos, watermark spam, text-heavy overlays, medical claims.",
    captionClean ? `Caption alignment: ${captionClean}` : "",
    "Style keywords for generation: viral UGC jewellery, soft Gulf light, quiet luxury, conversion-ready still.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * @param {string} scriptOrCaption
 * @param {Record<string, unknown>} [context]
 */
export function forVideo(scriptOrCaption, context = {}) {
  const duration = Number(context.duration_ms || 8000);
  const seconds = Math.max(2, Math.round(duration / 1000));
  const product = String(context.product || "Triada Designs jewellery piece");
  const style = String(context.style || "ugc").toLowerCase();
  const channel = String(context.channel || "instagram");
  const storyboard = String(
    context.storyboard ||
      "0-1s hook close-up; mid authentic voiceover + soft light shift; end brand-restrained CTA frame",
  );
  const hook = String(context.hook || "").trim();

  const ugcLine =
    style === "ugc"
      ? "Format: authentic UGC / creator-style vertical 9:16, natural handheld micro-shake, soft Gulf window light, jewellery hero — scroll-stopping first frame, not studio hard-sell."
      : "Format: calm premium motion from stills or soft camera push-in; conversion-ready end frame.";

  return [
    `Short high-converting marketing video for Triada Designs jewellery (${seconds}s).`,
    `Subject: ${product}.`,
    `Style: ${style}. Channel: ${channel} (Reels / TikTok / Stories / WhatsApp Status).`,
    ugcLine,
    hook ? `Opening hook cue: ${hook}` : "Opening: pattern-interrupt close-up of the piece in the first second.",
    `Storyboard: ${storyboard}.`,
    `Script/caption cue: ${String(scriptOrCaption || "").trim()}`,
    "Pacing: hook → desire → soft CTA. End frame calm brand restraint.",
    "Avoid: loud effects, fake urgency text overlays, invented claims/logos, neon glows, stock influencer clichés.",
    "Generation keywords: viral jewellery UGC, Gulf light, quiet luxury, Meta/TikTok native.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * @param {string} caption
 * @param {Record<string, unknown>} [context]
 */
export function ugcScriptUserPrompt(caption, context = {}) {
  const product = String(context.product || "Triada Designs jewellery");
  const channel = String(context.channel || "instagram");
  const seconds = Number(context.seconds || 8);
  const style = String(context.style || "ugc");
  const storyboardHint = String(context.storyboard || "");
  const objective = String(context.objective || "conversion");
  const captionClean = String(caption || "")
    .replace(/\s+/g, " ")
    .trim();

  return [
    `Write a ${seconds}s ${style} video package optimized for high conversion on ${channel}.`,
    `Brand: Triada Designs (luxury jewellery, UAE/Gulf aesthetic).`,
    `Product: ${product}`,
    `Objective: ${objective}`,
    captionClean ? `Caption / brief: ${captionClean}` : "Caption / brief: (none — invent a truthful sensory brief only).",
    storyboardHint ? `Storyboard hint: ${storyboardHint}` : "",
    'Respond with JSON only: {"hook":"...","script":"...","storyboard":"...","cta":"...","caption":"...","hashtags":["..."],"platform_notes":"..."}.',
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * @param {string} caption
 * @param {Record<string, unknown>} [context]
 */
export function creativeBrief(caption, context = {}) {
  return {
    caption,
    objective: context.objective || "conversion",
    product: context.product || context.product_name || null,
    materials: context.materials || null,
    channel: context.channel || null,
    image_prompt: forImage(caption, context),
    video_prompt: forVideo(caption, context),
    prompt_version: CREATIVE_PROMPT_VERSION,
    approval_required: true,
    note: "Draft only — human approval required before publish.",
  };
}

/**
 * Local fallback when Claude is not keyed — still conversion-shaped.
 * @param {{ product: string, caption?: string, seconds?: number, style?: string }} opts
 */
export function localUgcPackage(opts) {
  const product = opts.product || "Triada Designs jewellery";
  const seconds = opts.seconds || 8;
  const caption = String(opts.caption || "").trim();
  const hook = "POV: soft Gulf light on the piece you’ll actually wear every day.";
  const script =
    caption ||
    `${hook} This ${product} — quiet luxury, tactile finish, no hard sell. Soft CTA to shop Triada Designs.`;
  return {
    hook,
    script,
    storyboard: `0-1s jewellery close-up hook; 1-${Math.max(2, seconds - 2)}s handheld soft light + authentic VO; end frame brand restraint + soft CTA — no fake badges.`,
    cta: "Shop Triada Designs",
    caption: `Soft Gulf light. Everyday glow. ${product}.`,
    hashtags: ["TriadaDesigns", "QuietLuxury", "JewelleryUGC"],
    platform_notes: "Vertical 9:16 for Reels / TikTok / WhatsApp Status.",
    mode: "local_sim",
  };
}
