/**
 * Admin profile photo + channel attribution metadata.
 * Persists via agent_shared_kv (Supabase when keyed) + local file mirror —
 * same pattern as human-handoff settings.
 *
 * Channel honesty:
 * - Dashboard header / Settings / Inbox "You" bubbles: always show this photo.
 * - Messenger: Personas API (persona_id + profile_picture_url) when sync succeeds.
 * - WhatsApp: business-profile picture is account-level (one photo per number).
 * - Instagram Messaging: no per-message avatar; customers see the IG account photo.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BRAND } from "@/lib/brand/identity";
import { getLocalDataDir } from "@/lib/local-data-dir";
import { getSharedKv, setSharedKv } from "@/lib/agents/shared-memory";

const WORKSPACE_ID = "triada-ops";
const KV_KEY = "workspace.admin_profile";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "admin-profile-settings.json");

/**
 * @typedef {{
 *   workspace_id: string,
 *   display_name: string,
 *   avatar_url: string | null,
 *   messenger_persona_id: string | null,
 *   messenger_persona_picture_url: string | null,
 *   whatsapp_profile_synced_url: string | null,
 *   channel_sync: {
 *     messenger?: Record<string, unknown> | null,
 *     whatsapp?: Record<string, unknown> | null,
 *     instagram?: Record<string, unknown> | null,
 *   },
 *   updated_at: string,
 *   storage?: string,
 * }} AdminProfileSettings
 */

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeAvatarUrl(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^data:image\//i.test(value)) return value;
  if (value.startsWith("/")) return value;
  return null;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeDisplayName(raw) {
  const value = String(raw ?? "").trim().slice(0, 50);
  return value || BRAND.name || "Triada Admin";
}

/** @returns {AdminProfileSettings} */
export function defaultAdminProfileSettings() {
  return {
    workspace_id: WORKSPACE_ID,
    display_name: "Triada Admin",
    avatar_url: null,
    messenger_persona_id: null,
    messenger_persona_picture_url: null,
    whatsapp_profile_synced_url: null,
    channel_sync: {
      messenger: null,
      whatsapp: null,
      instagram: {
        ok: false,
        skipped: true,
        reason: "ig_account_photo_only",
        note: "Instagram Messaging has no per-message sender avatar; customers see the IG professional account photo.",
      },
    },
    updated_at: nowIso(),
  };
}

/**
 * @param {unknown} raw
 * @returns {AdminProfileSettings}
 */
export function shapeAdminProfileSettings(raw) {
  const base = defaultAdminProfileSettings();
  const src =
    raw && typeof raw === "object"
      ? /** @type {Record<string, unknown>} */ (raw)
      : {};
  const syncRaw =
    src.channel_sync && typeof src.channel_sync === "object"
      ? /** @type {Record<string, unknown>} */ (src.channel_sync)
      : {};
  return {
    workspace_id: WORKSPACE_ID,
    display_name: normalizeDisplayName(
      src.display_name ?? src.name ?? base.display_name,
    ),
    avatar_url: normalizeAvatarUrl(
      src.avatar_url ?? src.photo_url ?? src.profile_photo_url ?? null,
    ),
    messenger_persona_id:
      typeof src.messenger_persona_id === "string" &&
      src.messenger_persona_id.trim()
        ? String(src.messenger_persona_id).trim()
        : null,
    messenger_persona_picture_url: normalizeAvatarUrl(
      src.messenger_persona_picture_url ?? null,
    ),
    whatsapp_profile_synced_url: normalizeAvatarUrl(
      src.whatsapp_profile_synced_url ?? null,
    ),
    channel_sync: {
      messenger:
        syncRaw.messenger && typeof syncRaw.messenger === "object"
          ? /** @type {Record<string, unknown>} */ (syncRaw.messenger)
          : null,
      whatsapp:
        syncRaw.whatsapp && typeof syncRaw.whatsapp === "object"
          ? /** @type {Record<string, unknown>} */ (syncRaw.whatsapp)
          : null,
      instagram:
        syncRaw.instagram && typeof syncRaw.instagram === "object"
          ? /** @type {Record<string, unknown>} */ (syncRaw.instagram)
          : base.channel_sync.instagram,
    },
    updated_at:
      typeof src.updated_at === "string" && src.updated_at
        ? src.updated_at
        : nowIso(),
  };
}

async function readLocal() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    return shapeAdminProfileSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** @param {AdminProfileSettings} settings */
async function writeLocal(settings) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(settings, null, 2), "utf8");
}

function persistableValue(settings) {
  return {
    workspace_id: settings.workspace_id,
    display_name: settings.display_name,
    avatar_url: settings.avatar_url,
    messenger_persona_id: settings.messenger_persona_id,
    messenger_persona_picture_url: settings.messenger_persona_picture_url,
    whatsapp_profile_synced_url: settings.whatsapp_profile_synced_url,
    channel_sync: settings.channel_sync,
    updated_at: settings.updated_at,
  };
}

/**
 * @returns {Promise<AdminProfileSettings & { storage: string }>}
 */
export async function getAdminProfileSettings() {
  try {
    const entry = await getSharedKv(KV_KEY);
    if (entry && entry.value && typeof entry.value === "object") {
      const shaped = shapeAdminProfileSettings(entry.value);
      return { ...shaped, storage: "shared_kv" };
    }
  } catch {
    /* fall through */
  }

  const local = await readLocal();
  if (local) return { ...local, storage: "local_file" };

  const defaults = defaultAdminProfileSettings();
  return { ...defaults, storage: "defaults" };
}

/**
 * @param {Partial<AdminProfileSettings>} patch
 * @returns {Promise<AdminProfileSettings & { storage: string }>}
 */
export async function saveAdminProfileSettings(patch) {
  const current = await getAdminProfileSettings();
  const next = shapeAdminProfileSettings({
    ...current,
    ...patch,
    display_name: Object.prototype.hasOwnProperty.call(patch || {}, "display_name")
      ? patch.display_name
      : current.display_name,
    avatar_url: Object.prototype.hasOwnProperty.call(patch || {}, "avatar_url")
      ? patch.avatar_url
      : current.avatar_url,
    messenger_persona_id: Object.prototype.hasOwnProperty.call(
      patch || {},
      "messenger_persona_id",
    )
      ? patch.messenger_persona_id
      : current.messenger_persona_id,
    messenger_persona_picture_url: Object.prototype.hasOwnProperty.call(
      patch || {},
      "messenger_persona_picture_url",
    )
      ? patch.messenger_persona_picture_url
      : current.messenger_persona_picture_url,
    whatsapp_profile_synced_url: Object.prototype.hasOwnProperty.call(
      patch || {},
      "whatsapp_profile_synced_url",
    )
      ? patch.whatsapp_profile_synced_url
      : current.whatsapp_profile_synced_url,
    channel_sync: Object.prototype.hasOwnProperty.call(patch || {}, "channel_sync")
      ? {
          ...current.channel_sync,
          ...(patch.channel_sync && typeof patch.channel_sync === "object"
            ? patch.channel_sync
            : {}),
        }
      : current.channel_sync,
    updated_at: nowIso(),
  });

  let storage = "local_file";
  try {
    await setSharedKv({
      key: KV_KEY,
      value: persistableValue(next),
      written_by: "admin",
      tags: ["settings", "admin_profile", "avatar"],
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
 * Public https URL suitable for Meta Graph (Personas / WA profile handle upload).
 * Data URLs and relative paths cannot be fetched by Meta.
 * @param {string | null | undefined} url
 */
export function publicHttpsAvatarUrl(url) {
  const value = normalizeAvatarUrl(url);
  if (!value) return null;
  if (/^https:\/\//i.test(value)) return value;
  return null;
}
