/**
 * Human-readable labels for the AI Agents admin UI.
 * Technical keys (snake_case / shared-memory paths) stay under the hood.
 *
 * Keep this module free of team-roster / role-prompt imports so the Agents
 * page bundle does not ship internal prompt plumbing to the browser.
 */

import { platformLabel } from "@/lib/templates/labels";
import { providerNickname } from "@/lib/integrations/brand-labels";

/** @type {Record<string, string>} */
const AGENT_KEY_LABELS = {
  ai_support: "AI Support",
  social_media_manager: "Social Media Manager",
  content_creator: "Content creator / Creative",
  follow_up: "Follow up",
  marketing: "Marketing",
  quality_control: "Quality Control",
  compliance: "Compliance",
  leads_qualification: "Leads Qualification",
  escalation_officer: "Escalation officer",
};

/** @type {Record<string, string>} */
const ROLE_LABELS = {
  support: "Support",
  custom: "Custom",
  social_media_manager: "Social Media Manager",
  creative: "Creative",
  follow_up: "Follow up",
  marketing: "Marketing",
  quality_control: "Quality Control",
  compliance: "Compliance",
  lead_qualification: "Leads Qualification",
  leads_qualification: "Leads Qualification",
  escalation: "Escalation",
  escalation_officer: "Escalation",
};

/** @type {Record<string, string>} */
const STATUS_LABELS = {
  active: "Active",
  paused: "Paused",
  open: "Open",
  done: "Done",
  completed: "Completed",
  running: "Running",
  failed: "Failed",
  cancelled: "Cancelled",
  canceled: "Cancelled",
};

/** @type {Record<string, string>} */
const PRIORITY_LABELS = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

/** @type {Record<string, string>} */
const PURPOSE_LABELS = {
  draft_reply: "Draft reply",
  collaborate: "Team collaboration",
  test_run: "Test run",
  handoff: "Handoff",
  review: "Review",
  qualify_lead: "Qualify lead",
  escalate: "Escalation",
  follow_up: "Follow up",
  creative_brief: "Creative brief",
};

/** @type {Record<string, string>} */
const CHANNEL_LABELS = {
  content_studio: "Content Studio",
  campaigns: "Campaigns",
  calendar: "Calendar",
  internal: "Internal",
  messenger: "Messenger",
  webchat: "Web chat",
};

/** @type {Record<string, string>} */
const TOOL_LABELS = {
  sweep_unanswered_dms: "Sweep unanswered DMs",
  draft_dm_reply: "Draft DM reply",
  handoff_escalation: "Handoff to Escalation",
  propose_creative_brief: "Propose creative brief",
  generate_image: "Generate image",
  generate_platform_variants: "Generate platform variants",
  generate_short_video: "Generate short video",
  generate_ugc_video: "Generate UGC video",
  generate_animation: "Generate animation",
  ensure_creative_pack: "Ensure creative pack",
  generate_quote_inspiration: "Generate quote inspiration",
};

/** @type {Record<string, string>} */
const MODE_LABELS = {
  live: "Live",
  local: "Local",
  local_sim: "Local",
  local_seed: "Local",
  collaborate: "Team",
  solo: "Solo",
  dry_run: "Preview",
};

/**
 * Title-case a machine key without echoing underscores.
 * @param {unknown} value
 */
export function humanizeKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw
    .replace(/[._/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * @param {unknown} value
 * @param {Record<string, string>} map
 * @param {string} [fallback]
 */
function fromMap(value, map, fallback = "") {
  const key = String(value || "").trim();
  if (!key) return fallback;
  if (map[key]) return map[key];
  const lower = key.toLowerCase();
  if (map[lower]) return map[lower];
  if (/[._-]/.test(key)) return humanizeKey(key);
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * @param {unknown} keyOrId
 * @param {{ key?: string, id?: string, name?: string }[] } [agents]
 */
export function agentDisplayName(keyOrId, agents = []) {
  const needle = String(keyOrId || "").trim();
  if (!needle) return "System";
  if (needle === "system") return "System";
  const fromList = agents.find(
    (a) => a.key === needle || a.id === needle || a.name === needle,
  );
  if (fromList?.name) return fromList.name;
  if (AGENT_KEY_LABELS[needle]) return AGENT_KEY_LABELS[needle];
  const withoutPrefix = needle.replace(/^agent-/, "").replace(/-/g, "_");
  if (AGENT_KEY_LABELS[withoutPrefix]) return AGENT_KEY_LABELS[withoutPrefix];
  return humanizeKey(needle);
}

/** @param {unknown} role */
export function agentRoleLabel(role) {
  return fromMap(role, ROLE_LABELS, "Custom");
}

/** @param {unknown} status */
export function agentStatusLabel(status) {
  return fromMap(status, STATUS_LABELS, "Active");
}

/** @param {unknown} priority */
export function taskPriorityLabel(priority) {
  return fromMap(priority, PRIORITY_LABELS, "Normal");
}

/** @param {unknown} purpose */
export function activityPurposeLabel(purpose) {
  return fromMap(purpose, PURPOSE_LABELS, "Activity");
}

/** @param {unknown} channel */
export function agentChannelLabel(channel) {
  const key = String(channel || "")
    .trim()
    .toLowerCase();
  if (!key) return "";
  if (CHANNEL_LABELS[key]) return CHANNEL_LABELS[key];
  return platformLabel(key);
}

/** @param {unknown} tool */
export function agentToolLabel(tool) {
  return fromMap(tool, TOOL_LABELS);
}

/**
 * Admin label for a team-context note key.
 * Matched by shape (no dotted/snake path literals in the client bundle).
 * @param {unknown} key
 */
export function memoryKeyLabel(key) {
  const raw = String(key || "").trim();
  if (!raw) return "Note";
  const lower = raw.toLowerCase();
  if (lower.includes("brand") && lower.includes("workspace")) return "Brand";
  if (lower.includes("active") && lower.includes("thread")) return "Active thread";
  if (lower.includes("last") && lower.includes("handoff")) return "Last handoff";
  return humanizeKey(raw);
}

/** @param {unknown} mode */
export function runModeLabel(mode) {
  const key = String(mode || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  if (MODE_LABELS[key]) return MODE_LABELS[key];
  if (key.includes("_")) return null;
  return humanizeKey(key);
}

/**
 * Turn a shared-memory value into short admin-facing copy (never JSON).
 * @param {unknown} value
 */
export function memoryValueLabel(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (!value.length) return "—";
    if (value.every((item) => typeof item === "string" || typeof item === "number")) {
      return value.map((item) => agentDisplayName(item)).join(" · ");
    }
    return `${value.length} items`;
  }
  if (typeof value === "object") {
    const row = /** @type {Record<string, unknown>} */ (value);
    if (typeof row.summary === "string" && row.summary.trim()) return row.summary.trim();
    if (typeof row.name === "string" && row.name.trim()) {
      const parts = [row.name.trim()];
      if (typeof row.materials === "string" && row.materials.trim()) {
        parts.push(row.materials.trim());
      }
      if (row.make_time_days != null) {
        parts.push(`${row.make_time_days}-day make time`);
      }
      return parts.join(" · ");
    }
    if (typeof row.title === "string" && row.title.trim()) return row.title.trim();
    if (typeof row.text === "string" && row.text.trim()) return row.text.trim();
    if (typeof row.message === "string" && row.message.trim()) return row.message.trim();
    const keys = Object.keys(row);
    if (!keys.length) return "—";
    return keys
      .slice(0, 4)
      .map((k) => {
        const v = row[k];
        if (v == null || typeof v === "object") return humanizeKey(k);
        return `${humanizeKey(k)}: ${String(v)}`;
      })
      .join(" · ");
  }
  return "—";
}

/**
 * Soft activity line — agent name · purpose (no snake_case).
 * @param {{ agent_key?: string, agent?: string, agent_name?: string, purpose?: string, event?: string }} run
 * @param {{ key?: string, id?: string, name?: string }[] } [agents]
 */
export function activityRunLabel(run, agents = []) {
  const who =
    run?.agent_name ||
    agentDisplayName(run?.agent_key || run?.agent || "", agents);
  const what = activityPurposeLabel(run?.purpose || run?.event || "Activity");
  return `${who} · ${what}`;
}

/**
 * Soft provider/channel footer for activity rows.
 * @param {{ provider?: string, channel?: string }} run
 */
export function activityMetaLabel(run) {
  const parts = [];
  if (run?.provider) parts.push(providerNickname(run.provider));
  if (run?.channel) parts.push(agentChannelLabel(run.channel));
  return parts.filter(Boolean).join(" · ");
}

/** Role options for the create-agent form (value stays technical for API). */
export const AGENT_ROLE_OPTIONS = [
  { value: "support", label: "Support" },
  { value: "social_media_manager", label: "Social Media Manager" },
  { value: "creative", label: "Creative" },
  { value: "follow_up", label: "Follow up" },
  { value: "marketing", label: "Marketing" },
  { value: "quality_control", label: "Quality Control" },
  { value: "compliance", label: "Compliance" },
  { value: "lead_qualification", label: "Leads Qualification" },
  { value: "escalation", label: "Escalation" },
  { value: "custom", label: "Custom" },
];
