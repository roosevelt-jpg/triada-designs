/**
 * Admin-configured live support contacts for human handoff.
 * When a customer asks to speak with a person, Support shares these numbers.
 * Persists via agent_shared_kv (Supabase when keyed) + local file mirror.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BRAND } from "@/lib/brand/identity";
import { getLocalDataDir } from "@/lib/local-data-dir";
import { normalizePhoneToE164 } from "@/lib/crm/phone-e164";
import { getSharedKv, setSharedKv } from "@/lib/agents/shared-memory";

const WORKSPACE_ID = "triada-ops";
const KV_KEY = "workspace.human_handoff";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "human-handoff-settings.json");

/**
 * @typedef {{
 *   workspace_id: string,
 *   enabled: boolean,
 *   whatsapp_number: string,
 *   call_number: string,
 *   updated_at: string,
 *   storage?: string,
 * }} HumanHandoffSettings
 */

function nowIso() {
  return new Date().toISOString();
}

/**
 * Soft-normalize for display: keep E.164 when possible, else trimmed raw.
 * Empty string is allowed (admin may leave one channel blank).
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeHandoffNumber(raw) {
  const original = String(raw ?? "").trim();
  if (!original) return "";
  const normalized = normalizePhoneToE164(original, { defaultRegion: "RO" });
  if (normalized.ok && normalized.phone_e164) return normalized.phone_e164;
  // Keep spaces for display if user typed a formatted number that still has digits.
  const digits = original.replace(/\D+/g, "");
  if (digits.length >= 8) return original;
  return original;
}

/** @returns {HumanHandoffSettings} */
export function defaultHumanHandoffSettings() {
  const phones = Array.isArray(BRAND.phones) ? BRAND.phones : [];
  const primary = phones[0] ? normalizeHandoffNumber(phones[0]) : "";
  const secondary = phones[1] ? normalizeHandoffNumber(phones[1]) : primary;
  return {
    workspace_id: WORKSPACE_ID,
    enabled: true,
    whatsapp_number: primary,
    call_number: secondary || primary,
    updated_at: nowIso(),
  };
}

/**
 * @param {unknown} raw
 * @returns {HumanHandoffSettings}
 */
export function shapeHumanHandoffSettings(raw) {
  const base = defaultHumanHandoffSettings();
  const src = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  return {
    workspace_id: WORKSPACE_ID,
    enabled: src.enabled === false ? false : true,
    whatsapp_number: normalizeHandoffNumber(
      src.whatsapp_number ?? src.whatsapp ?? src.wa_number ?? base.whatsapp_number,
    ),
    call_number: normalizeHandoffNumber(
      src.call_number ?? src.phone ?? src.phone_number ?? base.call_number,
    ),
    updated_at:
      typeof src.updated_at === "string" && src.updated_at
        ? src.updated_at
        : nowIso(),
  };
}

async function readLocal() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    return shapeHumanHandoffSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** @param {HumanHandoffSettings} settings */
async function writeLocal(settings) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(settings, null, 2), "utf8");
}

/**
 * @returns {Promise<HumanHandoffSettings & { storage: string }>}
 */
export async function getHumanHandoffSettings() {
  try {
    const entry = await getSharedKv(KV_KEY);
    if (entry && entry.value && typeof entry.value === "object") {
      const shaped = shapeHumanHandoffSettings(entry.value);
      return { ...shaped, storage: "shared_kv" };
    }
  } catch {
    /* fall through */
  }

  const local = await readLocal();
  if (local) return { ...local, storage: "local_file" };

  const defaults = defaultHumanHandoffSettings();
  return { ...defaults, storage: "defaults" };
}

/**
 * @param {Partial<HumanHandoffSettings>} patch
 * @returns {Promise<HumanHandoffSettings & { storage: string }>}
 */
export async function saveHumanHandoffSettings(patch) {
  const current = await getHumanHandoffSettings();
  const next = shapeHumanHandoffSettings({
    ...current,
    ...patch,
    enabled:
      patch && Object.prototype.hasOwnProperty.call(patch, "enabled")
        ? patch.enabled !== false
        : current.enabled,
    whatsapp_number:
      patch && Object.prototype.hasOwnProperty.call(patch, "whatsapp_number")
        ? patch.whatsapp_number
        : current.whatsapp_number,
    call_number:
      patch && Object.prototype.hasOwnProperty.call(patch, "call_number")
        ? patch.call_number
        : current.call_number,
    updated_at: nowIso(),
  });

  let storage = "local_file";
  try {
    await setSharedKv({
      key: KV_KEY,
      value: {
        workspace_id: next.workspace_id,
        enabled: next.enabled,
        whatsapp_number: next.whatsapp_number,
        call_number: next.call_number,
        updated_at: next.updated_at,
      },
      written_by: "admin",
      tags: ["settings", "human_handoff", "support"],
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

  return { ...next, storage };
}

/**
 * wa.me link for the configured WhatsApp live number (digits only).
 * @param {string} [number]
 */
export function whatsappMeLink(number) {
  const digits = String(number || "").replace(/\D+/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}
