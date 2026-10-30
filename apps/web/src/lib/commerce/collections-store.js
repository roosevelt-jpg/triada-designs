/**
 * Triada product collections store.
 * Durable local/Supabase records; auto-upserted to Shopify custom_collections when Connected.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { getLocalDataDir } from "@/lib/local-data-dir";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TABLE = "commerce_collections";
const WORKSPACE_ID = "triada-ops";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "commerce-collections.json");

/**
 * @typedef {{
 *   status: string,
 *   external_id?: string | null,
 *   link?: string | null,
 *   synced_at?: string | null,
 *   mode?: string | null,
 *   message?: string | null,
 * }} ShopifyCollectionSync
 */

/**
 * @typedef {{
 *   id: string,
 *   workspace_id: string,
 *   title: string,
 *   handle: string | null,
 *   body_html: string,
 *   published: boolean,
 *   product_ids: string[],
 *   metadata: Record<string, unknown>,
 *   shopify_sync: ShopifyCollectionSync,
 *   created_at: string,
 *   updated_at: string,
 * }} CollectionRecord
 */

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `col-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** @returns {ShopifyCollectionSync} */
function emptySync() {
  return {
    status: "awaiting_credentials",
    external_id: null,
    link: null,
    synced_at: null,
    mode: "local",
    message: "Waiting credentials.",
  };
}

function slugify(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/**
 * @param {Partial<CollectionRecord> & Record<string, unknown>} input
 * @returns {CollectionRecord}
 */
export function shapeCollection(input = {}) {
  const title = String(input.title || "").trim() || "Untitled collection";
  const syncIn =
    input.shopify_sync && typeof input.shopify_sync === "object"
      ? /** @type {ShopifyCollectionSync} */ (input.shopify_sync)
      : emptySync();
  const productIds = Array.isArray(input.product_ids)
    ? input.product_ids.map((id) => String(id)).filter(Boolean)
    : typeof input.product_ids === "string" && input.product_ids.trim()
      ? input.product_ids
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  return {
    id: String(input.id || newId()),
    workspace_id: String(input.workspace_id || WORKSPACE_ID),
    title,
    handle:
      input.handle != null && String(input.handle).trim()
        ? slugify(input.handle)
        : slugify(title) || null,
    body_html: String(input.body_html || input.description || "").trim(),
    published: input.published !== false && input.published !== "false",
    product_ids: productIds,
    metadata:
      input.metadata && typeof input.metadata === "object"
        ? /** @type {Record<string, unknown>} */ (input.metadata)
        : {},
    shopify_sync: { ...emptySync(), ...syncIn },
    created_at: String(input.created_at || nowIso()),
    updated_at: String(input.updated_at || nowIso()),
  };
}

/** @returns {Promise<CollectionRecord[]>} */
async function readLocal() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => shapeCollection(row));
  } catch {
    return [];
  }
}

/** @param {CollectionRecord[]} rows */
async function writeLocal(rows) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(rows, null, 2), "utf8");
}

export async function listCollections() {
  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("workspace_id", WORKSPACE_ID)
        .order("updated_at", { ascending: false });
      if (!error && Array.isArray(data)) {
        return {
          mode: "supabase",
          data: data.map((row) =>
            shapeCollection({
              ...row,
              shopify_sync: row.metadata?.shopify_sync || row.shopify_sync,
              product_ids: row.metadata?.product_ids || row.product_ids,
            }),
          ),
        };
      }
    }
  }
  return { mode: "local_mock", data: await readLocal() };
}

/** @param {string} id */
export async function getCollection(id) {
  const listed = await listCollections();
  return listed.data.find((c) => c.id === String(id)) || null;
}

/**
 * @param {Partial<CollectionRecord> & Record<string, unknown>} input
 */
export async function upsertCollection(input = {}) {
  const title = String(input.title || "").trim();
  if (!title) {
    return { ok: false, error: "title is required", status: 422 };
  }
  const existingId = input.id ? String(input.id) : "";
  const listed = await listCollections();
  const previous =
    (existingId && listed.data.find((c) => c.id === existingId)) ||
    listed.data.find(
      (c) => c.title.toLowerCase() === title.toLowerCase(),
    ) ||
    null;

  const shaped = shapeCollection({
    ...(previous || {}),
    ...input,
    id: previous?.id || existingId || newId(),
    title,
    created_at: previous?.created_at,
    shopify_sync: input.shopify_sync || previous?.shopify_sync,
    updated_at: nowIso(),
  });

  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from(TABLE)
        .upsert(
          {
            id: shaped.id,
            workspace_id: shaped.workspace_id,
            title: shaped.title,
            handle: shaped.handle,
            body_html: shaped.body_html,
            published: shaped.published,
            metadata: {
              ...shaped.metadata,
              product_ids: shaped.product_ids,
              shopify_sync: shaped.shopify_sync,
            },
            created_at: shaped.created_at,
            updated_at: shaped.updated_at,
          },
          { onConflict: "id" },
        )
        .select("*")
        .maybeSingle();
      if (!error && data) {
        return {
          ok: true,
          created: !previous,
          mode: "supabase",
          collection: shapeCollection({
            ...data,
            product_ids: data.metadata?.product_ids || shaped.product_ids,
            shopify_sync: data.metadata?.shopify_sync || shaped.shopify_sync,
          }),
        };
      }
    }
  }

  const rows = await readLocal();
  const idx = rows.findIndex((c) => c.id === shaped.id);
  if (idx >= 0) rows[idx] = shaped;
  else rows.unshift(shaped);
  await writeLocal(rows);
  return {
    ok: true,
    created: !previous,
    mode: "local_mock",
    collection: shaped,
  };
}

/**
 * @param {string} id
 * @param {Partial<ShopifyCollectionSync>} sync
 */
export async function updateCollectionShopifySync(id, sync) {
  const existing = await getCollection(id);
  if (!existing) return { ok: false, error: "not_found" };
  return upsertCollection({
    ...existing,
    shopify_sync: { ...existing.shopify_sync, ...sync },
  });
}

/** @param {string} id */
export async function deleteCollection(id) {
  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      await supabase
        .from(TABLE)
        .delete()
        .eq("workspace_id", WORKSPACE_ID)
        .eq("id", String(id));
    }
  }
  const rows = await readLocal();
  await writeLocal(rows.filter((c) => c.id !== String(id)));
  return { ok: true };
}
