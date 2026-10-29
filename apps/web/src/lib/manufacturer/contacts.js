/**
 * Manufacturer contacts directory (factory email / WhatsApp).
 */

import { normalizePhoneToE164 } from "@/lib/crm/phone-e164.js";
import {
  WORKSPACE_ID,
  listManufacturerRows,
  getManufacturerRow,
  newManufacturerId,
  nowIso,
  upsertManufacturerRow,
} from "@/lib/manufacturer/persistence";

const TABLE = "manufacturer_contacts";

const DEFAULT_CONTACT = {
  name: "Primary workshop",
  company: "Triada manufacturing partner",
  email: "workshop@triada-designs.com",
  phone: "+971500000000",
  preferred_channel: "email",
  is_primary: true,
  notes: "Default manufacturer contact — update with live workshop details.",
  status: "active",
};

/**
 * @param {Partial<object> & Record<string, unknown>} input
 */
export function shapeManufacturerContact(input = {}) {
  const phoneRaw = input.phone_e164 || input.phone || null;
  const normalized = normalizePhoneToE164(phoneRaw);
  const preferred = String(input.preferred_channel || "email").toLowerCase();
  return {
    id: String(input.id || newManufacturerId("mfrcontact")),
    workspace_id: String(input.workspace_id || WORKSPACE_ID),
    name: String(input.name || "Manufacturer").trim() || "Manufacturer",
    company: input.company != null ? String(input.company).trim() || null : null,
    email: input.email != null ? String(input.email).trim().toLowerCase() || null : null,
    phone: normalized.phone_e164 || (phoneRaw ? String(phoneRaw) : null),
    phone_e164: normalized.phone_e164,
    preferred_channel: preferred === "whatsapp" ? "whatsapp" : "email",
    is_primary: input.is_primary === true,
    notes: input.notes != null ? String(input.notes) : null,
    status: String(input.status || "active"),
    metadata:
      input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
        ? input.metadata
        : {},
    created_at: String(input.created_at || nowIso()),
    updated_at: String(input.updated_at || nowIso()),
  };
}

async function ensureDefaultContact() {
  const listed = await listManufacturerRows(TABLE, { limit: 50 });
  if (listed.data.length) return listed;
  const seeded = shapeManufacturerContact({
    id: "mfrcontact-primary",
    ...DEFAULT_CONTACT,
  });
  await upsertManufacturerRow(TABLE, seeded);
  return listManufacturerRows(TABLE, { limit: 50 });
}

/**
 * Clear other primaries when marking one primary.
 * @param {string} keepId
 */
async function clearOtherPrimaries(keepId) {
  const listed = await listManufacturerRows(TABLE, { limit: 100 });
  for (const row of listed.data) {
    if (row.id !== keepId && row.is_primary) {
      await upsertManufacturerRow(TABLE, { ...row, is_primary: false });
    }
  }
}

export async function listManufacturerContacts() {
  const listed = await ensureDefaultContact();
  return {
    data: listed.data.map((r) => shapeManufacturerContact(r)),
    storage: listed.storage,
  };
}

export async function getPrimaryManufacturerContact() {
  const listed = await listManufacturerContacts();
  const primary =
    listed.data.find((c) => c.is_primary && c.status === "active") ||
    listed.data.find((c) => c.status === "active") ||
    listed.data[0] ||
    null;
  return { contact: primary, storage: listed.storage };
}

/**
 * @param {Record<string, unknown>} input
 */
export async function upsertManufacturerContact(input = {}) {
  const existingId = input.id ? String(input.id) : "";
  const existing = existingId
    ? await getManufacturerRow(TABLE, existingId)
    : { row: null };
  const shaped = shapeManufacturerContact({
    ...(existing.row || {}),
    ...input,
    id: existingId || input.id || newManufacturerId("mfrcontact"),
    created_at: existing.row?.created_at,
  });
  if (shaped.is_primary) {
    await clearOtherPrimaries(shaped.id);
  }
  const saved = await upsertManufacturerRow(TABLE, shaped);
  return {
    ok: true,
    contact: shapeManufacturerContact(saved.row),
    storage: saved.storage,
  };
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} patch
 */
export async function patchManufacturerContact(id, patch = {}) {
  const found = await getManufacturerRow(TABLE, id);
  if (!found.row) return { ok: false, error: "not_found", contact: null };
  return upsertManufacturerContact({ ...found.row, ...patch, id: found.row.id });
}
