/**
 * Compose Content Studio packages: Claude for copy/scripts, Gemini-oriented media prompts.
 * UI must stay product-facing (generate → approve → schedule → publish).
 */

import { completeAnthropic } from "@/lib/agents/anthropic-client";
import { hasGeminiEnv } from "@/lib/integrations/env-presence";
import { creativeModeLabel } from "@/lib/integrations/brand-labels";
import {
  CREATIVE_PROMPT_VERSION,
  captionCopySystemPrompt,
  creativeBrief,
  forImage,
  forVideo,
  localUgcPackage,
  ugcScriptSystemPrompt,
  ugcScriptUserPrompt,
} from "./jewellery-prompts";

/**
 * @param {string} text
 * @param {Record<string, unknown>} fallback
 */
function parseJsonObject(text, fallback) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return { ...fallback };
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return { ...fallback, script: trimmed };
  try {
    const decoded = JSON.parse(trimmed.slice(start, end + 1));
    if (decoded && typeof decoded === "object") {
      return { ...fallback, ...decoded };
    }
  } catch {
    /* fall through */
  }
  return { ...fallback, script: trimmed };
}

/**
 * @param {{
 *   item: Record<string, unknown>,
 *   body?: Record<string, unknown>,
 *   action: string,
 * }} input
 */
export async function composeCreativePackage(input) {
  const item = input.item || {};
  const body = input.body || {};
  const action = String(input.action || "");
  const isUgc =
    action === "generate-ugc-video" ||
    String(body.style || "").toLowerCase() === "ugc";
  const isVideo =
    isUgc ||
    action === "generate-video" ||
    action === "generate-animation" ||
    action.includes("video");
  const isImage =
    action === "generate-image" ||
    action === "generate-variants" ||
    action === "ensure-creative";

  const product = String(
    body.product ||
      item.product_context?.name ||
      "Triada Designs jewellery",
  );
  const materials = String(
    body.materials ||
      item.product_context?.materials ||
      "gold, refined stones",
  );
  const channel = String(body.channel || item.channel || "instagram");
  const caption = String(body.caption || item.body || item.title || "");
  const durationMs = Number(body.duration_ms || 8000);
  const seconds = Math.max(2, Math.round(durationMs / 1000));
  const style = String(body.style || (isUgc ? "ugc" : "editorial")).toLowerCase();
  const objective = String(body.objective || item.objective || "conversion");
  const storyboardHint = String(body.storyboard || "");

  const context = {
    product,
    materials,
    channel,
    style,
    objective,
    duration_ms: durationMs,
    seconds,
    storyboard: storyboardHint,
  };

  let ugcScript = null;
  let copyLive = false;
  const geminiReady = hasGeminiEnv();

  if (isUgc || isVideo || action === "ensure-creative") {
    const fallback = localUgcPackage({
      product,
      caption,
      seconds,
      style,
    });
    const completion = await completeAnthropic({
      system: ugcScriptSystemPrompt(),
      prompt: ugcScriptUserPrompt(caption, context),
      temperature: 0.55,
      max_tokens: 1100,
    });

    if (completion.ok && completion.text) {
      ugcScript = parseJsonObject(completion.text, fallback);
      copyLive = true;
    } else {
      ugcScript = { ...fallback };
    }

    const packageMode = copyLive || geminiReady ? "live" : "local_sim";
    ugcScript = {
      hook: String(ugcScript.hook || fallback.hook),
      script: String(ugcScript.script || fallback.script),
      storyboard: String(ugcScript.storyboard || fallback.storyboard),
      cta: String(ugcScript.cta || fallback.cta),
      caption: String(ugcScript.caption || fallback.caption),
      hashtags: Array.isArray(ugcScript.hashtags)
        ? ugcScript.hashtags.map(String).slice(0, 8)
        : fallback.hashtags,
      platform_notes: String(ugcScript.platform_notes || fallback.platform_notes),
      mode: packageMode,
      prompt_version: CREATIVE_PROMPT_VERSION,
    };
    context.hook = ugcScript.hook;
    context.storyboard = ugcScript.storyboard;
  }

  if ((action === "generate-image" || action === "ensure-creative") && !ugcScript) {
    const completion = await completeAnthropic({
      system: captionCopySystemPrompt(),
      prompt: [
        `Write conversion captions for Triada Designs.`,
        `Product: ${product}`,
        `Channel: ${channel}`,
        `Brief: ${caption || "everyday quiet luxury jewellery"}`,
        'JSON only: {"caption":"...","hook":"...","cta":"...","hashtags":["..."],"alt_variants":["..."]}',
      ].join("\n"),
      temperature: 0.5,
      max_tokens: 700,
    });
    if (completion.ok && completion.text) {
      const parsed = parseJsonObject(completion.text, {
        caption: caption || `${product} — quiet luxury for Gulf light.`,
        hook: "Soft light. Real glow.",
        cta: "Shop Triada Designs",
        hashtags: ["TriadaDesigns"],
      });
      copyLive = true;
      ugcScript = {
        ...parsed,
        script: String(parsed.caption || caption),
        storyboard: storyboardHint || "Still hero frame, soft light, brand restraint.",
        mode: "live",
        prompt_version: CREATIVE_PROMPT_VERSION,
      };
    }
  }

  const scriptText = ugcScript?.script || caption;
  const imagePrompt = forImage(scriptText, context);
  const videoPrompt = forVideo(scriptText, {
    ...context,
    hook: ugcScript?.hook,
    storyboard: ugcScript?.storyboard || storyboardHint,
  });
  const brief = creativeBrief(scriptText, context);
  brief.image_prompt = imagePrompt;
  brief.video_prompt = videoPrompt;
  if (ugcScript) brief.ugc_script = ugcScript;

  // Media path prefers Gemini when keyed; copy path prefers Claude when keyed.
  // Product-facing mode badge only (Live AI / Local) — no provider plumbing in UI.
  const mediaMode = geminiReady ? "gemini" : "local_sim";
  const overallMode = copyLive || geminiReady ? (geminiReady ? "gemini" : "live") : "local_sim";

  const kind = action.includes("anim")
    ? "animation"
    : isVideo
      ? "video"
      : "image";

  return {
    ok: true,
    mode: overallMode,
    mode_label: creativeModeLabel(overallMode),
    prompt_version: CREATIVE_PROMPT_VERSION,
    creative_brief: {
      ...(item.creative_brief && typeof item.creative_brief === "object"
        ? item.creative_brief
        : {}),
      ...brief,
      ugc_script: ugcScript || undefined,
      image_prompt: imagePrompt,
      video_prompt: videoPrompt,
      updated_at: new Date().toISOString(),
      prompt_version: CREATIVE_PROMPT_VERSION,
    },
    script: ugcScript,
    asset: {
      id: `asset-${item.id || "draft"}-${action || "creative"}`,
      kind,
      mode: mediaMode,
      width: 1080,
      height: isVideo || kind === "animation" ? 1920 : 1080,
      url: null,
      prompt: isVideo ? videoPrompt : imagePrompt,
    },
    sidecar: isVideo
      ? { placeholder_mp4: !geminiReady, animation_svg: !geminiReady }
      : null,
    message: isUgc
      ? "UGC video drafted and queued for approval."
      : isVideo
        ? "Short video drafted and queued for approval."
        : isImage
          ? "Creative draft ready for approval."
          : "Creative generation ready.",
  };
}
