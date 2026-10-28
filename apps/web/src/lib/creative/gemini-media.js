/**
 * Gemini media pixel path for Content Studio (server-side only).
 * Same path Gemini apps use: Interactions API with Nano Banana / Omni models.
 * Never report live Gemini success with SVG placeholders.
 */

import { hasGeminiEnv } from "@/lib/integrations/env-presence";

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Top Gemini image models (Nano Banana family) — Interactions API first. */
export const GEMINI_IMAGE_MODELS = [
  "gemini-nano-banana-2.1",
  "gemini-3-pro-image",
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-lite-image",
  "gemini-2.5-flash-image",
];

/** Current top Gemini video model (Veo / Imagen media paths retired). */
export const GEMINI_VIDEO_MODELS = ["gemini-omni-1.1-flash"];

/**
 * @returns {string}
 */
export function resolveGeminiApiKey() {
  return (
    (process.env.IMAGE_API_KEY || "").trim() ||
    (process.env.VIDEO_API_KEY || "").trim() ||
    (process.env.GEMINI_API_KEY || "").trim() ||
    (process.env.GOOGLE_GEMINI_API_KEY || "").trim() ||
    ""
  );
}

/**
 * @returns {string}
 */
export function geminiBaseUrl() {
  return (
    (process.env.IMAGE_BASE_URL || "").trim() ||
    (process.env.GEMINI_BASE_URL || "").trim() ||
    DEFAULT_BASE
  ).replace(/\/$/, "");
}

/**
 * Ignore stale Vercel IMAGE_MODEL=claude-… / text-LLM values.
 * @param {string} model
 * @param {"image"|"video"} kind
 */
export function isMediaModel(model, kind = "image") {
  const m = String(model || "")
    .trim()
    .toLowerCase();
  if (!m) return false;
  if (m.includes("claude") || m.includes("anthropic") || m.includes("gpt")) return false;
  if (kind === "video") {
    return m.includes("omni") || m.startsWith("veo-") || m.includes("video");
  }
  return (
    m.includes("nano-banana") ||
    m.includes("flash-image") ||
    m.includes("pro-image") ||
    m.includes("lite-image") ||
    m.startsWith("imagen-") ||
    (m.startsWith("gemini-") && m.includes("image"))
  );
}

/**
 * @param {number} width
 * @param {number} height
 */
export function aspectRatioForSize(width, height) {
  const w = Number(width) || 1080;
  const h = Number(height) || 1080;
  if (h <= 0) return "1:1";
  const r = w / h;
  if (Math.abs(r - 1) < 0.08) return "1:1";
  if (r < 0.7) return "9:16";
  if (r > 1.7) return "16:9";
  if (r > 1.2) return "5:4";
  if (r < 0.85) return "4:5";
  return "1:1";
}

/**
 * @param {unknown} interaction
 * @param {"image"|"video"} kind
 * @returns {{ data: string, mimeType: string } | null}
 */
function extractInteractionMedia(interaction, kind) {
  if (!interaction || typeof interaction !== "object") return null;

  const direct =
    kind === "video"
      ? interaction.output_video || interaction.outputVideo
      : interaction.output_image || interaction.outputImage;
  if (direct && typeof direct === "object" && direct.data) {
    return {
      data: String(direct.data),
      mimeType: String(
        direct.mime_type ||
          direct.mimeType ||
          (kind === "video" ? "video/mp4" : "image/png"),
      ),
    };
  }

  const steps = Array.isArray(interaction.steps) ? interaction.steps : [];
  for (const step of steps) {
    const content = Array.isArray(step?.content) ? step.content : [];
    for (const part of content) {
      const type = String(part?.type || "").toLowerCase();
      if (kind === "video" && (type === "video" || part?.mime_type?.startsWith?.("video/"))) {
        if (part?.data) {
          return {
            data: String(part.data),
            mimeType: String(part.mime_type || part.mimeType || "video/mp4"),
          };
        }
      }
      if (kind === "image" && (type === "image" || part?.mime_type?.startsWith?.("image/"))) {
        if (part?.data) {
          return {
            data: String(part.data),
            mimeType: String(part.mime_type || part.mimeType || "image/png"),
          };
        }
      }
    }
  }
  return null;
}

/**
 * Gemini Interactions API — same auth + shape as Gemini developer docs.
 * @param {{
 *   apiKey: string,
 *   model: string,
 *   prompt: string,
 *   kind: "image"|"video",
 *   aspectRatio: string,
 *   timeoutMs?: number,
 * }} opts
 */
async function callInteractions(opts) {
  const base = geminiBaseUrl();
  const timeoutMs = Number(opts.timeoutMs || 120000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = {
      model: opts.model,
      // Docs accept string or typed parts; typed parts are the canonical form.
      input: [{ type: "text", text: opts.prompt }],
      response_format: {
        type: opts.kind,
        aspect_ratio: opts.aspectRatio,
      },
    };

    const response = await fetch(`${base}/interactions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": opts.apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: `Interactions HTTP ${response.status}: ${String(json?.error?.message || json?.message || "").slice(0, 240)}`,
        model: opts.model,
      };
    }

    const media = extractInteractionMedia(json, opts.kind);
    if (!media?.data) {
      return {
        ok: false,
        error: `Interactions ${opts.model} returned no ${opts.kind} bytes`,
        model: opts.model,
      };
    }

    return {
      ok: true,
      bytesBase64: media.data,
      mimeType: media.mimeType,
      model: opts.model,
      provider: "gemini",
      path: "interactions",
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.name === "AbortError" ? "Interactions timed out" : String(error?.message || error),
      model: opts.model,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Legacy generateContent image path (still used by some Nano Banana models).
 * @param {{
 *   apiKey: string,
 *   model: string,
 *   prompt: string,
 *   aspectRatio: string,
 *   timeoutMs?: number,
 * }} opts
 */
async function callGenerateContentImage(opts) {
  const base = geminiBaseUrl();
  const timeoutMs = Number(opts.timeoutMs || 90000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${base}/models/${encodeURIComponent(opts.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": opts.apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: { aspectRatio: opts.aspectRatio },
          },
        }),
        signal: controller.signal,
      },
    );

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: `generateContent HTTP ${response.status}: ${String(json?.error?.message || "").slice(0, 240)}`,
        model: opts.model,
      };
    }

    const parts = json?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      const inline = part?.inlineData || part?.inline_data;
      if (inline?.data) {
        return {
          ok: true,
          bytesBase64: String(inline.data),
          mimeType: String(inline.mimeType || inline.mime_type || "image/png"),
          model: opts.model,
          provider: "gemini",
          path: "generateContent",
        };
      }
    }

    return {
      ok: false,
      error: `generateContent ${opts.model} returned no image parts`,
      model: opts.model,
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.name === "AbortError" ? "generateContent timed out" : String(error?.message || error),
      model: opts.model,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} preferred
 * @param {string[]} cascade
 * @param {"image"|"video"} kind
 */
function modelList(preferred, cascade, kind = "image") {
  const list = [];
  const pref = String(preferred || "").trim();
  if (pref && isMediaModel(pref, kind)) list.push(pref);
  for (const model of cascade) {
    if (!list.includes(model)) list.push(model);
  }
  return list;
}

/**
 * @param {{
 *   prompt: string,
 *   width?: number,
 *   height?: number,
 * }} input
 */
export async function generateGeminiImage(input) {
  if (!hasGeminiEnv() && !resolveGeminiApiKey()) {
    return { ok: false, error: "awaiting_credentials", mode: "awaiting_credentials" };
  }

  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    return { ok: false, error: "awaiting_credentials", mode: "awaiting_credentials" };
  }

  const aspectRatio = aspectRatioForSize(input.width, input.height);
  const preferred =
    (process.env.IMAGE_MODEL || "").trim() ||
    (process.env.GEMINI_IMAGE_MODEL || "").trim();
  const errors = [];

  for (const model of modelList(preferred, GEMINI_IMAGE_MODELS, "image")) {
    // Primary: Interactions (Gemini apps path)
    const result = await callInteractions({
      apiKey,
      model,
      prompt: input.prompt,
      kind: "image",
      aspectRatio,
      timeoutMs: Number(process.env.IMAGE_TIMEOUT || 120000),
    });
    if (result.ok) {
      return {
        ...result,
        mode: "gemini",
        kind: "image",
        dataUrl: `data:${result.mimeType};base64,${result.bytesBase64}`,
      };
    }
    errors.push(`${model}: ${result.error}`);

    // Secondary: generateContent for models that still expose it
    const gc = await callGenerateContentImage({
      apiKey,
      model,
      prompt: input.prompt,
      aspectRatio,
      timeoutMs: Number(process.env.IMAGE_TIMEOUT || 90000),
    });
    if (gc.ok) {
      return {
        ...gc,
        mode: "gemini",
        kind: "image",
        dataUrl: `data:${gc.mimeType};base64,${gc.bytesBase64}`,
      };
    }
    errors.push(`gc:${model}: ${gc.error}`);
  }

  return {
    ok: false,
    error: errors.slice(0, 8).join(" | ") || "Gemini image generation failed",
    mode: "error",
    attempts: errors.length,
  };
}

/**
 * @param {{
 *   prompt: string,
 *   width?: number,
 *   height?: number,
 *   durationMs?: number,
 * }} input
 */
export async function generateGeminiVideo(input) {
  if (!hasGeminiEnv() && !resolveGeminiApiKey()) {
    return { ok: false, error: "awaiting_credentials", mode: "awaiting_credentials" };
  }

  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    return { ok: false, error: "awaiting_credentials", mode: "awaiting_credentials" };
  }

  const aspectRatio = aspectRatioForSize(input.width || 1080, input.height || 1920);
  const preferred =
    (process.env.VIDEO_MODEL || "").trim() ||
    (process.env.GEMINI_VIDEO_MODEL || "").trim();
  const errors = [];

  for (const model of modelList(preferred, GEMINI_VIDEO_MODELS, "video")) {
    // Dead Veo ids → Omni (current top Gemini video model)
    const modelId = String(model).startsWith("veo-") ? "gemini-omni-1.1-flash" : model;

    const result = await callInteractions({
      apiKey,
      model: modelId,
      prompt: input.prompt,
      kind: "video",
      aspectRatio: aspectRatio === "1:1" ? "9:16" : aspectRatio,
      timeoutMs: Number(process.env.VIDEO_TIMEOUT || 180000),
    });

    if (result.ok) {
      return {
        ...result,
        mode: "gemini",
        kind: "video",
        dataUrl: `data:${result.mimeType};base64,${result.bytesBase64}`,
        duration_ms: Number(input.durationMs || 8000),
      };
    }
    errors.push(`${modelId}: ${result.error}`);
  }

  // Keyed but video failed: still return a photoreal Gemini still (not SVG).
  const still = await generateGeminiImage({
    prompt: `${input.prompt}\n\nStill frame: photoreal 3D anamorphic jewellery product hero for video poster — real piece, not abstract.`,
    width: input.width || 1080,
    height: input.height || 1920,
  });

  if (still.ok) {
    return {
      ok: true,
      mode: "gemini",
      kind: "video",
      bytesBase64: still.bytesBase64,
      mimeType: still.mimeType,
      dataUrl: still.dataUrl,
      model: still.model,
      provider: still.provider,
      path: `video_poster_via_${still.path}`,
      duration_ms: Number(input.durationMs || 8000),
      poster_only: true,
      video_error: errors.slice(0, 4).join(" | "),
    };
  }

  return {
    ok: false,
    error: errors.slice(0, 6).join(" | ") || "Gemini video generation failed",
    mode: "error",
    attempts: errors.length,
  };
}

/**
 * @param {{
 *   prompt: string,
 *   kind: "image"|"video"|"animation",
 *   width?: number,
 *   height?: number,
 *   durationMs?: number,
 * }} input
 */
export async function generateGeminiMedia(input) {
  const kind = input.kind === "animation" ? "video" : input.kind;
  if (kind === "video") {
    return generateGeminiVideo(input);
  }
  return generateGeminiImage(input);
}
