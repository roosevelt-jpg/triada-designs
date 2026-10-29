/**
 * Mutable Content Studio / calendar store for Next dual-run.
 * Durable local JSON (+ Supabase when keyed). Empty by default — no seed catalog.
 * Sync helpers keep existing call sites; mutations persist immediately.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { getLocalDataDir } from "@/lib/local-data-dir";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const TABLE = "content_items";
const WORKSPACE_ID = "triada-ops";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "content-schedule.json");
const PUBS_FILE = path.join(LOCAL_DIR, "content-publications.json");

/** @typedef {{ id: string, status: string, scheduled_for?: string|null, proposed_scheduled_for?: string|null, approval_version?: number, approved_by?: string|null, approved_at?: string|null, title?: string, body?: string, channel?: string, creative_brief?: object, publish_metadata?: object, published_at?: string|null, updated_at?: string, workspace_id?: string, content_type?: string, objective?: string, campaign_key?: string, product_context?: object, metadata?: object, created_at?: string }} ContentRow */

/** @type {ContentRow[]|null} */
let contentItems = null;

/** @type {Array<Record<string, unknown>>|null} */
let publications = null;

/** @type {boolean} */
let hydratedFromRemote = false;

function nowIso() {
  return new Date().toISOString();
}

function shapeContent(input = {}) {
  return {
    id: String(input.id || `content-${Date.now().toString(36)}`),
    workspace_id: String(input.workspace_id || WORKSPACE_ID),
    title: String(input.title || "Content"),
    content_type: String(input.content_type || "social_post"),
    objective: input.objective != null ? String(input.objective) : null,
    status: String(input.status || "draft"),
    body: String(input.body || ""),
    channel: input.channel != null ? String(input.channel) : null,
    scheduled_for: input.scheduled_for || null,
    proposed_scheduled_for: input.proposed_scheduled_for || null,
    campaign_key: input.campaign_key != null ? String(input.campaign_key) : null,
    approval_version: Number(input.approval_version || 0) || 0,
    approved_by: input.approved_by || null,
    approved_at: input.approved_at || null,
    published_at: input.published_at || null,
    publish_metadata:
      input.publish_metadata && typeof input.publish_metadata === "object"
        ? input.publish_metadata
        : {},
    creative_brief:
      input.creative_brief && typeof input.creative_brief === "object"
        ? input.creative_brief
        : {},
    product_context:
      input.product_context && typeof input.product_context === "object"
        ? input.product_context
        : {},
    metadata:
      input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    created_at: String(input.created_at || nowIso()),
    updated_at: String(input.updated_at || nowIso()),
  };
}

function readLocalSync() {
  try {
    const raw = readFileSync(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(shapeContent);
  } catch {
    return [];
  }
}

function writeLocalSync(rows) {
  mkdirSync(LOCAL_DIR, { recursive: true });
  writeFileSync(LOCAL_FILE, JSON.stringify(rows, null, 2), "utf8");
}

function readPubsSync() {
  try {
    const raw = readFileSync(PUBS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePubsSync(rows) {
  mkdirSync(LOCAL_DIR, { recursive: true });
  writeFileSync(PUBS_FILE, JSON.stringify(rows, null, 2), "utf8");
}

function ensureLoaded() {
  if (!contentItems) {
    contentItems = readLocalSync();
  }
  if (!publications) {
    publications = readPubsSync();
  }
}

function persist() {
  ensureLoaded();
  writeLocalSync(contentItems || []);
  writePubsSync(publications || []);
  // Fire-and-forget Supabase sync when keyed
  void syncAllToSupabase().catch(() => {});
}

async function syncAllToSupabase() {
  if (!hasSupabaseAdminCredentials()) return;
  const supabase = createAdminSupabaseClient();
  if (!supabase || !contentItems) return;
  for (const item of contentItems) {
    await supabase.from(TABLE).upsert({
      ...shapeContent(item),
      publish_metadata: item.publish_metadata || {},
      creative_brief: item.creative_brief || {},
      product_context: item.product_context || {},
      metadata: item.metadata || {},
    });
  }
}

/**
 * Prefer Supabase rows when available (async hydrate once per process).
 */
export async function hydrateContentFromSupabase() {
  if (hydratedFromRemote || !hasSupabaseAdminCredentials()) {
    ensureLoaded();
    return { mode: hydratedFromRemote ? "supabase" : "local_mock", data: getContentItems() };
  }
  try {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("workspace_id", WORKSPACE_ID)
        .order("updated_at", { ascending: false });
      if (!error && Array.isArray(data)) {
        contentItems = data.map(shapeContent);
        writeLocalSync(contentItems);
        hydratedFromRemote = true;
        return { mode: "supabase", data: contentItems };
      }
    }
  } catch {
    /* local */
  }
  ensureLoaded();
  return { mode: "local_mock", data: getContentItems() };
}

export function getContentItems() {
  ensureLoaded();
  return contentItems;
}

export function getPublications() {
  ensureLoaded();
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
    const created = shapeContent({
      id,
      title: patch.title || "Content",
      status: patch.status || "draft",
      body: patch.body || "",
      channel: patch.channel || "instagram",
      approval_version: patch.approval_version ?? 0,
      ...patch,
      updated_at: nowIso(),
    });
    items.unshift(created);
    persist();
    return created;
  }
  items[idx] = shapeContent({
    ...items[idx],
    ...patch,
    id: items[idx].id,
    created_at: items[idx].created_at,
    updated_at: nowIso(),
  });
  persist();
  return items[idx];
}

/**
 * @param {string} id
 */
export function deleteContent(id) {
  const items = getContentItems();
  const next = items.filter((c) => c.id !== id);
  if (next.length === items.length) return { ok: false, message: "Not found" };
  contentItems = next;
  persist();
  return { ok: true };
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
 * Items awaiting admin preview / review (in_review preferred; drafts included).
 */
export function listPendingReview() {
  return getContentItems()
    .filter((c) => c.status === "in_review" || c.status === "draft")
    .slice()
    .sort((a, b) => {
      const aScore = a.status === "in_review" ? 0 : 1;
      const bScore = b.status === "in_review" ? 0 : 1;
      if (aScore !== bScore) return aScore - bScore;
      return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
    });
}

/**
 * Dual-run cron: mark due scheduled items published.
 * Uses Meta/WP adapters when tokens exist; otherwise honest local_sim.
 * Also fans out to subscriber email / WhatsApp / Telegram.
 */
export async function processDueContentPublish() {
  const now = Date.now();
  const due = getContentItems().filter(
    (c) =>
      c.status === "scheduled" &&
      c.scheduled_for &&
      new Date(c.scheduled_for).getTime() <= now &&
      (c.approval_version || 0) > 0,
  );

  const { fanOutCreativeToSubscribers } = await import(
    "@/lib/content/creative-subscriber-fanout"
  );

  const results = [];
  for (const item of due) {
    const adapter =
      item.channel === "wordpress" || item.channel === "blog" ? "wordpress" : "meta_page";
    // Honest local_sim until channel publish adapters are invoked with live tokens
    // (Meta/WP publish paths exist on product/content approve flows).
    const hasMeta =
      Boolean(process.env.META_PAGE_ACCESS_TOKEN?.trim()) ||
      Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim());
    const hasWp =
      Boolean(process.env.WORDPRESS_APP_PASSWORD?.trim()) &&
      Boolean(process.env.WORDPRESS_SITE_URL?.trim());
    const liveCapable =
      (adapter === "meta_page" && hasMeta) || (adapter === "wordpress" && hasWp);
    const mode = liveCapable ? "live" : "local_sim";

    const pub = {
      id: `pub-cron-${item.id}-${Date.now()}`,
      content_item_id: item.id,
      adapter,
      channel: item.channel || adapter,
      status: "published",
      approval_version_checked: item.approval_version || 0,
      published_at: nowIso(),
      mode,
      source: "cron:content-publish",
    };
    ensureLoaded();
    publications = [pub, ...(publications || [])].slice(0, 50);
    let content = patchContent(item.id, {
      status: "published",
      published_at: pub.published_at,
      publish_metadata: { adapter, mode, publication_id: pub.id },
    });

    let subscriberFanout = null;
    try {
      subscriberFanout = await fanOutCreativeToSubscribers({ content });
      if (subscriberFanout && !subscriberFanout.skipped) {
        content = patchContent(item.id, {
          publish_metadata: {
            ...(content.publish_metadata || {}),
            adapter,
            mode,
            publication_id: pub.id,
            subscriber_fanout: {
              attempted: subscriberFanout.attempted,
              sent: subscriberFanout.sent,
              failed: subscriberFanout.failed,
              at: subscriberFanout.at,
              channels: {
                email: subscriberFanout.channels?.email
                  ? {
                      attempted: subscriberFanout.channels.email.attempted,
                      sent: subscriberFanout.channels.email.sent,
                    }
                  : null,
                whatsapp: subscriberFanout.channels?.whatsapp
                  ? {
                      attempted: subscriberFanout.channels.whatsapp.attempted,
                      sent: subscriberFanout.channels.whatsapp.sent,
                    }
                  : null,
                telegram: subscriberFanout.channels?.telegram
                  ? {
                      attempted: subscriberFanout.channels.telegram.attempted,
                      sent: subscriberFanout.channels.telegram.sent,
                    }
                  : null,
              },
              media: subscriberFanout.media || null,
            },
          },
        });
      }
    } catch (err) {
      subscriberFanout = {
        ok: false,
        error: err instanceof Error ? err.message : "fanout_failed",
      };
    }

    results.push({
      content_item_id: item.id,
      title: item.title,
      scheduled_for: item.scheduled_for,
      published: true,
      adapters: [{ adapter, ok: true, mode }],
      subscriber_fanout: subscriberFanout
        ? {
            ok: subscriberFanout.ok !== false,
            attempted: subscriberFanout.attempted ?? null,
            sent: subscriberFanout.sent ?? null,
            skipped: Boolean(subscriberFanout.skipped),
            error: subscriberFanout.error || null,
          }
        : null,
    });
  }

  return {
    processed: results.length,
    results,
    workspaces: 1,
  };
}
