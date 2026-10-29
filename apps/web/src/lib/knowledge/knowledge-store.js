/**
 * Dual-run knowledge sources (FAQs / policies).
 * Empty by default — admin add/edit/delete/save. No hardcoded catalog.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { getLocalDataDir } from "@/lib/local-data-dir";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TABLE = "knowledge_sources";
const WORKSPACE_ID = "triada-ops";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "knowledge-sources.json");

/**
 * @typedef {{
 *   id: string,
 *   workspace_id: string,
 *   title: string,
 *   source_type: string,
 *   status: string,
 *   body: string,
 *   tags: string[],
 *   metadata: Record<string, unknown>,
 *   created_at: string,
 *   updated_at: string,
 * }} KnowledgeRecord
 */

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `ks-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {unknown} tagsRaw
 * @returns {string[]}
 */
function parseTags(tagsRaw) {
  if (Array.isArray(tagsRaw)) {
    return tagsRaw.map((t) => String(t).trim()).filter(Boolean);
  }
  if (typeof tagsRaw === "string" && tagsRaw.trim()) {
    return tagsRaw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * @param {Partial<KnowledgeRecord> & Record<string, unknown>} input
 * @returns {KnowledgeRecord}
 */
export function shapeKnowledge(input = {}) {
  const typeRaw = String(input.source_type || "faq").toLowerCase();
  const source_type =
    typeRaw === "policy" || typeRaw === "training_doc" ? typeRaw : "faq";
  const statusRaw = String(input.status || "published").toLowerCase();
  const status =
    statusRaw === "draft" || statusRaw === "archived" ? statusRaw : "published";

  return {
    id: String(input.id || newId()),
    workspace_id: String(input.workspace_id || WORKSPACE_ID),
    title: String(input.title || "").trim() || "Untitled",
    source_type,
    status,
    body: String(input.body || "").trim(),
    tags: parseTags(input.tags),
    metadata:
      input.metadata && typeof input.metadata === "object"
        ? /** @type {Record<string, unknown>} */ (input.metadata)
        : {},
    created_at: String(input.created_at || nowIso()),
    updated_at: String(input.updated_at || nowIso()),
  };
}

/** @returns {Promise<KnowledgeRecord[]>} */
async function readLocal() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(shapeKnowledge);
  } catch {
    return [];
  }
}

/** @param {KnowledgeRecord[]} rows */
async function writeLocal(rows) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(rows, null, 2), "utf8");
}

/**
 * @param {{ q?: string, status?: string }} [opts]
 * @returns {Promise<{ mode: string, data: KnowledgeRecord[] }>}
 */
export async function listKnowledge(opts = {}) {
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
        if (statusFilter) query = query.eq("status", statusFilter);
        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          let rows = data.map(shapeKnowledge);
          if (q) {
            rows = rows.filter((r) => {
              const hay =
                `${r.title} ${r.body} ${r.source_type} ${r.tags.join(" ")}`.toLowerCase();
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
  if (statusFilter) rows = rows.filter((r) => r.status === statusFilter);
  if (q) {
    rows = rows.filter((r) => {
      const hay =
        `${r.title} ${r.body} ${r.source_type} ${r.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }
  return { mode: "local_mock", data: rows };
}

/**
 * @param {string} id
 * @returns {Promise<KnowledgeRecord | null>}
 */
export async function getKnowledge(id) {
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
        if (!error && data) return shapeKnowledge(data);
        if (!error && !data) return null;
      }
    } catch {
      /* fall through */
    }
  }

  const rows = await readLocal();
  return rows.find((r) => r.id === key) || null;
}

/**
 * @param {Partial<KnowledgeRecord> & Record<string, unknown>} input
 */
export async function upsertKnowledge(input) {
  const id = input.id ? String(input.id) : null;
  let previous = null;
  if (id) previous = await getKnowledge(id);

  const created = !previous;
  const record = shapeKnowledge({
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
          ...record,
          tags: record.tags,
          metadata: record.metadata,
        });
        if (!error) return { mode: "supabase", knowledge: record, created };
      }
    } catch {
      /* fall through */
    }
  }

  const rows = await readLocal();
  const idx = rows.findIndex((r) => r.id === record.id);
  if (idx < 0) rows.unshift(record);
  else rows[idx] = { ...record, created_at: rows[idx].created_at };
  await writeLocal(rows);
  return {
    mode: "local_mock",
    knowledge: idx >= 0 ? rows[idx] : record,
    created: idx < 0,
  };
}

/**
 * @param {string} id
 */
export async function deleteKnowledge(id) {
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
  const next = rows.filter((r) => r.id !== key);
  if (next.length === rows.length) {
    return { ok: false, message: "Knowledge source not found" };
  }
  await writeLocal(next);
  return { ok: true, mode: "local_mock" };
}

/**
 * Published FAQ/policy bodies for jewellery answer-bot (admin-owned).
 * @returns {Promise<{ materials?: string, care?: string, shipping?: string, making?: string, policies: KnowledgeRecord[] }>}
 */
export async function publishedKnowledgeForBot() {
  const listed = await listKnowledge({ status: "published" });
  const policies = listed.data.filter(
    (r) => r.source_type === "faq" || r.source_type === "policy",
  );
  const byTag = (tag) =>
    policies.find((p) => p.tags.map((t) => t.toLowerCase()).includes(tag))?.body ||
    null;
  return {
    materials: byTag("materials"),
    making: byTag("making") || byTag("make"),
    care: byTag("care"),
    shipping: byTag("shipping"),
    policies,
  };
}
