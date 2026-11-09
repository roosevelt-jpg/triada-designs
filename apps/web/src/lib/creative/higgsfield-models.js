/**
 * Higgsfield model catalog for Content Studio + Creative Agent.
 * Aligns with https://docs.higgsfield.ai — image (Soul V2) + video (Seedance 2.5).
 */

/** @typedef {"image"|"text_to_video"|"image_to_video"} HiggsfieldModelKind */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   kind: HiggsfieldModelKind,
 *   description: string,
 *   default?: boolean,
 * }} HiggsfieldModel
 */

/** @type {HiggsfieldModel[]} */
export const HIGGSFIELD_IMAGE_MODELS = [
  {
    id: "higgsfield-ai/soul/v2/standard",
    label: "Soul V2",
    kind: "image",
    description: "Photoreal text-to-image (Higgsfield Soul V2 standard).",
    default: true,
  },
];

/** @type {HiggsfieldModel[]} */
export const HIGGSFIELD_VIDEO_MODELS = [
  {
    id: "bytedance/seedance-2.5/text-to-video",
    label: "Seedance 2.5 · Text → Video",
    kind: "text_to_video",
    description: "Cinematic text-to-video for marketing / UGC clips.",
    default: true,
  },
  {
    id: "bytedance/seedance-2.5/image-to-video",
    label: "Seedance 2.5 · Image → Video",
    kind: "image_to_video",
    description: "Animate a public still into a short marketing video.",
  },
];

export const HIGGSFIELD_RESOLUTIONS = ["480p", "720p", "1080p"];

export const HIGGSFIELD_IMAGE_ASPECT_RATIOS = [
  "9:16",
  "16:9",
  "4:3",
  "3:4",
  "1:1",
  "2:3",
  "3:2",
];

export const HIGGSFIELD_VIDEO_ASPECT_RATIOS = [
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
  "21:9",
];

/** Soul V2 default style UUID from Higgsfield docs. */
export const HIGGSFIELD_DEFAULT_STYLE_ID =
  "3db34ab5-3439-4317-9e03-08dc30852e69";

/**
 * @returns {{
 *   image: HiggsfieldModel[],
 *   video: HiggsfieldModel[],
 *   resolutions: string[],
 *   image_aspect_ratios: string[],
 *   video_aspect_ratios: string[],
 *   default_style_id: string,
 * }}
 */
export function higgsfieldModelCatalog() {
  return {
    image: HIGGSFIELD_IMAGE_MODELS,
    video: HIGGSFIELD_VIDEO_MODELS,
    resolutions: HIGGSFIELD_RESOLUTIONS,
    image_aspect_ratios: HIGGSFIELD_IMAGE_ASPECT_RATIOS,
    video_aspect_ratios: HIGGSFIELD_VIDEO_ASPECT_RATIOS,
    default_style_id: HIGGSFIELD_DEFAULT_STYLE_ID,
  };
}

/**
 * @param {string | undefined} raw
 * @param {"image"|"video"} kind
 */
export function resolveHiggsfieldModelId(raw, kind) {
  const trimmed = String(raw || "").trim().replace(/^\/+/, "").replace(/\/$/, "");
  if (kind === "image") {
    if (trimmed && HIGGSFIELD_IMAGE_MODELS.some((m) => m.id === trimmed)) {
      return trimmed;
    }
    const env =
      (process.env.HIGGSFIELD_IMAGE_ENDPOINT || "").trim() ||
      (process.env.HIGGSFIELD_MODEL || "").trim();
    if (env) return env.replace(/^\/+/, "").replace(/\/$/, "");
    return HIGGSFIELD_IMAGE_MODELS.find((m) => m.default)?.id || HIGGSFIELD_IMAGE_MODELS[0].id;
  }

  if (trimmed && HIGGSFIELD_VIDEO_MODELS.some((m) => m.id === trimmed)) {
    return trimmed;
  }
  const env = (process.env.HIGGSFIELD_VIDEO_ENDPOINT || "").trim();
  if (env) return env.replace(/^\/+/, "").replace(/\/$/, "");
  return (
    HIGGSFIELD_VIDEO_MODELS.find((m) => m.default)?.id || HIGGSFIELD_VIDEO_MODELS[0].id
  );
}

/**
 * @param {string | undefined} raw
 * @param {string[]} allowed
 * @param {string} fallback
 */
export function normalizeHiggsfieldResolution(raw, allowed, fallback) {
  const value = String(raw || "").trim().toLowerCase();
  if (allowed.includes(value)) return value;
  return fallback;
}

/**
 * Clamp Seedance duration (seconds). API: 4–30, default 5.
 * @param {number | undefined} seconds
 * @param {number} [fallback=5]
 */
export function clampVideoDurationSeconds(seconds, fallback = 5) {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(30, Math.max(4, Math.round(n)));
}
