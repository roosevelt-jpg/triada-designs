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
import { previewSvgDataUrl } from "./preview-svg";

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

  const width = 1080;
  const height = isVideo || kind === "animation" ? 1920 : 1080;
  const prompt = isVideo ? videoPrompt : imagePrompt;
  const productTitle =
    String(item.product_context?.name || product || item.title || "Triada Designs");
  const previewUrl = previewSvgDataUrl({
    width,
    height,
    title: productTitle,
    target: isUgc ? "ugc" : kind,
    prompt,
    kind,
  });

  /** @type {object[]} */
  const variants = [];
  if (action === "generate-variants" || action === "ensure-creative") {
    const platforms = [
      { key: "instagram_feed", w: 1080, h: 1080, ratio: "1:1" },
      { key: "instagram_story", w: 1080, h: 1920, ratio: "9:16" },
      { key: "facebook_feed", w: 1200, h: 630, ratio: "1.91:1" },
      { key: "tiktok", w: 1080, h: 1920, ratio: "9:16" },
    ];
    for (const platform of platforms) {
      variants.push({
        id: `variant-${item.id || "draft"}-${platform.key}`,
        platform_target: platform.key,
        width: platform.w,
        height: platform.h,
        aspect_ratio: platform.ratio,
        mode: mediaMode,
        media_asset: {
          url: previewSvgDataUrl({
            width: platform.w,
            height: platform.h,
            title: productTitle,
            target: platform.key,
            prompt,
            kind: "image",
          }),
          kind: "image",
          mode: mediaMode,
        },
      });
    }
  }

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
      width,
      height,
      aspect_ratio: height === width ? "1:1" : height > width ? "9:16" : "16:9",
      duration_ms: isVideo ? durationMs : null,
      url: previewUrl,
      mime_type: "image/svg+xml",
      prompt,
      preview_ready: true,
    },
    variants,
    sidecar: isVideo
      ? { placeholder_mp4: !geminiReady, animation_svg: !geminiReady }
      : null,
    message: isUgc
      ? "UGC video drafted — preview before approval."
      : isVideo
        ? "Short video drafted — preview before approval."
        : isImage
          ? "Creative draft ready — preview before approval."
          : "Creative generation ready.",
  };
}
