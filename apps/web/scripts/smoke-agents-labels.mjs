/**
 * Smoke: Agents admin UI helpers never echo snake_case / JSON / shared-memory keys.
 */
import assert from "node:assert/strict";
import {
  activityMetaLabel,
  activityRunLabel,
  agentChannelLabel,
  agentDisplayName,
  agentRoleLabel,
  agentStatusLabel,
  agentToolLabel,
  memoryKeyLabel,
  memoryValueLabel,
  runModeLabel,
  taskPriorityLabel,
} from "../src/lib/agents/labels.js";

assert.equal(agentDisplayName("ai_support"), "AI Support");
assert.equal(agentDisplayName("social_media_manager"), "Social Media Manager");
assert.equal(agentDisplayName("quality_control"), "Quality Control");
assert.equal(agentDisplayName("system"), "System");
assert.equal(agentRoleLabel("social_media_manager"), "Social Media Manager");
assert.equal(agentRoleLabel("lead_qualification"), "Leads Qualification");
assert.equal(agentStatusLabel("paused"), "Paused");
assert.equal(agentStatusLabel("completed"), "Completed");
assert.equal(taskPriorityLabel("urgent"), "Urgent");
assert.equal(agentChannelLabel("webchat"), "Web chat");
assert.equal(agentChannelLabel("content_studio"), "Content Studio");
assert.equal(agentChannelLabel("whatsapp"), "WhatsApp");
assert.equal(agentToolLabel("sweep_unanswered_dms"), "Sweep unanswered DMs");
assert.equal(agentToolLabel("generate_ugc_video"), "Generate UGC video");
assert.equal(memoryKeyLabel("workspace.brand"), "Brand");
assert.equal(memoryKeyLabel("collab.active_thread"), "Active thread");
assert.equal(memoryKeyLabel("collab.last_handoff"), "Last handoff");
assert.equal(runModeLabel("local_sim"), "Local");
assert.equal(runModeLabel("dry_run"), "Preview");
assert.equal(
  memoryValueLabel({
    name: "Triada Designs",
    materials: "silver with gold plating",
    make_time_days: 7,
  }),
  "Triada Designs · silver with gold plating · 7-day make time",
);
assert.equal(
  memoryValueLabel({
    summary: "Team ready — agents share this context.",
    agents: ["ai_support", "follow_up"],
  }),
  "Team ready — agents share this context.",
);
assert.equal(memoryValueLabel(["ai_support", "marketing"]), "AI Support · Marketing");
assert.equal(
  activityRunLabel({ agent_key: "ai_support", purpose: "draft_reply" }),
  "AI Support · Draft reply",
);
assert.equal(
  activityMetaLabel({ provider: "anthropic", channel: "whatsapp" }),
  "Claude · WhatsApp",
);

for (const sample of [
  agentDisplayName("escalation_officer"),
  agentRoleLabel("quality_control"),
  agentStatusLabel("pending_approval"),
  agentChannelLabel("content_studio"),
  agentToolLabel("handoff_escalation"),
  memoryKeyLabel("collab.last_handoff"),
  runModeLabel("local_sim"),
  activityRunLabel({ agent_key: "leads_qualification", purpose: "qualify_lead" }),
]) {
  assert.equal(sample.includes("_"), false, `label leaked underscore: ${sample}`);
  assert.equal(sample.includes("{"), false, `label leaked JSON: ${sample}`);
}

const objectDump = memoryValueLabel({ foo_bar: 1, nested: { a: 1 } });
assert.equal(objectDump.includes("{"), false, `memory dump leaked braces: ${objectDump}`);
assert.equal(objectDump.includes("_"), false, `memory dump leaked underscore: ${objectDump}`);

console.log("smoke-agents-labels: pass");
