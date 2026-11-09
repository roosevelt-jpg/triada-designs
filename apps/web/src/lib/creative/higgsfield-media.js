/**
 * Higgsfield pixel path for Content Studio + Creative Agent (server-side only).
 * Official API: https://api.higgsfield.ai — Authorization: Key KEY_ID:KEY_SECRET
 * Images: Soul V2 · Videos: Seedance 2.5 (text-to-video / image-to-video)
 * Prefer when HIGGSFIELD_API_KEY_ID + HIGGSFIELD_API_KEY_SECRET are present;
 * compose falls back to Gemini when this path is unavailable or fails.
 * Never invent secrets; never call from the browser.
 */

import { resolveHiggsfieldCredentialsAsync } from "@/lib/integrations/higgsfield-credentials";
import { randomUUID } from "node:crypto";
import {
  HIGGSFIELD_DEFAULT_STYLE_ID,
  HIGGSFIELD_IMAGE_ASPECT_RATIOS,
  HIGGSFIELD_RESOLUTIONS,
  HIGGSFIELD_VIDEO_ASPECT_RATIOS,
  clampVideoDurationSeconds,
  normalizeHiggsfieldResolution,
  resolveHiggsfieldModelId,
} from "./higgsfield-models";

const DEFAULT_BASE = "https://api.higgsfield.ai";
const TERMINAL = new Set(["completed", "failed", "nsfw", "canceled", "cancelled"]);

/**
 * Env-only sync resolve (legacy). Prefer resolveHiggsfieldCredentialsAsync.
 * @returns {{ keyId: string, keySecret: string } | null}
 */
export function resolveHiggsfieldCredentials() {
  const keyId =
    (process.env.HIGGSFIELD_API_KEY_ID || "").trim() ||
    (process.env.HF_API_KEY_ID || "").trim();
  const keySecret =
    (process.env.HIGGSFIELD_API_KEY_SECRET || "").trim() ||
    (process.env.HF_API_KEY_SECRET || "").trim();
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

/** @returns {string} */
export function higgsfieldBaseUrl() {
  const raw = (process.env.HIGGSFIELD_BASE_URL || "").trim() || DEFAULT_BASE;
  try {
    const u = new URL(raw.replace(/\/$/, ""));
    if (u.protocol === "https:" || u.protocol === "http:") {
      return u.origin;
    }
  } catch {
    /* fall through */
  }
  return DEFAULT_BASE;
}

/** Model path under api.higgsfield.ai (Soul V2 standard by default). */
export function higgsfieldImageEndpoint(modelOverride) {
  return resolveHiggsfieldModelId(modelOverride, "image");
}

/** Seedance 2.5 text-to-video by default. */
export function higgsfieldVideoEndpoint(modelOverride) {
  return resolveHiggsfieldModelId(modelOverride, "video");
}

/**
 * @param {number | undefined} width
 * @param {number | undefined} height
 */
export function aspectRatioForSize(width, height) {
  const w = Number(width) || 1080;
  const h = Number(height) || 1080;
  const ratio = w / h;
  if (Math.abs(ratio - 1) < 0.08) return "1:1";
  if (ratio > 1.7) return "16:9";
  if (ratio < 0.6) return "9:16";
  if (ratio > 1.2) return "3:2";
  if (ratio < 0.85) return "2:3";
  if (ratio > 1) return "4:3";
  return "3:4";
}

/** Soul V2 / Seedance are async poll — never inherit a short shared IMAGE_TIMEOUT floor. */
const HIGGSFIELD_TIMEOUT_FLOOR_MS = 90_000;
const HIGGSFIELD_TIMEOUT_DEFAULT_MS = 120_000;
const HIGGSFIELD_VIDEO_TIMEOUT_FLOOR_MS = 120_000;
const HIGGSFIELD_VIDEO_TIMEOUT_DEFAULT_MS = 180_000;

/**
 * @param {string | undefined} raw
 * @param {number} fallbackMs
 * @param {number} [floorMs]
 */
function resolveTimeoutMs(raw, fallbackMs, floorMs = 0) {
  const n = Number(raw);
  let ms = fallbackMs;
  if (Number.isFinite(n) && n > 0) {
    ms = n < 1000 ? Math.round(n * 1000) : Math.round(n);
  }
  return Math.max(ms, floorMs || 0);
}

/**
 * Pull first image URL from a completed Soul V2 body (shape-tolerant).
 * @param {Record<string, unknown> | null | undefined} body
 * @returns {string | null}
 */
function firstImageUrl(body) {
  if (!body || typeof body !== "object") return null;
  const candidates = [
    body.images,
    body.output && typeof body.output === "object"
      ? /** @type {Record<string, unknown>} */ (body.output).images
      : null,
    body.data && typeof body.data === "object"
      ? /** @type {Record<string, unknown>} */ (body.data).images
      : null,
  ];
  for (const list of candidates) {
    if (!Array.isArray(list) || !list.length) continue;
    const first = list[0];
    if (typeof first === "string" && first.startsWith("http")) return first;
    if (first && typeof first === "object") {
      const row = /** @type {Record<string, unknown>} */ (first);
      const url = row.url || row.image_url || row.src || row.download_url;
      if (typeof url === "string" && url) return url;
    }
  }
  return null;
}

/**
 * Pull video URL from a completed Seedance body (shape-tolerant).
 * @param {Record<string, unknown> | null | undefined} body
 * @returns {string | null}
 */
function firstVideoUrl(body) {
  if (!body || typeof body !== "object") return null;
  const video =
    body.video ||
    (body.output && typeof body.output === "object"
      ? /** @type {Record<string, unknown>} */ (body.output).video
      : null) ||
    (body.data && typeof body.data === "object"
      ? /** @type {Record<string, unknown>} */ (body.data).video
      : null);
  if (typeof video === "string" && video.startsWith("http")) return video;
  if (video && typeof video === "object") {
    const row = /** @type {Record<string, unknown>} */ (video);
    const url = row.url || row.video_url || row.src || row.download_url;
    if (typeof url === "string" && url) return url;
  }
  const videos = body.videos || body.outputs;
  if (Array.isArray(videos) && videos.length) {
    const first = videos[0];
    if (typeof first === "string" && first.startsWith("http")) return first;
    if (first && typeof first === "object") {
      const row = /** @type {Record<string, unknown>} */ (first);
      const url = row.url || row.video_url || row.src;
      if (typeof url === "string" && url) return url;
    }
  }
  return null;
}

/**
 * @param {{ keyId: string, keySecret: string }} creds
 */
function authHeader(creds) {
  return `Key ${creds.keyId}:${creds.keySecret}`;
}

/**
 * Sleep helper for polling backoff.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Download a completed media URL into base64 (server-side).
 * @param {string} url
 * @param {number} timeoutMs
 * @param {"image"|"video"} kind
 */
async function fetchMediaAsBase64(url, timeoutMs, kind) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      return { ok: false, error: `${kind}_download_http_${res.status}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = (res.headers.get("content-type") || "")
      .split(";")[0]
      .trim();
    let mimeType = contentType;
    if (kind === "image") {
      mimeType = contentType.startsWith("image/") ? contentType : "image/png";
    } else {
      mimeType = contentType.startsWith("video/") ? contentType : "video/mp4";
    }
    return {
      ok: true,
      bytesBase64: buf.toString("base64"),
      mimeType,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err?.name === "AbortError"
          ? `${kind}_download_timeout`
          : String(err?.message || err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Poll status_url until terminal or timeout.
 * @param {{
 *   statusUrl: string,
 *   creds: { keyId: string, keySecret: string },
 *   timeoutMs: number,
 * }} input
 */
async function pollUntilDone(input) {
  const deadline = Date.now() + input.timeoutMs;
  let delay = 2000;
  let lastStatus = "queued";
  let lastBody = null;

  while (Date.now() < deadline) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(input.statusUrl, {
        method: "GET",
        headers: {
          Authorization: authHeader(input.creds),
          Accept: "application/json",
        },
        signal: ctrl.signal,
      });
      const text = await res.text();
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { raw: text.slice(0, 400) };
      }
      if (res.status === 401) {
        return {
          ok: false,
          error: "higgsfield_unauthorized",
          status: "failed",
          body,
        };
      }
      if (res.status === 404) {
        return {
          ok: false,
          error: "higgsfield_request_not_found",
          status: "failed",
          body,
        };
      }
      if (!res.ok) {
        if (res.status >= 500) {
          await sleep(delay + Math.random() * 500);
          delay = Math.min(delay * 1.5, 10000);
          continue;
        }
        return {
          ok: false,
          error: `higgsfield_status_http_${res.status}`,
          status: "failed",
          body,
        };
      }

      lastBody = body;
      lastStatus = String(body?.status || "").toLowerCase();
      if (TERMINAL.has(lastStatus)) {
        return {
          ok: lastStatus === "completed",
          status: lastStatus,
          body,
          error: lastStatus === "completed" ? null : `higgsfield_${lastStatus}`,
        };
      }
    } catch (err) {
      if (Date.now() + delay >= deadline) {
        return {
          ok: false,
          error:
            err?.name === "AbortError"
              ? "higgsfield_poll_timeout"
              : String(err?.message || err),
          status: lastStatus,
          body: lastBody,
        };
      }
    } finally {
      clearTimeout(timer);
    }

    await sleep(delay + Math.random() * 500);
    delay = Math.min(delay * 1.5, 10000);
  }

  return {
    ok: false,
    error: "higgsfield_poll_deadline",
    status: lastStatus,
    body: lastBody,
  };
}

/**
 * Submit async Higgsfield job and wait for completion body.
 * @param {{
 *   endpoint: string,
 *   payload: Record<string, unknown>,
 *   timeoutMs: number,
 *   creds: { keyId: string, keySecret: string, source?: string },
 * }} input
 */
async function submitAndWait(input) {
  const base = higgsfieldBaseUrl();
  const submitUrl = `${base}/${input.endpoint}`;
  const idempotencyKey = randomUUID();
  const credentialSource = input.creds.source || "env";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.min(input.timeoutMs, 60000));
  let submitBody = null;
  try {
    const res = await fetch(submitUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader(input.creds),
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(input.payload),
      signal: ctrl.signal,
    });
    const text = await res.text();
    try {
      submitBody = text ? JSON.parse(text) : null;
    } catch {
      submitBody = { raw: text.slice(0, 400) };
    }
    if (res.status === 401) {
      return {
        ok: false,
        error: "higgsfield_unauthorized",
        mode: "error",
        provider: "higgsfield",
        credential_source: credentialSource,
      };
    }
    if (res.status === 403) {
      return {
        ok: false,
        error: "higgsfield_forbidden_or_insufficient_balance",
        mode: "error",
        provider: "higgsfield",
        credential_source: credentialSource,
      };
    }
    if (!res.ok) {
      const detail =
        (submitBody && (submitBody.detail || submitBody.message || submitBody.error)) ||
        `http_${res.status}`;
      return {
        ok: false,
        error: `higgsfield_submit: ${String(detail).slice(0, 240)}`,
        mode: "error",
        provider: "higgsfield",
        credential_source: credentialSource,
      };
    }
  } catch (err) {
    return {
      ok: false,
      error:
        err?.name === "AbortError"
          ? "higgsfield_submit_timeout"
          : String(err?.message || err),
      mode: "error",
      provider: "higgsfield",
      credential_source: credentialSource,
    };
  } finally {
    clearTimeout(timer);
  }

  const requestId = String(submitBody?.request_id || "").trim();
  const statusUrl =
    String(submitBody?.status_url || "").trim() ||
    (requestId ? `${base}/requests/${requestId}/status` : "");

  if (!statusUrl) {
    return {
      ok: false,
      error: "higgsfield_missing_status_url",
      mode: "error",
      provider: "higgsfield",
      credential_source: credentialSource,
    };
  }

  const submitStatus = String(submitBody?.status || "").toLowerCase();
  let completed = submitBody;
  if (submitStatus !== "completed") {
    if (TERMINAL.has(submitStatus)) {
      return {
        ok: false,
        error: `higgsfield_${submitStatus || "failed"}`,
        mode: "error",
        provider: "higgsfield",
        request_id: requestId || undefined,
        status: submitStatus,
        credential_source: credentialSource,
      };
    }
    const polled = await pollUntilDone({
      statusUrl,
      creds: input.creds,
      timeoutMs: input.timeoutMs,
    });
    if (!polled.ok) {
      return {
        ok: false,
        error: polled.error || "higgsfield_failed",
        mode: "error",
        provider: "higgsfield",
        request_id: requestId || undefined,
        status: polled.status,
        credential_source: credentialSource,
      };
    }
    completed = polled.body;
  }

  return {
    ok: true,
    completed,
    request_id: requestId || undefined,
    credential_source: credentialSource,
  };
}

/**
 * Build Soul V2 payload with professional params.
 * @param {{
 *   prompt: string,
 *   width?: number,
 *   height?: number,
 *   aspect_ratio?: string,
 *   resolution?: string,
 *   seed?: number,
 *   style_id?: string,
 *   style_strength?: number,
 *   enhance_prompt?: boolean,
 *   batch_size?: number,
 *   custom_reference_id?: string,
 *   custom_reference_strength?: number,
 * }} input
 */
function buildImagePayload(input) {
  const aspectFromSize = aspectRatioForSize(input.width, input.height);
  const aspectRaw = String(input.aspect_ratio || aspectFromSize).trim();
  const aspect_ratio = HIGGSFIELD_IMAGE_ASPECT_RATIOS.includes(aspectRaw)
    ? aspectRaw
    : aspectFromSize;
  const envRes = (process.env.HIGGSFIELD_RESOLUTION || "").trim();
  const resolution = normalizeHiggsfieldResolution(
    input.resolution || envRes,
    ["720p", "1080p"],
    "720p",
  );
  const batchRaw = Number(input.batch_size);
  const batch_size = batchRaw === 4 ? 4 : 1;
  const enhance_prompt =
    input.enhance_prompt === undefined ? true : Boolean(input.enhance_prompt);

  /** @type {Record<string, unknown>} */
  const payload = {
    prompt: String(input.prompt || "").slice(0, 4000),
    resolution,
    aspect_ratio,
    batch_size,
    enhance_prompt,
  };

  const seed = Number(input.seed);
  if (Number.isFinite(seed) && seed >= 1 && seed <= 1_000_000) {
    payload.seed = Math.round(seed);
  }

  const styleId = String(input.style_id || "").trim();
  if (styleId) {
    payload.style_id = styleId;
  } else if (process.env.HIGGSFIELD_STYLE_ID) {
    payload.style_id = String(process.env.HIGGSFIELD_STYLE_ID).trim();
  } else {
    payload.style_id = HIGGSFIELD_DEFAULT_STYLE_ID;
  }

  const styleStrength = Number(input.style_strength);
  if (Number.isFinite(styleStrength)) {
    payload.style_strength = Math.min(1, Math.max(0, styleStrength));
  }

  const refId = String(input.custom_reference_id || "").trim();
  if (refId) {
    payload.custom_reference_id = refId;
    const strength = Number(input.custom_reference_strength);
    payload.custom_reference_strength = Number.isFinite(strength)
      ? Math.min(1, Math.max(0.01, strength))
      : 1;
  }

  return payload;
}

/**
 * Submit Soul V2 text-to-image and wait for pixels.
 * @param {{
 *   prompt: string,
 *   width?: number,
 *   height?: number,
 *   model?: string,
 *   aspect_ratio?: string,
 *   resolution?: string,
 *   seed?: number,
 *   style_id?: string,
 *   style_strength?: number,
 *   enhance_prompt?: boolean,
 *   batch_size?: number,
 *   custom_reference_id?: string,
 *   custom_reference_strength?: number,
 * }} input
 */
export async function generateHiggsfieldImage(input) {
  const creds = await resolveHiggsfieldCredentialsAsync();
  if (!creds) {
    return {
      ok: false,
      error: "awaiting_credentials",
      mode: "awaiting_credentials",
      credential_source: "none",
    };
  }

  const endpoint = higgsfieldImageEndpoint(input.model);
  const timeoutMs = resolveTimeoutMs(
    process.env.HIGGSFIELD_TIMEOUT || process.env.IMAGE_TIMEOUT,
    HIGGSFIELD_TIMEOUT_DEFAULT_MS,
    HIGGSFIELD_TIMEOUT_FLOOR_MS,
  );
  const payload = buildImagePayload(input);
  const submitted = await submitAndWait({
    endpoint,
    payload,
    timeoutMs,
    creds,
  });
  if (!submitted.ok) return submitted;

  const firstUrl = firstImageUrl(
    submitted.completed && typeof submitted.completed === "object"
      ? /** @type {Record<string, unknown>} */ (submitted.completed)
      : null,
  );
  if (!firstUrl) {
    return {
      ok: false,
      error: "higgsfield_completed_without_image",
      mode: "error",
      provider: "higgsfield",
      request_id: submitted.request_id,
      credential_source: submitted.credential_source,
    };
  }

  const downloaded = await fetchMediaAsBase64(String(firstUrl), 45000, "image");
  if (!downloaded.ok) {
    return {
      ok: false,
      error: downloaded.error || "higgsfield_download_failed",
      mode: "error",
      provider: "higgsfield",
      request_id: submitted.request_id,
      remote_url: String(firstUrl).slice(0, 200),
      credential_source: submitted.credential_source,
    };
  }

  return {
    ok: true,
    mode: "higgsfield",
    kind: "image",
    provider: "higgsfield",
    model: endpoint,
    path:
      submitted.credential_source === "env"
        ? "soul_v2_poll_env"
        : `soul_v2_poll_${submitted.credential_source}`,
    bytesBase64: downloaded.bytesBase64,
    mimeType: downloaded.mimeType,
    dataUrl: `data:${downloaded.mimeType};base64,${downloaded.bytesBase64}`,
    request_id: submitted.request_id,
    remote_url: String(firstUrl),
    credential_source: submitted.credential_source,
    params: {
      resolution: payload.resolution,
      aspect_ratio: payload.aspect_ratio,
      seed: payload.seed,
      style_id: payload.style_id,
      enhance_prompt: payload.enhance_prompt,
      batch_size: payload.batch_size,
      custom_reference_id: payload.custom_reference_id,
    },
  };
}

/**
 * Build Seedance 2.5 payload (text-to-video or image-to-video).
 * @param {{
 *   prompt: string,
 *   model?: string,
 *   duration?: number,
 *   duration_ms?: number,
 *   width?: number,
 *   height?: number,
 *   aspect_ratio?: string,
 *   resolution?: string,
 *   image_url?: string,
 *   end_image_url?: string,
 *   generate_audio?: boolean,
 *   bitrate_mode?: string,
 * }} input
 */
function buildVideoPayload(input) {
  const endpoint = higgsfieldVideoEndpoint(input.model);
  const isImageToVideo = endpoint.includes("image-to-video");
  const secondsFromMs = Number(input.duration_ms)
    ? Math.round(Number(input.duration_ms) / 1000)
    : undefined;
  const duration = clampVideoDurationSeconds(
    input.duration ?? secondsFromMs,
    5,
  );
  const envRes = (process.env.HIGGSFIELD_VIDEO_RESOLUTION ||
    process.env.HIGGSFIELD_RESOLUTION ||
    "").trim();
  const resolution = normalizeHiggsfieldResolution(
    input.resolution || envRes,
    HIGGSFIELD_RESOLUTIONS,
    "720p",
  );

  /** @type {Record<string, unknown>} */
  const payload = {
    duration,
    resolution,
    bitrate_mode:
      String(input.bitrate_mode || "high").toLowerCase() === "standard"
        ? "standard"
        : "high",
    generate_audio:
      input.generate_audio === undefined ? true : Boolean(input.generate_audio),
  };

  const prompt = String(input.prompt || "").trim();
  if (prompt) payload.prompt = prompt.slice(0, 4000);

  if (isImageToVideo) {
    const imageUrl = String(input.image_url || "").trim();
    if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
      return {
        ok: false,
        error: "higgsfield_image_to_video_requires_public_image_url",
        endpoint,
      };
    }
    payload.image_url = imageUrl;
    const endUrl = String(input.end_image_url || "").trim();
    if (endUrl && /^https?:\/\//i.test(endUrl)) {
      payload.end_image_url = endUrl;
    }
  } else {
    if (!prompt) {
      return { ok: false, error: "higgsfield_text_to_video_requires_prompt", endpoint };
    }
    const aspectFromSize = aspectRatioForSize(
      input.width || 1080,
      input.height || 1920,
    );
    const aspectRaw = String(input.aspect_ratio || aspectFromSize).trim();
    payload.aspect_ratio = HIGGSFIELD_VIDEO_ASPECT_RATIOS.includes(aspectRaw)
      ? aspectRaw
      : aspectFromSize === "9:16" || aspectFromSize === "16:9" || aspectFromSize === "1:1"
        ? aspectFromSize
        : "9:16";
    const outFmt = String(input.output_format || "mp4").toLowerCase();
    payload.output_format = outFmt === "mov" ? "mov" : "mp4";
  }

  return { ok: true, endpoint, payload, duration };
}

/**
 * Submit Seedance text/image-to-video and wait for mp4 bytes.
 * @param {{
 *   prompt: string,
 *   model?: string,
 *   duration?: number,
 *   duration_ms?: number,
 *   width?: number,
 *   height?: number,
 *   aspect_ratio?: string,
 *   resolution?: string,
 *   image_url?: string,
 *   end_image_url?: string,
 *   generate_audio?: boolean,
 *   bitrate_mode?: string,
 *   output_format?: string,
 * }} input
 */
export async function generateHiggsfieldVideo(input) {
  const creds = await resolveHiggsfieldCredentialsAsync();
  if (!creds) {
    return {
      ok: false,
      error: "awaiting_credentials",
      mode: "awaiting_credentials",
      credential_source: "none",
    };
  }

  const built = buildVideoPayload(input);
  if (!built.ok) {
    return {
      ok: false,
      error: built.error,
      mode: "error",
      provider: "higgsfield",
      model: built.endpoint,
    };
  }

  const timeoutMs = resolveTimeoutMs(
    process.env.HIGGSFIELD_VIDEO_TIMEOUT ||
      process.env.HIGGSFIELD_TIMEOUT ||
      process.env.VIDEO_TIMEOUT,
    HIGGSFIELD_VIDEO_TIMEOUT_DEFAULT_MS,
    HIGGSFIELD_VIDEO_TIMEOUT_FLOOR_MS,
  );

  const submitted = await submitAndWait({
    endpoint: built.endpoint,
    payload: built.payload,
    timeoutMs,
    creds,
  });
  if (!submitted.ok) return submitted;

  const firstUrl = firstVideoUrl(
    submitted.completed && typeof submitted.completed === "object"
      ? /** @type {Record<string, unknown>} */ (submitted.completed)
      : null,
  );
  if (!firstUrl) {
    return {
      ok: false,
      error: "higgsfield_completed_without_video",
      mode: "error",
      provider: "higgsfield",
      request_id: submitted.request_id,
      credential_source: submitted.credential_source,
      model: built.endpoint,
    };
  }

  const downloaded = await fetchMediaAsBase64(String(firstUrl), 90000, "video");
  if (!downloaded.ok) {
    return {
      ok: false,
      error: downloaded.error || "higgsfield_video_download_failed",
      mode: "error",
      provider: "higgsfield",
      request_id: submitted.request_id,
      remote_url: String(firstUrl).slice(0, 200),
      credential_source: submitted.credential_source,
      model: built.endpoint,
    };
  }

  return {
    ok: true,
    mode: "higgsfield",
    kind: "video",
    provider: "higgsfield",
    model: built.endpoint,
    path:
      submitted.credential_source === "env"
        ? "seedance_poll_env"
        : `seedance_poll_${submitted.credential_source}`,
    bytesBase64: downloaded.bytesBase64,
    mimeType: downloaded.mimeType,
    dataUrl: `data:${downloaded.mimeType};base64,${downloaded.bytesBase64}`,
    request_id: submitted.request_id,
    remote_url: String(firstUrl),
    credential_source: submitted.credential_source,
    duration_ms: (built.duration || 5) * 1000,
    params: {
      duration: built.duration,
      resolution: built.payload.resolution,
      aspect_ratio: built.payload.aspect_ratio,
      generate_audio: built.payload.generate_audio,
      bitrate_mode: built.payload.bitrate_mode,
      image_url: built.payload.image_url,
    },
  };
}
