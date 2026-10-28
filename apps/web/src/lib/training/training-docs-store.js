/**
 * Admin training docs for AI agents (tone, when to message, open/close).
 * Persists to Supabase when keyed, else local mock file under .triada-local.
 * RAG-style keyword retrieval — agents must use these docs when unsure.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getLocalDataDir } from "@/lib/local-data-dir";

const TABLE = "training_docs";
const WORKSPACE_ID = "triada-ops";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "training-docs.json");

/**
 * @typedef {{
 *   id: string,
 *   workspace_id: string,
 *   title: string,
 *   category: string,
 *   body: string,
 *   tags: string[],
 *   status: "published" | "draft" | "archived",
 *   source: string,
 *   filename: string | null,
 *   storage_path: string | null,
 *   metadata: Record<string, unknown>,
 *   created_at: string,
 *   updated_at: string,
 * }} TrainingDoc
 */

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `tdoc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Seed tone / timing / open-close docs so agents have brand guidance offline. */
export function seedTrainingDocs() {
  const at = nowIso();
  return [
    {
      id: "tdoc-tone",
      workspace_id: WORKSPACE_ID,
      title: "Triada tone of voice",
      category: "tone",
      body: [
        "Speak with warmth, calm confidence, and spiritual elegance — never salesy or pushy.",
        "Use warm greetings (e.g. “Warm greetings from Triada Designs,”).",
        "Prefer short, clear sentences. Avoid slang, hype, or invented brand words.",
        "Materials: silver with gold plating; 14K/18K gold on request. Typical make time ~7 days.",
        "Never invent prices, stock, delivery promises, or custom quotes — hand off to a human.",
      ].join("\n"),
      tags: ["tone", "voice", "brand", "warmth"],
      status: "published",
      source: "seed",
      filename: null,
      storage_path: null,
      metadata: { purpose: "tone" },
      created_at: at,
      updated_at: at,
    },
    {
      id: "tdoc-when-to-message",
      workspace_id: WORKSPACE_ID,
      title: "When to message customers",
      category: "timing",
      body: [
        "WhatsApp: business messages only (orders, products, support) to opted-in customers.",
        "Message promptly after inquiry, order confirmation, production updates, and delivery.",
        "Abandonment follow-ups: wait for the scheduled delay; never spam.",
        "Broadcasts, VIP drops, and marketing require human approval before send.",
        "Quiet hours: prefer Asia/Dubai daytime unless the customer is mid-conversation.",
      ].join("\n"),
      tags: ["timing", "whatsapp", "opt-in", "approval"],
      status: "published",
      source: "seed",
      filename: null,
      storage_path: null,
      metadata: { purpose: "when_to_message" },
      created_at: at,
      updated_at: at,
    },
    {
      id: "tdoc-open-close",
      workspace_id: WORKSPACE_ID,
      title: "Conversation open and close",
      category: "conversation",
      body: [
        "Open: warm greeting + brief purpose. Disclose you are an AI assistant; a person is available on request.",
        "Close: thank the customer, invite a reply if needed, and include Triada address/contact when ending a thread.",
        "Never fabricate off-brand closing lines or spiritual claims beyond approved Salt & Spirit language.",
        "If unsure of tone, timing, or wording — retrieve training docs and stay within them; otherwise escalate.",
      ].join("\n"),
      tags: ["open", "close", "greeting", "handoff"],
      status: "published",
      source: "seed",
      filename: null,
      storage_path: null,
      metadata: { purpose: "conversation_open_close" },
      created_at: at,
      updated_at: at,
    },
  ];
}

/**
 * @param {Partial<TrainingDoc> & Record<string, unknown>} input
 * @returns {TrainingDoc}
 */
export function shapeTrainingDoc(input = {}) {
  const tags = Array.isArray(input.tags)
    ? input.tags.map((t) => String(t).trim()).filter(Boolean)
    : String(input.tags || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

  return {
    id: String(input.id || newId()),
    workspace_id: String(input.workspace_id || WORKSPACE_ID),
    title: String(input.title || "Untitled training doc").trim(),
    category: String(input.category || "general").trim() || "general",
    body: String(input.body || "").trim(),
    tags,
    status:
      input.status === "draft" || input.status === "archived"
        ? input.status
        : "published",
    source: String(input.source || "upload"),
    filename: input.filename != null ? String(input.filename) : null,
    storage_path: input.storage_path != null ? String(input.storage_path) : null,
    metadata:
      input.metadata && typeof input.metadata === "object"
        ? /** @type {Record<string, unknown>} */ (input.metadata)
        : {},
    created_at: String(input.created_at || nowIso()),
    updated_at: String(input.updated_at || nowIso()),
  };
}

async function readLocal() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) return parsed.map(shapeTrainingDoc);
  } catch {
    // missing file → seed
  }
  const seeded = seedTrainingDocs();
  try {
    await writeLocal(seeded);
  } catch {
    // Read-only hosts: keep in-memory seed for this invocation.
  }
  return seeded;
}

/** @param {TrainingDoc[]} rows */
async function writeLocal(rows) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(rows, null, 2), "utf8");
}

/**
 * @returns {Promise<{ data: TrainingDoc[], storage: string }>}
 */
export async function listTrainingDocs() {
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
          const seeded = seedTrainingDocs();
          await supabase.from(TABLE).upsert(seeded);
          return { data: seeded, storage: "supabase" };
        }
        return { data: data.map(shapeTrainingDoc), storage: "supabase" };
      }
    }
  }

  return { data: await readLocal(), storage: "local_mock" };
}

/**
 * @param {Partial<TrainingDoc> & { file_text?: string, filename?: string }} input
 */
export async function upsertTrainingDoc(input) {
  const body =
    String(input.body || input.file_text || "").trim() ||
    String(input.file_text || "").trim();
  const doc = shapeTrainingDoc({
    ...input,
    body,
    updated_at: nowIso(),
    source: input.source || (input.filename ? "upload" : "manual"),
  });

  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      // Optional storage upload of original text blob (no secrets).
      if (body && input.filename) {
        const storagePath = `${WORKSPACE_ID}/${doc.id}/${input.filename}`;
        const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
        const up = await supabase.storage
          .from("training-docs")
          .upload(storagePath, blob, { upsert: true, contentType: "text/plain" });
        if (!up.error) doc.storage_path = storagePath;
      }

      const { error } = await supabase.from(TABLE).upsert(doc);
      if (!error) {
        return { doc, storage: "supabase" };
      }
    }
  }

  const local = await readLocal();
  const idx = local.findIndex((row) => row.id === doc.id);
  if (idx >= 0) local[idx] = { ...local[idx], ...doc, created_at: local[idx].created_at };
  else local.unshift(doc);
  await writeLocal(local);
  return { doc: idx >= 0 ? local[idx] : doc, storage: "local_mock" };
}

/** @param {string} id */
export async function deleteTrainingDoc(id) {
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

/**
 * Keyword RAG-style retrieval for agent prompts.
 * When the model is unsure, these excerpts must be used — never invent off-brand words.
 *
 * @param {string} query
 * @param {{ limit?: number, categories?: string[] }} [opts]
 * @returns {Promise<Array<{ id: string, title: string, category: string, excerpt: string, score: number, tags: string[] }>>}
 */
export async function retrieveTrainingDocs(query, opts = {}) {
  const { data } = await listTrainingDocs();
  const published = data.filter((d) => d.status === "published");
  const categories = Array.isArray(opts.categories) ? opts.categories : null;
  const pool = categories?.length
    ? published.filter((d) => categories.includes(d.category))
    : published;

  const needle = String(query || "").toLowerCase();
  const tokens = needle.split(/\W+/).filter((t) => t.length >= 3);

  const scored = pool.map((doc) => {
    const hay = `${doc.title} ${doc.body} ${doc.tags.join(" ")} ${doc.category}`.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (hay.includes(token)) score += 1;
    }
    // Soft boost for core brand categories when query is vague.
    if (!tokens.length) {
      if (doc.category === "tone") score += 2;
      if (doc.category === "conversation") score += 1;
      if (doc.category === "timing") score += 1;
    }
    // Always surface tone/conversation when asking about reply/message.
    if (/(reply|message|tone|greeting|close|open)/i.test(needle)) {
      if (doc.category === "tone" || doc.category === "conversation") score += 2;
    }
    if (/(when|timing|follow.?up|abandon)/i.test(needle) && doc.category === "timing") {
      score += 2;
    }
    return {
      id: doc.id,
      title: doc.title,
      category: doc.category,
      excerpt: excerpt(doc.body, 420),
      score,
      tags: doc.tags,
    };
  });

  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  const limit = Math.max(1, Math.min(opts.limit || 3, 8));

  // If nothing scored, still return core brand docs so agents never fabricate blind.
  const top = scored.filter((s) => s.score > 0).slice(0, limit);
  if (top.length) return top;
  return scored.slice(0, limit);
}

/** @param {string} body @param {number} max */
function excerpt(body, max) {
  const text = String(body || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
