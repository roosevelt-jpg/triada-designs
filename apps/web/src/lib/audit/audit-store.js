/**
 * Append-only audit events. Empty by default — no synthetic login seed.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { getLocalDataDir } from "@/lib/local-data-dir";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TABLE = "audit_events";
const WORKSPACE_ID = "triada-ops";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "audit-events.json");

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {Partial<{ id: string, action: string, actor: string, entity_type: string, entity_id: string, detail: object, created_at: string }> & Record<string, unknown>} input
 */
export function shapeAudit(input = {}) {
  return {
    id: String(input.id || newId()),
    workspace_id: WORKSPACE_ID,
    action: String(input.action || "unknown"),
    actor: input.actor != null ? String(input.actor) : null,
    entity_type: input.entity_type != null ? String(input.entity_type) : null,
    entity_id: input.entity_id != null ? String(input.entity_id) : null,
    detail:
      input.detail && typeof input.detail === "object"
        ? /** @type {Record<string, unknown>} */ (input.detail)
        : {},
    created_at: String(input.created_at || input.at || nowIso()),
  };
}

async function readLocal() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(shapeAudit) : [];
  } catch {
    return [];
  }
}

async function writeLocal(rows) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(rows, null, 2), "utf8");
}

/**
 * @param {{ limit?: number }} [opts]
 */
export async function listAuditEvents(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);

  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from(TABLE)
          .select("*")
          .eq("workspace_id", WORKSPACE_ID)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (!error && Array.isArray(data)) {
          return {
            mode: "supabase",
            data: data.map((row) => ({
              ...shapeAudit(row),
              at: row.created_at,
            })),
          };
        }
      }
    } catch {
      /* fall through */
    }
  }

  const rows = await readLocal();
  return {
    mode: "local_mock",
    data: rows.slice(0, limit).map((r) => ({ ...r, at: r.created_at })),
  };
}

/**
 * @param {Partial<{ action: string, actor: string, entity_type: string, entity_id: string, detail: object }>} input
 */
export async function appendAuditEvent(input) {
  const row = shapeAudit(input);

  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        const { error } = await supabase.from(TABLE).insert({
          ...row,
          detail: row.detail,
        });
        if (!error) return { mode: "supabase", event: { ...row, at: row.created_at } };
      }
    } catch {
      /* fall through */
    }
  }

  const rows = await readLocal();
  rows.unshift(row);
  await writeLocal(rows.slice(0, 500));
  return { mode: "local_mock", event: { ...row, at: row.created_at } };
}
