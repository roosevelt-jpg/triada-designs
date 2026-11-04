/**
 * Higgsfield image pixel path for Content Studio (server-side only).
 * Official API: https://api.higgsfield.ai — Authorization: Key KEY_ID:KEY_SECRET
 * Prefer when HIGGSFIELD_API_KEY_ID + HIGGSFIELD_API_KEY_SECRET are present;
 * compose falls back to Gemini when this path is unavailable or fails.
 * Never invent secrets; never call from the browser.
 */

import { resolveHiggsfieldCredentialsAsync } from "@/lib/integrations/higgsfield-credentials";
import { randomUUID } from "node:crypto";

const DEFAULT_BASE = "https://api.higgsfield.ai";
const DEFAULT_ENDPOINT = "higgsfield-ai/soul/v2/standard";
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
export function higgsfieldImageEndpoint() {
  const raw =
    (process.env.HIGGSFIELD_IMAGE_ENDPOINT || "").trim() ||
    (process.env.HIGGSFIELD_MODEL || "").trim() ||
    DEFAULT_ENDPOINT;
  return String(raw).replace(/^\/+/, "").replace(/\/$/, "");
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

/**
 * @param {string | undefined} raw
 * @param {number} fallbackMs
 */
function resolveTimeoutMs(raw, fallbackMs) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallbackMs;
  return n < 1000 ? Math.round(n * 1000) : Math.round(n);
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
 * Download a completed image URL into base64 (server-side).
 * @param {string} url
 * @param {number} timeoutMs
 */
async function fetchImageAsBase64(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      return { ok: false, error: `image_download_http_${res.status}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = (res.headers.get("content-type") || "image/png")
      .split(";")[0]
      .trim();
    const mimeType = contentType.startsWith("image/") ? contentType : "image/png";
    return {
      ok: true,
      bytesBase64: buf.toString("base64"),
      mimeType,
    };
  } catch (err) {
    return {
      ok: false,
      error: err?.name === "AbortError" ? "image_download_timeout" : String(err?.message || err),
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
        // 5xx → retry with backoff
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
          error:
            lastStatus === "completed"
              ? null
              : `higgsfield_${lastStatus}`,
        };
      }
    } catch (err) {
      // network / abort → retry
      if (Date.now() + delay >= deadline) {
        return {
          ok: false,
          error: err?.name === "AbortError" ? "higgsfield_poll_timeout" : String(err?.message || err),
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
 * Submit Soul V2 text-to-image and wait for pixels.
 * @param {{
 *   prompt: string,
 *   width?: number,
 *   height?: number,
 * }} input
 */
export async function generateHiggsfieldImage(input) {
  const creds = await resolveHiggsfieldCredentialsAsync();
  if (!creds) {
    return { ok: false, error: "awaiting_credentials", mode: "awaiting_credentials" };
  }

  const base = higgsfieldBaseUrl();
  const endpoint = higgsfieldImageEndpoint();
  const submitUrl = `${base}/${endpoint}`;
  const aspectRatio = aspectRatioForSize(input.width, input.height);
  const resolution =
    (process.env.HIGGSFIELD_RESOLUTION || "").trim() || "720p";
  const timeoutMs = resolveTimeoutMs(
    process.env.HIGGSFIELD_TIMEOUT || process.env.IMAGE_TIMEOUT,
    120000,
  );
  const idempotencyKey = randomUUID();

  const payload = {
    prompt: String(input.prompt || "").slice(0, 4000),
    resolution: resolution === "1080p" ? "1080p" : "720p",
    aspect_ratio: aspectRatio,
    batch_size: 1,
    enhance_prompt: true,
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.min(timeoutMs, 60000));
  let submitBody = null;
  try {
    const res = await fetch(submitUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader(creds),
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
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
    };
  }

  // Already completed on submit (unlikely but handle).
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
      };
    }
    const polled = await pollUntilDone({
      statusUrl,
      creds,
      timeoutMs,
    });
    if (!polled.ok) {
      return {
        ok: false,
        error: polled.error || "higgsfield_failed",
        mode: "error",
        provider: "higgsfield",
        request_id: requestId || undefined,
        status: polled.status,
      };
    }
    completed = polled.body;
  }

  const images = Array.isArray(completed?.images) ? completed.images : [];
  const firstUrl =
    (images[0] && (images[0].url || images[0].image_url || images[0].src)) ||
    null;
  if (!firstUrl) {
    return {
      ok: false,
      error: "higgsfield_completed_without_image",
      mode: "error",
      provider: "higgsfield",
      request_id: requestId || undefined,
    };
  }

  const downloaded = await fetchImageAsBase64(String(firstUrl), 45000);
  if (!downloaded.ok) {
    return {
      ok: false,
      error: downloaded.error || "higgsfield_download_failed",
      mode: "error",
      provider: "higgsfield",
      request_id: requestId || undefined,
      remote_url: String(firstUrl).slice(0, 200),
    };
  }

  return {
    ok: true,
    mode: "higgsfield",
    kind: "image",
    provider: "higgsfield",
    model: endpoint,
    path: "soul_v2_poll",
    bytesBase64: downloaded.bytesBase64,
    mimeType: downloaded.mimeType,
    dataUrl: `data:${downloaded.mimeType};base64,${downloaded.bytesBase64}`,
    request_id: requestId || undefined,
    remote_url: String(firstUrl),
  };
}
