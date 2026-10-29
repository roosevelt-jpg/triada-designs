/**
 * WhatsApp Cloud API media upload + outbound attach helpers (Meta Graph).
 * Upload: POST /{phone-number-id}/media → media_id
 * Attach on template HEADER or session image/video messages.
 * Never logs or returns raw access tokens.
 */

import { integrationRuntimeMode } from "@/lib/integrations/env-presence";
import { resolveWhatsAppCloudCredentials } from "@/lib/integrations/meta-credentials";
import { validateMetaGraphMedia } from "@/lib/media/meta-graph-media-rules";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH_BASE = (
  process.env.META_GRAPH_BASE || "https://graph.facebook.com"
).replace(/\/$/, "");

function graphUrl(resourcePath) {
  return `${GRAPH_BASE}/${GRAPH_VERSION}/${String(resourcePath).replace(/^\//, "")}`;
}

/**
 * @param {unknown} value
 * @returns {"image"|"video"|null}
 */
export function normalizeWhatsAppMediaKind(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return null;
  if (raw === "image" || raw.startsWith("image/")) return "image";
  if (raw === "video" || raw.startsWith("video/")) return "video";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(raw)) return "image";
  if (["mp4", "3gp"].includes(raw)) return "video";
  return null;
}

/**
 * @param {string} [mimeType]
 * @param {"image"|"video"|null} [kind]
 */
export function defaultMimeForWhatsAppMedia(mimeType, kind = null) {
  const mime = String(mimeType || "").trim().toLowerCase();
  if (mime) return mime;
  if (kind === "video") return "video/mp4";
  return "image/jpeg";
}

/**
 * @returns {Promise<{ live: boolean, creds: Awaited<ReturnType<typeof resolveWhatsAppCloudCredentials>> }>}
 */
async function resolveSendGate() {
  const creds = await resolveWhatsAppCloudCredentials();
  const forceLocal =
    (process.env.INTEGRATION_MODE || "").trim().toLowerCase() === "local";
  const live =
    !forceLocal &&
    creds.sendReady &&
    integrationRuntimeMode(creds.sendReady) === "live";
  return { live, creds };
}

/**
 * Build a template send HEADER component for IMAGE/VIDEO media_id or link.
 * @param {{
 *   media_id?: string|null,
 *   media_link?: string|null,
 *   media_type?: string|null,
 * }} media
 * @returns {Record<string, unknown>|null}
 */
export function buildWhatsAppTemplateMediaHeader(media = {}) {
  const mediaId = media.media_id ? String(media.media_id).trim() : "";
  const mediaLink = media.media_link ? String(media.media_link).trim() : "";
  if (!mediaId && !mediaLink) return null;

  const kind =
    normalizeWhatsAppMediaKind(media.media_type) ||
    (mediaLink.match(/\.(mp4|3gp)(\?|$)/i) ? "video" : "image");
  const payload = mediaId ? { id: mediaId } : { link: mediaLink };

  return {
    type: "HEADER",
    parameters: [
      {
        type: kind,
        [kind]: payload,
      },
    ],
  };
}

/**
 * Merge media HEADER into template components (replace existing HEADER if present).
 * @param {unknown[]} [components]
 * @param {{
 *   media_id?: string|null,
 *   media_link?: string|null,
 *   media_type?: string|null,
 *   header_media_id?: string|null,
 *   header_media_link?: string|null,
 *   header_media_type?: string|null,
 * }} [media]
 * @returns {unknown[]}
 */
export function mergeWhatsAppTemplateMediaComponents(components = [], media = {}) {
  const list = Array.isArray(components)
    ? components.filter((c) => c && typeof c === "object")
    : [];
  const header = buildWhatsAppTemplateMediaHeader({
    media_id: media.media_id || media.header_media_id,
    media_link: media.media_link || media.header_media_link,
    media_type: media.media_type || media.header_media_type,
  });
  if (!header) return list;

  let replaced = false;
  const next = list.map((raw) => {
    const row = /** @type {Record<string, unknown>} */ (raw);
    if (String(row.type || "").toUpperCase() === "HEADER") {
      replaced = true;
      return header;
    }
    return row;
  });
  return replaced ? next : [header, ...next];
}

/**
 * Extract media fields from a send / automation / campaign payload.
 * @param {Record<string, unknown>} [input]
 */
export function extractWhatsAppMediaInput(input = {}) {
  const mediaType =
    input.media_type ||
    input.header_media_type ||
    input.header_format ||
    input.type ||
    null;
  return {
    media_id: input.media_id || input.header_media_id || null,
    media_link: input.media_link || input.header_media_link || input.media_url || null,
    media_url: input.media_url || input.header_media_url || input.media_link || null,
    media_type: mediaType,
    mime_type: input.mime_type || input.content_type || null,
    filename: input.filename || input.file_name || null,
    caption: input.caption || input.media_caption || null,
    media_base64: input.media_base64 || input.file_base64 || null,
  };
}

/**
 * Upload binary / URL / base64 to Meta Cloud media endpoint.
 * @param {{
 *   buffer?: ArrayBuffer|Uint8Array|Buffer|null,
 *   media_url?: string|null,
 *   media_base64?: string|null,
 *   mime_type?: string|null,
 *   media_type?: string|null,
 *   filename?: string|null,
 * }} input
 */
export async function uploadWhatsAppMedia(input = {}) {
  const { live, creds } = await resolveSendGate();
  let kind =
    normalizeWhatsAppMediaKind(input.media_type) ||
    normalizeWhatsAppMediaKind(input.mime_type) ||
    "image";
  let mime = defaultMimeForWhatsAppMedia(input.mime_type, kind);
  const filename =
    String(input.filename || "").trim() ||
    (kind === "video" ? "triada-media.mp4" : "triada-media.jpg");

  let bytes = input.buffer || null;

  if (!bytes && input.media_base64) {
    const raw = String(input.media_base64).replace(/^data:[^;]+;base64,/, "");
    bytes = Buffer.from(raw, "base64");
  }

  if (!bytes && input.media_url) {
    try {
      const fetched = await fetch(String(input.media_url), { cache: "no-store" });
      if (!fetched.ok) {
        return {
          ok: false,
          mode: live ? "live" : "local_sim",
          media_id: null,
          media_type: kind,
          mime_type: mime,
          error: `media_url_fetch_failed:${fetched.status}`,
          raw: {},
        };
      }
      const ab = await fetched.arrayBuffer();
      bytes = Buffer.from(ab);
      const remoteMime = fetched.headers.get("content-type");
      if (remoteMime && !input.mime_type) {
        mime = defaultMimeForWhatsAppMedia(remoteMime, kind);
      }
    } catch (err) {
      return {
        ok: false,
        mode: live ? "live" : "local_sim",
        media_id: null,
        media_type: kind,
        mime_type: mime,
        error: err instanceof Error ? err.message : "media_url_fetch_failed",
        raw: {},
      };
    }
  }

  const sizeBytes = bytes ? Number(bytes.byteLength || bytes.length || 0) : 0;
  const graph = validateMetaGraphMedia({
    mime_type: mime,
    filename,
    size_bytes: sizeBytes || null,
    kind,
    allowed_kinds: ["image", "video"],
  });
  if (!graph.ok) {
    return {
      ok: false,
      mode: live ? "live" : "local_sim",
      media_id: null,
      media_type: kind,
      mime_type: mime,
      error: graph.error || "meta_graph_media_rejected",
      message: graph.message,
      raw: { graph },
    };
  }
  kind = graph.kind || kind;
  mime = graph.mime_type || mime;

  if (!live) {
    const id = `local-media-${kind}-${Date.now().toString(36)}`;
    return {
      ok: true,
      mode: "local_sim",
      media_id: id,
      media_type: kind,
      mime_type: mime,
      filename,
      bytes: sizeBytes,
      error: null,
      raw: { simulated: true, messaging_product: "whatsapp", graph },
    };
  }

  if (!bytes || !sizeBytes) {
    return {
      ok: false,
      mode: "live",
      media_id: null,
      media_type: kind,
      mime_type: mime,
      error: "media_bytes_required",
      raw: {},
    };
  }

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mime);
  const blob = new Blob([bytes], { type: mime });
  form.append("file", blob, filename);

  const response = await fetch(graphUrl(`${creds.phoneNumberId}/media`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      Accept: "application/json",
    },
    body: form,
    cache: "no-store",
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok || !raw?.id) {
    return {
      ok: false,
      mode: "live",
      media_id: null,
      media_type: kind,
      mime_type: mime,
      error: raw?.error?.message || `HTTP ${response.status}`,
      raw: { error: raw?.error || undefined },
    };
  }

  return {
    ok: true,
    mode: "live",
    media_id: String(raw.id),
    media_type: kind,
    mime_type: mime,
    filename,
    error: null,
    raw: { id: raw.id },
  };
}

/**
 * Resolve media_id from existing id, upload URL/base64, or pass-through link-only.
 * @param {ReturnType<typeof extractWhatsAppMediaInput>} media
 */
export async function resolveWhatsAppMediaId(media = {}) {
  const existing = media.media_id ? String(media.media_id).trim() : "";
  if (existing) {
    return {
      ok: true,
      mode: "passthrough",
      media_id: existing,
      media_type:
        normalizeWhatsAppMediaKind(media.media_type) ||
        normalizeWhatsAppMediaKind(media.mime_type) ||
        "image",
      media_link: media.media_link ? String(media.media_link) : null,
      uploaded: false,
      error: null,
    };
  }

  const hasUploadSource = Boolean(media.media_url || media.media_base64);
  if (hasUploadSource) {
    const uploaded = await uploadWhatsAppMedia({
      media_url: media.media_url,
      media_base64: media.media_base64,
      mime_type: media.mime_type,
      media_type: media.media_type,
      filename: media.filename,
    });
    return {
      ok: uploaded.ok,
      mode: uploaded.mode,
      media_id: uploaded.media_id,
      media_type: uploaded.media_type,
      media_link: null,
      uploaded: true,
      error: uploaded.error,
      raw: uploaded.raw,
    };
  }

  const link = media.media_link ? String(media.media_link).trim() : "";
  if (link) {
    return {
      ok: true,
      mode: "link",
      media_id: null,
      media_type:
        normalizeWhatsAppMediaKind(media.media_type) ||
        (link.match(/\.(mp4|3gp)(\?|$)/i) ? "video" : "image"),
      media_link: link,
      uploaded: false,
      error: null,
    };
  }

  return {
    ok: true,
    mode: "none",
    media_id: null,
    media_type: null,
    media_link: null,
    uploaded: false,
    error: null,
  };
}

/**
 * Send an in-session image or video message (24h customer care window).
 * @param {{
 *   to: string,
 *   media_id?: string|null,
 *   media_link?: string|null,
 *   media_url?: string|null,
 *   media_base64?: string|null,
 *   media_type?: string|null,
 *   mime_type?: string|null,
 *   filename?: string|null,
 *   caption?: string|null,
 * }} input
 */
export async function sendWhatsAppMediaMessage(input) {
  const to = String(input.to || "").trim();
  if (!to) {
    return {
      ok: false,
      mode: "local_sim",
      provider_message_id: null,
      media_id: null,
      error: "to_required",
      raw: {},
    };
  }

  const resolved = await resolveWhatsAppMediaId(extractWhatsAppMediaInput(input));
  if (!resolved.ok) {
    return {
      ok: false,
      mode: resolved.mode || "live",
      provider_message_id: null,
      media_id: resolved.media_id,
      error: resolved.error || "media_resolve_failed",
      raw: resolved.raw || {},
    };
  }
  if (!resolved.media_id && !resolved.media_link) {
    return {
      ok: false,
      mode: resolved.mode || "local_sim",
      provider_message_id: null,
      media_id: null,
      error: "media_required",
      raw: {},
    };
  }

  const kind = resolved.media_type || "image";
  const mediaPayload = resolved.media_id
    ? { id: resolved.media_id }
    : { link: resolved.media_link };
  if (input.caption) {
    mediaPayload.caption = String(input.caption).slice(0, 1024);
  }

  const { live, creds } = await resolveSendGate();
  if (!live) {
    return {
      ok: true,
      mode: "local_sim",
      provider_message_id: `local-wa-media-${Date.now().toString(36)}`,
      media_id: resolved.media_id,
      media_type: kind,
      error: null,
      raw: {
        to,
        simulated: true,
        type: kind,
        [kind]: mediaPayload,
      },
    };
  }

  const response = await fetch(graphUrl(`${creds.phoneNumberId}/messages`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: kind,
      [kind]: mediaPayload,
    }),
    cache: "no-store",
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      mode: "live",
      provider_message_id: null,
      media_id: resolved.media_id,
      media_type: kind,
      error: raw?.error?.message || `HTTP ${response.status}`,
      raw: { error: raw?.error || undefined },
    };
  }

  const messages = Array.isArray(raw?.messages) ? raw.messages : [];
  return {
    ok: true,
    mode: "live",
    provider_message_id: messages[0]?.id ? String(messages[0].id) : null,
    media_id: resolved.media_id,
    media_type: kind,
    error: null,
    raw: { messages },
  };
}

/**
 * Prepare template components with optional media attach (upload when needed).
 * @param {unknown[]} [components]
 * @param {Record<string, unknown>} [mediaInput]
 */
export async function prepareWhatsAppTemplateComponentsWithMedia(
  components = [],
  mediaInput = {},
) {
  const extracted = extractWhatsAppMediaInput(mediaInput);
  const hasAny =
    extracted.media_id ||
    extracted.media_link ||
    extracted.media_url ||
    extracted.media_base64;
  if (!hasAny) {
    return {
      ok: true,
      components: Array.isArray(components) ? components : [],
      media_id: null,
      media_type: null,
      uploaded: false,
      error: null,
    };
  }

  const resolved = await resolveWhatsAppMediaId(extracted);
  if (!resolved.ok) {
    return {
      ok: false,
      components: Array.isArray(components) ? components : [],
      media_id: null,
      media_type: resolved.media_type,
      uploaded: Boolean(resolved.uploaded),
      error: resolved.error || "media_resolve_failed",
    };
  }

  const merged = mergeWhatsAppTemplateMediaComponents(components, {
    media_id: resolved.media_id,
    media_link: resolved.media_link,
    media_type: resolved.media_type,
  });

  return {
    ok: true,
    components: merged,
    media_id: resolved.media_id,
    media_type: resolved.media_type,
    uploaded: Boolean(resolved.uploaded),
    error: null,
  };
}
