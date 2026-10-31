/**
 * Inventory transfers / PO-like jobs store.
 * Local/Supabase transfer + PO records; best-effort Shopify inventoryTransfer when Connected.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { getLocalDataDir } from "@/lib/local-data-dir";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TABLE = "commerce_transfers";
const WORKSPACE_ID = "triada-ops";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "commerce-transfers.json");

/**
 * @typedef {{
 *   status: string,
 *   external_id?: string | null,
 *   link?: string | null,
 *   synced_at?: string | null,
 *   mode?: string | null,
 *   message?: string | null,
 *   limitation?: string | null,
 * }} ShopifyTransferSync
 */

/**
 * @typedef {{
 *   sku?: string | null,
 *   title?: string | null,
 *   quantity: number,
 *   inventory_item_id?: string | null,
 *   product_id?: string | null,
 * }} TransferLineItem
 */

/**
 * @typedef {{
 *   id: string,
 *   workspace_id: string,
 *   title: string,
 *   note: string,
 *   kind: 'transfer' | 'purchase_order',
 *   status: string,
 *   from_location: string | null,
 *   to_location: string | null,
 *   supplier: string | null,
 *   line_items: TransferLineItem[],
 *   metadata: Record<string, unknown>,
 *   shopify_sync: ShopifyTransferSync,
 *   created_at: string,
 *   updated_at: string,
 * }} TransferRecord
 */

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `xfer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** @returns {ShopifyTransferSync} */
function emptySync() {
  return {
    status: "awaiting_credentials",
    external_id: null,
    link: null,
    synced_at: null,
    mode: "local",
    message: "Waiting credentials.",
    limitation: null,
  };
}

/**
 * @param {unknown} raw
 * @returns {TransferLineItem[]}
 */
function shapeLines(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = /** @type {Record<string, unknown>} */ (row);
      const qty = Math.max(1, Number(r.quantity ?? r.qty) || 1);
      return {
        sku: r.sku != null ? String(r.sku) : null,
        title: r.title != null ? String(r.title) : null,
        quantity: qty,
        inventory_item_id:
          r.inventory_item_id != null ? String(r.inventory_item_id) : null,
        product_id: r.product_id != null ? String(r.product_id) : null,
      };
    })
    .filter(Boolean);
}

/**
 * @param {Partial<TransferRecord> & Record<string, unknown>} input
 * @returns {TransferRecord}
 */
export function shapeTransfer(input = {}) {
  const kind =
    String(input.kind || "transfer").toLowerCase() === "purchase_order"
      ? "purchase_order"
      : "transfer";
  const syncIn =
    input.shopify_sync && typeof input.shopify_sync === "object"
      ? /** @type {ShopifyTransferSync} */ (input.shopify_sync)
      : emptySync();

  return {
    id: String(input.id || newId()),
    workspace_id: String(input.workspace_id || WORKSPACE_ID),
    title: String(input.title || "").trim() || "Inventory transfer",
    note: String(input.note || "").trim(),
    kind,
    status: String(input.status || "draft"),
    from_location:
      input.from_location != null ? String(input.from_location) : null,
    to_location: input.to_location != null ? String(input.to_location) : null,
    supplier: input.supplier != null ? String(input.supplier) : null,
    line_items: shapeLines(input.line_items),
    metadata:
      input.metadata && typeof input.metadata === "object"
        ? /** @type {Record<string, unknown>} */ (input.metadata)
        : {},
    shopify_sync: { ...emptySync(), ...syncIn },
    created_at: String(input.created_at || nowIso()),
    updated_at: String(input.updated_at || nowIso()),
  };
}

/** @returns {Promise<TransferRecord[]>} */
async function readLocal() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => shapeTransfer(row));
  } catch {
    return [];
  }
}

/** @param {TransferRecord[]} rows */
async function writeLocal(rows) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(rows, null, 2), "utf8");
}

export async function listTransfers() {
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
            shapeTransfer({
              ...row,
              line_items: row.metadata?.line_items || row.line_items,
              shopify_sync: row.metadata?.shopify_sync || row.shopify_sync,
            }),
          ),
        };
      }
    }
  }
  return { mode: "local_mock", data: await readLocal() };
}

/** @param {string} id */
export async function getTransfer(id) {
  const listed = await listTransfers();
  return listed.data.find((t) => t.id === String(id)) || null;
}

/**
 * @param {Partial<TransferRecord> & Record<string, unknown>} input
 */
export async function upsertTransfer(input = {}) {
  const title = String(input.title || "").trim();
  if (!title) {
    return { ok: false, error: "title is required", status: 422 };
  }
  const existingId = input.id ? String(input.id) : "";
  const listed = await listTransfers();
  const previous =
    (existingId && listed.data.find((t) => t.id === existingId)) || null;

  const shaped = shapeTransfer({
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
            note: shaped.note,
            kind: shaped.kind,
            status: shaped.status,
            from_location: shaped.from_location,
            to_location: shaped.to_location,
            supplier: shaped.supplier,
            metadata: {
              ...shaped.metadata,
              line_items: shaped.line_items,
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
          transfer: shapeTransfer({
            ...data,
            line_items: data.metadata?.line_items || shaped.line_items,
            shopify_sync: data.metadata?.shopify_sync || shaped.shopify_sync,
          }),
        };
      }
    }
  }

  const rows = await readLocal();
  const idx = rows.findIndex((t) => t.id === shaped.id);
  if (idx >= 0) rows[idx] = shaped;
  else rows.unshift(shaped);
  await writeLocal(rows);
  return {
    ok: true,
    created: !previous,
    mode: "local_mock",
    transfer: shaped,
  };
}

/**
 * @param {string} id
 * @param {Partial<ShopifyTransferSync>} sync
 */
export async function updateTransferShopifySync(id, sync) {
  const existing = await getTransfer(id);
  if (!existing) return { ok: false, error: "not_found" };
  return upsertTransfer({
    ...existing,
    shopify_sync: { ...existing.shopify_sync, ...sync },
  });
}

/** @param {string} id */
export async function deleteTransfer(id) {
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
  await writeLocal(rows.filter((t) => t.id !== String(id)));
  return { ok: true };
}
