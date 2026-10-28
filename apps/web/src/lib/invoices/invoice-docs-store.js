/**
 * Admin-editable invoice / receipt content (plain-text fields).
 * Brand chrome (logo header, address footer, warm greeting defaults) stays in wrap-invoice.
 * Persists to Supabase when keyed, else local mock under .triada-local.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getLocalDataDir } from "@/lib/local-data-dir";
import { wrapInvoiceDocument } from "@/lib/brand/wrap-invoice";

const TABLE = "invoice_docs";
const WORKSPACE_ID = "triada-ops";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "invoice-docs.json");

/**
 * @typedef {{
 *   title?: string,
 *   sku?: string,
 *   qty?: number,
 *   price?: number,
 * }} InvoiceLineItem
 */

/**
 * @typedef {{
 *   id: string,
 *   workspace_id: string,
 *   document_type: "invoice" | "receipt",
 *   number: string,
 *   order_id: string | null,
 *   customer_name: string,
 *   customer_email: string,
 *   currency: string,
 *   total: number,
 *   status: string,
 *   issued_at: string,
 *   line_items: InvoiceLineItem[],
 *   notes: string,
 *   greeting: string,
 *   prepared_for: string,
 *   source: string,
 *   metadata: Record<string, unknown>,
 *   created_at: string,
 *   updated_at: string,
 * }} InvoiceDoc
 */

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** @param {unknown} value */
function normalizeLineItems(value) {
  if (typeof value === "string") {
    return parseLineItemsPlainText(value);
  }
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const row = raw && typeof raw === "object" ? raw : {};
    return {
      title: String(row.title || row.name || "Item").trim() || "Item",
      sku: row.sku != null && String(row.sku).trim() ? String(row.sku).trim() : "",
      qty: Number(row.qty ?? row.quantity ?? 1) || 1,
      price: Number(row.price ?? row.amount ?? 0) || 0,
    };
  });
}

/**
 * Plain-text line items: one per line as `title | sku | qty | price`.
 * Sku may be blank: `title | | qty | price` or `title | qty | price`.
 * @param {string} text
 * @returns {InvoiceLineItem[]}
 */
export function parseLineItemsPlainText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length >= 4) {
      return {
        title: parts[0] || "Item",
        sku: parts[1] || "",
        qty: Number(parts[2]) || 1,
        price: Number(parts[3]) || 0,
      };
    }
    if (parts.length === 3) {
      return {
        title: parts[0] || "Item",
        sku: "",
        qty: Number(parts[1]) || 1,
        price: Number(parts[2]) || 0,
      };
    }
    if (parts.length === 2) {
      return {
        title: parts[0] || "Item",
        sku: "",
        qty: 1,
        price: Number(parts[1]) || 0,
      };
    }
    return { title: parts[0] || "Item", sku: "", qty: 1, price: 0 };
  });
}

/** @param {InvoiceLineItem[]} items */
export function formatLineItemsPlainText(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const title = String(item.title || "Item").trim() || "Item";
      const sku = String(item.sku || "").trim();
      const qty = Number(item.qty ?? 1) || 1;
      const price = Number(item.price ?? 0) || 0;
      return `${title} | ${sku} | ${qty} | ${price}`;
    })
    .join("\n");
}

/** Seed one production-shaped invoice so the editor is never empty. */
export function seedInvoiceDocs() {
  const at = nowIso();
  return [
    {
      id: "inv-td-1001",
      workspace_id: WORKSPACE_ID,
      document_type: "invoice",
      number: "INV-TD-1001",
      order_id: "ord-1",
      customer_name: "Layla Al Maktoum",
      customer_email: "layla@example.com",
      currency: "AED",
      total: 1450,
      status: "draft",
      issued_at: at,
      line_items: [
        {
          title: "Aura Signet Ring",
          sku: "TD-RING-AURA-01",
          qty: 1,
          price: 1450,
        },
      ],
      notes: "Handmade to order · silver with gold plating · ~7 days make time.",
      greeting: "",
      prepared_for: "",
      source: "seed",
      metadata: {},
      created_at: at,
      updated_at: at,
    },
  ];
}

/**
 * @param {Partial<InvoiceDoc> & Record<string, unknown>} input
 * @returns {InvoiceDoc}
 */
export function shapeInvoiceDoc(input = {}) {
  const documentType =
    String(input.document_type || input.documentType || "invoice").toLowerCase() ===
    "receipt"
      ? "receipt"
      : "invoice";
  const lineItems = normalizeLineItems(
    input.line_items ?? input.lineItems ?? [],
  );
  const totalRaw = input.total;
  const total =
    totalRaw === undefined || totalRaw === null || totalRaw === ""
      ? lineItems.reduce(
          (sum, row) => sum + Number(row.qty || 1) * Number(row.price || 0),
          0,
        )
      : Number(totalRaw) || 0;

  return {
    id: String(input.id || newId()),
    workspace_id: String(input.workspace_id || WORKSPACE_ID),
    document_type: documentType,
    number: String(
      input.number || input.invoice_number || `INV-${Date.now().toString(36).toUpperCase()}`,
    ).trim(),
    order_id:
      input.order_id != null || input.orderId != null
        ? String(input.order_id ?? input.orderId).trim() || null
        : null,
    customer_name: String(input.customer_name || input.customerName || "").trim(),
    customer_email: String(input.customer_email || input.customerEmail || "").trim(),
    currency: String(input.currency || "AED").trim() || "AED",
    total,
    status: String(input.status || "issued").trim() || "issued",
    issued_at: String(input.issued_at || input.issuedAt || nowIso()),
    line_items: lineItems,
    notes: String(input.notes || "").trim(),
    greeting: String(input.greeting || "").trim(),
    prepared_for: String(input.prepared_for || input.preparedFor || "").trim(),
    source: String(input.source || "manual"),
    metadata:
      input.metadata && typeof input.metadata === "object"
        ? /** @type {Record<string, unknown>} */ (input.metadata)
        : {},
    created_at: String(input.created_at || nowIso()),
    updated_at: String(input.updated_at || nowIso()),
  };
}

/** @param {InvoiceDoc} doc */
export function invoiceDocToWrapInput(doc) {
  return {
    documentType: doc.document_type,
    number: doc.number,
    orderId: doc.order_id || undefined,
    customerName: doc.customer_name || undefined,
    customerEmail: doc.customer_email || undefined,
    currency: doc.currency,
    total: doc.total,
    status: doc.status,
    issuedAt: doc.issued_at,
    lineItems: doc.line_items,
    notes: doc.notes || undefined,
    greeting: doc.greeting || undefined,
    preparedFor: doc.prepared_for || undefined,
  };
}

/** @param {InvoiceDoc} doc */
export function presentInvoiceDoc(doc) {
  const branded = wrapInvoiceDocument(invoiceDocToWrapInput(doc));
  return {
    id: doc.id,
    invoice_number: doc.number,
    order_id: doc.order_id,
    type: doc.document_type,
    status: doc.status,
    total: doc.total,
    amount: doc.total,
    currency: doc.currency,
    customer_name: doc.customer_name,
    customer_email: doc.customer_email,
    issued_at: doc.issued_at,
    notes: doc.notes,
    greeting_override: doc.greeting,
    prepared_for: doc.prepared_for,
    line_items: doc.line_items,
    line_items_text: formatLineItemsPlainText(doc.line_items),
    source: doc.source,
    branded: true,
    logo_url: branded.logo_url,
    greeting: branded.greeting,
    html: branded.html,
    pdf_mode: branded.pdf_mode,
    email: branded.email,
    document: branded,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  };
}

async function readLocal() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) return parsed.map(shapeInvoiceDoc);
  } catch {
    // missing file → seed
  }
  const seeded = seedInvoiceDocs();
  try {
    await writeLocal(seeded);
  } catch {
    // Read-only hosts: keep in-memory seed for this invocation.
  }
  return seeded;
}

/** @param {InvoiceDoc[]} rows */
async function writeLocal(rows) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(rows, null, 2), "utf8");
}

/**
 * @returns {Promise<{ data: InvoiceDoc[], storage: string }>}
 */
export async function listInvoiceDocs() {
  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("workspace_id", WORKSPACE_ID)
        .order("updated_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        if (data.length === 0) {
          const seeded = seedInvoiceDocs();
          await supabase.from(TABLE).upsert(seeded);
          return { data: seeded, storage: "supabase" };
        }
        return { data: data.map(shapeInvoiceDoc), storage: "supabase" };
      }
    }
  }

  return { data: await readLocal(), storage: "local_mock" };
}

/** @param {string} id */
export async function getInvoiceDoc(id) {
  const docId = String(id || "");
  if (!docId) return { doc: null, storage: "none" };
  const listed = await listInvoiceDocs();
  const doc = listed.data.find((row) => row.id === docId) || null;
  return { doc, storage: listed.storage };
}

/**
 * @param {Partial<InvoiceDoc> & Record<string, unknown>} input
 */
export async function upsertInvoiceDoc(input) {
  const doc = shapeInvoiceDoc({
    ...input,
    updated_at: nowIso(),
    source: input.source || "manual",
  });

  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      const { error } = await supabase.from(TABLE).upsert(doc);
      if (!error) {
        return { doc, storage: "supabase" };
      }
    }
  }

  const local = await readLocal();
  const idx = local.findIndex((row) => row.id === doc.id);
  if (idx >= 0) {
    local[idx] = { ...local[idx], ...doc, created_at: local[idx].created_at };
  } else {
    local.unshift(doc);
  }
  await writeLocal(local);
  return { doc: idx >= 0 ? local[idx] : doc, storage: "local_mock" };
}

/** @param {string} id */
export async function deleteInvoiceDoc(id) {
  const docId = String(id || "");
  if (!docId) return { ok: false, message: "Missing id" };

  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq("workspace_id", WORKSPACE_ID)
        .eq("id", docId);
      if (!error) return { ok: true, storage: "supabase" };
    }
  }

  const local = await readLocal();
  const next = local.filter((row) => row.id !== docId);
  await writeLocal(next);
  return { ok: true, storage: "local_mock" };
}
