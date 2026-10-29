/**
 * Dual-run services catalog store.
 * Supabase when keyed; else local JSON under .triada-local.
 * Empty by default — admin must add/edit/delete/save (no hardcoded catalog).
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { getLocalDataDir } from "@/lib/local-data-dir";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TABLE = "services";
const WORKSPACE_ID = "triada-ops";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "services-catalog.json");

/**
 * @typedef {{
 *   id: string,
 *   workspace_id: string,
 *   name: string,
 *   description: string,
 *   price: number | null,
 *   currency: string,
 *   inquiry_url: string | null,
 *   status: string,
 *   approved_claims: string[],
 *   metadata: Record<string, unknown>,
 *   created_at: string,
 *   updated_at: string,
 * }} ServiceRecord
 */

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `svc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {unknown} claimsRaw
 * @returns {string[]}
 */
function parseClaims(claimsRaw) {
  if (Array.isArray(claimsRaw)) {
    return claimsRaw.map((c) => String(c).trim()).filter(Boolean);
  }
  if (typeof claimsRaw === "string" && claimsRaw.trim()) {
    return claimsRaw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * @param {Partial<ServiceRecord> & Record<string, unknown>} input
 * @returns {ServiceRecord}
 */
export function shapeService(input = {}) {
  const priceRaw = input.price;
  const price =
    priceRaw === null || priceRaw === undefined || priceRaw === ""
      ? null
      : Number(priceRaw);

  const statusRaw = String(input.status || "active").toLowerCase();
  const status =
    statusRaw === "draft" || statusRaw === "archived" ? statusRaw : "active";

  return {
    id: String(input.id || newId()),
    workspace_id: String(input.workspace_id || WORKSPACE_ID),
    name: String(input.name || "").trim() || "Untitled service",
    description: String(input.description || "").trim(),
    price: Number.isFinite(price) ? price : null,
    currency: String(input.currency || "AED").trim().toUpperCase() || "AED",
    inquiry_url:
      input.inquiry_url != null && String(input.inquiry_url).trim()
        ? String(input.inquiry_url).trim()
        : null,
    status,
    approved_claims: parseClaims(input.approved_claims),
    metadata:
      input.metadata && typeof input.metadata === "object"
        ? /** @type {Record<string, unknown>} */ (input.metadata)
        : {},
    created_at: String(input.created_at || nowIso()),
    updated_at: String(input.updated_at || nowIso()),
  };
}

/** @returns {Promise<ServiceRecord[]>} */
async function readLocal() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => shapeService(row));
  } catch {
    return [];
  }
}

/** @param {ServiceRecord[]} rows */
async function writeLocal(rows) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(rows, null, 2), "utf8");
}

/**
 * @param {{ q?: string, status?: string }} [opts]
 * @returns {Promise<{ mode: string, data: ServiceRecord[] }>}
 */
export async function listServices(opts = {}) {
  const q = String(opts.q || "")
    .trim()
    .toLowerCase();
  const statusFilter = opts.status ? String(opts.status).toLowerCase() : "";

  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        let query = supabase
          .from(TABLE)
          .select("*")
          .eq("workspace_id", WORKSPACE_ID)
          .order("updated_at", { ascending: false });

        if (statusFilter) {
          query = query.eq("status", statusFilter);
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          let rows = data.map(shapeService);
          if (q) {
            rows = rows.filter((s) => {
              const hay =
                `${s.name} ${s.description} ${s.status} ${s.approved_claims.join(" ")}`.toLowerCase();
              return hay.includes(q);
            });
          }
          return { mode: "supabase", data: rows };
        }
      }
    } catch {
      /* fall through */
    }
  }

  let rows = await readLocal();
  if (statusFilter) {
    rows = rows.filter((s) => s.status === statusFilter);
  }
  if (q) {
    rows = rows.filter((s) => {
      const hay =
        `${s.name} ${s.description} ${s.status} ${s.approved_claims.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }
  return { mode: "local_mock", data: rows };
}

/**
 * @param {string} id
 * @returns {Promise<ServiceRecord | null>}
 */
export async function getService(id) {
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
        if (!error && data) return shapeService(data);
        if (!error && !data) return null;
      }
    } catch {
      /* fall through */
    }
  }

  const rows = await readLocal();
  return rows.find((s) => s.id === key) || null;
}

/**
 * @param {Partial<ServiceRecord> & Record<string, unknown>} input
 * @returns {Promise<{ mode: string, service: ServiceRecord, created: boolean }>}
 */
export async function upsertService(input) {
  const id = input.id ? String(input.id) : null;
  let previous = null;
  if (id) {
    previous = await getService(id);
  }

  const created = !previous;
  const service = shapeService({
    ...(previous || {}),
    ...input,
    id: previous?.id || id || newId(),
    created_at: previous?.created_at || nowIso(),
    updated_at: nowIso(),
  });

  if (!String(input.name || previous?.name || "").trim() && !previous) {
    // allow Untitled only when name omitted on create — shapeService already defaults
  }

  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        const row = {
          ...service,
          approved_claims: service.approved_claims,
          metadata: service.metadata,
        };
        const { error } = await supabase.from(TABLE).upsert(row);
        if (!error) {
          return { mode: "supabase", service, created };
        }
      }
    } catch {
      /* fall through */
    }
  }

  const rows = await readLocal();
  const idx = rows.findIndex((s) => s.id === service.id);
  if (idx < 0) rows.unshift(service);
  else rows[idx] = { ...service, created_at: rows[idx].created_at };
  await writeLocal(rows);
  return {
    mode: "local_mock",
    service: idx >= 0 ? rows[idx] : service,
    created: idx < 0,
  };
}

/**
 * @param {string} id
 * @returns {Promise<{ ok: boolean, mode?: string, message?: string }>}
 */
export async function deleteService(id) {
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
  const next = rows.filter((s) => s.id !== key);
  if (next.length === rows.length) {
    return { ok: false, message: "Service not found" };
  }
  await writeLocal(next);
  return { ok: true, mode: "local_mock" };
}
