/**
 * Seed roster for Triada multi-agent team.
 * Agents collaborate via shared memory/kv + team orchestration.
 */

import {
  CREATIVE_PROMPT_VERSION,
  creativeAgentSystemPrompt,
} from "../creative/jewellery-prompts";

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
      channels: ["instagram", "whatsapp", "facebook", "webchat", "email"],
      escalation: true,
      collaborates_with: ["escalation_officer", "quality_control", "compliance"],
      system_prompt:
        "You are AI Support for Triada Designs. Retrieve training docs for tone, timing, and open/close. Never invent prices or policies. Write shared memory notes for follow-up and escalation when needed.",
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
      prompt_version: CREATIVE_PROMPT_VERSION,
      system_prompt: creativeAgentSystemPrompt(),
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
      collaborates_with: ["ai_support", "marketing", "leads_qualification"],
      system_prompt:
        "One friendly reminder after a quiet day. Warm Triada tone. Never spam. Read shared context from Support and Leads before drafting.",
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
      system_prompt:
        "Campaign concepts for Meta/IG/TikTok/WhatsApp jewellery marketing. Prefer viral UGC angles Creative drafts — hooks first, soft CTAs, no fake urgency or fabricated social proof. Collaborate with Creative and QC via shared memory. Human approval required before anything goes live.",
      prompt_version: CREATIVE_PROMPT_VERSION,
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
      collaborates_with: ["ai_support", "content_creator", "marketing", "compliance"],
      system_prompt:
        "Flag invented prices, stock claims, off-brand tone, fake scarcity, and missing disclosures on Creative/Marketing UGC drafts. Write QC notes into shared memory.",
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
      collaborates_with: ["ai_support", "follow_up", "marketing", "escalation_officer"],
      system_prompt:
        "WhatsApp: business messages only to opted-in customers. No bulk unsolicited WhatsApp. Outreach needs easy opt-out and consent records.",
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
      system_prompt:
        "Score from explicit purchase/service signals only. Share lead context in shared memory for Follow up and Support.",
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
      collaborates_with: ["ai_support", "compliance", "leads_qualification"],
      system_prompt:
        "Prefer clear next actions and owners. Escalate wholesale, boutique, stylist, corporate gifting, custom quotes, and complaints. Never invent revenue or promises.",
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
  meta_messaging: "ai_support",
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
