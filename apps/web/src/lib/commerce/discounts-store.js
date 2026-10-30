/**
 * Triada discount codes / price rules store.
 * Supabase when keyed; else local JSON. Empty by default.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { getLocalDataDir } from "@/lib/local-data-dir";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TABLE = "commerce_discounts";
const WORKSPACE_ID = "triada-ops";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "commerce-discounts.json");

/**
 * @typedef {{
 *   status: string,
 *   external_id?: string | null,
 *   price_rule_id?: string | null,
 *   link?: string | null,
 *   synced_at?: string | null,
 *   mode?: string | null,
 *   message?: string | null,
 * }} ShopifyDiscountSync
 */

/**
 * @typedef {{
 *   id: string,
 *   workspace_id: string,
 *   title: string,
 *   code: string,
 *   value_type: 'percentage' | 'fixed_amount',
 *   value: number,
 *   status: string,
 *   starts_at: string | null,
 *   ends_at: string | null,
 *   usage_limit: number | null,
 *   metadata: Record<string, unknown>,
 *   shopify_sync: ShopifyDiscountSync,
 *   created_at: string,
 *   updated_at: string,
 * }} DiscountRecord
 */

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `disc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** @returns {ShopifyDiscountSync} */
function emptySync() {
  return {
    status: "awaiting_credentials",
    external_id: null,
    price_rule_id: null,
    link: null,
    synced_at: null,
    mode: "local",
    message: "Waiting credentials.",
  };
}

/**
 * @param {Partial<DiscountRecord> & Record<string, unknown>} input
 * @returns {DiscountRecord}
 */
export function shapeDiscount(input = {}) {
  const valueType =
    String(input.value_type || input.valueType || "percentage").toLowerCase() ===
    "fixed_amount"
      ? "fixed_amount"
      : "percentage";
  const syncIn =
    input.shopify_sync && typeof input.shopify_sync === "object"
      ? /** @type {ShopifyDiscountSync} */ (input.shopify_sync)
      : emptySync();

  return {
    id: String(input.id || newId()),
    workspace_id: String(input.workspace_id || WORKSPACE_ID),
    title: String(input.title || input.code || "Discount").trim() || "Discount",
    code: String(input.code || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ""),
    value_type: valueType,
    value: Number(input.value ?? 0) || 0,
    status: String(input.status || "active"),
    starts_at: input.starts_at != null ? String(input.starts_at) : null,
    ends_at: input.ends_at != null ? String(input.ends_at) : null,
    usage_limit:
      input.usage_limit == null || input.usage_limit === ""
        ? null
        : Number(input.usage_limit) || null,
    metadata:
      input.metadata && typeof input.metadata === "object"
        ? /** @type {Record<string, unknown>} */ (input.metadata)
        : {},
    shopify_sync: { ...emptySync(), ...syncIn },
    created_at: String(input.created_at || nowIso()),
    updated_at: String(input.updated_at || nowIso()),
  };
}

/** @returns {Promise<DiscountRecord[]>} */
async function readLocal() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => shapeDiscount(row));
  } catch {
    return [];
  }
}

/** @param {DiscountRecord[]} rows */
async function writeLocal(rows) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(rows, null, 2), "utf8");
}

export async function listDiscounts() {
  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("workspace_id", WORKSPACE_ID)
        .order("updated_at", { ascending: false });
      if (!error && Array.isArray(data)) {
        return { mode: "supabase", data: data.map((row) => shapeDiscount(row)) };
      }
    }
  }
  return { mode: "local_mock", data: await readLocal() };
}

/** @param {string} id */
export async function getDiscount(id) {
  const listed = await listDiscounts();
  return listed.data.find((d) => d.id === String(id)) || null;
}

/**
 * @param {Partial<DiscountRecord> & Record<string, unknown>} input
 */
export async function upsertDiscount(input = {}) {
  const code = String(input.code || "").trim();
  if (!code) {
    return { ok: false, error: "code is required", status: 422 };
  }
  const existingId = input.id ? String(input.id) : "";
  const listed = await listDiscounts();
  const previous =
    (existingId && listed.data.find((d) => d.id === existingId)) ||
    listed.data.find(
      (d) => d.code.toUpperCase() === code.toUpperCase().replace(/\s+/g, ""),
    ) ||
    null;

  const shaped = shapeDiscount({
    ...(previous || {}),
    ...input,
    id: previous?.id || existingId || newId(),
    code,
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
            code: shaped.code,
            value_type: shaped.value_type,
            value: shaped.value,
            status: shaped.status,
            starts_at: shaped.starts_at,
            ends_at: shaped.ends_at,
            usage_limit: shaped.usage_limit,
            metadata: {
              ...shaped.metadata,
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
          discount: shapeDiscount({
            ...data,
            shopify_sync:
              data.metadata?.shopify_sync || shaped.shopify_sync,
          }),
        };
      }
    }
  }

  const rows = await readLocal();
  const idx = rows.findIndex((d) => d.id === shaped.id);
  if (idx >= 0) rows[idx] = shaped;
  else rows.unshift(shaped);
  await writeLocal(rows);
  return {
    ok: true,
    created: !previous,
    mode: "local_mock",
    discount: shaped,
  };
}

/**
 * @param {string} id
 * @param {Partial<ShopifyDiscountSync>} sync
 */
export async function updateDiscountShopifySync(id, sync) {
  const existing = await getDiscount(id);
  if (!existing) return { ok: false, error: "not_found" };
  return upsertDiscount({
    ...existing,
    shopify_sync: { ...existing.shopify_sync, ...sync },
  });
}

/** @param {string} id */
export async function deleteDiscount(id) {
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
  await writeLocal(rows.filter((d) => d.id !== String(id)));
  return { ok: true };
}
