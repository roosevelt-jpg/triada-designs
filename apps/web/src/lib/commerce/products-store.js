/**
 * Dual-run product catalog store (local JSON under getLocalDataDir).
 * Seeded jewellery catalog on first load; create/edit persist here.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PRODUCTS, WORKSPACE } from "@/lib/api/seed-data";
import { getLocalDataDir } from "@/lib/local-data-dir";

const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "products-catalog.json");

/**
 * @typedef {{
 *   status: string,
 *   external_id?: string | null,
 *   link?: string | null,
 *   synced_at?: string | null,
 *   mode?: string | null,
 *   message?: string | null,
 * }} ChannelSyncState
 */

/**
 * @typedef {{
 *   id: string,
 *   workspace_id: string,
 *   sku: string | null,
 *   title: string,
 *   description: string,
 *   product_url: string | null,
 *   price: number | null,
 *   currency: string,
 *   availability_status: string,
 *   published_status: string,
 *   approved_claims: string[],
 *   metadata: Record<string, unknown>,
 *   channel_sync: { shopify: ChannelSyncState, wordpress: ChannelSyncState },
 *   created_at: string,
 *   updated_at: string,
 *   synced_at: string | null,
 * }} ProductRecord
 */

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `prod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** @returns {{ shopify: ChannelSyncState, wordpress: ChannelSyncState }} */
function emptyChannelSync() {
  return {
    shopify: {
      status: "awaiting_credentials",
      external_id: null,
      link: null,
      synced_at: null,
      mode: "local",
      message: "Waiting credentials.",
    },
    wordpress: {
      status: "awaiting_credentials",
      external_id: null,
      link: null,
      synced_at: null,
      mode: "local",
      message: "Waiting credentials.",
    },
  };
}

/**
 * @param {Partial<ProductRecord> & Record<string, unknown>} input
 * @returns {ProductRecord}
 */
export function shapeProduct(input = {}) {
  const claimsRaw = input.approved_claims;
  const approved_claims = Array.isArray(claimsRaw)
    ? claimsRaw.map((c) => String(c)).filter(Boolean)
    : typeof claimsRaw === "string" && claimsRaw.trim()
      ? claimsRaw
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const priceRaw = input.price;
  const price =
    priceRaw === null || priceRaw === undefined || priceRaw === ""
      ? null
      : Number(priceRaw);

  const baseSync = emptyChannelSync();
  const incoming =
    input.channel_sync && typeof input.channel_sync === "object"
      ? /** @type {Record<string, ChannelSyncState>} */ (input.channel_sync)
      : {};

  return {
    id: String(input.id || newId()),
    workspace_id: String(input.workspace_id || WORKSPACE.id),
    sku: input.sku != null && String(input.sku).trim() ? String(input.sku).trim() : null,
    title: String(input.title || "Untitled piece").trim() || "Untitled piece",
    description: String(input.description || "").trim(),
    product_url:
      input.product_url != null && String(input.product_url).trim()
        ? String(input.product_url).trim()
        : "https://triada-designs.com/",
    price: Number.isFinite(price) ? price : null,
    currency: String(input.currency || "AED").trim().toUpperCase() || "AED",
    availability_status: String(input.availability_status || "in_stock_snapshot"),
    published_status: String(input.published_status || "draft"),
    approved_claims,
    metadata:
      input.metadata && typeof input.metadata === "object"
        ? /** @type {Record<string, unknown>} */ (input.metadata)
        : {},
    channel_sync: {
      shopify: { ...baseSync.shopify, ...(incoming.shopify || {}) },
      wordpress: { ...baseSync.wordpress, ...(incoming.wordpress || {}) },
    },
    created_at: String(input.created_at || nowIso()),
    updated_at: String(input.updated_at || nowIso()),
    synced_at: input.synced_at ? String(input.synced_at) : null,
  };
}

function seedRecords() {
  return PRODUCTS.map((p) =>
    shapeProduct({
      ...p,
      published_status: p.published_status || "published",
      channel_sync: emptyChannelSync(),
      created_at: nowIso(),
      updated_at: nowIso(),
    }),
  );
}

/** @returns {Promise<ProductRecord[]>} */
async function readLocal() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return seedRecords();
    return parsed.map((row) => shapeProduct(row));
  } catch {
    return seedRecords();
  }
}

/** @param {ProductRecord[]} rows */
async function writeLocal(rows) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(rows, null, 2), "utf8");
}

/**
 * @param {{ q?: string }} [opts]
 * @returns {Promise<{ mode: 'local_mock', data: ProductRecord[] }>}
 */
export async function listProducts(opts = {}) {
  const q = String(opts.q || "")
    .trim()
    .toLowerCase();
  let rows = await readLocal();
  if (q) {
    rows = rows.filter((p) => {
      const hay = `${p.title} ${p.sku || ""} ${p.description} ${p.published_status}`.toLowerCase();
      return hay.includes(q);
    });
  }
  return { mode: "local_mock", data: rows };
}

/**
 * @param {string} id
 * @returns {Promise<ProductRecord | null>}
 */
export async function getProduct(id) {
  const rows = await readLocal();
  return rows.find((p) => p.id === id) || null;
}

/**
 * @param {Partial<ProductRecord> & Record<string, unknown>} input
 * @returns {Promise<{ mode: string, product: ProductRecord, created: boolean }>}
 */
export async function upsertProduct(input) {
  const rows = await readLocal();
  const id = input.id ? String(input.id) : null;
  const idx = id ? rows.findIndex((p) => p.id === id) : -1;
  const created = idx < 0;
  const previous = created ? null : rows[idx];

  const product = shapeProduct({
    ...(previous || {}),
    ...input,
    id: previous?.id || id || newId(),
    created_at: previous?.created_at || nowIso(),
    updated_at: nowIso(),
    channel_sync: input.channel_sync || previous?.channel_sync || emptyChannelSync(),
  });

  if (created) {
    rows.unshift(product);
  } else {
    rows[idx] = product;
  }
  await writeLocal(rows);
  return { mode: "local_mock", product, created };
}

/**
 * @param {string} id
 * @param {Partial<ProductRecord> & Record<string, unknown>} patch
 */
export async function patchProduct(id, patch) {
  const existing = await getProduct(id);
  if (!existing) {
    return { ok: false, error: "Product not found", status: 404 };
  }
  const result = await upsertProduct({ ...existing, ...patch, id });
  return { ok: true, ...result };
}

/**
 * Replace channel_sync for one product without clobbering other fields.
 * @param {string} id
 * @param {{ shopify?: ChannelSyncState, wordpress?: ChannelSyncState }} channels
 */
export async function updateProductChannelSync(id, channels) {
  const existing = await getProduct(id);
  if (!existing) {
    return { ok: false, error: "Product not found", status: 404 };
  }
  const channel_sync = {
    shopify: { ...existing.channel_sync.shopify, ...(channels.shopify || {}) },
    wordpress: {
      ...existing.channel_sync.wordpress,
      ...(channels.wordpress || {}),
    },
  };
  const result = await upsertProduct({
    ...existing,
    channel_sync,
    synced_at: nowIso(),
  });
  return { ok: true, ...result };
}
