/**
 * Telegram Bot API photo / video send for customer creative fan-out.
 * Supports HTTPS media_url and data:/base64 payloads (multipart upload).
 * Never logs bot tokens.
 */

import {
  hasTelegramEnv,
  integrationRuntimeMode,
} from "@/lib/integrations/env-presence";

const TELEGRAM_API = (
  process.env.TELEGRAM_API_BASE || "https://api.telegram.org"
).replace(/\/$/, "");

/**
 * @returns {{ live: boolean, token: string }}
 */
function resolveSendGate() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const forceLocal =
    (process.env.INTEGRATION_MODE || "").trim().toLowerCase() === "local";
  const ready = hasTelegramEnv() && Boolean(token);
  const live =
    !forceLocal && ready && integrationRuntimeMode(ready) === "live";
  return { live, token };
}

/**
 * @param {string | null | undefined} raw
 * @returns {{ buffer: Buffer, mime: string } | null}
 */
function decodeDataUrlOrBase64(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const dataMatch = value.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataMatch) {
    return {
      mime: dataMatch[1].trim().toLowerCase() || "application/octet-stream",
      buffer: Buffer.from(dataMatch[2], "base64"),
    };
  }
  // bare base64
  if (/^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 64) {
    try {
      return {
        mime: "application/octet-stream",
        buffer: Buffer.from(value.replace(/\s+/g, ""), "base64"),
      };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * @param {"photo"|"video"} kind
 * @param {{
 *   chat_id: string | number,
 *   caption?: string | null,
 *   media_url?: string | null,
 *   media_base64?: string | null,
 *   mime_type?: string | null,
 *   filename?: string | null,
 * }} input
 */
async function sendTelegramMedia(kind, input) {
  const chatId = String(input.chat_id || "").trim();
  const caption = String(input.caption || "").trim().slice(0, 1024);
  const mediaUrl = String(input.media_url || "").trim();
  const decoded = decodeDataUrlOrBase64(input.media_base64);

  if (!chatId) {
    return {
      ok: false,
      mode: "local_sim",
      channel: "telegram",
      kind,
      provider_message_id: null,
      error: "chat_id_required",
      raw: {},
    };
  }
  if (!mediaUrl && !decoded) {
    return {
      ok: false,
      mode: "local_sim",
      channel: "telegram",
      kind,
      provider_message_id: null,
      error: "media_required",
      raw: {},
    };
  }

  const { live, token } = resolveSendGate();
  const method = kind === "video" ? "sendVideo" : "sendPhoto";
  const field = kind === "video" ? "video" : "photo";
  const defaultMime =
    kind === "video"
      ? "video/mp4"
      : String(input.mime_type || decoded?.mime || "image/jpeg");
  const filename =
    String(input.filename || "").trim() ||
    (kind === "video" ? "triada-creative.mp4" : "triada-creative.jpg");

  if (!live) {
    return {
      ok: true,
      mode: "local_sim",
      channel: "telegram",
      kind,
      provider_message_id: `local-tg-${kind}-${Date.now().toString(36)}`,
      error: null,
      raw: {
        chat_id: chatId,
        simulated: true,
        method,
        has_url: Boolean(mediaUrl && /^https?:\/\//i.test(mediaUrl)),
        has_bytes: Boolean(decoded),
        caption: caption || null,
      },
    };
  }

  /** @type {RequestInit} */
  let init;
  if (decoded) {
    const form = new FormData();
    form.append("chat_id", chatId);
    if (caption) form.append("caption", caption);
    const blob = new Blob([decoded.buffer], {
      type: String(input.mime_type || decoded.mime || defaultMime),
    });
    form.append(field, blob, filename);
    init = { method: "POST", body: form, cache: "no-store" };
  } else {
    init = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        [field]: mediaUrl,
        ...(caption ? { caption } : {}),
      }),
      cache: "no-store",
    };
  }

  const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, init);
  const raw = await response.json().catch(() => ({}));
  if (!response.ok || raw?.ok === false) {
    return {
      ok: false,
      mode: "live",
      channel: "telegram",
      kind,
      provider_message_id: null,
      error: raw?.description || `HTTP ${response.status}`,
      raw,
    };
  }

  return {
    ok: true,
    mode: "live",
    channel: "telegram",
    kind,
    provider_message_id: raw?.result?.message_id
      ? String(raw.result.message_id)
      : null,
    error: null,
    raw,
  };
}

/**
 * @param {{
 *   chat_id: string | number,
 *   caption?: string | null,
 *   media_url?: string | null,
 *   media_base64?: string | null,
 *   mime_type?: string | null,
 *   filename?: string | null,
 * }} input
 */
export async function sendTelegramPhoto(input) {
  return sendTelegramMedia("photo", input);
}

/**
 * @param {{
 *   chat_id: string | number,
 *   caption?: string | null,
 *   media_url?: string | null,
 *   media_base64?: string | null,
 *   mime_type?: string | null,
 *   filename?: string | null,
 * }} input
 */
export async function sendTelegramVideo(input) {
  return sendTelegramMedia("video", input);
}
