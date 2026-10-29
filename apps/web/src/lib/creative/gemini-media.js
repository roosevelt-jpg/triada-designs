/**
 * Gemini media pixel path for Content Studio (server-side only).
 * Same path Gemini apps use: Interactions API with Nano Banana / Omni models.
 * Never report live Gemini success with SVG placeholders.
 */

import { hasGeminiEnv } from "@/lib/integrations/env-presence";

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Soft-warn creative/status after Free Tier / billing 429s (process-local). */
let lastGeminiQuotaAt = null;
let lastGeminiQuotaMessage = "";

export function recordGeminiQuotaHit(message = "") {
  lastGeminiQuotaAt = Date.now();
  lastGeminiQuotaMessage = String(message || "Gemini quota / billing limit").slice(0, 240);
}

export function getGeminiQuotaWarning() {
  if (!lastGeminiQuotaAt) return null;
  // Surface for 6 hours so status does not claim "Live AI" after Free Tier 429.
  if (Date.now() - lastGeminiQuotaAt > 6 * 60 * 60 * 1000) return null;
  return {
    at: new Date(lastGeminiQuotaAt).toISOString(),
    message: lastGeminiQuotaMessage || "Gemini quota exceeded (e.g. Free Tier 429).",
  };
}

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
 * Only allow Google Generative Language hosts.
 * Production previously had GEMINI_BASE_URL=https://api.anthropic.com which 404s all media.
 * @returns {string}
 */
export function geminiBaseUrl() {
  const candidates = [
    (process.env.IMAGE_BASE_URL || "").trim(),
    (process.env.GEMINI_BASE_URL || "").trim(),
    DEFAULT_BASE,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const base = raw.replace(/\/$/, "");
    try {
      const host = new URL(base).hostname;
      if (host === "generativelanguage.googleapis.com") return base;
    } catch {
      /* ignore bad URL */
    }
  }
  return DEFAULT_BASE;
}

/**
 * Ordered Google AI hosts to try (never Anthropic / third-party).
 * @param {string} [preferred]
 */
function googleAiBases(preferred) {
  return Array.from(
    new Set(
      [preferred, DEFAULT_BASE, "https://generativelanguage.googleapis.com/v1beta", geminiBaseUrl()]
        .filter(Boolean)
        .map((b) => String(b).replace(/\/$/, ""))
        .filter((b) => {
          try {
            return new URL(b).hostname === "generativelanguage.googleapis.com";
          } catch {
            return false;
          }
        }),
    ),
  );
}

/**
 * Normalize timeout env values.
 * Laravel-era Vercel vars used seconds (e.g. IMAGE_TIMEOUT=90); Next needs ms.
 * @param {string|number|undefined} raw
 * @param {number} fallbackMs
 */
export function resolveTimeoutMs(raw, fallbackMs) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallbackMs;
  // Values under 1000 are almost certainly seconds (90 → 90s, not 90ms).
  if (n < 1000) return Math.round(n * 1000);
  return Math.round(n);
}

/**
 * List models visible to this API key (used to pick live image/video endpoints).
 * @param {string} apiKey
 * @returns {Promise<{ ok: boolean, models: string[], error?: string }>}
 */
async function listGeminiModels(apiKey) {
  // Always try the canonical Google AI Studio host first — stale IMAGE_BASE_URL /
  // GEMINI_BASE_URL on Vercel has been observed to 404 every media call.
  const bases = Array.from(
    new Set([
      DEFAULT_BASE,
      geminiBaseUrl(),
      "https://generativelanguage.googleapis.com/v1",
    ].filter(Boolean)),
  );
  const errors = [];
  for (const base of bases) {
    try {
      const response = await fetch(`${base}/models?key=${encodeURIComponent(apiKey)}`);
      const json = await response.json().catch(() => ({}));
      if (response.ok) {
        const names = (json.models || [])
          .map((m) => String(m.name || "").replace(/^models\//, ""))
          .filter(Boolean);
        return { ok: true, models: names, base };
      }
      const hdr = await fetch(`${base}/models`, {
        headers: { "x-goog-api-key": apiKey },
      });
      const hdrJson = await hdr.json().catch(() => ({}));
      if (hdr.ok) {
        const names = (hdrJson.models || [])
          .map((m) => String(m.name || "").replace(/^models\//, ""))
          .filter(Boolean);
        return { ok: true, models: names, base };
      }
      errors.push(
        `${base}→${response.status}/${hdr.status}:${String(json?.error?.message || hdrJson?.error?.message || "").slice(0, 120)}`,
      );
    } catch (error) {
      errors.push(`${base}→${String(error?.message || error)}`);
    }
  }
  return {
    ok: false,
    models: [],
    error: `models.list failed (${errors.join(" | ")})`,
  };
}

/**
 * Rank discovered models for jewellery image generation.
 * @param {string[]} available
 */
function pickImageModels(available) {
  const set = new Set(available.map((m) => m.toLowerCase()));
  const preferred = [
    "gemini-nano-banana-2.1",
    "nano-banana-pro-preview",
    "gemini-3-pro-image",
    "gemini-3-pro-image-preview",
    "gemini-3.1-flash-image",
    "gemini-3.1-flash-image-preview",
    "gemini-3.1-flash-lite-image",
    "gemini-2.5-flash-image",
    "gemini-2.5-flash-image-preview",
  ];
  const ranked = preferred.filter((m) => set.has(m.toLowerCase()));
  // Also include any other image-named Gemini models the key can see.
  for (const name of available) {
    const lower = name.toLowerCase();
    if (
      !ranked.some((r) => r.toLowerCase() === lower) &&
      (lower.includes("image") || lower.includes("nano-banana") || lower.includes("imagen"))
    ) {
      ranked.push(name);
    }
  }
  return ranked.length ? ranked : preferred;
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
  const bases = googleAiBases(opts.base);
  const timeoutMs = resolveTimeoutMs(opts.timeoutMs, 120000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const body = {
    model: opts.model,
    // Docs accept string or typed parts; typed parts are the canonical form.
    input: [{ type: "text", text: opts.prompt }],
    response_format: {
      type: opts.kind,
      aspect_ratio: opts.aspectRatio,
    },
  };

  try {
    let lastError = "Interactions failed";
    for (const base of bases) {
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
        lastError = `Interactions HTTP ${response.status} @ ${base}: ${String(json?.error?.message || json?.message || "").slice(0, 200)}`;
        continue;
      }

      const media = extractInteractionMedia(json, opts.kind);
      if (!media?.data) {
        lastError = `Interactions ${opts.model} @ ${base} returned no ${opts.kind} bytes`;
        continue;
      }

      return {
        ok: true,
        bytesBase64: media.data,
        mimeType: media.mimeType,
        model: opts.model,
        provider: "gemini",
        path: "interactions",
        base,
      };
    }

    return {
      ok: false,
      error: lastError,
      model: opts.model,
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
 * generateContent image path (Nano Banana / Flash Image).
 * @param {{
 *   apiKey: string,
 *   model: string,
 *   prompt: string,
 *   aspectRatio: string,
 *   timeoutMs?: number,
 *   base?: string,
 * }} opts
 */
async function callGenerateContentImage(opts) {
  // Prefer v1beta for native image models; v1 often 404s preview image ids.
  const bases = googleAiBases(opts.base || DEFAULT_BASE);
  const timeoutMs = resolveTimeoutMs(opts.timeoutMs, 120000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const payload = {
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio: opts.aspectRatio },
    },
  };

  try {
    let lastError = "generateContent failed";
    for (const base of bases) {
      /** @type {Response} */
      let response = await fetch(
        `${base}/models/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        },
      );
      let json = await response.json().catch(() => ({}));
      if (!response.ok) {
        response = await fetch(
          `${base}/models/${encodeURIComponent(opts.model)}:generateContent`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-goog-api-key": opts.apiKey,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          },
        );
        json = await response.json().catch(() => ({}));
      }

      if (!response.ok) {
        lastError = `generateContent HTTP ${response.status} @ ${base}: ${String(json?.error?.message || "").slice(0, 200)}`;
        continue;
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
            base,
          };
        }
      }
      lastError = `generateContent ${opts.model} @ ${base} returned no image parts`;
    }

    return {
      ok: false,
      error: lastError,
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

  if (/^sk-ant/i.test(apiKey) || apiKey.toLowerCase().includes("anthropic")) {
    return {
      ok: false,
      error: "GEMINI_API_KEY looks like an Anthropic key — set a Google AI Studio Gemini key on Vercel",
      mode: "error",
    };
  }

  const listed = await listGeminiModels(apiKey);
  const discovered = listed.ok ? pickImageModels(listed.models) : GEMINI_IMAGE_MODELS;
  if (!listed.ok) {
    errors.push(`models.list: ${listed.error}`);
  }

  // Prefer preview ids the key actually lists (e.g. gemini-3-pro-image-preview).
  const cascade = modelList(
    preferred,
    listed.ok ? discovered : GEMINI_IMAGE_MODELS.slice(0, 3),
    "image",
  );
  const workingBase = listed.base || DEFAULT_BASE;
  const timeoutMs = resolveTimeoutMs(process.env.IMAGE_TIMEOUT, 120000);
  // Keep the cascade short — avoid burning quota / Vercel duration across many ids.
  const shortCascade = cascade.slice(0, 3);

  for (const model of shortCascade) {
    // generateContent first (reliable for Nano Banana on AI Studio keys).
    const gc = await callGenerateContentImage({
      apiKey,
      model,
      prompt: input.prompt,
      aspectRatio,
      base: workingBase,
      timeoutMs,
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
    if (/429|quota|billing/i.test(String(gc.error || ""))) {
      recordGeminiQuotaHit(gc.error);
      return {
        ok: false,
        error: `Gemini image quota exceeded for ${model}. Enable billing / raise limits on the Google AI Studio key used as GEMINI_API_KEY. (${gc.error})`,
        mode: "error",
        attempts: errors.length,
      };
    }

    // Interactions (Gemini apps path) when generateContent is unavailable for the id.
    const result = await callInteractions({
      apiKey,
      model,
      prompt: input.prompt,
      kind: "image",
      aspectRatio,
      base: workingBase,
      timeoutMs,
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
  }

  const availableHint = listed.ok
    ? ` base=${workingBase}; available_imageish=${discovered.slice(0, 8).join(",") || "none"}; sample=${listed.models.slice(0, 8).join(",")}`
    : ` tip=check Vercel GEMINI_API_KEY is a Google AI Studio key (not Claude) and unset bad GEMINI_BASE_URL/IMAGE_BASE_URL`;

  return {
    ok: false,
    error:
      (errors.slice(0, 10).join(" | ") || "Gemini image generation failed") +
      availableHint,
    mode: "error",
    attempts: errors.length,
    available_models: listed.ok ? listed.models.slice(0, 40) : [],
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
  const timeoutMs = resolveTimeoutMs(process.env.VIDEO_TIMEOUT, 180000);

  // Prefer omni models visible to this key when listable.
  const listed = await listGeminiModels(apiKey);
  const videoCascade = [];
  if (listed.ok) {
    for (const name of listed.models) {
      const lower = name.toLowerCase();
      if (lower.includes("omni") || lower.includes("veo")) videoCascade.push(name);
    }
  }
  const models = modelList(
    preferred,
    videoCascade.length ? videoCascade : GEMINI_VIDEO_MODELS,
    "video",
  );

  for (const model of models) {
    // Dead Veo ids → Omni (current top Gemini video model)
    const modelId = String(model).startsWith("veo-") ? "gemini-omni-1.1-flash" : model;

    const result = await callInteractions({
      apiKey,
      model: modelId,
      prompt: input.prompt,
      kind: "video",
      aspectRatio: aspectRatio === "1:1" ? "9:16" : aspectRatio,
      base: listed.base || DEFAULT_BASE,
      timeoutMs,
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
