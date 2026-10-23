import { apiFetch } from "@/lib/api-client";

/** @typedef {{ timezone: string, skewMs: number, syncedAt: number, utc?: string, workspace_local?: string, offset_minutes?: number }} SystemTimeState */

/** @type {SystemTimeState} */
let state = {
  timezone: "UTC",
  skewMs: 0,
  syncedAt: 0,
};

const listeners = new Set();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn(getSystemTimeState());
    } catch {
      // ignore subscriber errors
    }
  });
}

/** @returns {SystemTimeState} */
export function getSystemTimeState() {
  return { ...state };
}

/**
 * Subscribe to system-time sync updates.
 * @param {(s: SystemTimeState) => void} listener
 */
export function subscribeSystemTime(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Sync clock skew + workspace timezone from the API.
 * Safe to call repeatedly; failures leave the previous skew in place.
 */
export async function syncSystemTime() {
  const data = await apiFetch("/v1/system/time");
  const serverMs =
    typeof data.unix_ms === "number" && Number.isFinite(data.unix_ms)
      ? data.unix_ms
      : new Date(data.utc).getTime();
  const clientMs = Date.now();
  state = {
    timezone: data.timezone || "UTC",
    skewMs: serverMs - clientMs,
    syncedAt: clientMs,
    utc: data.utc,
    workspace_local: data.workspace_local,
    offset_minutes: data.offset_minutes,
  };
  notify();
  return getSystemTimeState();
}

/** Server/workspace-aligned "now" (Date). */
export function nowDate() {
  return new Date(Date.now() + state.skewMs);
}

/** ISO string for scheduling payloads using server-aligned now. */
export function nowIso() {
  return nowDate().toISOString();
}

/**
 * Format using live Date + workspace timezone when available.
 * @param {string|Date|null|undefined} value
 * @param {Intl.DateTimeFormatOptions} [options]
 */
export function formatInWorkspace(value, options = {}) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const timeZone = state.timezone || undefined;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      ...options,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", options).format(date);
  }
}
