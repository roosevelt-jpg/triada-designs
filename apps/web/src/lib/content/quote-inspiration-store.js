/**
 * Quote / Inspiration engine settings + history.
 * Weekday broadcast prefs, campaign list targeting, generated cards.
 * Persists under .triada-local (or /tmp on serverless); Supabase-ready shape.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getLocalDataDir } from "@/lib/local-data-dir";

const WORKSPACE_ID = "triada-ops";
const LOCAL_DIR = getLocalDataDir();
const SETTINGS_FILE = path.join(LOCAL_DIR, "quote-inspiration-settings.json");
const HISTORY_FILE = path.join(LOCAL_DIR, "quote-inspiration-history.json");

/** Mon=1 … Sun=7 (ISO weekday). Default: Mon, Wed, Fri. */
export const DEFAULT_WEEKDAYS = [1, 3, 5];

export const WEEKDAY_LABELS = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

/**
 * @typedef {{
 *   workspace_id: string,
 *   enabled: boolean,
 *   weekdays: number[],
 *   send_hour_utc: number,
 *   send_minute_utc: number,
 *   timezone: string,
 *   channel: string,
 *   template_name: string,
 *   language: string,
 *   theme: string,
 *   campaign_key: string,
 *   contact_ids: string[],
 *   recipient_limit: number,
 *   require_approval: boolean,
 *   auto_schedule_next: boolean,
 *   last_run_at: string|null,
 *   last_broadcast_at: string|null,
 *   last_content_id: string|null,
 *   updated_at: string,
 * }} QuoteInspirationSettings
 */

/**
 * @typedef {{
 *   id: string,
 *   content_id: string,
 *   quote: string,
 *   attribution: string,
 *   caption: string,
 *   theme: string,
 *   status: string,
 *   card_url: string|null,
 *   scheduled_for: string|null,
 *   weekday: number|null,
 *   broadcast: Record<string, unknown>|null,
 *   training_doc_ids: string[],
 *   created_at: string,
 * }} QuoteInspirationRow
 */

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix = "qi") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** @returns {QuoteInspirationSettings} */
export function defaultQuoteInspirationSettings() {
  return {
    workspace_id: WORKSPACE_ID,
    enabled: true,
    weekdays: [...DEFAULT_WEEKDAYS],
    send_hour_utc: 10,
    send_minute_utc: 0,
    timezone: "UTC",
    channel: "whatsapp",
    template_name: "triada_inspiration_share",
    language: "en",
    theme: "quiet luxury jewellery",
    campaign_key: "inspiration",
    contact_ids: [],
    recipient_limit: 50,
    require_approval: true,
    auto_schedule_next: true,
    last_run_at: null,
    last_broadcast_at: null,
    last_content_id: null,
    updated_at: nowIso(),
  };
}

/**
 * @param {unknown} value
 * @returns {number[]}
 */
export function normalizeWeekdays(value) {
  const raw = Array.isArray(value) ? value : [];
  const set = new Set();
  for (const item of raw) {
    const n = Number(item);
    if (Number.isInteger(n) && n >= 1 && n <= 7) set.add(n);
  }
  const list = [...set].sort((a, b) => a - b);
  return list.length ? list : [...DEFAULT_WEEKDAYS];
}

/**
 * ISO weekday 1–7 for a Date.
 * @param {Date} [date]
 */
export function isoWeekday(date = new Date()) {
  const js = date.getUTCDay(); // 0 Sun … 6 Sat
  return js === 0 ? 7 : js;
}

/**
 * Next UTC datetime matching selected weekdays + send hour.
 * @param {QuoteInspirationSettings} settings
 * @param {Date} [from]
 */
export function nextWeekdaySendAt(settings, from = new Date()) {
  const weekdays = normalizeWeekdays(settings.weekdays);
  const hour = Math.min(23, Math.max(0, Number(settings.send_hour_utc) || 10));
  const minute = Math.min(59, Math.max(0, Number(settings.send_minute_utc) || 0));
  const cursor = new Date(from.getTime());
  // Start from "now" — if today's slot already passed, move forward.
  for (let i = 0; i < 14; i += 1) {
    const day = new Date(
      Date.UTC(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth(),
        cursor.getUTCDate() + i,
        hour,
        minute,
        0,
        0,
      ),
    );
    if (!weekdays.includes(isoWeekday(day))) continue;
    if (day.getTime() > from.getTime() + 30_000) return day.toISOString();
  }
  // Fallback +7 days
  const fallback = new Date(from.getTime() + 7 * 86400000);
  fallback.setUTCHours(hour, minute, 0, 0);
  return fallback.toISOString();
}

/**
 * @param {QuoteInspirationSettings} settings
 * @param {Date} [now]
 */
export function isWeekdaySendDue(settings, now = new Date()) {
  if (!settings.enabled) return false;
  const weekdays = normalizeWeekdays(settings.weekdays);
  if (!weekdays.includes(isoWeekday(now))) return false;
  const hour = Number(settings.send_hour_utc) || 10;
  const minute = Number(settings.send_minute_utc) || 0;
  const slot = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hour,
    minute,
    0,
    0,
  );
  // Due within a 2-hour window after slot (cron runs daily).
  const elapsed = now.getTime() - slot;
  if (elapsed < 0 || elapsed > 2 * 60 * 60 * 1000) return false;
  if (settings.last_broadcast_at) {
    const last = new Date(settings.last_broadcast_at).getTime();
    // Already broadcast today.
    if (
      new Date(last).getUTCFullYear() === now.getUTCFullYear() &&
      new Date(last).getUTCMonth() === now.getUTCMonth() &&
      new Date(last).getUTCDate() === now.getUTCDate()
    ) {
      return false;
    }
  }
  return true;
}

async function ensureDir() {
  await mkdir(LOCAL_DIR, { recursive: true });
}

async function readJson(file, fallback) {
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await ensureDir();
  await writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

/** @returns {Promise<QuoteInspirationSettings>} */
export async function getQuoteInspirationSettings() {
  const raw = await readJson(SETTINGS_FILE, null);
  if (!raw || typeof raw !== "object") return defaultQuoteInspirationSettings();
  const base = defaultQuoteInspirationSettings();
  return {
    ...base,
    ...raw,
    weekdays: normalizeWeekdays(raw.weekdays ?? base.weekdays),
    contact_ids: Array.isArray(raw.contact_ids)
      ? raw.contact_ids.map(String)
      : [],
    workspace_id: WORKSPACE_ID,
  };
}

/**
 * @param {Partial<QuoteInspirationSettings>} patch
 * @returns {Promise<QuoteInspirationSettings>}
 */
export async function saveQuoteInspirationSettings(patch = {}) {
  const current = await getQuoteInspirationSettings();
  const next = {
    ...current,
    ...patch,
    weekdays: normalizeWeekdays(
      patch.weekdays !== undefined ? patch.weekdays : current.weekdays,
    ),
    contact_ids: Array.isArray(patch.contact_ids)
      ? patch.contact_ids.map(String)
      : current.contact_ids,
    send_hour_utc: Math.min(
      23,
      Math.max(0, Number(patch.send_hour_utc ?? current.send_hour_utc) || 10),
    ),
    send_minute_utc: Math.min(
      59,
      Math.max(0, Number(patch.send_minute_utc ?? current.send_minute_utc) || 0),
    ),
    recipient_limit: Math.min(
      100,
      Math.max(1, Number(patch.recipient_limit ?? current.recipient_limit) || 50),
    ),
    enabled: patch.enabled !== undefined ? Boolean(patch.enabled) : current.enabled,
    require_approval:
      patch.require_approval !== undefined
        ? Boolean(patch.require_approval)
        : current.require_approval,
    auto_schedule_next:
      patch.auto_schedule_next !== undefined
        ? Boolean(patch.auto_schedule_next)
        : current.auto_schedule_next,
    workspace_id: WORKSPACE_ID,
    updated_at: nowIso(),
  };
  await writeJson(SETTINGS_FILE, next);
  return next;
}

/** @returns {Promise<QuoteInspirationRow[]>} */
export async function listQuoteInspirationHistory() {
  const raw = await readJson(HISTORY_FILE, []);
  return Array.isArray(raw) ? raw : [];
}

/**
 * @param {Partial<QuoteInspirationRow> & { quote: string }} input
 * @returns {Promise<QuoteInspirationRow>}
 */
export async function appendQuoteInspirationHistory(input) {
  const row = {
    id: String(input.id || newId("qi")),
    content_id: String(input.content_id || ""),
    quote: String(input.quote || "").trim(),
    attribution: String(input.attribution || "Triada Designs"),
    caption: String(input.caption || ""),
    theme: String(input.theme || "inspiration"),
    status: String(input.status || "draft"),
    card_url: input.card_url != null ? String(input.card_url) : null,
    scheduled_for: input.scheduled_for != null ? String(input.scheduled_for) : null,
    weekday: input.weekday != null ? Number(input.weekday) : null,
    broadcast:
      input.broadcast && typeof input.broadcast === "object" ? input.broadcast : null,
    training_doc_ids: Array.isArray(input.training_doc_ids)
      ? input.training_doc_ids.map(String)
      : [],
    created_at: String(input.created_at || nowIso()),
  };
  const list = await listQuoteInspirationHistory();
  list.unshift(row);
  await writeJson(HISTORY_FILE, list.slice(0, 100));
  return row;
}

/**
 * @param {string} id
 * @param {Partial<QuoteInspirationRow>} patch
 */
export async function patchQuoteInspirationHistory(id, patch) {
  const list = await listQuoteInspirationHistory();
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...patch };
  await writeJson(HISTORY_FILE, list);
  return list[idx];
}

export function createQuoteContentId() {
  return newId("content-quote");
}
