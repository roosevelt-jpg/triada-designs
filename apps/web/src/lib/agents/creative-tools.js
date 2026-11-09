/**
 * Creative tool allowlist + execution for ALL Triada AI agents (Next dual-run).
 * Anthropic drafts scripts/briefs/quotes; Higgsfield (Soul V2 / Seedance) mints pixels.
 * Human approval remains required before publish.
 */

import { composeCreativePackage } from "@/lib/creative/compose-package";
import { higgsfieldModelCatalog } from "@/lib/creative/higgsfield-models";
import { upsertMediaAsset, setMediaVariants } from "@/lib/creative/media-store";
import { findContent, patchContent } from "@/lib/content-schedule-store";
import { creativeModeLabel } from "@/lib/integrations/brand-labels";
import {
  AGENT_KEY_ALIASES,
  SHARED_CREATIVE_TOOLS,
  TEAM_ROSTER,
} from "@/lib/agents/team-roster";

export { SHARED_CREATIVE_TOOLS };

/** All seeded agent keys (+ aliases) may run the Anthropic → Higgsfield pipeline. */
export const CREATIVE_TOOL_AGENT_KEYS = [
  ...new Set([
    ...TEAM_ROSTER.map((a) => a.key),
    ...Object.keys(AGENT_KEY_ALIASES),
    ...Object.values(AGENT_KEY_ALIASES),
    "content",
    "creative",
  ]),
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
  {
    name: "generate_quote_inspiration",
    description:
      "Generate an inspirational quote (Anthropic) + designed card (Higgsfield Soul V2). Queues for approval/broadcast.",
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
  generate_quote_inspiration: "generate-quote-inspiration",
};

/**
 * @param {string} agentKey
 */
export function normalizeCreativeAgentKey(agentKey) {
  const key = String(agentKey || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (AGENT_KEY_ALIASES[key]) return AGENT_KEY_ALIASES[key];
  if (key === "creative" || key === "content") return "content_creator";
  return key;
}

/**
 * @param {string} agentKey
 * @param {string} tool
 */
export function creativeToolAllowed(agentKey, tool) {
  const normalized = normalizeCreativeAgentKey(agentKey);
  if (!CREATIVE_TOOL_AGENT_KEYS.includes(normalized) && !CREATIVE_TOOL_AGENT_KEYS.includes(agentKey)) {
    // Still allow any known roster key even if alias map drifts.
    const rosterHit = TEAM_ROSTER.some((a) => a.key === normalized);
    if (!rosterHit) return false;
  }
  return CREATIVE_TOOLS.some((t) => t.name === tool);
}

/** @returns {{ agents: string[], tools: typeof CREATIVE_TOOLS, models: ReturnType<typeof higgsfieldModelCatalog> }} */
export function creativeToolsCatalog() {
  return {
    agents: TEAM_ROSTER.map((a) => a.key),
    tools: CREATIVE_TOOLS,
    models: higgsfieldModelCatalog(),
  };
}

/**
 * Infer a creative tool from purpose / free-text message / task title.
 * @param {{ purpose?: string, message?: string, tool?: string, title?: string }} input
 * @returns {string | null}
 */
export function inferCreativeTool(input = {}) {
  const explicit = String(input.tool || "").trim();
  if (explicit && (TOOL_TO_ACTION[explicit] || explicit === "generate_quote_inspiration")) {
    return explicit;
  }

  const purpose = String(input.purpose || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (TOOL_TO_ACTION[purpose] || purpose === "generate_quote_inspiration") return purpose;

  const msg = `${String(input.message || "")} ${String(input.title || "")}`.toLowerCase();
  if (!msg.trim()) return null;
  if (/quote|inspiration card|inspirational|weekday broadcast|quote card/.test(msg)) {
    return "generate_quote_inspiration";
  }
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
  if (/image|still|photo|soul|poster|hero frame|picture|visual/.test(msg)) {
    return "generate_image";
  }
  if (/brief|script|caption|storyboard|creative pack|full pack|ugc|campaign creative/.test(msg)) {
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
    "theme",
    "language",
    "niche_hint",
    "customer_hint",
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
 * Execute a creative tool (Content Studio compose OR Quote inspiration).
 * @param {{
 *   agent_key: string,
 *   tool: string,
 *   content_id?: string,
 *   payload?: Record<string, unknown>,
 *   dry_run?: boolean,
 * }} input
 */
export async function runCreativeTool(input) {
  const agentKey = normalizeCreativeAgentKey(input.agent_key || "content_creator");
  const tool = String(input.tool || "").trim();
  if (!creativeToolAllowed(agentKey, tool)) {
    return {
      ok: false,
      error: "tool_not_allowed",
      message: `Tool “${tool}” is not allowed for agent “${agentKey}”.`,
      allowlist: creativeToolsCatalog(),
    };
  }

  const payload = {
    ...pickProParams(input.payload || {}),
    ...(tool === "generate_ugc_video" ? { style: "ugc" } : {}),
  };

  if (tool === "generate_quote_inspiration") {
    if (input.dry_run) {
      return {
        ok: true,
        dry_run: true,
        agent_key: agentKey,
        tool,
        action: "generate-quote-inspiration",
        message:
          "Would generate quote copy with Anthropic and a Higgsfield Soul V2 card (SVG fallback).",
        models: higgsfieldModelCatalog(),
        payload,
      };
    }
    const { generateQuoteInspiration } = await import(
      "@/lib/content/quote-inspiration-engine"
    );
    const quoteResult = await generateQuoteInspiration({
      theme: String(payload.theme || payload.product || payload.caption || "quiet luxury jewellery"),
      language: String(payload.language || "en"),
      niche_hint: payload.niche_hint ? String(payload.niche_hint) : undefined,
      customer_hint: payload.customer_hint
        ? String(payload.customer_hint)
        : undefined,
      schedule: payload.schedule !== false,
      // Always leave for human preview unless caller opts into auto-approve.
      approve: payload.approve === true,
      resolution: payload.resolution,
      seed: payload.seed,
      style_id: payload.style_id,
      enhance_prompt: payload.enhance_prompt,
      image_model: payload.image_model || payload.model,
      aspect_ratio: payload.aspect_ratio || "1:1",
    });
    return {
      ok: quoteResult.ok !== false,
      agent_key: agentKey,
      tool,
      action: "generate-quote-inspiration",
      mode: quoteResult.mode,
      mode_label: quoteResult.mode_label || creativeModeLabel(quoteResult.mode),
      message: quoteResult.message,
      content_id: quoteResult.content?.id,
      content: quoteResult.content,
      script: quoteResult.quote || null,
      creative_brief: quoteResult.content?.creative_brief,
      asset: quoteResult.asset,
      variants: [],
      preview_required: Boolean(quoteResult.preview_required),
      review_url: quoteResult.review_url || "/content/inspiration",
      sidecar: { quote_engine: true },
      error: quoteResult.error || null,
      models: higgsfieldModelCatalog(),
    };
  }

  const action = TOOL_TO_ACTION[tool];
  if (!action) {
    return { ok: false, error: "unknown_tool", message: `Unknown tool: ${tool}` };
  }

  const contentId =
    String(input.content_id || input.payload?.content_id || "").trim() ||
    `content-agent-${Date.now().toString(36)}`;

  let item = findContent(contentId);
  if (!item) {
    item = patchContent(contentId, {
      title: String(
        payload.product ||
          input.payload?.title ||
          "Agent creative draft",
      ),
      body: String(
        payload.caption ||
          input.payload?.message ||
          input.payload?.brief ||
          "Marketing creative drafted by Triada AI agents.",
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
        ? payload.with_video
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

/**
 * When an agent task describes creative work, execute the Anthropic → Higgsfield tool.
 * @param {{
 *   agent_key: string,
 *   title?: string,
 *   description?: string,
 *   tool?: string,
 *   execute?: boolean,
 *   dry_run?: boolean,
 *   payload?: Record<string, unknown>,
 * }} input
 */
export async function executeCreativeTaskIfNeeded(input) {
  const text = `${input.title || ""} ${input.description || ""}`.trim();
  const tool =
    inferCreativeTool({
      tool: input.tool,
      message: text,
      title: input.title,
      purpose: input.tool,
    }) || null;

  if (!tool) {
    return {
      ok: true,
      skipped: true,
      reason: "no_creative_intent",
      message: "Task stored — no creative media intent detected.",
    };
  }

  if (input.execute === false) {
    return {
      ok: true,
      skipped: true,
      reason: "execute_disabled",
      tool,
      message: `Creative tool ${tool} inferred but execute=false — task stored only.`,
    };
  }

  const result = await runCreativeTool({
    agent_key: input.agent_key,
    tool,
    dry_run: Boolean(input.dry_run),
    payload: {
      ...(input.payload && typeof input.payload === "object" ? input.payload : {}),
      caption: input.description || input.title,
      product: input.payload?.product || input.title,
      theme: input.payload?.theme || input.title,
    },
  });

  return {
    ...result,
    skipped: false,
    inferred_tool: tool,
  };
}
