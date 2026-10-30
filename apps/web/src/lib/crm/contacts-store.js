/**
 * Dual-run CRM contacts store (Supabase when keyed, else local mock file).
 * Phones are stored E.164 (+…) plus digits-only for WhatsApp Cloud `to`.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { normalizePhoneToE164 } from "./phone-e164.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getLocalDataDir } from "@/lib/local-data-dir";

const TABLE = "crm_contacts";
const WORKSPACE_ID = "triada-ops";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "crm-contacts.json");

/**
 * @typedef {{
 *   id: string,
 *   workspace_id: string,
 *   name: string | null,
 *   email: string | null,
 *   email_normalized: string | null,
 *   phone: string | null,
 *   phone_e164: string | null,
 *   phone_normalized: string | null,
 *   phone_valid: boolean,
 *   whatsapp_ready: boolean,
 *   preferred_language: string,
 *   lifecycle_status: string,
 *   source: string,
 *   marketing_opt_out: boolean,
 *   metadata: Record<string, unknown>,
 *   avatar_url: string | null,
 *   created_at: string,
 *   updated_at: string,
 * }} ContactRecord
 */

/**
 * @param {Record<string, unknown>} metadata
 * @returns {string | null}
 */
function avatarFromMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  const raw =
    metadata.avatar_url ||
    metadata.profile_pic ||
    metadata.picture ||
    metadata.photo_url ||
    metadata.profile_picture_url ||
    null;
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `contact-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {Partial<ContactRecord> & Record<string, unknown>} input
 * @returns {ContactRecord}
 */
export function shapeContact(input = {}) {
  const phoneRaw = input.phone_e164 || input.phone || input.primary_phone || null;
  const normalized =
    input.phone_normalized && input.phone_e164
      ? {
          ok: true,
          phone_e164: String(input.phone_e164),
          phone_digits: String(input.phone_normalized),
          error: null,
        }
      : normalizePhoneToE164(phoneRaw);

  const email =
    (input.email != null && String(input.email).trim()) ||
    (input.primary_email != null && String(input.primary_email).trim()) ||
    null;
  const name =
    (input.name != null && String(input.name).trim()) ||
    (input.display_name != null && String(input.display_name).trim()) ||
    null;

  const phone_valid =
    typeof input.phone_valid === "boolean" ? input.phone_valid : normalized.ok;
  const marketing_opt_out = Boolean(input.marketing_opt_out);

  const metadata =
    input.metadata && typeof input.metadata === "object"
      ? /** @type {Record<string, unknown>} */ (input.metadata)
      : {};
  const avatar_url =
    (typeof input.avatar_url === "string" &&
    /^https?:\/\//i.test(input.avatar_url.trim())
      ? input.avatar_url.trim()
      : null) || avatarFromMetadata(metadata);

  return {
    id: String(input.id || newId()),
    workspace_id: String(input.workspace_id || WORKSPACE_ID),
    name,
    email,
    email_normalized: email ? email.toLowerCase() : null,
    phone: normalized.phone_e164 || (phoneRaw ? String(phoneRaw) : null),
    phone_e164: normalized.phone_e164,
    phone_normalized: normalized.phone_digits,
    phone_valid,
    whatsapp_ready: phone_valid && !marketing_opt_out,
    preferred_language: String(input.preferred_language || "en"),
    lifecycle_status: String(input.lifecycle_status || "lead"),
    source: String(input.source || "manual"),
    marketing_opt_out,
    metadata: avatar_url
      ? { ...metadata, avatar_url }
      : metadata,
    avatar_url,
    created_at: String(input.created_at || nowIso()),
    updated_at: String(input.updated_at || nowIso()),
  };
}

/**
 * Find an existing contact by phone_normalized or email_normalized.
 * @param {{ phone_normalized?: string | null, email_normalized?: string | null }} keys
 * @returns {Promise<ContactRecord | null>}
 */
async function findContactByIdentity(keys) {
  const phoneKey = String(keys.phone_normalized || "").trim();
  const emailKey = String(keys.email_normalized || "").trim().toLowerCase();
  if (!phoneKey && !emailKey) return null;

  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      if (phoneKey) {
        const { data, error } = await supabase
          .from(TABLE)
          .select("*")
          .eq("workspace_id", WORKSPACE_ID)
          .eq("phone_normalized", phoneKey)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!error && data) return shapeContact(data);
      }
      if (emailKey) {
        const { data, error } = await supabase
          .from(TABLE)
          .select("*")
          .eq("workspace_id", WORKSPACE_ID)
          .eq("email_normalized", emailKey)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!error && data) return shapeContact(data);
      }
    }
  }

  const rows = await readLocal();
  if (phoneKey) {
    const hit = rows.find((c) => c.phone_normalized === phoneKey);
    if (hit) return hit;
  }
  if (emailKey) {
    const hit = rows.find((c) => c.email_normalized === emailKey);
    if (hit) return hit;
  }
  return null;
}

/** @returns {Promise<ContactRecord[]>} */
async function readLocal() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => shapeContact(row));
  } catch {
    return [];
  }
}

/** @param {ContactRecord[]} rows */
async function writeLocal(rows) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(rows, null, 2), "utf8");
}

/**
 * @returns {Promise<{ mode: 'supabase' | 'local_mock', data: ContactRecord[] }>}
 */
export async function listContacts(opts = {}) {
  const q = String(opts.q || "").trim().toLowerCase();
  const whatsappReadyOnly = Boolean(opts.whatsapp_ready);

  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      let query = supabase
        .from(TABLE)
        .select("*")
        .eq("workspace_id", WORKSPACE_ID)
        .order("updated_at", { ascending: false });

      if (whatsappReadyOnly) {
        query = query.eq("whatsapp_ready", true);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        let rows = data.map((row) => shapeContact(row));
        // Empty by default — never auto-seed fake contacts into Production.
        rows = filterContacts(rows, q, whatsappReadyOnly);
        return { mode: "supabase", data: rows };
      }
    }
  }

  let rows = await readLocal();
  rows = filterContacts(rows, q, whatsappReadyOnly);
  return { mode: "local_mock", data: rows };
}

/**
 * @param {ContactRecord[]} rows
 * @param {string} q
 * @param {boolean} whatsappReadyOnly
 */
function filterContacts(rows, q, whatsappReadyOnly) {
  let out = rows;
  if (whatsappReadyOnly) {
    out = out.filter((c) => c.whatsapp_ready && c.phone_normalized);
  }
  if (q) {
    out = out.filter((c) => {
      const hay = `${c.name || ""} ${c.email || ""} ${c.phone || ""} ${c.phone_normalized || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }
  return out;
}

/**
 * Fetch one contact by id (Supabase when keyed, else local mock).
 * @param {string} id
 * @returns {Promise<ContactRecord | null>}
 */
export async function getContact(id) {
  const contactId = String(id || "").trim();
  if (!contactId) return null;

  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("workspace_id", WORKSPACE_ID)
        .eq("id", contactId)
        .limit(1)
        .maybeSingle();
      if (!error && data) return shapeContact(data);
    }
  }

  const rows = await readLocal();
  return rows.find((c) => c.id === contactId) || null;
}

/**
 * Upsert by phone_normalized (preferred) or email_normalized.
 * @param {Array<Partial<ContactRecord>>} inputs
 * @returns {Promise<{ mode: string, upserted: ContactRecord[], created: number, updated: number }>}
 */
export async function upsertContacts(inputs) {
  /** @type {ContactRecord[]} */
  const resolved = [];
  let created = 0;
  let updated = 0;

  for (const raw of inputs || []) {
    const shaped = shapeContact({ ...raw, updated_at: nowIso() });
    let existing = await findContactByIdentity({
      phone_normalized: shaped.phone_normalized,
      email_normalized: shaped.email_normalized,
    });
    // Explicit id (e.g. stable channel peer) wins when identity keys are empty.
    if (!existing && raw && raw.id) {
      existing = await getContact(String(raw.id));
    }
    if (existing) {
      const mergedMeta = {
        ...(existing.metadata || {}),
        ...(shaped.metadata || {}),
      };
      resolved.push(
        shapeContact({
          ...existing,
          ...shaped,
          id: existing.id,
          name: shaped.name || existing.name,
          email: shaped.email || existing.email,
          phone: shaped.phone || existing.phone,
          phone_e164: shaped.phone_e164 || existing.phone_e164,
          phone_normalized: shaped.phone_normalized || existing.phone_normalized,
          phone_valid: shaped.phone_valid || existing.phone_valid,
          preferred_language:
            shaped.preferred_language || existing.preferred_language,
          metadata: mergedMeta,
          avatar_url: shaped.avatar_url || existing.avatar_url,
          created_at: existing.created_at,
          updated_at: nowIso(),
        }),
      );
      updated += 1;
    } else {
      resolved.push(shapeContact({ ...shaped, id: shaped.id || newId() }));
      created += 1;
    }
  }

  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      const payload = resolved.map((c) => ({
        id: c.id,
        workspace_id: c.workspace_id,
        name: c.name,
        email: c.email,
        email_normalized: c.email_normalized,
        phone: c.phone,
        phone_e164: c.phone_e164,
        phone_normalized: c.phone_normalized,
        phone_valid: c.phone_valid,
        whatsapp_ready: c.whatsapp_ready,
        preferred_language: c.preferred_language,
        lifecycle_status: c.lifecycle_status,
        source: c.source,
        marketing_opt_out: c.marketing_opt_out,
        metadata: c.metadata,
        created_at: c.created_at,
        updated_at: c.updated_at,
      }));

      const { data, error } = await supabase
        .from(TABLE)
        .upsert(payload, { onConflict: "id" })
        .select("*");

      if (!error && Array.isArray(data)) {
        return {
          mode: "supabase",
          upserted: data.map((row) => shapeContact(row)),
          created,
          updated,
        };
      }
      // Fall through to local if table missing / RLS
    }
  }

  const existingRows = await readLocal();
  const byId = new Map(existingRows.map((c) => [c.id, c]));
  for (const row of resolved) {
    byId.set(row.id, row);
  }
  const next = Array.from(byId.values()).sort((a, b) =>
    String(b.updated_at).localeCompare(String(a.updated_at)),
  );
  await writeLocal(next);
  return {
    mode: "local_mock",
    upserted: resolved,
    created,
    updated,
  };
}

/**
 * Import mapped upload rows; only persists phone_valid rows.
 * Invalid rows are returned for UI flagging and are not stored.
 * @param {Array<Record<string, unknown>>} mappedRows
 * @param {{ source?: string }} [opts]
 */
export async function importContactRows(mappedRows, opts = {}) {
  const source = opts.source || "upload";
  const valid = [];
  const invalid = [];

  for (const row of mappedRows || []) {
    if (row.phone_valid && row.phone_normalized) {
      valid.push(
        shapeContact({
          name: row.name,
          email: row.email,
          phone: row.phone_e164 || row.phone,
          phone_e164: row.phone_e164,
          phone_normalized: row.phone_normalized,
          phone_valid: true,
          preferred_language: row.preferred_language || "en",
          source: row.source || source,
          metadata: {
            upload_row: row.row_number ?? null,
            phone_raw: row.phone_raw || null,
          },
        }),
      );
    } else {
      invalid.push({
        row_number: row.row_number ?? null,
        name: row.name || null,
        email: row.email || null,
        phone_raw: row.phone_raw || null,
        error: row.phone_error || "invalid_phone",
      });
    }
  }

  const result = valid.length
    ? await upsertContacts(valid)
    : { mode: hasSupabaseAdminCredentials() ? "supabase" : "local_mock", upserted: [], created: 0, updated: 0 };

  return {
    mode: result.mode,
    imported: result.upserted,
    created: result.created,
    updated: result.updated,
    invalid,
    summary: {
      submitted: (mappedRows || []).length,
      imported: result.upserted.length,
      created: result.created,
      updated: result.updated,
      invalid: invalid.length,
    },
  };
}

/**
 * Non-mutating contact count for Overview KPIs.
 * Does not seed empty stores — empty workspace returns 0.
 * @returns {Promise<{ count: number, mode: 'supabase' | 'local_mock' }>}
 */
export async function countContacts() {
  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      const { count, error } = await supabase
        .from(TABLE)
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", WORKSPACE_ID);
      if (!error && typeof count === "number") {
        return { count, mode: "supabase" };
      }
    }
  }

  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { count: parsed.length, mode: "local_mock" };
    }
  } catch {
    /* missing file = empty */
  }
  return { count: 0, mode: "local_mock" };
}

/**
 * Contacts ready for WhatsApp template/campaign sends.
 * @returns {Promise<{ mode: string, data: ContactRecord[] }>}
 */
export async function listWhatsAppCampaignRecipients() {
  return listContacts({ whatsapp_ready: true });
}
