/**
 * Creative Agent tool allowlist + execution (Next dual-run).
 * Anthropic drafts scripts/briefs; Higgsfield (Soul V2 / Seedance) mints pixels.
 * Human approval remains required before publish.
 */

import { composeCreativePackage } from "@/lib/creative/compose-package";
import { higgsfieldModelCatalog } from "@/lib/creative/higgsfield-models";
import { upsertMediaAsset, setMediaVariants } from "@/lib/creative/media-store";
import { findContent, patchContent } from "@/lib/content-schedule-store";
import { creativeModeLabel } from "@/lib/integrations/brand-labels";

export const CREATIVE_TOOL_AGENT_KEYS = [
  "content_creator",
  "marketing",
  "content",
  "creative",
];

export const CREATIVE_TOOLS = [
  {
    name: "propose_creative_brief",
    description:
      "Propose a jewellery-aware creative brief + Claude script/captions. Does not publish.",
  },
  {
    name: "generate_image",
    description:
      "Generate a photoreal still via Higgsfield Soul V2 (Gemini fallback). Preview before approval.",
  },
  {
    name: "generate_platform_variants",
    description: "Generate platform-sized variants from a hero still for IG/FB/TikTok.",
  },
  {
    name: "generate_short_video",
    description:
      "Generate a short marketing video via Higgsfield Seedance 2.5 (Gemini fallback).",
  },
  {
    name: "generate_ugc_video",
    description:
      "Generate a vertical UGC-style video via Higgsfield Seedance + Anthropic script.",
  },
  {
    name: "generate_animation",
    description: "Generate a short motion loop for feed/stories (Higgsfield video path).",
  },
  {
    name: "ensure_creative_pack",
    description:
      "Ensure script + image variants + video exist for a content item (still approval-gated).",
  },
];

const TOOL_TO_ACTION = {
  propose_creative_brief: "ensure-creative",
  generate_image: "generate-image",
  generate_platform_variants: "generate-variants",
  generate_short_video: "generate-video",
  generate_ugc_video: "generate-ugc-video",
  generate_animation: "generate-animation",
  ensure_creative_pack: "ensure-creative",
};

/**
 * @param {string} agentKey
 * @param {string} tool
 */
export function creativeToolAllowed(agentKey, tool) {
  const key = String(agentKey || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  const normalized =
    key === "creative" || key === "content" ? "content_creator" : key;
  if (!CREATIVE_TOOL_AGENT_KEYS.includes(normalized) && normalized !== "content_creator") {
    return false;
  }
  return CREATIVE_TOOLS.some((t) => t.name === tool);
}

/** @returns {{ agents: string[], tools: typeof CREATIVE_TOOLS, models: ReturnType<typeof higgsfieldModelCatalog> }} */
export function creativeToolsCatalog() {
  return {
    agents: CREATIVE_TOOL_AGENT_KEYS,
    tools: CREATIVE_TOOLS,
    models: higgsfieldModelCatalog(),
  };
}

/**
 * Infer a creative tool from purpose / free-text message.
 * @param {{ purpose?: string, message?: string, tool?: string }} input
 * @returns {string | null}
 */
export function inferCreativeTool(input = {}) {
  const explicit = String(input.tool || "").trim();
  if (explicit && TOOL_TO_ACTION[explicit]) return explicit;

  const purpose = String(input.purpose || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (TOOL_TO_ACTION[purpose]) return purpose;

  const msg = String(input.message || "").toLowerCase();
  if (!msg) return null;
  if (/\bugc\b/.test(msg) && /video|reel|clip|tiktok|short/.test(msg)) {
    return "generate_ugc_video";
  }
  if (/animat|motion loop|loop/.test(msg)) return "generate_animation";
  if (/variant|resize|platform size|story size|feed size/.test(msg)) {
    return "generate_platform_variants";
  }
  if (/video|reel|clip|seedance|cinematic|footage/.test(msg)) {
    return "generate_short_video";
  }
  if (/image|still|photo|soul|poster|hero frame|picture/.test(msg)) {
    return "generate_image";
  }
  if (/brief|script|caption|storyboard|creative pack|full pack/.test(msg)) {
    return "ensure_creative_pack";
  }
  return null;
}

/**
 * @param {Record<string, unknown>} payload
 */
function pickProParams(payload = {}) {
  const keys = [
    "model",
    "image_model",
    "video_model",
    "resolution",
    "aspect_ratio",
    "seed",
    "style_id",
    "style_strength",
    "enhance_prompt",
    "batch_size",
    "custom_reference_id",
    "custom_reference_strength",
    "image_url",
    "end_image_url",
    "generate_audio",
    "bitrate_mode",
    "duration",
    "duration_ms",
    "product",
    "materials",
    "channel",
    "caption",
    "storyboard",
    "style",
    "objective",
    "output_format",
  ];
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== "") {
      out[key] = payload[key];
    }
  }
  return out;
}

/**
 * Execute a Creative Agent tool against Content Studio compose path.
 * @param {{
 *   agent_key: string,
 *   tool: string,
 *   content_id?: string,
 *   payload?: Record<string, unknown>,
 *   dry_run?: boolean,
 * }} input
 */
export async function runCreativeTool(input) {
  const agentKey = String(input.agent_key || "content_creator");
  const tool = String(input.tool || "").trim();
  if (!creativeToolAllowed(agentKey, tool)) {
    return {
      ok: false,
      error: "tool_not_allowed",
      message: `Tool “${tool}” is not allowed for agent “${agentKey}”.`,
      allowlist: creativeToolsCatalog(),
    };
  }

  const action = TOOL_TO_ACTION[tool];
  if (!action) {
    return { ok: false, error: "unknown_tool", message: `Unknown tool: ${tool}` };
  }

  const payload = {
    ...pickProParams(input.payload || {}),
    ...(tool === "generate_ugc_video" ? { style: "ugc" } : {}),
  };

  const contentId =
    String(input.content_id || input.payload?.content_id || "").trim() ||
    `content-agent-${Date.now().toString(36)}`;

  let item = findContent(contentId);
  if (!item) {
    item = patchContent(contentId, {
      title: String(
        payload.product ||
          input.payload?.title ||
          "Creative Agent draft",
      ),
      body: String(
        payload.caption ||
          input.payload?.message ||
          input.payload?.brief ||
          "Marketing creative drafted by Creative Agent.",
      ),
      channel: String(payload.channel || "instagram"),
      status: "draft",
      product_context: {
        name: String(payload.product || "Triada Designs jewellery"),
        materials: String(payload.materials || "gold, refined stones"),
      },
      metadata: {
        created_by_agent: agentKey,
        creative_tool: tool,
      },
    });
  }

  if (input.dry_run) {
    return {
      ok: true,
      dry_run: true,
      agent_key: agentKey,
      tool,
      action,
      content_id: contentId,
      message: `Would run ${tool} for content ${contentId} (Anthropic script → Higgsfield pixels).`,
      models: higgsfieldModelCatalog(),
      payload,
    };
  }

  const composed = await composeCreativePackage({
    item,
    body: payload,
    action:
      tool === "propose_creative_brief"
        ? // Brief-only: still compose scripts; skip forcing video when only brief asked.
          payload.with_video
          ? "ensure-creative"
          : "generate-image"
        : action,
  });

  const content = patchContent(contentId, {
    status:
      item.status === "approved" ||
      item.status === "scheduled" ||
      item.status === "published"
        ? item.status
        : "in_review",
    creative_brief: composed.creative_brief,
    body:
      composed.script?.caption ||
      composed.script?.script ||
      item.body,
  });

  const storedAsset = upsertMediaAsset(contentId, {
    ...composed.asset,
    id: `asset-${contentId}-${tool}`,
  });
  if (composed.variants?.length) {
    setMediaVariants(contentId, composed.variants);
  }

  return {
    ok: composed.ok !== false,
    agent_key: agentKey,
    tool,
    action,
    mode: composed.mode,
    mode_label: composed.mode_label || creativeModeLabel(composed.mode),
    message: composed.message,
    content_id: contentId,
    content,
    script: composed.script || null,
    creative_brief: composed.creative_brief,
    asset: storedAsset,
    variants: composed.variants || [],
    preview_required: true,
    review_url: "/content/review",
    sidecar: composed.sidecar,
    error: composed.error || null,
    models: higgsfieldModelCatalog(),
  };
}
