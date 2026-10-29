/**
 * Dual-run persistence for manufacturer admin tables.
 * Supabase when keyed; else local JSON under .triada-local.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { getLocalDataDir } from "@/lib/local-data-dir";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const WORKSPACE_ID = "triada-ops";

const LOCAL_DIR = getLocalDataDir();

/**
 * @param {string} table
 */
function localFile(table) {
  return path.join(LOCAL_DIR, `${table.replace(/_/g, "-")}.json`);
}

export function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {string} prefix
 */
export function newManufacturerId(prefix = "mfr") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {string} table
 * @returns {Promise<object[]>}
 */
async function readLocal(table) {
  try {
    const raw = await readFile(localFile(table), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @param {string} table
 * @param {object[]} rows
 */
async function writeLocal(table, rows) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(localFile(table), JSON.stringify(rows, null, 2), "utf8");
}

/**
 * @param {string} table
 * @param {{
 *   eq?: Record<string, string | boolean | number | null>,
 *   orderBy?: string,
 *   ascending?: boolean,
 *   limit?: number,
 * }} [opts]
 * @returns {Promise<{ data: object[], storage: string }>}
 */
export async function listManufacturerRows(table, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  const orderBy = opts.orderBy || "updated_at";
  const ascending = opts.ascending === true;

  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        let q = supabase
          .from(table)
          .select("*")
          .eq("workspace_id", WORKSPACE_ID)
          .order(orderBy, { ascending })
          .limit(limit);
        for (const [key, value] of Object.entries(opts.eq || {})) {
          if (value === null) q = q.is(key, null);
          else q = q.eq(key, value);
        }
        const { data, error } = await q;
        if (!error && Array.isArray(data)) {
          return { data, storage: "supabase" };
        }
      }
    } catch {
      /* fall through */
    }
  }

  let rows = await readLocal(table);
  rows = rows.filter((r) => String(r.workspace_id || WORKSPACE_ID) === WORKSPACE_ID);
  for (const [key, value] of Object.entries(opts.eq || {})) {
    rows = rows.filter((r) => {
      if (value === null) return r[key] == null;
      return r[key] === value;
    });
  }
  rows.sort((a, b) => {
    const av = String(a[orderBy] || "");
    const bv = String(b[orderBy] || "");
    return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
  });
  return { data: rows.slice(0, limit), storage: "local_file" };
}

/**
 * @param {string} table
 * @param {string} id
 * @returns {Promise<{ row: object | null, storage: string }>}
 */
export async function getManufacturerRow(table, id) {
  const key = String(id || "").trim();
  if (!key) return { row: null, storage: "none" };

  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from(table)
          .select("*")
          .eq("workspace_id", WORKSPACE_ID)
          .eq("id", key)
          .maybeSingle();
        if (!error && data) return { row: data, storage: "supabase" };
      }
    } catch {
      /* fall through */
    }
  }

  const rows = await readLocal(table);
  const found = rows.find((r) => r.id === key) || null;
  return { row: found, storage: "local_file" };
}

/**
 * @param {string} table
 * @param {object} row
 * @returns {Promise<{ row: object, storage: string }>}
 */
export async function upsertManufacturerRow(table, row) {
  const shaped = {
    ...row,
    workspace_id: String(row.workspace_id || WORKSPACE_ID),
    updated_at: nowIso(),
    created_at: String(row.created_at || nowIso()),
  };

  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from(table)
          .upsert(shaped, { onConflict: "id" })
          .select("*")
          .maybeSingle();
        if (!error && data) return { row: data, storage: "supabase" };
      }
    } catch {
      /* fall through */
    }
  }

  const rows = await readLocal(table);
  const idx = rows.findIndex((r) => r.id === shaped.id);
  if (idx >= 0) {
    shaped.created_at = rows[idx].created_at;
    rows[idx] = shaped;
  } else {
    rows.push(shaped);
  }
  await writeLocal(table, rows);
  return { row: shaped, storage: "local_file" };
}

/**
 * @param {string} table
 * @param {string} id
 * @returns {Promise<{ ok: boolean, storage?: string, message?: string }>}
 */
export async function deleteManufacturerRow(table, id) {
  const key = String(id || "").trim();
  if (!key) return { ok: false, message: "Missing id" };

  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq("workspace_id", WORKSPACE_ID)
          .eq("id", key);
        if (!error) return { ok: true, storage: "supabase" };
      }
    } catch {
      /* fall through */
    }
  }

  const rows = await readLocal(table);
  const next = rows.filter((r) => r.id !== key);
  if (next.length === rows.length) {
    return { ok: false, message: "Not found" };
  }
  await writeLocal(table, next);
  return { ok: true, storage: "local_file" };
}
