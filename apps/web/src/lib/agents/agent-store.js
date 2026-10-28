/**
 * Persistent AI agents + admin-assigned tasks.
 * Seeds the multi-agent team; admin can create agents and assign work.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { getLocalDataDir } from "@/lib/local-data-dir";
import { TEAM_ROSTER, resolveAgent } from "./team-roster";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const AGENTS_TABLE = "ai_agents";
const TASKS_TABLE = "ai_agent_tasks";
const WORKSPACE_ID = "triada-ops";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "ai-agents.json");

/**
 * @typedef {{
 *   id: string,
 *   key: string,
 *   workspace_id: string,
 *   name: string,
 *   role: string,
 *   description: string,
 *   status: "active" | "paused",
 *   config: Record<string, unknown>,
 *   created_at: string,
 *   updated_at: string,
 * }} AgentRecord
 *
 * @typedef {{
 *   id: string,
 *   workspace_id: string,
 *   agent_id: string,
 *   agent_key: string,
 *   title: string,
 *   description: string,
 *   status: "open" | "in_progress" | "done" | "cancelled",
 *   priority: "low" | "normal" | "high" | "urgent",
 *   context_keys: string[],
 *   created_by: string,
 *   created_at: string,
 *   updated_at: string,
 * }} AgentTask
 */

function nowIso() {
  return new Date().toISOString();
}

function newAgentId() {
  return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function newTaskId() {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function slugKey(name) {
  return String(name || "agent")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48) || "agent";
}

/**
 * Push newer roster system prompts onto seeded agents (by key) when
 * prompt_version advances — preserves admin custom agents.
 * @param {AgentRecord[]} agents
 * @returns {{ agents: AgentRecord[], changed: boolean }}
 */
function applyRosterPromptUpdates(agents) {
  let changed = false;
  const next = agents.map((agent) => {
    const roster = TEAM_ROSTER.find((r) => r.key === agent.key || r.id === agent.id);
    if (!roster) return agent;
    const rosterVersion = Number(roster.config?.prompt_version || 0);
    if (!rosterVersion) return agent;
    const currentVersion = Number(agent.config?.prompt_version || 0);
    if (currentVersion >= rosterVersion) return agent;
    changed = true;
    return {
      ...agent,
      description: roster.description || agent.description,
      config: {
        ...(agent.config || {}),
        ...(roster.config || {}),
        prompt_version: rosterVersion,
        system_prompt: roster.config?.system_prompt,
        channels: roster.config?.channels || agent.config?.channels,
        collaborates_with:
          roster.config?.collaborates_with || agent.config?.collaborates_with,
        allowed_tools: roster.config?.allowed_tools || agent.config?.allowed_tools,
      },
      updated_at: nowIso(),
    };
  });
  return { agents: next, changed };
}

/** @returns {AgentRecord[]} */
export function seedAgents() {
  const at = nowIso();
  return TEAM_ROSTER.map((row) => ({
    ...row,
    workspace_id: WORKSPACE_ID,
    created_at: at,
    updated_at: at,
  }));
}

/** @returns {Promise<{ agents: AgentRecord[], tasks: AgentTask[] }>} */
async function readLocal() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      agents: Array.isArray(parsed?.agents) ? parsed.agents : [],
      tasks: Array.isArray(parsed?.tasks) ? parsed.tasks : [],
    };
  } catch {
    return { agents: [], tasks: [] };
  }
}

/** @param {{ agents: AgentRecord[], tasks: AgentTask[] }} state */
async function writeLocal(state) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(state, null, 2), "utf8");
}

async function ensureLocalSeeded() {
  const state = await readLocal();
  if (state.agents.length > 0) return state;
  const next = { agents: seedAgents(), tasks: seedStarterTasks() };
  try {
    await writeLocal(next);
  } catch {
    // Read-only hosts: keep in-memory seed for this invocation.
  }
  return next;
}

/** @returns {AgentTask[]} */
function seedStarterTasks() {
  const at = nowIso();
  return [
    {
      id: "task-seed-support-kb",
      workspace_id: WORKSPACE_ID,
      agent_id: "agent-ai-support",
      agent_key: "ai_support",
      title: "Ground replies in training docs",
      description:
        "When unsure of tone or policy, retrieve Training docs and write notes to shared memory for Follow up.",
      status: "open",
      priority: "normal",
      context_keys: ["workspace.brand", "collab.active_thread"],
      created_by: "system",
      created_at: at,
      updated_at: at,
    },
    {
      id: "task-seed-creative-ugc",
      workspace_id: WORKSPACE_ID,
      agent_id: "agent-creative",
      agent_key: "content_creator",
      title: "Draft viral UGC for Meta / IG / TikTok / WhatsApp",
      description:
        "Produce high-converting jewellery UGC scripts, captions, and creative briefs. Hook first, soft CTA, no fake scarcity. Queue for QC then human approval.",
      status: "open",
      priority: "high",
      context_keys: ["workspace.brand", "collab.active_thread"],
      created_by: "system",
      created_at: at,
      updated_at: at,
    },
    {
      id: "task-seed-qc-review",
      workspace_id: WORKSPACE_ID,
      agent_id: "agent-quality-control",
      agent_key: "quality_control",
      title: "QC marketing drafts before publish",
      description:
        "Review Creative/Marketing shared memory drafts for invented claims and missing disclosures.",
      status: "open",
      priority: "high",
      context_keys: ["collab.active_thread"],
      created_by: "system",
      created_at: at,
      updated_at: at,
    },
    {
      id: "task-seed-compliance-wa",
      workspace_id: WORKSPACE_ID,
      agent_id: "agent-compliance",
      agent_key: "compliance",
      title: "Verify WhatsApp opt-in before Follow up",
      description:
        "Block Follow up sends when consent is missing. Record decision in shared kv.",
      status: "open",
      priority: "high",
      context_keys: ["collab.active_thread"],
      created_by: "system",
      created_at: at,
      updated_at: at,
    },
  ];
}

/**
 * @returns {Promise<{ data: AgentRecord[], storage: string }>}
 */
export async function listAgents() {
  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from(AGENTS_TABLE)
          .select("*")
          .eq("workspace_id", WORKSPACE_ID)
          .order("name", { ascending: true });
        if (!error && Array.isArray(data) && data.length > 0) {
          const normalized = data.map(normalizeAgent);
          const synced = applyRosterPromptUpdates(normalized);
          if (synced.changed) {
            try {
              await supabase.from(AGENTS_TABLE).upsert(synced.agents);
            } catch {
              /* non-blocking — return updated in-memory */
            }
          }
          return { data: synced.agents, storage: "supabase" };
        }
        if (!error && Array.isArray(data) && data.length === 0) {
          const seeded = seedAgents();
          await supabase.from(AGENTS_TABLE).upsert(seeded);
          return { data: seeded, storage: "supabase" };
        }
      }
    } catch {
      /* fall through */
    }
  }

  const state = await ensureLocalSeeded();
  const synced = applyRosterPromptUpdates(state.agents);
  if (synced.changed) {
    try {
      await writeLocal({ ...state, agents: synced.agents });
    } catch {
      /* read-only hosts */
    }
  }
  return { data: synced.agents, storage: "local_file" };
}

/**
 * @param {Partial<AgentRecord> & { name: string }} input
 */
export async function createAgent(input) {
  const at = nowIso();
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Agent name is required.");

  /** @type {AgentRecord} */
  const agent = {
    id: input.id ? String(input.id) : newAgentId(),
    key: String(input.key || slugKey(name)),
    workspace_id: WORKSPACE_ID,
    name,
    role: String(input.role || "custom"),
    description: String(input.description || ""),
    status: input.status === "paused" ? "paused" : "active",
    config:
      input.config && typeof input.config === "object"
        ? /** @type {Record<string, unknown>} */ (input.config)
        : {
            channels: Array.isArray(input.channels) ? input.channels : ["internal"],
            collaborates_with: Array.isArray(input.collaborates_with)
              ? input.collaborates_with
              : [],
            system_prompt: String(input.system_prompt || ""),
          },
    created_at: at,
    updated_at: at,
  };

  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from(AGENTS_TABLE)
          .upsert(agent)
          .select("*")
          .maybeSingle();
        if (!error && data) {
          return { ok: true, agent: normalizeAgent(data), storage: "supabase" };
        }
      }
    } catch {
      /* fall through */
    }
  }

  const state = await ensureLocalSeeded();
  const idx = state.agents.findIndex((a) => a.id === agent.id || a.key === agent.key);
  if (idx >= 0) {
    state.agents[idx] = { ...state.agents[idx], ...agent, id: state.agents[idx].id, updated_at: at };
    await writeLocal(state);
    return { ok: true, agent: state.agents[idx], storage: "local_file" };
  }
  state.agents.push(agent);
  await writeLocal(state);
  return { ok: true, agent, storage: "local_file" };
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} patch
 */
export async function updateAgent(id, patch) {
  const listed = await listAgents();
  const current = listed.data.find((a) => a.id === id || a.key === id);
  if (!current) throw new Error("Agent not found.");

  const next = {
    ...current,
    ...patch,
    id: current.id,
    key: current.key,
    workspace_id: WORKSPACE_ID,
    config:
      patch.config && typeof patch.config === "object"
        ? { ...(current.config || {}), .../** @type {object} */ (patch.config) }
        : current.config,
    updated_at: nowIso(),
  };
  if ("paused" in patch) {
    next.status = patch.paused ? "paused" : "active";
  }
  if (patch.status === "paused" || patch.status === "active") {
    next.status = patch.status;
  }

  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from(AGENTS_TABLE)
          .upsert(next)
          .select("*")
          .maybeSingle();
        if (!error && data) {
          return { ok: true, agent: normalizeAgent(data), storage: "supabase" };
        }
      }
    } catch {
      /* fall through */
    }
  }

  const state = await ensureLocalSeeded();
  const idx = state.agents.findIndex((a) => a.id === current.id);
  if (idx < 0) throw new Error("Agent not found.");
  state.agents[idx] = /** @type {AgentRecord} */ (next);
  await writeLocal(state);
  return { ok: true, agent: state.agents[idx], storage: "local_file" };
}

/**
 * @param {string} keyOrId
 */
export async function findAgent(keyOrId) {
  const listed = await listAgents();
  return resolveAgent(keyOrId, listed.data);
}

/**
 * @returns {Promise<{ data: AgentTask[], storage: string }>}
 */
export async function listTasks(agentId) {
  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        let q = supabase
          .from(TASKS_TABLE)
          .select("*")
          .eq("workspace_id", WORKSPACE_ID)
          .order("updated_at", { ascending: false })
          .limit(200);
        if (agentId) q = q.or(`agent_id.eq.${agentId},agent_key.eq.${agentId}`);
        const { data, error } = await q;
        if (!error && Array.isArray(data)) {
          return { data: data.map(normalizeTask), storage: "supabase" };
        }
      }
    } catch {
      /* fall through */
    }
  }

  const state = await ensureLocalSeeded();
  let tasks = state.tasks;
  if (agentId) {
    tasks = tasks.filter(
      (t) => t.agent_id === agentId || t.agent_key === agentId,
    );
  }
  return { data: tasks, storage: "local_file" };
}

/**
 * Admin assigns a task to an agent.
 * @param {{
 *   agent_id?: string,
 *   agent_key?: string,
 *   title: string,
 *   description?: string,
 *   priority?: string,
 *   context_keys?: string[],
 *   created_by?: string,
 * }} input
 */
export async function assignTask(input) {
  const title = String(input.title || "").trim();
  if (!title) throw new Error("Task title is required.");

  const agent = await findAgent(input.agent_id || input.agent_key || "");
  if (!agent) throw new Error("Assign task requires a valid agent.");

  const at = nowIso();
  /** @type {AgentTask} */
  const task = {
    id: newTaskId(),
    workspace_id: WORKSPACE_ID,
    agent_id: agent.id,
    agent_key: agent.key,
    title,
    description: String(input.description || ""),
    status: "open",
    priority: normalizePriority(input.priority),
    context_keys: Array.isArray(input.context_keys)
      ? input.context_keys.map(String)
      : ["collab.active_thread"],
    created_by: String(input.created_by || "admin"),
    created_at: at,
    updated_at: at,
  };

  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from(TASKS_TABLE)
          .insert(task)
          .select("*")
          .maybeSingle();
        if (!error && data) {
          return { ok: true, task: normalizeTask(data), agent, storage: "supabase" };
        }
      }
    } catch {
      /* fall through */
    }
  }

  const state = await ensureLocalSeeded();
  state.tasks.unshift(task);
  await writeLocal(state);
  return { ok: true, task, agent, storage: "local_file" };
}

/**
 * @param {string} taskId
 * @param {Record<string, unknown>} patch
 */
export async function updateTask(taskId, patch) {
  const state = await ensureLocalSeeded();
  const idx = state.tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) throw new Error("Task not found.");

  const next = {
    ...state.tasks[idx],
    ...patch,
    id: state.tasks[idx].id,
    agent_id: state.tasks[idx].agent_id,
    agent_key: state.tasks[idx].agent_key,
    updated_at: nowIso(),
  };
  if (patch.status) {
    next.status = normalizeTaskStatus(patch.status);
  }
  if (patch.priority) {
    next.priority = normalizePriority(patch.priority);
  }

  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from(TASKS_TABLE)
          .upsert(next)
          .select("*")
          .maybeSingle();
        if (!error && data) {
          return { ok: true, task: normalizeTask(data), storage: "supabase" };
        }
      }
    } catch {
      /* fall through */
    }
  }

  state.tasks[idx] = /** @type {AgentTask} */ (next);
  await writeLocal(state);
  return { ok: true, task: state.tasks[idx], storage: "local_file" };
}

/** @param {unknown} row */
function normalizeAgent(row) {
  const r = /** @type {Record<string, unknown>} */ (row || {});
  return {
    id: String(r.id),
    key: String(r.key || slugKey(r.name)),
    workspace_id: String(r.workspace_id || WORKSPACE_ID),
    name: String(r.name || "Agent"),
    role: String(r.role || "custom"),
    description: String(r.description || ""),
    status: r.status === "paused" ? "paused" : "active",
    config:
      r.config && typeof r.config === "object"
        ? /** @type {Record<string, unknown>} */ (r.config)
        : {},
    created_at: String(r.created_at || nowIso()),
    updated_at: String(r.updated_at || nowIso()),
  };
}

/** @param {unknown} row */
function normalizeTask(row) {
  const r = /** @type {Record<string, unknown>} */ (row || {});
  return {
    id: String(r.id),
    workspace_id: String(r.workspace_id || WORKSPACE_ID),
    agent_id: String(r.agent_id || ""),
    agent_key: String(r.agent_key || ""),
    title: String(r.title || ""),
    description: String(r.description || ""),
    status: normalizeTaskStatus(r.status),
    priority: normalizePriority(r.priority),
    context_keys: Array.isArray(r.context_keys) ? r.context_keys.map(String) : [],
    created_by: String(r.created_by || "admin"),
    created_at: String(r.created_at || nowIso()),
    updated_at: String(r.updated_at || nowIso()),
  };
}

/** @param {unknown} value */
function normalizePriority(value) {
  const v = String(value || "normal").toLowerCase();
  if (v === "low" || v === "high" || v === "urgent") return v;
  return "normal";
}

/** @param {unknown} value */
function normalizeTaskStatus(value) {
  const v = String(value || "open").toLowerCase();
  if (v === "in_progress" || v === "done" || v === "cancelled") return v;
  return "open";
}

/** Sync helper for seed-data / runtime bootstrap. */
export function buildAgentsFromRoster() {
  return seedAgents();
}
