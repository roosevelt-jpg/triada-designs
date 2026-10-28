/**
 * Compose Content Studio packages: Claude for copy/scripts, Gemini for media pixels.
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
import { generateGeminiMedia, resolveGeminiApiKey } from "./gemini-media";
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
  const geminiReady = hasGeminiEnv() || Boolean(resolveGeminiApiKey());

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

  let mediaMode = "local_sim";
  let mediaError = null;
  let previewUrl = null;
  let mimeType = "image/svg+xml";
  let mediaModel = null;
  let mediaPath = null;
  let posterOnly = false;

  if (geminiReady) {
    const media = await generateGeminiMedia({
      prompt,
      kind,
      width,
      height,
      durationMs,
    });

    if (media.ok && media.dataUrl) {
      mediaMode = "gemini";
      previewUrl = media.dataUrl;
      mimeType = media.mimeType || (isVideo ? "video/mp4" : "image/png");
      mediaModel = media.model || null;
      mediaPath = media.path || null;
      posterOnly = Boolean(media.poster_only);
      if (media.video_error) {
        mediaError = media.video_error;
      }
    } else {
      // Keyed but failed — do not pretend SVG is Gemini output.
      mediaMode = "error";
      mediaError = media.error || "Gemini media generation failed";
      previewUrl = previewSvgDataUrl({
        width,
        height,
        title: productTitle,
        target: isUgc ? "ugc" : kind,
        prompt,
        kind,
      });
      mimeType = "image/svg+xml";
    }
  } else {
    previewUrl = previewSvgDataUrl({
      width,
      height,
      title: productTitle,
      target: isUgc ? "ugc" : kind,
      prompt,
      kind,
    });
  }

  const overallMode =
    mediaMode === "gemini"
      ? "gemini"
      : copyLive
        ? "live"
        : mediaMode === "error"
          ? "local_sim"
          : "local_sim";

  /** @type {object[]} */
  const variants = [];
  if (action === "generate-variants" || action === "ensure-creative") {
    const platforms = [
      { key: "instagram_feed", w: 1080, h: 1080, ratio: "1:1" },
      { key: "instagram_story", w: 1080, h: 1920, ratio: "9:16" },
      { key: "facebook_feed", w: 1200, h: 630, ratio: "1.91:1" },
      { key: "tiktok", w: 1080, h: 1920, ratio: "9:16" },
    ];

    // Prefer one live Gemini hero, then crop-label variants from that asset URL.
    let heroUrl = previewUrl;
    if (geminiReady && mediaMode === "gemini" && kind !== "image") {
      const hero = await generateGeminiMedia({
        prompt: imagePrompt,
        kind: "image",
        width: 1080,
        height: 1080,
      });
      if (hero.ok && hero.dataUrl) heroUrl = hero.dataUrl;
    } else if (geminiReady && mediaMode !== "gemini") {
      const hero = await generateGeminiMedia({
        prompt: imagePrompt,
        kind: "image",
        width: 1080,
        height: 1080,
      });
      if (hero.ok && hero.dataUrl) {
        heroUrl = hero.dataUrl;
        mediaMode = "gemini";
        previewUrl = hero.dataUrl;
        mimeType = hero.mimeType || "image/png";
        mediaModel = hero.model;
        mediaPath = hero.path;
      }
    }

    for (const platform of platforms) {
      variants.push({
        id: `variant-${item.id || "draft"}-${platform.key}`,
        platform_target: platform.key,
        width: platform.w,
        height: platform.h,
        aspect_ratio: platform.ratio,
        mode: mediaMode === "gemini" ? "gemini" : "local_sim",
        media_asset: {
          url:
            mediaMode === "gemini" && heroUrl
              ? heroUrl
              : previewSvgDataUrl({
                  width: platform.w,
                  height: platform.h,
                  title: productTitle,
                  target: platform.key,
                  prompt: imagePrompt,
                  kind: "image",
                }),
          kind: "image",
          mode: mediaMode === "gemini" ? "gemini" : "local_sim",
          mime_type:
            mediaMode === "gemini" && heroUrl && !String(heroUrl).startsWith("data:image/svg")
              ? "image/png"
              : "image/svg+xml",
        },
      });
    }
  }

  const ok = mediaMode === "gemini" || !geminiReady;

  return {
    ok,
    mode: overallMode === "gemini" ? "gemini" : overallMode,
    mode_label: creativeModeLabel(overallMode === "gemini" ? "gemini" : overallMode),
    prompt_version: CREATIVE_PROMPT_VERSION,
    creative_brief: {
      ...(item.creative_brief && typeof item.creative_brief === "object"
        ? item.creative_brief
        : {}),
      ...brief,
      ugc_script: ugcScript || undefined,
      image_prompt: imagePrompt,
      video_prompt: videoPrompt,
      media_model: mediaModel,
      media_path: mediaPath,
      updated_at: new Date().toISOString(),
      prompt_version: CREATIVE_PROMPT_VERSION,
    },
    script: ugcScript,
    asset: {
      id: `asset-${item.id || "draft"}-${action || "creative"}`,
      kind,
      mode: mediaMode === "gemini" ? "gemini" : "local_sim",
      width,
      height,
      aspect_ratio: height === width ? "1:1" : height > width ? "9:16" : "16:9",
      duration_ms: isVideo ? durationMs : null,
      url: previewUrl,
      mime_type: mimeType,
      prompt,
      preview_ready: Boolean(previewUrl),
      model: mediaModel,
      metadata: {
        media_path: mediaPath,
        poster_only: posterOnly || undefined,
        gemini_error: mediaError || undefined,
        realistic_3d: mediaMode === "gemini",
      },
    },
    variants,
    sidecar: isVideo
      ? {
          placeholder_mp4: mediaMode !== "gemini",
          animation_svg: mediaMode !== "gemini",
          poster_only: posterOnly || undefined,
        }
      : null,
    error: geminiReady && mediaMode !== "gemini" ? mediaError : null,
    message: !ok
      ? "Media generation needs a retry — preview is not live yet."
      : isUgc
        ? "UGC video drafted — preview before approval."
        : isVideo
          ? "Short video drafted — preview before approval."
          : isImage
            ? "Creative draft ready — preview before approval."
            : "Creative generation ready.",
  };
}
