/**
 * Waitlist / product-interest form definitions.
 * Dual-run: local JSON under .triada-local (+ shared_kv mirror when available).
 * Empty by default — admin creates forms and copies the short public link.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getLocalDataDir } from "@/lib/local-data-dir";
import { getSharedKv, setSharedKv } from "@/lib/agents/shared-memory";

const WORKSPACE_ID = "triada-ops";
const KV_KEY = "workspace.waitlist_forms";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "waitlist-forms.json");

/**
 * @typedef {{
 *   id: string,
 *   workspace_id: string,
 *   slug: string,
 *   title: string,
 *   description: string,
 *   product_label: string,
 *   product_link: string | null,
 *   success_message: string,
 *   status: "active" | "draft" | "archived",
 *   submission_count: number,
 *   metadata: Record<string, unknown>,
 *   created_at: string,
 *   updated_at: string,
 * }} WaitlistFormRecord
 */

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `wlf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function slugifyWaitlist(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * @param {Partial<WaitlistFormRecord> & Record<string, unknown>} input
 * @returns {WaitlistFormRecord}
 */
export function shapeWaitlistForm(input = {}) {
  const statusRaw = String(input.status || "active").toLowerCase();
  const status =
    statusRaw === "draft" || statusRaw === "archived" ? statusRaw : "active";

  const title = String(input.title || "").trim() || "Product interest";
  const slugRaw =
    input.slug != null && String(input.slug).trim()
      ? String(input.slug)
      : title;
  const slug = slugifyWaitlist(slugRaw) || `form-${Date.now().toString(36)}`;

  const productLink =
    input.product_link != null && String(input.product_link).trim()
      ? String(input.product_link).trim()
      : null;

  const countRaw = Number(input.submission_count);
  const submission_count = Number.isFinite(countRaw) && countRaw >= 0 ? countRaw : 0;

  return {
    id: String(input.id || newId()),
    workspace_id: String(input.workspace_id || WORKSPACE_ID),
    slug,
    title,
    description: String(input.description || "").trim(),
    product_label: String(input.product_label || "").trim() || title,
    product_link: productLink,
    success_message:
      String(input.success_message || "").trim() ||
      "Thank you — we have your interest and will be in touch soon.",
    status,
    submission_count,
    metadata:
      input.metadata && typeof input.metadata === "object"
        ? /** @type {Record<string, unknown>} */ (input.metadata)
        : {},
    created_at: String(input.created_at || nowIso()),
    updated_at: String(input.updated_at || nowIso()),
  };
}

/**
 * Public-safe projection (no internal ids beyond slug).
 * @param {WaitlistFormRecord} form
 */
export function presentPublicWaitlistForm(form) {
  return {
    slug: form.slug,
    title: form.title,
    description: form.description,
    product_label: form.product_label,
    product_link: form.product_link,
    success_message: form.success_message,
  };
}

/**
 * Short shareable path for website / social.
 * @param {WaitlistFormRecord | { slug?: string }} form
 */
export function waitlistShortPath(form) {
  const slug = slugifyWaitlist(form?.slug || "");
  return slug ? `/f/${slug}` : "/f/";
}

/** @returns {Promise<WaitlistFormRecord[]>} */
async function readLocal() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => shapeWaitlistForm(row));
  } catch {
    return [];
  }
}

/** @param {WaitlistFormRecord[]} rows */
async function writeLocal(rows) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(rows, null, 2), "utf8");
}

/**
 * @returns {Promise<{ data: WaitlistFormRecord[], mode: string }>}
 */
async function loadAll() {
  try {
    const entry = await getSharedKv(KV_KEY);
    if (entry && entry.value && typeof entry.value === "object") {
      const value = /** @type {Record<string, unknown>} */ (entry.value);
      const rows = Array.isArray(value.forms) ? value.forms : [];
      return {
        data: rows.map((row) => shapeWaitlistForm(row)),
        mode: "shared_kv",
      };
    }
  } catch {
    /* fall through */
  }

  const local = await readLocal();
  return { data: local, mode: "local_file" };
}

/**
 * @param {WaitlistFormRecord[]} rows
 * @returns {Promise<string>}
 */
async function persistAll(rows) {
  let mode = "local_file";
  try {
    await setSharedKv({
      key: KV_KEY,
      value: {
        workspace_id: WORKSPACE_ID,
        forms: rows,
        updated_at: nowIso(),
      },
      written_by: "admin",
      tags: ["waitlist", "forms", "crm"],
    });
    mode = "shared_kv";
  } catch {
    mode = "local_file";
  }

  try {
    await writeLocal(rows);
  } catch {
    /* best-effort */
  }

  return mode;
}

/**
 * @param {{ status?: string, q?: string }} [opts]
 * @returns {Promise<{ data: WaitlistFormRecord[], mode: string }>}
 */
export async function listWaitlistForms(opts = {}) {
  const listed = await loadAll();
  let rows = listed.data;
  const status = opts.status ? String(opts.status).toLowerCase() : "";
  if (status) {
    rows = rows.filter((r) => r.status === status);
  }
  const q = String(opts.q || "")
    .trim()
    .toLowerCase();
  if (q) {
    rows = rows.filter((r) => {
      const hay = `${r.title} ${r.slug} ${r.product_label} ${r.description}`.toLowerCase();
      return hay.includes(q);
    });
  }
  rows = [...rows].sort((a, b) =>
    String(b.updated_at).localeCompare(String(a.updated_at)),
  );
  return { data: rows, mode: listed.mode };
}

/**
 * @param {string} idOrSlug
 * @returns {Promise<WaitlistFormRecord | null>}
 */
export async function getWaitlistForm(idOrSlug) {
  const key = String(idOrSlug || "").trim();
  if (!key) return null;
  const listed = await loadAll();
  const slug = slugifyWaitlist(key);
  return (
    listed.data.find((r) => r.id === key) ||
    listed.data.find((r) => r.slug === slug) ||
    null
  );
}

/**
 * @param {string} slug
 * @returns {Promise<WaitlistFormRecord | null>}
 */
export async function getActiveWaitlistFormBySlug(slug) {
  const form = await getWaitlistForm(slug);
  if (!form || form.status !== "active") return null;
  return form;
}

/**
 * @param {Partial<WaitlistFormRecord> & Record<string, unknown>} input
 * @returns {Promise<{ form: WaitlistFormRecord, created: boolean, mode: string }>}
 */
export async function upsertWaitlistForm(input = {}) {
  const listed = await loadAll();
  const rows = [...listed.data];
  const shaped = shapeWaitlistForm({ ...input, updated_at: nowIso() });

  const existingIdx = rows.findIndex(
    (r) =>
      r.id === shaped.id ||
      (input.id && r.id === String(input.id)) ||
      (shaped.slug && r.slug === shaped.slug && !input.id),
  );

  // Enforce unique slug across forms
  const slugClash = rows.find(
    (r) => r.slug === shaped.slug && r.id !== (existingIdx >= 0 ? rows[existingIdx].id : shaped.id),
  );
  if (slugClash) {
    const err = new Error(`Short link “${shaped.slug}” is already in use.`);
    // @ts-expect-error attach status for API
    err.status = 409;
    throw err;
  }

  let created = false;
  if (existingIdx >= 0) {
    const prev = rows[existingIdx];
    rows[existingIdx] = shapeWaitlistForm({
      ...prev,
      ...shaped,
      id: prev.id,
      submission_count: prev.submission_count,
      created_at: prev.created_at,
      updated_at: nowIso(),
    });
  } else {
    created = true;
    rows.push(shaped);
  }

  const mode = await persistAll(rows);
  const form = rows.find((r) => r.id === (existingIdx >= 0 ? rows[existingIdx].id : shaped.id));
  return { form: /** @type {WaitlistFormRecord} */ (form), created, mode };
}

/**
 * @param {string} id
 * @returns {Promise<{ ok: boolean, mode: string }>}
 */
export async function deleteWaitlistForm(id) {
  const key = String(id || "").trim();
  const listed = await loadAll();
  const next = listed.data.filter((r) => r.id !== key);
  if (next.length === listed.data.length) {
    return { ok: false, mode: listed.mode };
  }
  const mode = await persistAll(next);
  return { ok: true, mode };
}

/**
 * Bump submission counter after a successful public submit.
 * @param {string} id
 */
export async function incrementWaitlistFormSubmissions(id) {
  const listed = await loadAll();
  const rows = listed.data.map((r) => {
    if (r.id !== id) return r;
    return shapeWaitlistForm({
      ...r,
      submission_count: (r.submission_count || 0) + 1,
      updated_at: nowIso(),
    });
  });
  const mode = await persistAll(rows);
  return { mode };
}
