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
 * @param {Partial<WorkflowRecord> & Record<string, unknown>} input
 */
export function shapeWorkflow(input = {}) {
  const statusRaw = String(input.status || "draft").toLowerCase();
  const status =
    statusRaw === "active" || statusRaw === "inactive" ? statusRaw : "draft";
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
    definition:
      input.definition && typeof input.definition === "object"
        ? /** @type {Record<string, unknown>} */ (input.definition)
        : {},
    metadata:
      input.metadata && typeof input.metadata === "object"
        ? /** @type {Record<string, unknown>} */ (input.metadata)
        : {},
    created_at: String(input.created_at || nowIso()),
    updated_at: String(input.updated_at || nowIso()),
  };
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
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        const { error } = await supabase.from(TABLE).upsert({
          ...workflow,
          definition: workflow.definition,
          metadata: workflow.metadata,
        });
        if (!error) return { mode: "supabase", workflow, created };
      }
    } catch {
      /* fall through */
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
