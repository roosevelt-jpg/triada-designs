/**
 * Meta Graph / WhatsApp Cloud API media approval rules (format, MIME, size).
 * Source: WhatsApp Cloud API media limits for outbound image/video.
 * Never logs secrets or credentials.
 */

/** @typedef {"image"|"video"|"audio"|"document"|"sticker"} MetaMediaKind */

/** @type {Record<MetaMediaKind, { mimes: string[], maxBytes: number, extensions: string[] }>} */
export const META_WHATSAPP_MEDIA_RULES = {
  image: {
    mimes: ["image/jpeg", "image/png"],
    maxBytes: 5 * 1024 * 1024,
    extensions: ["jpg", "jpeg", "png"],
  },
  video: {
    mimes: ["video/mp4", "video/3gpp"],
    maxBytes: 16 * 1024 * 1024,
    extensions: ["mp4", "3gp", "3gpp"],
  },
  audio: {
    mimes: [
      "audio/aac",
      "audio/mp4",
      "audio/mpeg",
      "audio/amr",
      "audio/ogg",
    ],
    maxBytes: 16 * 1024 * 1024,
    extensions: ["aac", "m4a", "mp3", "amr", "ogg"],
  },
  document: {
    mimes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
    ],
    maxBytes: 100 * 1024 * 1024,
    extensions: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt"],
  },
  sticker: {
    mimes: ["image/webp"],
    maxBytes: 500 * 1024,
    extensions: ["webp"],
  },
};

/** Accept attribute for WhatsApp image/video file pickers. */
export const META_WHATSAPP_IMAGE_VIDEO_ACCEPT =
  "image/jpeg,image/png,video/mp4,video/3gpp,.jpg,.jpeg,.png,.mp4,.3gp";

/**
 * @param {string} [filename]
 * @returns {string}
 */
export function extensionOf(filename) {
  const name = String(filename || "").trim().toLowerCase();
  const i = name.lastIndexOf(".");
  if (i < 0) return "";
  return name.slice(i + 1).replace(/[^a-z0-9]/g, "");
}

/**
 * @param {string} [mime]
 * @param {string} [filename]
 * @returns {MetaMediaKind | null}
 */
export function inferMetaMediaKind(mime, filename) {
  const m = String(mime || "")
    .trim()
    .toLowerCase()
    .split(";")[0]
    .trim();
  const ext = extensionOf(filename);

  if (m === "image/webp" || ext === "webp") return "sticker";
  if (m.startsWith("image/") || ["jpg", "jpeg", "png"].includes(ext)) return "image";
  if (m.startsWith("video/") || ["mp4", "3gp", "3gpp"].includes(ext)) return "video";
  if (m.startsWith("audio/") || ["aac", "m4a", "mp3", "amr", "ogg"].includes(ext)) {
    return "audio";
  }
  if (m.startsWith("application/") || m === "text/plain" || META_WHATSAPP_MEDIA_RULES.document.extensions.includes(ext)) {
    return "document";
  }
  return null;
}

/**
 * Normalize MIME for WhatsApp Graph upload.
 * @param {string} [mime]
 * @param {MetaMediaKind | null} [kind]
 * @param {string} [filename]
 */
export function normalizeMetaMime(mime, kind = null, filename = "") {
  const raw = String(mime || "")
    .trim()
    .toLowerCase()
    .split(";")[0]
    .trim();
  if (raw === "image/jpg") return "image/jpeg";
  if (raw) return raw;

  const ext = extensionOf(filename);
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "mp4") return "video/mp4";
  if (ext === "3gp" || ext === "3gpp") return "video/3gpp";
  if (kind === "video") return "video/mp4";
  if (kind === "image") return "image/jpeg";
  return raw;
}

/**
 * Validate a file against WhatsApp Cloud API / Meta Graph media rules.
 * @param {{
 *   mime_type?: string|null,
 *   filename?: string|null,
 *   size_bytes?: number|null,
 *   kind?: MetaMediaKind|string|null,
 *   allowed_kinds?: Array<MetaMediaKind|"image"|"video">,
 * }} input
 * @returns {{
 *   ok: boolean,
 *   kind: MetaMediaKind | null,
 *   mime_type: string,
 *   max_bytes: number | null,
 *   error: string | null,
 *   message: string | null,
 * }}
 */
export function validateMetaGraphMedia(input = {}) {
  const filename = String(input.filename || "").trim();
  const allowed = Array.isArray(input.allowed_kinds) && input.allowed_kinds.length
    ? input.allowed_kinds.map((k) => String(k).toLowerCase())
    : ["image", "video"];

  const hinted = String(input.kind || "").trim().toLowerCase();
  let kind =
    /** @type {MetaMediaKind | null} */ (
      hinted && hinted in META_WHATSAPP_MEDIA_RULES ? hinted : null
    ) || inferMetaMediaKind(input.mime_type || "", filename);

  const mime = normalizeMetaMime(input.mime_type || "", kind, filename);

  if (!kind) {
    kind = inferMetaMediaKind(mime, filename);
  }

  if (!kind || !(kind in META_WHATSAPP_MEDIA_RULES)) {
    return {
      ok: false,
      kind: null,
      mime_type: mime,
      max_bytes: null,
      error: "unsupported_media_type",
      message:
        "Meta / WhatsApp accepts JPEG or PNG images and MP4 or 3GP video for this field.",
    };
  }

  if (!allowed.includes(kind)) {
    return {
      ok: false,
      kind,
      mime_type: mime,
      max_bytes: META_WHATSAPP_MEDIA_RULES[kind].maxBytes,
      error: "kind_not_allowed",
      message: `This field only accepts ${allowed.join(" or ")} media that meets Meta Graph rules.`,
    };
  }

  const rule = META_WHATSAPP_MEDIA_RULES[kind];
  if (!rule.mimes.includes(mime)) {
    return {
      ok: false,
      kind,
      mime_type: mime,
      max_bytes: rule.maxBytes,
      error: "mime_not_approved",
      message:
        kind === "image"
          ? "WhatsApp images must be JPEG or PNG (Graph-approved)."
          : kind === "video"
            ? "WhatsApp videos must be MP4 or 3GP (Graph-approved)."
            : `MIME ${mime || "(unknown)"} is not approved for WhatsApp ${kind}.`,
    };
  }

  const size = Number(input.size_bytes);
  if (Number.isFinite(size) && size > rule.maxBytes) {
    const mb = Math.round((rule.maxBytes / (1024 * 1024)) * 10) / 10;
    return {
      ok: false,
      kind,
      mime_type: mime,
      max_bytes: rule.maxBytes,
      error: "file_too_large",
      message: `File exceeds WhatsApp ${kind} limit of ${mb} MB.`,
    };
  }

  if (Number.isFinite(size) && size <= 0) {
    return {
      ok: false,
      kind,
      mime_type: mime,
      max_bytes: rule.maxBytes,
      error: "empty_file",
      message: "File is empty.",
    };
  }

  return {
    ok: true,
    kind,
    mime_type: mime,
    max_bytes: rule.maxBytes,
    error: null,
    message: null,
  };
}

/**
 * Human hint under upload fields.
 * @param {"image"|"video"|"image_video"} [mode]
 */
export function metaGraphMediaHint(mode = "image_video") {
  if (mode === "image") {
    return "JPEG or PNG · max 5 MB (WhatsApp / Meta Graph).";
  }
  if (mode === "video") {
    return "MP4 or 3GP · max 16 MB (WhatsApp / Meta Graph).";
  }
  return "JPEG/PNG up to 5 MB · MP4/3GP up to 16 MB (WhatsApp / Meta Graph).";
}
