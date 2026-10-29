/**
 * Dual-run CRM leads store.
 * Empty by default — admin add/edit/delete/save. No hardcoded seed leads.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { getLocalDataDir } from "@/lib/local-data-dir";
import {
  DEFAULT_CURRENCY,
  normalizePreferredCurrency,
} from "@/lib/locale/preferred-currency";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TABLE = "crm_leads";
const WORKSPACE_ID = "triada-ops";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "crm-leads.json");

const STAGES = new Set([
  "new_lead",
  "qualified",
  "proposal",
  "won",
  "lost",
  "nurture",
]);

/**
 * @typedef {{
 *   id: string,
 *   workspace_id: string,
 *   stage: string,
 *   title: string,
 *   contact_name: string | null,
 *   contact_email: string | null,
 *   contact_phone: string | null,
 *   contact_id: string | null,
 *   source_channel: string | null,
 *   score: number | null,
 *   estimated_value: number | null,
 *   currency: string,
 *   external_crm_id: string | null,
 *   metadata: Record<string, unknown>,
 *   created_at: string,
 *   updated_at: string,
 * }} LeadRecord
 */

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `lead-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {Partial<LeadRecord> & Record<string, unknown>} input
 * @returns {LeadRecord}
 */
export function shapeLead(input = {}) {
  const stageRaw = String(input.stage || "new_lead").toLowerCase();
  const stage = STAGES.has(stageRaw) ? stageRaw : "new_lead";
  const scoreRaw = input.score;
  const score =
    scoreRaw === null || scoreRaw === undefined || scoreRaw === ""
      ? null
      : Number(scoreRaw);
  const valueRaw = input.estimated_value;
  const estimated_value =
    valueRaw === null || valueRaw === undefined || valueRaw === ""
      ? null
      : Number(valueRaw);

  // Accept nested contact from API payloads
  const contact =
    input.contact && typeof input.contact === "object"
      ? /** @type {Record<string, unknown>} */ (input.contact)
      : null;

  return {
    id: String(input.id || newId()),
    workspace_id: String(input.workspace_id || WORKSPACE_ID),
    stage,
    title: String(input.title || "").trim() || "Untitled lead",
    contact_name:
      (input.contact_name != null && String(input.contact_name).trim()) ||
      (contact?.name != null && String(contact.name).trim()) ||
      null,
    contact_email:
      (input.contact_email != null && String(input.contact_email).trim()) ||
      (contact?.email != null && String(contact.email).trim()) ||
      null,
    contact_phone:
      (input.contact_phone != null && String(input.contact_phone).trim()) ||
      (contact?.phone != null && String(contact.phone).trim()) ||
      null,
    contact_id:
      input.contact_id != null && String(input.contact_id).trim()
        ? String(input.contact_id).trim()
        : null,
    source_channel:
      (input.source_channel != null && String(input.source_channel).trim()) ||
      (input.channel != null && String(input.channel).trim()) ||
      null,
    score: Number.isFinite(score) ? score : null,
    estimated_value: Number.isFinite(estimated_value) ? estimated_value : null,
    currency: normalizePreferredCurrency(input.currency, DEFAULT_CURRENCY, {
      allowUnknown: true,
    }),
    external_crm_id:
      input.external_crm_id != null && String(input.external_crm_id).trim()
        ? String(input.external_crm_id).trim()
        : null,
    metadata:
      input.metadata && typeof input.metadata === "object"
        ? /** @type {Record<string, unknown>} */ (input.metadata)
        : {},
    created_at: String(input.created_at || nowIso()),
    updated_at: String(input.updated_at || nowIso()),
  };
}

/**
 * Shape for Leads UI / Zoho sync consumers (nested contact).
 * @param {LeadRecord} lead
 */
export function presentLead(lead) {
  return {
    ...lead,
    channel: lead.source_channel,
    contact: {
      name: lead.contact_name,
      email: lead.contact_email,
      phone: lead.contact_phone,
      id: lead.contact_id,
    },
  };
}

/** @returns {Promise<LeadRecord[]>} */
async function readLocal() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(shapeLead);
  } catch {
    return [];
  }
}

/** @param {LeadRecord[]} rows */
async function writeLocal(rows) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(rows, null, 2), "utf8");
}

/**
 * @param {{ q?: string, stage?: string }} [opts]
 */
export async function listLeads(opts = {}) {
  const q = String(opts.q || "")
    .trim()
    .toLowerCase();
  const stageFilter = opts.stage ? String(opts.stage).toLowerCase() : "";

  if (hasSupabaseAdminCredentials()) {
    try {
      const supabase = createAdminSupabaseClient();
      if (supabase) {
        let query = supabase
          .from(TABLE)
          .select("*")
          .eq("workspace_id", WORKSPACE_ID)
          .order("updated_at", { ascending: false });
        if (stageFilter) query = query.eq("stage", stageFilter);
        const { data, error } = await query;
        if (!error && Array.isArray(data)) {
          let rows = data.map(shapeLead);
          if (q) {
            rows = rows.filter((r) => {
              const hay =
                `${r.title} ${r.contact_name || ""} ${r.contact_email || ""} ${r.stage} ${r.source_channel || ""}`.toLowerCase();
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
  if (stageFilter) rows = rows.filter((r) => r.stage === stageFilter);
  if (q) {
    rows = rows.filter((r) => {
      const hay =
        `${r.title} ${r.contact_name || ""} ${r.contact_email || ""} ${r.stage} ${r.source_channel || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }
  return { mode: "local_mock", data: rows };
}

/**
 * @param {string} id
 */
export async function getLead(id) {
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
        if (!error && data) return shapeLead(data);
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
 * @param {Partial<LeadRecord> & Record<string, unknown>} input
 */
export async function upsertLead(input) {
  const id = input.id ? String(input.id) : null;
  let previous = null;
  if (id) previous = await getLead(id);

  const created = !previous;
  const lead = shapeLead({
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
          ...lead,
          metadata: lead.metadata,
        });
        if (!error) return { mode: "supabase", lead, created };
      }
    } catch {
      /* fall through */
    }
  }

  const rows = await readLocal();
  const idx = rows.findIndex((r) => r.id === lead.id);
  if (idx < 0) rows.unshift(lead);
  else rows[idx] = { ...lead, created_at: rows[idx].created_at };
  await writeLocal(rows);
  return {
    mode: "local_mock",
    lead: idx >= 0 ? rows[idx] : lead,
    created: idx < 0,
  };
}

/**
 * @param {string} id
 */
export async function deleteLead(id) {
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
    return { ok: false, message: "Lead not found" };
  }
  await writeLocal(next);
  return { ok: true, mode: "local_mock" };
}

/**
 * Opportunities derived from qualified/proposal/won leads (no fake opp-1).
 */
export async function listOpportunities() {
  const listed = await listLeads();
  const data = listed.data
    .filter((l) => ["qualified", "proposal", "won"].includes(l.stage))
    .map((l) => ({
      id: `opp-${l.id}`,
      name: l.title,
      stage: l.stage === "qualified" ? "proposal" : l.stage,
      amount: l.estimated_value,
      currency: l.currency,
      source_channel: l.source_channel,
      contact: {
        name: l.contact_name,
        email: l.contact_email,
        phone: l.contact_phone,
      },
      lead_id: l.id,
    }));
  return { mode: listed.mode, data };
}
