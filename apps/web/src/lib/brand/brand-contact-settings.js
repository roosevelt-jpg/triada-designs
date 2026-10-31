/**
 * Workspace brand address / contact for outbound footers (AI replies, Meta DMs,
 * WhatsApp, email) and invoice defaults. Same editable source as Settings + invoices.
 * Persists via agent_shared_kv (Supabase when keyed) + local file mirror.
 * Blank fields fall back to hardcoded BRAND identity defaults (not Meta business profile).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BRAND } from "@/lib/brand/identity";
import { getLocalDataDir } from "@/lib/local-data-dir";
import { getSharedKv, setSharedKv } from "@/lib/agents/shared-memory";

const WORKSPACE_ID = "triada-ops";
const KV_KEY = "workspace.brand_contact";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "brand-contact-settings.json");

/**
 * @typedef {{
 *   workspace_id: string,
 *   address_line: string,
 *   ops_email: string,
 *   phones: string,
 *   updated_at: string,
 *   storage?: string,
 * }} BrandContactSettings
 */

/** @type {BrandContactSettings | null} */
let cache = null;

function nowIso() {
  return new Date().toISOString();
}

/** @returns {BrandContactSettings} */
export function defaultBrandContactSettings() {
  return {
    workspace_id: WORKSPACE_ID,
    address_line: BRAND.address.singleLine,
    ops_email: BRAND.opsEmail,
    phones: Array.isArray(BRAND.phones) ? BRAND.phones.join(" · ") : "",
    updated_at: nowIso(),
  };
}

/**
 * @param {unknown} raw
 * @returns {BrandContactSettings}
 */
export function shapeBrandContactSettings(raw) {
  const base = defaultBrandContactSettings();
  const src = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const address = String(
    src.address_line ?? src.addressLine ?? src.address ?? "",
  ).trim();
  const email = String(src.ops_email ?? src.opsEmail ?? src.email ?? "").trim();
  const phonesRaw = src.phones ?? src.phone ?? src.tel;
  const phones =
    typeof phonesRaw === "string"
      ? phonesRaw.trim()
      : Array.isArray(phonesRaw)
        ? phonesRaw.map(String).map((p) => p.trim()).filter(Boolean).join(" · ")
        : "";

  return {
    workspace_id: WORKSPACE_ID,
    address_line: address || base.address_line,
    ops_email: email || base.ops_email,
    phones: phones || base.phones,
    updated_at:
      typeof src.updated_at === "string" && src.updated_at
        ? src.updated_at
        : nowIso(),
  };
}

/**
 * Sync read of last loaded/saved brand contact (or BRAND defaults).
 * Warm via getBrandContactSettings() on outbound / Settings paths.
 * @returns {BrandContactSettings}
 */
export function getBrandContactSync() {
  return cache || defaultBrandContactSettings();
}

/** @param {BrandContactSettings} settings */
function setCache(settings) {
  cache = settings;
  return settings;
}

async function readLocal() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    return shapeBrandContactSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** @param {BrandContactSettings} settings */
async function writeLocal(settings) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(settings, null, 2), "utf8");
}

/**
 * @returns {Promise<BrandContactSettings & { storage: string }>}
 */
export async function getBrandContactSettings() {
  try {
    const entry = await getSharedKv(KV_KEY);
    if (entry && entry.value && typeof entry.value === "object") {
      const shaped = shapeBrandContactSettings(entry.value);
      setCache(shaped);
      return { ...shaped, storage: "shared_kv" };
    }
  } catch {
    /* fall through */
  }

  const local = await readLocal();
  if (local) {
    setCache(local);
    return { ...local, storage: "local_file" };
  }

  const defaults = defaultBrandContactSettings();
  setCache(defaults);
  return { ...defaults, storage: "defaults" };
}

/**
 * @param {Partial<BrandContactSettings> & Record<string, unknown>} patch
 * @returns {Promise<BrandContactSettings & { storage: string }>}
 */
export async function saveBrandContactSettings(patch) {
  const current = await getBrandContactSettings();
  const next = shapeBrandContactSettings({
    ...current,
    ...patch,
    address_line:
      patch && Object.prototype.hasOwnProperty.call(patch, "address_line")
        ? patch.address_line
        : patch && Object.prototype.hasOwnProperty.call(patch, "addressLine")
          ? patch.addressLine
          : current.address_line,
    ops_email:
      patch && Object.prototype.hasOwnProperty.call(patch, "ops_email")
        ? patch.ops_email
        : patch && Object.prototype.hasOwnProperty.call(patch, "opsEmail")
          ? patch.opsEmail
          : current.ops_email,
    phones:
      patch && Object.prototype.hasOwnProperty.call(patch, "phones")
        ? patch.phones
        : current.phones,
    updated_at: nowIso(),
  });

  let storage = "local_file";
  try {
    await setSharedKv({
      key: KV_KEY,
      value: {
        workspace_id: next.workspace_id,
        address_line: next.address_line,
        ops_email: next.ops_email,
        phones: next.phones,
        updated_at: next.updated_at,
      },
      written_by: "admin",
      tags: ["settings", "brand_contact", "outbound"],
    });
    storage = "shared_kv";
  } catch {
    storage = "local_file";
  }

  try {
    await writeLocal(next);
  } catch {
    /* best-effort local mirror */
  }

  setCache(next);
  return { ...next, storage };
}

/**
 * When an invoice saves non-blank address/contact, mirror into the shared brand
 * contact so AI Meta/IG/WA footers match the updated invoice address.
 * Blank invoice fields leave the shared brand contact unchanged.
 * @param {{ address_line?: string, ops_email?: string, phones?: string }} doc
 */
export async function syncBrandContactFromInvoice(doc) {
  const address = String(doc?.address_line || "").trim();
  const email = String(doc?.ops_email || "").trim();
  const phones = String(doc?.phones || "").trim();
  if (!address && !email && !phones) {
    return getBrandContactSettings();
  }
  /** @type {Partial<BrandContactSettings>} */
  const patch = {};
  if (address) patch.address_line = address;
  if (email) patch.ops_email = email;
  if (phones) patch.phones = phones;
  return saveBrandContactSettings(patch);
}

/**
 * Plain-text multi-line footer for chat / WhatsApp / AI closing signatures.
 * @param {Partial<BrandContactSettings> | null | undefined} [contact]
 */
export function brandContactPlain(contact) {
  const c = shapeBrandContactSettings(contact || getBrandContactSync());
  return [
    BRAND.name,
    c.address_line,
    `Email: ${c.ops_email}`,
    `Tel: ${c.phones}`,
    BRAND.siteUrl,
  ].join("\n");
}

/**
 * Compact one-line footer (Meta template FOOTER length limits).
 * @param {Partial<BrandContactSettings> | null | undefined} [contact]
 */
export function brandContactOneLine(contact) {
  const c = shapeBrandContactSettings(contact || getBrandContactSync());
  return `${BRAND.name} · ${c.address_line} · ${c.ops_email} · ${BRAND.siteUrl}`;
}
