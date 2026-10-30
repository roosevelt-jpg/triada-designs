/**
 * Durable automations / workflows store.
 * Empty by default — admin create/edit/delete. No seed workflows as Production SoT.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { getLocalDataDir } from "@/lib/local-data-dir";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TABLE = "automations";
const WORKSPACE_ID = "triada-ops";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "automations.json");
const RUNS_FILE = path.join(LOCAL_DIR, "automation-runs.json");

/**
 * @typedef {{
 *   id: string,
 *   workspace_id: string,
 *   name: string,
 *   status: string,
 *   trigger_type: string | null,
 *   description: string,
 *   definition: Record<string, unknown>,
 *   metadata: Record<string, unknown>,
 *   created_at: string,
 *   updated_at: string,
 * }} WorkflowRecord
 */

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Columns that exist on public.automations (see live_catalogs migration).
 * API-facing fields like version / run_count / activated_at / node_* live in
 * metadata so PostgREST upserts do not reject unknown columns and silently
 * fall through to ephemeral /tmp local_mock on Vercel.
 */
const DB_COLUMNS = new Set([
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

/**
 * @param {Partial<WorkflowRecord> & Record<string, unknown>} input
 */
export function shapeWorkflow(input = {}) {
  const statusRaw = String(input.status || "draft").toLowerCase();
  // UI + activate/deactivate use active | disabled | draft.
  // Map legacy "inactive" → disabled so Offline badge stays correct.
  let status = "draft";
  if (statusRaw === "active") status = "active";
  else if (statusRaw === "disabled" || statusRaw === "inactive") status = "disabled";
  else if (statusRaw === "draft") status = "draft";

  const definition =
    input.definition && typeof input.definition === "object"
      ? /** @type {Record<string, unknown>} */ (input.definition)
      : {};
  const nodes =
    definition.nodes && typeof definition.nodes === "object"
      ? Object.keys(/** @type {Record<string, unknown>} */ (definition.nodes))
      : [];

  const metadata =
    input.metadata && typeof input.metadata === "object"
      ? /** @type {Record<string, unknown>} */ ({ ...input.metadata })
      : {};

  const version = Math.max(
    1,
    Number(input.version ?? metadata.version) || 1,
  );
  const runCount = Math.max(
    0,
    Number(input.run_count ?? metadata.run_count) || 0,
  );
  const activatedAt = input.activated_at
    ? String(input.activated_at)
    : metadata.activated_at
      ? String(metadata.activated_at)
      : null;

  // Keep durable extras inside metadata for round-trips through Supabase.
  metadata.version = version;
  metadata.run_count = runCount;
  metadata.activated_at = activatedAt;
  if (!Array.isArray(metadata.node_summary)) {
    metadata.node_summary = nodes;
  }

  return {
    id: String(input.id || newId()),
    workspace_id: String(input.workspace_id || WORKSPACE_ID),
    name: String(input.name || "").trim() || "Untitled workflow",
    status,
    trigger_type:
      input.trigger_type != null && String(input.trigger_type).trim()
        ? String(input.trigger_type).trim()
        : null,
    description: String(input.description || "").trim(),
    definition,
    metadata,
    version,
    run_count: runCount,
    node_summary: nodes,
    node_count: nodes.length,
    activated_at: activatedAt,
    created_at: String(input.created_at || nowIso()),
    updated_at: String(input.updated_at || nowIso()),
  };
}

/**
 * Strip API-only fields so upsert matches the automations table schema.
 * @param {ReturnType<typeof shapeWorkflow>} workflow
 */
export function toAutomationsDbRow(workflow) {
  const row = {
    id: workflow.id,
    workspace_id: workflow.workspace_id || WORKSPACE_ID,
    name: workflow.name,
    status: workflow.status,
    trigger_type: workflow.trigger_type,
    description: workflow.description || "",
    definition: workflow.definition || {},
    metadata: {
      ...(workflow.metadata && typeof workflow.metadata === "object"
        ? workflow.metadata
        : {}),
      version: workflow.version ?? 1,
      run_count: workflow.run_count ?? 0,
      activated_at: workflow.activated_at || null,
      node_summary: Array.isArray(workflow.node_summary)
        ? workflow.node_summary
        : [],
    },
    created_at: workflow.created_at || nowIso(),
    updated_at: workflow.updated_at || nowIso(),
  };
  for (const key of Object.keys(row)) {
    if (!DB_COLUMNS.has(key)) delete row[key];
  }
  return row;
}

async function readLocal() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(shapeWorkflow);
  } catch {
    return [];
  }
}

async function writeLocal(rows) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(rows, null, 2), "utf8");
}

async function readRuns() {
  try {
    const raw = await readFile(RUNS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRuns(rows) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(RUNS_FILE, JSON.stringify(rows, null, 2), "utf8");
}

export async function listWorkflows() {
  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from(TABLE)
          .select("*")
          .eq("workspace_id", WORKSPACE_ID)
          .order("updated_at", { ascending: false });
        if (!error && Array.isArray(data)) {
          return { mode: "supabase", data: data.map(shapeWorkflow) };
        }
      }
    } catch {
      /* fall through */
    }
  }
  return { mode: "local_mock", data: await readLocal() };
}

export async function getWorkflow(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from(TABLE)
          .select("*")
          .eq("workspace_id", WORKSPACE_ID)
          .eq("id", key)
          .maybeSingle();
        if (!error && data) return shapeWorkflow(data);
        if (!error && !data) return null;
      }
    } catch {
      /* fall through */
    }
  }
  const rows = await readLocal();
  return rows.find((w) => w.id === key) || null;
}

export async function upsertWorkflow(input) {
  const id = input.id ? String(input.id) : null;
  let previous = null;
  if (id) previous = await getWorkflow(id);
  const created = !previous;
  const workflow = shapeWorkflow({
    ...(previous || {}),
    ...input,
    id: previous?.id || id || newId(),
    created_at: previous?.created_at || nowIso(),
    updated_at: nowIso(),
  });

  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      const row = toAutomationsDbRow(workflow);
      const { error } = await supabase.from(TABLE).upsert(row, {
        onConflict: "id",
      });
      if (error) {
        const err = new Error(
          error.message || "Failed to persist workflow to durable store.",
        );
        err.code = "automations_persist_failed";
        err.status = 502;
        throw err;
      }
      return { mode: "supabase", workflow, created };
    }
  }

  const rows = await readLocal();
  const idx = rows.findIndex((w) => w.id === workflow.id);
  if (idx < 0) rows.unshift(workflow);
  else rows[idx] = { ...workflow, created_at: rows[idx].created_at };
  await writeLocal(rows);
  return {
    mode: "local_mock",
    workflow: idx >= 0 ? rows[idx] : workflow,
    created: idx < 0,
  };
}

export async function deleteWorkflow(id) {
  const key = String(id || "").trim();
  if (!key) return { ok: false, message: "Missing id" };

  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        const { error } = await supabase
          .from(TABLE)
          .delete()
          .eq("workspace_id", WORKSPACE_ID)
          .eq("id", key);
        if (!error) return { ok: true, mode: "supabase" };
      }
    } catch {
      /* fall through */
    }
  }

  const rows = await readLocal();
  const next = rows.filter((w) => w.id !== key);
  if (next.length === rows.length) return { ok: false, message: "Workflow not found" };
  await writeLocal(next);
  return { ok: true, mode: "local_mock" };
}

/**
 * Append a real run (never invent seed "live" history).
 * @param {Record<string, unknown>} run
 */
export async function appendAutomationRun(run) {
  const row = {
    id: String(run.id || `run-${Date.now()}`),
    workflow_id: String(run.workflow_id || ""),
    status: String(run.status || "completed"),
    mode: String(run.mode || "dry_run"),
    steps: Array.isArray(run.steps) ? run.steps : [],
    started_at: String(run.started_at || nowIso()),
    finished_at: String(run.finished_at || nowIso()),
  };
  const runs = await readRuns();
  runs.unshift(row);
  await writeRuns(runs.slice(0, 200));
  return row;
}

export async function listAutomationRuns(workflowId) {
  const runs = await readRuns();
  const key = String(workflowId || "").trim();
  return {
    data: key ? runs.filter((r) => r.workflow_id === key) : runs,
  };
}

export async function getAutomationRun(workflowId, runId) {
  const { data } = await listAutomationRuns(workflowId);
  return data.find((r) => r.id === runId) || null;
}
