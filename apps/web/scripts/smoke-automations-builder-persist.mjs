/**
 * Smoke: blank New workflow persist + activate round-trip, and DB row shape.
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-automations-builder-persist.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import { addNode } from "@/lib/workflow-definition.js";
import {
  deleteWorkflow,
  getWorkflow,
  shapeWorkflow,
  toAutomationsDbRow,
  upsertWorkflow,
} from "@/lib/automations/automations-store.js";

const DB_KEYS = new Set([
  "id",
  "workspace_id",
  "name",
  "status",
  "trigger_type",
  "description",
  "definition",
  "metadata",
  "created_at",
  "updated_at",
]);

function blankStarter(triggerType = "incoming_message") {
  const { definition, key } = addNode(
    { entry: "", nodes: {}, layout: {} },
    { type: "trigger", label: "Start", x: 48, y: 48 },
  );
  if (definition.nodes[key]) {
    definition.nodes[key] = {
      ...definition.nodes[key],
      config: { trigger_type: triggerType },
    };
  }
  return definition;
}

const shaped = shapeWorkflow({
  name: "Blank canvas smoke",
  description: "persist check",
  trigger_type: "incoming_message",
  status: "draft",
  definition: blankStarter(),
  version: 1,
  run_count: 0,
  activated_at: null,
});
const row = toAutomationsDbRow(shaped);
for (const key of Object.keys(row)) {
  if (!DB_KEYS.has(key)) {
    throw new Error(`db row leaked non-column field: ${key}`);
  }
}
for (const key of ["version", "run_count", "node_summary", "node_count", "activated_at"]) {
  if (Object.prototype.hasOwnProperty.call(row, key)) {
    throw new Error(`db row must not include ${key} at top level`);
  }
}
if (row.metadata?.version !== 1) throw new Error("version should round-trip in metadata");
console.log("ok db-row-shape", { keys: Object.keys(row).sort() });

const saved = await upsertWorkflow({
  name: "Blank canvas smoke",
  description: "New workflow → canvas → Publish path",
  trigger_type: "incoming_message",
  status: "draft",
  definition: blankStarter(),
  version: 1,
  run_count: 0,
});
if (!saved.workflow?.id) throw new Error("persist failed");
console.log("ok blank-persist", { id: saved.workflow.id, mode: saved.mode });

const got = await getWorkflow(saved.workflow.id);
if (!got) throw new Error("get missing after create — not-found regression");
if (!got.definition?.entry) throw new Error("starter trigger missing");

const published = await upsertWorkflow({
  ...got,
  status: "active",
  activated_at: new Date().toISOString(),
});
if (published.workflow.status !== "active") {
  throw new Error(`publish status expected active, got ${published.workflow.status}`);
}
const gotLive = await getWorkflow(saved.workflow.id);
if (!gotLive || gotLive.status !== "active") {
  throw new Error("get after publish missing or not active");
}
console.log("ok publish", { id: gotLive.id, status: gotLive.status });

const del = await deleteWorkflow(saved.workflow.id);
if (!del.ok) throw new Error("delete failed");
console.log("ok cleanup");

console.log("smoke-automations-builder-persist: PASS");
