/**
 * Seed roster for Triada multi-agent team.
 * Agents collaborate via shared memory/kv + team orchestration.
 */

import { TEAM_PROMPT_VERSION, systemPromptForRole } from "./role-prompts";

/** @typedef {{
 *   id: string,
 *   key: string,
 *   name: string,
 *   role: string,
 *   description: string,
 *   status: "active" | "paused",
 *   config: Record<string, unknown>,
 * }} SeedAgent
 */

/** @type {SeedAgent[]} */
export const TEAM_ROSTER = [
  {
    id: "agent-ai-support",
    key: "ai_support",
    name: "AI Support",
    role: "support",
    description:
      "Answers product, order, sizing, materials, and care questions from approved knowledge. Hands off when unsure.",
    status: "active",
    config: {
      channels: ["whatsapp", "webchat", "email", "telegram"],
      escalation: true,
      collaborates_with: [
        "social_media_manager",
        "escalation_officer",
        "quality_control",
        "compliance",
        "leads_qualification",
        "follow_up",
      ],
      prompt_version: TEAM_PROMPT_VERSION,
      system_prompt: systemPromptForRole("ai_support"),
    },
  },
  {
    id: "agent-social-media-manager",
    key: "social_media_manager",
    name: "Social Media Manager",
    role: "social_media_manager",
    description:
      "Owns Instagram, Messenger, Facebook, and LinkedIn DMs — replies so no inbound message is left unanswered.",
    status: "active",
    config: {
      channels: ["instagram", "messenger", "facebook", "linkedin"],
      owns_dms: true,
      no_unanswered_dms: true,
      escalation: true,
      collaborates_with: [
        "ai_support",
        "leads_qualification",
        "escalation_officer",
        "quality_control",
        "compliance",
        "follow_up",
      ],
      prompt_version: TEAM_PROMPT_VERSION,
      system_prompt: systemPromptForRole("social_media_manager"),
      allowed_tools: ["sweep_unanswered_dms", "draft_dm_reply", "handoff_escalation"],
    },
  },
  {
    id: "agent-creative",
    key: "content_creator",
    name: "Content creator / Creative",
    role: "creative",
    description:
      "Drafts viral UGC scripts, high-converting captions, creative briefs, and platform variants for Meta/IG/TikTok/WhatsApp. Human approval before publish.",
    status: "active",
    config: {
      channels: [
        "content_studio",
        "instagram",
        "tiktok",
        "facebook",
        "whatsapp",
        "linkedin",
      ],
      collaborates_with: ["marketing", "quality_control", "compliance"],
      prompt_version: TEAM_PROMPT_VERSION,
      system_prompt: systemPromptForRole("content_creator"),
      allowed_tools: [
        "propose_creative_brief",
        "generate_image",
        "generate_platform_variants",
        "generate_short_video",
        "generate_ugc_video",
        "generate_animation",
      ],
    },
  },
  {
    id: "agent-follow-up",
    key: "follow_up",
    name: "Follow up",
    role: "follow_up",
    description:
      "Friendly cart/sizing abandonment reminders and after-sale care sequences. Opt-in WhatsApp only.",
    status: "active",
    config: {
      channels: ["whatsapp", "email", "instagram"],
      collaborates_with: ["ai_support", "marketing", "leads_qualification", "compliance"],
      prompt_version: TEAM_PROMPT_VERSION,
      system_prompt: systemPromptForRole("follow_up"),
    },
  },
  {
    id: "agent-marketing",
    key: "marketing",
    name: "Marketing",
    role: "marketing",
    description:
      "Campaign concepts, channel-ready copy, and calendar proposals for human approval.",
    status: "active",
    config: {
      channels: ["content_studio", "campaigns", "calendar"],
      collaborates_with: ["content_creator", "quality_control", "compliance"],
      prompt_version: TEAM_PROMPT_VERSION,
      system_prompt: systemPromptForRole("marketing"),
    },
  },
  {
    id: "agent-quality-control",
    key: "quality_control",
    name: "Quality Control",
    role: "quality_control",
    description:
      "Reviews drafts for accuracy, brand voice, catalog facts, and policy alignment before send/publish.",
    status: "active",
    config: {
      channels: ["internal"],
      collaborates_with: ["ai_support", "content_creator", "marketing", "compliance", "follow_up"],
      prompt_version: TEAM_PROMPT_VERSION,
      system_prompt: systemPromptForRole("quality_control"),
    },
  },
  {
    id: "agent-compliance",
    key: "compliance",
    name: "Compliance",
    role: "compliance",
    description:
      "Checks WhatsApp opt-in, consent, outreach rules, and disclosure requirements.",
    status: "active",
    config: {
      channels: ["internal", "whatsapp", "email", "linkedin"],
      collaborates_with: ["ai_support", "follow_up", "marketing", "escalation_officer", "quality_control"],
      prompt_version: TEAM_PROMPT_VERSION,
      system_prompt: systemPromptForRole("compliance"),
    },
  },
  {
    id: "agent-leads-qualification",
    key: "leads_qualification",
    name: "Leads Qualification",
    role: "lead_qualification",
    description:
      "Scores inbound intent, updates CRM lead stage, and routes hot leads to humans or Escalation.",
    status: "active",
    config: {
      channels: ["webchat", "facebook", "instagram", "whatsapp", "telegram", "email"],
      create_leads: true,
      collaborates_with: ["ai_support", "follow_up", "escalation_officer"],
      prompt_version: TEAM_PROMPT_VERSION,
      system_prompt: systemPromptForRole("leads_qualification"),
    },
  },
  {
    id: "agent-escalation-officer",
    key: "escalation_officer",
    name: "Escalation officer",
    role: "escalation",
    description:
      "Handles complaints, custom quotes, wholesale/B2B, and anything Support cannot verify. Prepares human handoff.",
    status: "active",
    config: {
      channels: ["internal", "telegram", "email", "whatsapp"],
      collaborates_with: ["ai_support", "compliance", "leads_qualification", "quality_control"],
      prompt_version: TEAM_PROMPT_VERSION,
      system_prompt: systemPromptForRole("escalation_officer"),
    },
  },
];

/** Alias keys so legacy callers (answer_bot, gift_finder, etc.) resolve to the team. */
export const AGENT_KEY_ALIASES = {
  support: "ai_support",
  answer_bot: "ai_support",
  "agent-answer": "ai_support",
  gift_finder: "ai_support",
  creative_media: "content_creator",
  content: "content_creator",
  sales: "leads_qualification",
  lead_qualification: "leads_qualification",
  sales_ops: "follow_up",
  meta_messaging: "social_media_manager",
  social: "social_media_manager",
  dm_manager: "social_media_manager",
  inbox_dms: "social_media_manager",
};

/**
 * @param {string} keyOrId
 * @param {SeedAgent[]} agents
 */
export function resolveAgent(keyOrId, agents) {
  const needle = String(keyOrId || "").trim();
  if (!needle) return agents[0] || null;
  const aliased = AGENT_KEY_ALIASES[needle] || needle;
  return (
    agents.find(
      (a) =>
        a.id === needle ||
        a.key === needle ||
        a.id === aliased ||
        a.key === aliased ||
        a.name === needle,
    ) ||
    agents[0] ||
    null
  );
}

export { TEAM_PROMPT_VERSION };
