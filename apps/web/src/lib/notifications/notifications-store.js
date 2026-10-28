/**
 * Dual-run in-app notifications feed for the dashboard bell.
 * Content review (and other producers) push here; the bell UI reads this API.
 */

import { WORKSPACE } from "@/lib/api/seed-data";

/** @typedef {{
 *   id: string,
 *   workspace_id: string,
 *   type: string,
 *   title: string,
 *   body: string,
 *   href?: string|null,
 *   severity?: "info"|"warning"|"success"|"danger",
 *   entity_type?: string|null,
 *   entity_id?: string|null,
 *   payload?: Record<string, unknown>,
 *   read_at?: string|null,
 *   created_at: string,
 * }} NotificationEvent */

/** @type {NotificationEvent[]} */
let events = [];

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix = "notif") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Push a notification into the feed the dashboard bell reads.
 * Dedupes by type+entity_id while unread (updates title/body/href instead).
 *
 * @param {{
 *   type: string,
 *   title: string,
 *   body?: string,
 *   href?: string|null,
 *   severity?: "info"|"warning"|"success"|"danger",
 *   entity_type?: string|null,
 *   entity_id?: string|null,
 *   payload?: Record<string, unknown>,
 *   workspace_id?: string,
 *   dedupe?: boolean,
 * }} input
 * @returns {NotificationEvent}
 */
export function pushNotification(input) {
  const type = String(input.type || "info").trim() || "info";
  const entityId = input.entity_id ? String(input.entity_id) : null;
  const dedupe = input.dedupe !== false;

  if (dedupe && entityId) {
    const existing = events.find(
      (e) =>
        !e.read_at &&
        e.type === type &&
        e.entity_id === entityId
    );
    if (existing) {
      existing.title = String(input.title || existing.title);
      existing.body = String(input.body || existing.body || "");
      existing.href = input.href != null ? input.href : existing.href;
      existing.severity = input.severity || existing.severity || "info";
      existing.payload = {
        ...(existing.payload || {}),
        ...(input.payload || {}),
      };
      existing.created_at = nowIso();
      return { ...existing };
    }
  }

  /** @type {NotificationEvent} */
  const event = {
    id: newId("notif"),
    workspace_id: String(input.workspace_id || WORKSPACE.id || "triada-ops"),
    type,
    title: String(input.title || "Notification"),
    body: String(input.body || ""),
    href: input.href || null,
    severity: input.severity || "info",
    entity_type: input.entity_type || null,
    entity_id: entityId,
    payload: input.payload || {},
    read_at: null,
    created_at: nowIso(),
  };

  events = [event, ...events].slice(0, 200);
  return { ...event };
}

/**
 * @param {{ unreadOnly?: boolean, limit?: number }} [opts]
 * @returns {NotificationEvent[]}
 */
export function listNotifications(opts = {}) {
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 50));
  let rows = events.slice();
  if (opts.unreadOnly) {
    rows = rows.filter((e) => !e.read_at);
  }
  return rows.slice(0, limit).map((e) => ({ ...e }));
}

export function unreadNotificationCount() {
  return events.filter((e) => !e.read_at).length;
}

/**
 * @param {string} id
 */
export function markNotificationRead(id) {
  const row = events.find((e) => e.id === id);
  if (!row) return null;
  if (!row.read_at) row.read_at = nowIso();
  return { ...row };
}

export function markAllNotificationsRead() {
  const at = nowIso();
  let changed = 0;
  for (const row of events) {
    if (!row.read_at) {
      row.read_at = at;
      changed += 1;
    }
  }
  return { ok: true, marked: changed, unread_count: 0 };
}

export function notificationsFeedPayload(opts = {}) {
  const data = listNotifications(opts);
  return {
    data,
    unread_count: unreadNotificationCount(),
    feed: "dashboard_bell",
  };
}
