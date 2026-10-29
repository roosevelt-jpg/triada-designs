/**
 * Jewellery-ops record store — Supabase when keyed, else local JSON under .triada-local.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { getLocalDataDir } from "@/lib/local-data-dir";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TABLE = "jewellery_ops_records";
const WORKSPACE_ID = "triada-ops";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "jewellery-ops-records.json");

/**
 * @typedef {{
 *   id: string,
 *   workspace_id: string,
 *   kind: string,
 *   status: string,
 *   run_at: string | null,
 *   payload: Record<string, unknown>,
 *   created_at: string,
 *   updated_at: string,
 * }} JewelleryOpsRecord
 */

function nowIso() {
  return new Date().toISOString();
}

export function newJewelleryOpsId(prefix = "jop") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** @returns {Promise<JewelleryOpsRecord[]>} */
async function readLocal() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** @param {JewelleryOpsRecord[]} rows */
async function writeLocal(rows) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(rows, null, 2), "utf8");
}

/**
 * @param {Partial<JewelleryOpsRecord> & { kind: string }} input
 * @returns {JewelleryOpsRecord}
 */
export function shapeJewelleryOpsRecord(input) {
  return {
    id: String(input.id || newJewelleryOpsId(input.kind || "jop")),
    workspace_id: String(input.workspace_id || WORKSPACE_ID),
    kind: String(input.kind),
    status: String(input.status || "open"),
    run_at: input.run_at ? String(input.run_at) : null,
    payload:
      input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
        ? /** @type {Record<string, unknown>} */ (input.payload)
        : {},
    created_at: String(input.created_at || nowIso()),
    updated_at: String(input.updated_at || nowIso()),
  };
}

/**
 * @param {{ kind?: string, status?: string, due_before?: string, limit?: number }} [opts]
 * @returns {Promise<{ data: JewelleryOpsRecord[], storage: string }>}
 */
export async function listJewelleryOpsRecords(opts = {}) {
  const kind = opts.kind ? String(opts.kind) : "";
  const status = opts.status ? String(opts.status) : "";
  const dueBefore = opts.due_before ? String(opts.due_before) : "";
  const limit = Math.min(Math.max(Number(opts.limit) || 200, 1), 500);

  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        let q = supabase
          .from(TABLE)
          .select("id,workspace_id,kind,status,run_at,payload,created_at,updated_at")
          .eq("workspace_id", WORKSPACE_ID)
          .order("updated_at", { ascending: false })
          .limit(limit);
        if (kind) q = q.eq("kind", kind);
        if (status) q = q.eq("status", status);
        if (dueBefore) q = q.lte("run_at", dueBefore);
        const { data, error } = await q;
        if (!error && Array.isArray(data)) {
          return {
            data: data.map((row) =>
              shapeJewelleryOpsRecord({
                ...row,
                payload:
                  row.payload && typeof row.payload === "object" ? row.payload : {},
              }),
            ),
            storage: "supabase",
          };
        }
      }
    } catch {
      /* fall through */
    }
  }

  let rows = await readLocal();
  if (kind) rows = rows.filter((r) => r.kind === kind);
  if (status) rows = rows.filter((r) => r.status === status);
  if (dueBefore) {
    rows = rows.filter((r) => r.run_at && String(r.run_at) <= dueBefore);
  }
  rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  return { data: rows.slice(0, limit), storage: "local_file" };
}

/**
 * @param {string} id
 * @returns {Promise<{ record: JewelleryOpsRecord | null, storage: string }>}
 */
export async function getJewelleryOpsRecord(id) {
  const key = String(id || "").trim();
  if (!key) return { record: null, storage: "none" };

  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from(TABLE)
          .select("id,workspace_id,kind,status,run_at,payload,created_at,updated_at")
          .eq("workspace_id", WORKSPACE_ID)
          .eq("id", key)
          .maybeSingle();
        if (!error && data) {
          return {
            record: shapeJewelleryOpsRecord({
              ...data,
              payload:
                data.payload && typeof data.payload === "object" ? data.payload : {},
            }),
            storage: "supabase",
          };
        }
      }
    } catch {
      /* fall through */
    }
  }

  const rows = await readLocal();
  const found = rows.find((r) => r.id === key) || null;
  return { record: found, storage: "local_file" };
}

/**
 * @param {Partial<JewelleryOpsRecord> & { kind: string }} input
 * @returns {Promise<{ record: JewelleryOpsRecord, storage: string }>}
 */
export async function upsertJewelleryOpsRecord(input) {
  const shaped = shapeJewelleryOpsRecord({
    ...input,
    updated_at: nowIso(),
    created_at: input.created_at || nowIso(),
  });

  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from(TABLE)
          .upsert(
            {
              id: shaped.id,
              workspace_id: shaped.workspace_id,
              kind: shaped.kind,
              status: shaped.status,
              run_at: shaped.run_at,
              payload: shaped.payload,
              created_at: shaped.created_at,
              updated_at: shaped.updated_at,
            },
            { onConflict: "id" },
          )
          .select("id,workspace_id,kind,status,run_at,payload,created_at,updated_at")
          .maybeSingle();
        if (!error && data) {
          return {
            record: shapeJewelleryOpsRecord({
              ...data,
              payload:
                data.payload && typeof data.payload === "object" ? data.payload : {},
            }),
            storage: "supabase",
          };
        }
      }
    } catch {
      /* fall through */
    }
  }

  const rows = await readLocal();
  const idx = rows.findIndex((r) => r.id === shaped.id);
  if (idx >= 0) {
    shaped.created_at = rows[idx].created_at;
    rows[idx] = shaped;
  } else {
    rows.push(shaped);
  }
  await writeLocal(rows);
  return { record: shaped, storage: "local_file" };
}

/**
 * @param {string} id
 * @param {Partial<JewelleryOpsRecord>} patch
 */
export async function patchJewelleryOpsRecord(id, patch) {
  const existing = await getJewelleryOpsRecord(id);
  if (!existing.record) {
    return { record: null, storage: existing.storage };
  }
  return upsertJewelleryOpsRecord({
    ...existing.record,
    ...patch,
    id: existing.record.id,
    kind: patch.kind || existing.record.kind,
    payload: {
      ...existing.record.payload,
      ...(patch.payload && typeof patch.payload === "object" ? patch.payload : {}),
    },
  });
}

/** @returns {Promise<Record<string, number>>} */
export async function countJewelleryOpsByKind() {
  const listed = await listJewelleryOpsRecords({ limit: 500 });
  /** @type {Record<string, number>} */
  const counts = {};
  for (const row of listed.data) {
    counts[row.kind] = (counts[row.kind] || 0) + 1;
  }
  return counts;
}
