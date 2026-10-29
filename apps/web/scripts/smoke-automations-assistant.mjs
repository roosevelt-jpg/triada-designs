/**
 * Smoke: Workflow Builder Assistant builds a full wired visual draft.
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-automations-assistant.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import {
  deleteWorkflow,
  getWorkflow,
  upsertWorkflow,
} from "@/lib/automations/automations-store.js";
import { buildWorkflowFromPrompt } from "@/lib/automations/workflow-assistant.js";

const built = await buildWorkflowFromPrompt({
  prompt:
    "When a WhatsApp customer abandons their cart, wait one day then remind them with a warm follow-up.",
});
if (!built.ok) throw new Error(`assistant failed: ${built.error}`);
const nodeCount = Object.keys(built.definition.nodes || {}).length;
if (nodeCount < 3) throw new Error(`assistant graph too small: ${nodeCount}`);
if (!built.definition.entry) throw new Error("missing entry");

// Ensure nodes are wired (at least one next pointer from entry)
const entry = built.definition.nodes[built.definition.entry];
if (!entry || entry.type !== "trigger") throw new Error("entry is not trigger");
if (!entry.next) throw new Error("trigger not wired to next step");

console.log("ok build", {
  name: built.name,
  nodes: nodeCount,
  trigger: built.trigger_type,
  mode: built.mode,
  entry: built.definition.entry,
  next: entry.next,
});

const saved = await upsertWorkflow({
  name: built.name,
  description: built.description,
  trigger_type: built.trigger_type,
  definition: built.definition,
  status: "draft",
  metadata: { built_by: "workflow_assistant", assistant_mode: built.mode },
});
if (!saved.workflow?.id) throw new Error("persist failed");
console.log("ok persist", { id: saved.workflow.id, mode: saved.mode });

const got = await getWorkflow(saved.workflow.id);
if (!got) throw new Error("get missing");
const del = await deleteWorkflow(saved.workflow.id);
if (!del.ok) throw new Error("delete failed");
console.log("ok cleanup");

console.log("smoke-automations-assistant: PASS");
