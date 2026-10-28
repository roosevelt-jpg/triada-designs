/**
 * Shared memory / kv for multi-agent collaboration.
 * All agents in a workspace read/write the same context store.
 * Persists to Supabase `agent_shared_kv` when keyed, else `.triada-local/agent-shared-kv.json`.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { getLocalDataDir } from "@/lib/local-data-dir";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TABLE = "agent_shared_kv";
const WORKSPACE_ID = "triada-ops";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "agent-shared-kv.json");

/**
 * @typedef {{
 *   key: string,
 *   value: unknown,
 *   written_by: string | null,
 *   tags: string[],
 *   updated_at: string,
 * }} KvEntry
 */

function nowIso() {
  return new Date().toISOString();
}

/** @returns {Promise<Record<string, KvEntry>>} */
async function readLocalMap() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** @param {Record<string, KvEntry>} map */
async function writeLocalMap(map) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(map, null, 2), "utf8");
}

/**
 * Seed a few shared context keys so collaboration is visible offline.
 * @returns {Record<string, KvEntry>}
 */
export function seedSharedMemory() {
  const at = nowIso();
  return {
    "workspace.brand": {
      key: "workspace.brand",
      value: {
        name: "Triada Designs",
        materials: "silver with gold plating; 14K/18K on request",
        make_time_days: 7,
      },
      written_by: "system",
      tags: ["brand", "shared"],
      updated_at: at,
    },
    "collab.last_handoff": {
      key: "collab.last_handoff",
      value: null,
      written_by: "system",
      tags: ["orchestration"],
      updated_at: at,
    },
    "collab.active_thread": {
      key: "collab.active_thread",
      value: {
        summary: "Team ready — Support, Creative, Follow up, Marketing, QC, Compliance, Leads, Escalation share this kv.",
        agents: [
          "ai_support",
          "content_creator",
          "follow_up",
          "marketing",
          "quality_control",
          "compliance",
          "leads_qualification",
          "escalation_officer",
        ],
      },
      written_by: "system",
      tags: ["orchestration", "team"],
      updated_at: at,
    },
  };
}

async function ensureLocalSeeded() {
  const map = await readLocalMap();
  if (Object.keys(map).length > 0) return map;
  const seeded = seedSharedMemory();
  try {
    await writeLocalMap(seeded);
  } catch {
    // Read-only hosts: keep in-memory seed for this invocation.
  }
  return seeded;
}

/**
 * @param {string} [prefix]
 * @returns {Promise<{ data: KvEntry[], storage: string }>}
 */
export async function listSharedKv(prefix = "") {
  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        let q = supabase
          .from(TABLE)
          .select("key,value,written_by,tags,updated_at")
          .eq("workspace_id", WORKSPACE_ID)
          .order("updated_at", { ascending: false })
          .limit(200);
        if (prefix) q = q.like("key", `${prefix}%`);
        const { data, error } = await q;
        if (!error && Array.isArray(data)) {
          return {
            data: data.map((row) => ({
              key: String(row.key),
              value: row.value,
              written_by: row.written_by ? String(row.written_by) : null,
              tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
              updated_at: String(row.updated_at || nowIso()),
            })),
            storage: "supabase",
          };
        }
      }
    } catch {
      /* fall through */
    }
  }

  const map = await ensureLocalSeeded();
  let rows = Object.values(map);
  if (prefix) rows = rows.filter((r) => r.key.startsWith(prefix));
  rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  return { data: rows, storage: "local_file" };
}

/**
 * @param {string} key
 * @returns {Promise<KvEntry | null>}
 */
export async function getSharedKv(key) {
  const k = String(key || "").trim();
  if (!k) return null;

  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from(TABLE)
          .select("key,value,written_by,tags,updated_at")
          .eq("workspace_id", WORKSPACE_ID)
          .eq("key", k)
          .maybeSingle();
        if (!error && data) {
          return {
            key: String(data.key),
            value: data.value,
            written_by: data.written_by ? String(data.written_by) : null,
            tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
            updated_at: String(data.updated_at || nowIso()),
          };
        }
      }
    } catch {
      /* fall through */
    }
  }

  const map = await ensureLocalSeeded();
  return map[k] || null;
}

/**
 * @param {{
 *   key: string,
 *   value: unknown,
 *   written_by?: string,
 *   tags?: string[],
 * }} input
 */
export async function setSharedKv(input) {
  const key = String(input.key || "").trim();
  if (!key) throw new Error("Shared memory key is required.");

  /** @type {KvEntry} */
  const entry = {
    key,
    value: input.value ?? null,
    written_by: input.written_by ? String(input.written_by) : null,
    tags: Array.isArray(input.tags) ? input.tags.map(String) : [],
    updated_at: nowIso(),
  };

  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        const { error } = await supabase.from(TABLE).upsert(
          {
            workspace_id: WORKSPACE_ID,
            key: entry.key,
            value: entry.value,
            written_by: entry.written_by,
            tags: entry.tags,
            updated_at: entry.updated_at,
          },
          { onConflict: "workspace_id,key" },
        );
        if (!error) return { ok: true, entry, storage: "supabase" };
      }
    } catch {
      /* fall through */
    }
  }

  const map = await ensureLocalSeeded();
  map[key] = entry;
  await writeLocalMap(map);
  return { ok: true, entry, storage: "local_file" };
}

/**
 * Build a compact context blob for orchestration prompts.
 * @param {string[]} [keys]
 */
export async function readCollaborationContext(keys) {
  const listed = await listSharedKv();
  const wanted = Array.isArray(keys) && keys.length ? new Set(keys) : null;
  const rows = wanted
    ? listed.data.filter((r) => wanted.has(r.key))
    : listed.data.slice(0, 24);
  return {
    storage: listed.storage,
    entries: rows,
    summary: rows
      .map((r) => {
        const val =
          typeof r.value === "string"
            ? r.value
            : JSON.stringify(r.value ?? null);
        return `[${r.key}] (${r.written_by || "system"}): ${val.slice(0, 280)}`;
      })
      .join("\n"),
  };
}
