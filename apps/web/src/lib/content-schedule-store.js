/**
 * Mutable Content Studio / calendar store for Next dual-run.
 * Laravel remains source of truth when API_ORIGIN is healthy; this keeps
 * generate → approve → schedule → cron publish operable without it.
 */

import { buildContent } from "@/lib/api/seed-data";

/** @typedef {{ id: string, status: string, scheduled_for?: string|null, approval_version?: number, approved_by?: string|null, approved_at?: string|null, title?: string, body?: string, channel?: string, creative_brief?: object, publish_metadata?: object, published_at?: string|null, updated_at?: string }} ContentRow */

/** @type {ContentRow[]|null} */
let contentItems = null;

/** @type {Array<Record<string, unknown>>} */
let publications = [];

function cloneSeed() {
  return buildContent().map((item) => ({ ...item }));
}

export function getContentItems() {
  if (!contentItems) {
    contentItems = cloneSeed();
  }
  return contentItems;
}

export function getPublications() {
  return publications;
}

/**
 * @param {string} id
 * @returns {ContentRow|undefined}
 */
export function findContent(id) {
  return getContentItems().find((c) => c.id === id);
}

/**
 * @param {string} id
 * @param {Partial<ContentRow>} patch
 */
export function patchContent(id, patch) {
  const items = getContentItems();
  const idx = items.findIndex((c) => c.id === id);
  if (idx < 0) {
    const created = {
      id,
      title: patch.title || "Content",
      status: patch.status || "draft",
      body: patch.body || "",
      channel: patch.channel || "instagram",
      approval_version: patch.approval_version ?? 0,
      updated_at: new Date().toISOString(),
      ...patch,
    };
    items.unshift(created);
    return created;
  }
  items[idx] = {
    ...items[idx],
    ...patch,
    updated_at: new Date().toISOString(),
  };
  return items[idx];
}

export function listScheduled() {
  return getContentItems()
    .filter((c) => c.scheduled_for)
    .slice()
    .sort((a, b) => String(a.scheduled_for).localeCompare(String(b.scheduled_for)));
}

export function listPendingApproval() {
  return getContentItems().filter((c) => c.status === "draft" || c.status === "in_review");
}

/**
 * Dual-run cron: mark due scheduled items published (local_sim adapters).
 */
export function processDueContentPublish() {
  const now = Date.now();
  const due = getContentItems().filter(
    (c) =>
      c.status === "scheduled" &&
      c.scheduled_for &&
      new Date(c.scheduled_for).getTime() <= now &&
      (c.approval_version || 0) > 0
  );

  const results = [];
  for (const item of due) {
    const adapter =
      item.channel === "wordpress" || item.channel === "blog" ? "wordpress" : "meta_page";
    const pub = {
      id: `pub-cron-${item.id}-${Date.now()}`,
      content_item_id: item.id,
      adapter,
      channel: item.channel || adapter,
      status: "published",
      approval_version_checked: item.approval_version || 0,
      published_at: new Date().toISOString(),
      mode: "local_sim",
      source: "cron:content-publish",
    };
    publications = [pub, ...publications].slice(0, 50);
    patchContent(item.id, {
      status: "published",
      published_at: pub.published_at,
      publish_metadata: { adapter, mode: "local_sim", publication_id: pub.id },
    });
    results.push({
      content_item_id: item.id,
      title: item.title,
      scheduled_for: item.scheduled_for,
      published: true,
      adapters: [{ adapter, ok: true, mode: "local_sim" }],
    });
  }

  return {
    processed: results.length,
    results,
    workspaces: 1,
  };
}
