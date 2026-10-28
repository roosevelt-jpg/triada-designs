/**
 * Admin notification events for the dashboard bell.
 * Persists to local dual-run JSON; always re-derives content_pending_review
 * from Content Studio so serverless /tmp wipes never hide approval work.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getLocalDataDir } from "@/lib/local-data-dir";
import {
  findContent,
  getContentItems,
  listPendingApproval,
} from "@/lib/content-schedule-store";

const WORKSPACE_ID = "triada-ops";
const LOCAL_FILE = path.join(getLocalDataDir(), "notifications.json");

/** Stable id for a content-pending-review synthetic event */
export function contentPendingReviewId(contentId) {
  return `n-content-pending-${contentId}`;
}

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @typedef {{
 *   id: string,
 *   workspace_id: string,
 *   user_id?: string|null,
 *   type: string,
 *   title: string,
 *   body: string,
 *   href?: string|null,
 *   payload?: Record<string, unknown>,
 *   read_at?: string|null,
 *   created_at: string,
 *   source?: string,
 * }} NotificationEvent
 */

/**
 * @returns {Promise<{ events: NotificationEvent[], read_ids: string[] }>}
 */
async function readStore() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      events: Array.isArray(parsed.events) ? parsed.events : [],
      read_ids: Array.isArray(parsed.read_ids) ? parsed.read_ids : [],
    };
  } catch {
    return { events: [], read_ids: [] };
  }
}

/**
 * @param {{ events: NotificationEvent[], read_ids: string[] }} data
 */
async function writeStore(data) {
  await mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await writeFile(
    LOCAL_FILE,
    JSON.stringify(
      {
        events: data.events,
        read_ids: data.read_ids,
        updated_at: nowIso(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

/**
 * Build live content-pending-review notifications from Content Studio.
 * @param {string[]} readIds
 * @returns {NotificationEvent[]}
 */
function deriveContentPendingReview(readIds) {
  const pending = listPendingApproval().filter(
    (c) => c.status === "in_review" || c.status === "draft",
  );
  const readSet = new Set(readIds);
  return pending.map((item) => {
    const id = contentPendingReviewId(item.id);
    const isReview = item.status === "in_review";
    return {
      id,
      workspace_id: item.workspace_id || WORKSPACE_ID,
      user_id: null,
      type: "content_pending_review",
      title: isReview ? "Content pending review" : "Draft awaiting review",
      body: item.title
        ? `"${item.title}" needs approval before publish.`
        : "A content item needs approval before publish.",
      href: "/content",
      payload: {
        content_id: item.id,
        content_status: item.status,
        channel: item.channel || null,
        content_type: item.content_type || null,
      },
      read_at: readSet.has(id) ? nowIso() : null,
      created_at: item.updated_at || item.created_at || nowIso(),
      source: "content_store",
    };
  });
}

/**
 * Seed a couple of durable ops notifications once (first write).
 * @returns {NotificationEvent[]}
 */
function seedOpsNotifications() {
  const at = nowIso();
  return [
    {
      id: "n-seed-welcome",
      workspace_id: WORKSPACE_ID,
      user_id: null,
      type: "system",
      title: "Welcome to Triada ops",
      body: "Approval-gated content and channel work land here when they need attention.",
      href: "/overview",
      payload: {},
      read_at: null,
      created_at: at,
      source: "seed",
    },
  ];
}

/**
 * @param {Partial<NotificationEvent> & { type: string, title: string }} input
 * @returns {Promise<NotificationEvent>}
 */
export async function createNotification(input) {
  const store = await readStore();
  if (store.events.length === 0 && store.read_ids.length === 0) {
    store.events = seedOpsNotifications();
  }

  const event = {
    id: input.id || newId(),
    workspace_id: input.workspace_id || WORKSPACE_ID,
    user_id: input.user_id ?? null,
    type: String(input.type),
    title: String(input.title),
    body: String(input.body || ""),
    href: input.href || null,
    payload: input.payload && typeof input.payload === "object" ? input.payload : {},
    read_at: input.read_at ?? null,
    created_at: input.created_at || nowIso(),
    source: input.source || "api",
  };

  // Dedupe by id (upsert)
  const idx = store.events.findIndex((e) => e.id === event.id);
  if (idx >= 0) {
    store.events[idx] = { ...store.events[idx], ...event };
  } else {
    store.events.unshift(event);
  }
  store.events = store.events.slice(0, 200);
  await writeStore(store);
  return event;
}

/**
 * Ensure a content_pending_review notification exists when content enters review.
 * @param {{ id: string, title?: string, status?: string, channel?: string, content_type?: string, workspace_id?: string, updated_at?: string }} item
 */
export async function notifyContentPendingReview(item) {
  if (!item?.id) return null;
  const status = item.status || "in_review";
  if (status !== "in_review" && status !== "draft") return null;

  const id = contentPendingReviewId(item.id);
  // Clear prior read so regenerated media re-alerts the admin
  const store = await readStore();
  store.read_ids = store.read_ids.filter((rid) => rid !== id);
  await writeStore(store);

  return createNotification({
    id,
    type: "content_pending_review",
    title: status === "in_review" ? "Content pending review" : "Draft awaiting review",
    body: item.title
      ? `"${item.title}" needs approval before publish.`
      : "A content item needs approval before publish.",
    href: "/content",
    payload: {
      content_id: item.id,
      content_status: status,
      channel: item.channel || null,
      content_type: item.content_type || null,
    },
    read_at: null,
    created_at: item.updated_at || nowIso(),
    source: "content_generate",
  });
}

/**
 * When content is approved/published, mark its pending-review notification read.
 * @param {string} contentId
 */
export async function dismissContentPendingReview(contentId) {
  if (!contentId) return;
  const id = contentPendingReviewId(contentId);
  await markNotificationRead(id);
  const store = await readStore();
  store.events = store.events.filter((e) => e.id !== id);
  await writeStore(store);
}

/**
 * @param {{ unreadOnly?: boolean, limit?: number }} [opts]
 */
export async function listNotifications(opts = {}) {
  const store = await readStore();
  if (store.events.length === 0 && store.read_ids.length === 0) {
    store.events = seedOpsNotifications();
    await writeStore(store);
  }

  // Ensure content store is hydrated
  getContentItems();

  const derived = deriveContentPendingReview(store.read_ids);
  const derivedIds = new Set(derived.map((d) => d.id));

  // Drop stale persisted content_pending_review rows that are no longer pending
  const persisted = store.events.filter((e) => {
    if (e.type !== "content_pending_review") return true;
    return derivedIds.has(e.id);
  });

  const byId = new Map();
  for (const e of persisted) {
    if (derivedIds.has(e.id)) continue; // prefer live derived
    byId.set(e.id, {
      ...e,
      read_at: e.read_at || (store.read_ids.includes(e.id) ? e.read_at || nowIso() : null),
    });
  }
  for (const d of derived) {
    byId.set(d.id, d);
  }

  let list = Array.from(byId.values()).sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)),
  );

  const unread_count = list.filter((e) => !e.read_at).length;
  if (opts.unreadOnly) {
    list = list.filter((e) => !e.read_at);
  }

  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
  return {
    data: list.slice(0, limit),
    unread_count,
    total: list.length,
    source: "next_dual_run",
  };
}

export async function getUnreadNotificationCount() {
  const listed = await listNotifications({ limit: 100 });
  return {
    unread_count: listed.data.filter((e) => !e.read_at).length,
    source: listed.source,
  };
}

/**
 * @param {string} id
 */
export async function markNotificationRead(id) {
  const store = await readStore();
  if (!store.read_ids.includes(id)) {
    store.read_ids.push(id);
  }
  store.events = store.events.map((e) =>
    e.id === id ? { ...e, read_at: e.read_at || nowIso() } : e,
  );
  await writeStore(store);

  // If this was a content pending review and content still pending, keep derived unread=false via read_ids
  const listed = await listNotifications({ limit: 100 });
  const found = listed.data.find((e) => e.id === id) || {
    id,
    read_at: nowIso(),
    type: "unknown",
    title: "Notification",
    body: "",
    created_at: nowIso(),
    workspace_id: WORKSPACE_ID,
  };
  return found;
}

export async function markAllNotificationsRead() {
  const listed = await listNotifications({ limit: 100 });
  const store = await readStore();
  const ids = listed.data.map((e) => e.id);
  store.read_ids = Array.from(new Set([...store.read_ids, ...ids]));
  const at = nowIso();
  store.events = store.events.map((e) => ({
    ...e,
    read_at: e.read_at || at,
  }));
  await writeStore(store);
  return getUnreadNotificationCount();
}

/**
 * Resolve a content item for href helpers / tests.
 * @param {string} contentId
 */
export function peekContent(contentId) {
  return findContent(contentId);
}
