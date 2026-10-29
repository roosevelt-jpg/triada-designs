/**
 * Human-readable capabilities for each seeded AI agent.
 * Used by the Agents page detail view (and kept in sync with team-roster descriptions).
 */

/** @type {Record<string, string[]>} */
export const AGENT_FEATURES_BY_KEY = {
  ai_support: [
    "Answers product, order, sizing, materials, and care questions from approved knowledge",
    "Handles WhatsApp, webchat, email, Telegram, LinkedIn, TikTok, and Meta DMs",
    "Hands off when unsure — never invents prices, stock, or policy",
    "Escalates complaints, custom quotes, and wholesale to Escalation",
    "Routes purchase intent to Leads and quiet threads to Follow up",
    "Hands Instagram / Messenger / Facebook / LinkedIn DMs to Social Media Manager",
    "Retrieves Training Docs for tone, timing, and open/close",
    "Replies in the customer’s language (including AR, RO, DE, FR, RU, ES, PT)",
  ],
  social_media_manager: [
    "Owns Instagram, Messenger, Facebook, and LinkedIn DMs end-to-end",
    "Sweeps unanswered social DMs so no inbound message is left waiting",
    "Drafts warm, on-brand DM replies grounded in Training Docs",
    "Hands off complaints, custom quotes, and unverifiable claims to Escalation",
    "Routes clear purchase intent to Leads Qualification",
    "Collaborates with Support, QC, and Compliance on sensitive threads",
    "Keeps Triada tone calm and refined across social channels",
    "Matches the customer’s language on every reply",
  ],
  content_creator: [
    "Drafts viral UGC scripts and high-converting captions",
    "Writes creative briefs and platform variants for Meta, IG, TikTok, WhatsApp, LinkedIn",
    "Produces image, short video, UGC, and animation creatives for review",
    "Auto-resizes media for each publishing channel",
    "Requires human approval before anything goes live",
    "Collaborates with Marketing, Quality Control, and Compliance",
    "Stays grounded in brand niche and approved catalog facts",
  ],
  follow_up: [
    "Sends friendly cart and sizing abandonment reminders",
    "Runs after-sale care sequences on opt-in WhatsApp",
    "Works WhatsApp, email, and Instagram follow-up channels",
    "Respects consent and compliance rules before every send",
    "Collaborates with Support, Marketing, Leads, and Compliance",
    "Uses Training Docs for timing and conversation close",
  ],
  marketing: [
    "Shapes campaign concepts and channel-ready copy",
    "Proposes calendar placements for human approval",
    "Coordinates Content Studio, Campaigns, and Calendar",
    "Partners with Creative for assets and with QC/Compliance for review",
    "Keeps offers factual — no invented discounts or claims",
  ],
  quality_control: [
    "Reviews drafts for accuracy and brand voice",
    "Checks catalog facts before send or publish",
    "Flags policy misalignment for Compliance",
    "Collaborates across Support, Creative, Marketing, Compliance, and Follow up",
    "Blocks off-brand or fabricated copy from going out",
  ],
  compliance: [
    "Checks WhatsApp opt-in and consent before outreach",
    "Enforces disclosure and outreach rules",
    "Reviews policy-sensitive replies across WhatsApp, email, and LinkedIn",
    "Partners with Support, Follow up, Marketing, Escalation, and QC",
    "Stops non-compliant broadcasts and sequences",
  ],
  leads_qualification: [
    "Scores inbound intent across webchat, Meta, WhatsApp, Telegram, and email",
    "Updates CRM lead stage for the team",
    "Routes hot leads to humans or Escalation",
    "Creates lead records when purchase or service intent is clear",
    "Collaborates with Support, Follow up, and Escalation",
  ],
  escalation_officer: [
    "Handles complaints and sensitive customer issues",
    "Collects custom quote and boutique / wholesale / B2B details",
    "Prepares clean human handoff packages",
    "Works internal, Telegram, email, and WhatsApp escalation paths",
    "Collaborates with Support, Compliance, Leads, and QC",
  ],
};

/**
 * Resolve seeded feature bullets for an agent (by key / id / role aliases).
 * @param {{ key?: string, id?: string, role?: string, features?: string[] } | null | undefined} agent
 * @returns {string[]}
 */
export function featuresForAgent(agent) {
  if (!agent) return [];
  if (Array.isArray(agent.features) && agent.features.length) {
    return agent.features.map(String);
  }
  const key = String(agent.key || "").trim();
  if (key && AGENT_FEATURES_BY_KEY[key]) return [...AGENT_FEATURES_BY_KEY[key]];
  const id = String(agent.id || "").replace(/^agent-/, "").replace(/-/g, "_");
  if (id && AGENT_FEATURES_BY_KEY[id]) return [...AGENT_FEATURES_BY_KEY[id]];
  return [];
}

/**
 * Build the full capability sections shown in the agent detail view.
 * Includes card-described features plus channels, tools, peers, and flags.
 * @param {{
 *   name?: string,
 *   role?: string,
 *   description?: string,
 *   status?: string,
 *   key?: string,
 *   features?: string[],
 *   config?: Record<string, unknown>,
 * } | null | undefined} agent
 */
export function getAgentCapabilitySections(agent) {
  if (!agent) {
    return {
      features: [],
      channels: [],
      tools: [],
      peers: [],
      flags: [],
    };
  }

  const config = agent.config || {};
  const channels = Array.isArray(config.channels)
    ? config.channels.map(String)
    : [];
  const tools = Array.isArray(config.allowed_tools)
    ? config.allowed_tools.map(String)
    : [];
  const peers = Array.isArray(config.collaborates_with)
    ? config.collaborates_with.map(String)
    : [];

  /** @type {string[]} */
  const flags = [];
  if (config.escalation) flags.push("Can escalate sensitive threads");
  if (config.owns_dms) flags.push("Owns social DM inboxes");
  if (config.no_unanswered_dms) flags.push("Sweeps unanswered DMs");
  if (config.create_leads) flags.push("Creates and stages CRM leads");

  return {
    features: featuresForAgent(agent),
    channels,
    tools,
    peers,
    flags,
  };
}
