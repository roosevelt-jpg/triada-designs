/**
 * Compose Content Studio packages: Claude for copy/scripts;
 * image + video pixels prefer Higgsfield when keyed, else Gemini.
 * UI must stay product-facing (generate → approve → schedule → publish).
 */

import { completeAnthropic } from "@/lib/agents/anthropic-client";
import { hasGeminiEnv } from "@/lib/integrations/env-presence";
import { hasHiggsfieldCredentials } from "@/lib/integrations/higgsfield-credentials";
import {
  creativeModeLabel,
  isLiveCreativeMediaMode,
} from "@/lib/integrations/brand-labels";
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
import {
  generateHiggsfieldImage,
  generateHiggsfieldVideo,
} from "./higgsfield-media";
import { previewSvgDataUrl } from "./preview-svg";

/**
 * Extract shared pro-generation params from the request body.
 * @param {Record<string, unknown>} body
 */
function proParamsFromBody(body = {}) {
  return {
    model: body.model || body.image_model || body.video_model || undefined,
    image_model: body.image_model || body.model || undefined,
    video_model: body.video_model || body.model || undefined,
    resolution: body.resolution || undefined,
    aspect_ratio: body.aspect_ratio || undefined,
    seed: body.seed != null ? Number(body.seed) : undefined,
    style_id: body.style_id || undefined,
    style_strength:
      body.style_strength != null ? Number(body.style_strength) : undefined,
    enhance_prompt:
      body.enhance_prompt === undefined
        ? undefined
        : Boolean(body.enhance_prompt),
    batch_size: body.batch_size != null ? Number(body.batch_size) : undefined,
    custom_reference_id: body.custom_reference_id || undefined,
    custom_reference_strength:
      body.custom_reference_strength != null
        ? Number(body.custom_reference_strength)
        : undefined,
    image_url: body.image_url || undefined,
    end_image_url: body.end_image_url || undefined,
    generate_audio:
      body.generate_audio === undefined
        ? undefined
        : Boolean(body.generate_audio),
    bitrate_mode: body.bitrate_mode || undefined,
    output_format: body.output_format || undefined,
  };
}

/**
 * Image pixels: Higgsfield Soul V2 first when keyed, else Gemini.
 * Video / animation: Higgsfield Seedance first when keyed, else Gemini.
 * @param {{
 *   prompt: string,
 *   kind: "image"|"video"|"animation",
 *   width?: number,
 *   height?: number,
 *   durationMs?: number,
 *   pro?: Record<string, unknown>,
 * }} input
 */
async function generateCreativePixels(input) {
  const kind = input.kind === "animation" ? "video" : input.kind;
  const pro = input.pro || {};

  if (kind === "image" && (await hasHiggsfieldCredentials())) {
    const hf = await generateHiggsfieldImage({
      prompt: input.prompt,
      width: input.width,
      height: input.height,
      model: pro.image_model || pro.model,
      aspect_ratio: pro.aspect_ratio,
      resolution: pro.resolution,
      seed: pro.seed,
      style_id: pro.style_id,
      style_strength: pro.style_strength,
      enhance_prompt: pro.enhance_prompt,
      batch_size: pro.batch_size,
      custom_reference_id: pro.custom_reference_id,
      custom_reference_strength: pro.custom_reference_strength,
    });
    if (hf.ok && hf.dataUrl) return hf;
    if (hasGeminiEnv() || resolveGeminiApiKey()) {
      const gemini = await generateGeminiMedia(input);
      if (gemini.ok && gemini.dataUrl) {
        return {
          ...gemini,
          higgsfield_error: hf.error || undefined,
          credential_source: hf.credential_source || undefined,
          path: gemini.path
            ? `higgsfield_fallback_${gemini.path}`
            : "higgsfield_fallback_gemini",
        };
      }
      const parts = [];
      if (hf.error) parts.push(`higgsfield(${hf.credential_source || "store"}): ${hf.error}`);
      if (gemini.error) parts.push(`gemini_fallback: ${gemini.error}`);
      return {
        ok: false,
        error: parts.join(" | ") || "image_generation_failed",
        mode: "error",
        higgsfield_error: hf.error || undefined,
        credential_source: hf.credential_source || undefined,
        gemini_error: gemini.error || undefined,
      };
    }
    return hf;
  }

  if (kind === "video" && (await hasHiggsfieldCredentials())) {
    // Prefer image-to-video only when a public http(s) still is provided.
    const imageUrl = String(pro.image_url || "").trim();
    const wantI2v =
      String(pro.video_model || pro.model || "").includes("image-to-video") ||
      Boolean(imageUrl && /^https?:\/\//i.test(imageUrl));
    const videoModel = wantI2v
      ? pro.video_model ||
        pro.model ||
        "bytedance/seedance-2.5/image-to-video"
      : pro.video_model ||
        pro.model ||
        "bytedance/seedance-2.5/text-to-video";

    const hf = await generateHiggsfieldVideo({
      prompt: input.prompt,
      width: input.width,
      height: input.height,
      duration_ms: input.durationMs,
      model: videoModel,
      aspect_ratio: pro.aspect_ratio,
      resolution: pro.resolution,
      image_url: wantI2v ? imageUrl : undefined,
      end_image_url: pro.end_image_url,
      generate_audio: pro.generate_audio,
      bitrate_mode: pro.bitrate_mode,
      output_format: pro.output_format,
    });
    if (hf.ok && hf.dataUrl) return hf;

    // If image-to-video failed for missing public URL, retry text-to-video once.
    if (
      wantI2v &&
      hf.error === "higgsfield_image_to_video_requires_public_image_url"
    ) {
      const retry = await generateHiggsfieldVideo({
        prompt: input.prompt,
        width: input.width,
        height: input.height,
        duration_ms: input.durationMs,
        model: "bytedance/seedance-2.5/text-to-video",
        aspect_ratio: pro.aspect_ratio,
        resolution: pro.resolution,
        generate_audio: pro.generate_audio,
        bitrate_mode: pro.bitrate_mode,
        output_format: pro.output_format,
      });
      if (retry.ok && retry.dataUrl) return retry;
      hf.error = retry.error || hf.error;
    }

    if (hasGeminiEnv() || resolveGeminiApiKey()) {
      const gemini = await generateGeminiMedia(input);
      if (gemini.ok && gemini.dataUrl) {
        return {
          ...gemini,
          higgsfield_error: hf.error || undefined,
          credential_source: hf.credential_source || undefined,
          path: gemini.path
            ? `higgsfield_fallback_${gemini.path}`
            : "higgsfield_fallback_gemini",
        };
      }
      const parts = [];
      if (hf.error) parts.push(`higgsfield(${hf.credential_source || "store"}): ${hf.error}`);
      if (gemini.error) parts.push(`gemini_fallback: ${gemini.error}`);
      return {
        ok: false,
        error: parts.join(" | ") || "video_generation_failed",
        mode: "error",
        higgsfield_error: hf.error || undefined,
        credential_source: hf.credential_source || undefined,
        gemini_error: gemini.error || undefined,
      };
    }
    return hf;
  }

  return generateGeminiMedia(input);
}

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
  const pro = proParamsFromBody(body);
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
  const durationMs = Number(
    body.duration_ms ||
      (body.duration != null ? Number(body.duration) * 1000 : 8000),
  );
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
  const higgsfieldReady = await hasHiggsfieldCredentials();
  const imageProviderReady = higgsfieldReady || geminiReady;
  // Video now prefers Higgsfield Seedance when keyed.
  const mediaProviderReady = isVideo
    ? higgsfieldReady || geminiReady
    : imageProviderReady;

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

    const packageMode = copyLive || mediaProviderReady ? "live" : "local_sim";
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
  let mediaProvider = null;
  let posterOnly = false;
  let credentialSource = null;
  let higgsfieldError = null;
  let mediaParams = null;

  if (mediaProviderReady) {
    const media = await generateCreativePixels({
      prompt,
      kind,
      width,
      height,
      durationMs,
      pro,
    });

    if (media.ok && media.dataUrl) {
      mediaMode = media.mode === "higgsfield" ? "higgsfield" : "gemini";
      mediaProvider = media.provider || mediaMode;
      previewUrl = media.dataUrl;
      mimeType = media.mimeType || (isVideo ? "video/mp4" : "image/png");
      mediaModel = media.model || null;
      mediaPath = media.path || null;
      posterOnly = Boolean(media.poster_only);
      credentialSource = media.credential_source || null;
      mediaParams = media.params || null;
      if (media.video_error) {
        mediaError = media.video_error;
      }
      if (media.higgsfield_error) {
        higgsfieldError = media.higgsfield_error;
        mediaError = media.higgsfield_error;
      }
    } else {
      mediaMode = "error";
      mediaError = media.error || "Media generation failed";
      higgsfieldError = media.higgsfield_error || null;
      credentialSource = media.credential_source || null;
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

  const liveMedia = isLiveCreativeMediaMode(mediaMode);
  const overallMode = liveMedia
    ? mediaMode
    : copyLive
      ? "live"
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

    let heroUrl = previewUrl;
    if (imageProviderReady && liveMedia && kind !== "image") {
      const hero = await generateCreativePixels({
        prompt: imagePrompt,
        kind: "image",
        width: 1080,
        height: 1080,
        pro,
      });
      if (hero.ok && hero.dataUrl) heroUrl = hero.dataUrl;
    } else if (imageProviderReady && !liveMedia) {
      const hero = await generateCreativePixels({
        prompt: imagePrompt,
        kind: "image",
        width: 1080,
        height: 1080,
        pro,
      });
      if (hero.ok && hero.dataUrl) {
        heroUrl = hero.dataUrl;
        mediaMode = hero.mode === "higgsfield" ? "higgsfield" : "gemini";
        mediaProvider = hero.provider || mediaMode;
        previewUrl = hero.dataUrl;
        mimeType = hero.mimeType || "image/png";
        mediaModel = hero.model;
        mediaPath = hero.path;
        mediaParams = hero.params || mediaParams;
      }
    }

    const variantLive = isLiveCreativeMediaMode(mediaMode);
    for (const platform of platforms) {
      variants.push({
        id: `variant-${item.id || "draft"}-${platform.key}`,
        platform_target: platform.key,
        width: platform.w,
        height: platform.h,
        aspect_ratio: platform.ratio,
        mode: variantLive ? mediaMode : "local_sim",
        media_asset: {
          url:
            variantLive && heroUrl
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
          mode: variantLive ? mediaMode : "local_sim",
          mime_type:
            variantLive && heroUrl && !String(heroUrl).startsWith("data:image/svg")
              ? "image/png"
              : "image/svg+xml",
        },
      });
    }
  }

  const finalLive = isLiveCreativeMediaMode(mediaMode);
  const ok = finalLive || !mediaProviderReady;

  return {
    ok,
    mode: finalLive ? mediaMode : overallMode,
    mode_label: creativeModeLabel(finalLive ? mediaMode : overallMode),
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
      media_provider: mediaProvider || undefined,
      media_params: mediaParams || undefined,
      credential_source: credentialSource || undefined,
      updated_at: new Date().toISOString(),
      prompt_version: CREATIVE_PROMPT_VERSION,
    },
    script: ugcScript,
    asset: {
      id: `asset-${item.id || "draft"}-${action || "creative"}`,
      kind,
      mode: finalLive ? mediaMode : "local_sim",
      width,
      height,
      aspect_ratio:
        pro.aspect_ratio ||
        (height === width ? "1:1" : height > width ? "9:16" : "16:9"),
      duration_ms: isVideo ? durationMs : null,
      url: previewUrl,
      mime_type: mimeType,
      prompt,
      preview_ready: Boolean(previewUrl),
      model: mediaModel,
      metadata: {
        media_path: mediaPath,
        media_provider: mediaProvider || undefined,
        credential_source: credentialSource || undefined,
        poster_only: posterOnly || undefined,
        media_error: mediaError || undefined,
        higgsfield_error: higgsfieldError || undefined,
        media_params: mediaParams || undefined,
        realistic_3d: finalLive,
      },
    },
    variants,
    sidecar: isVideo
      ? {
          placeholder_mp4: !finalLive,
          animation_svg: !finalLive,
          poster_only: posterOnly || undefined,
          provider: mediaProvider || undefined,
        }
      : {
          credential_source: credentialSource || undefined,
          higgsfield_error: higgsfieldError || undefined,
        },
    error: mediaProviderReady && !finalLive ? mediaError : null,
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
