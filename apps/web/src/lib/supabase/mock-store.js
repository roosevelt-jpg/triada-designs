import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getLocalDataDir } from "@/lib/local-data-dir";

const STORE_DIR = getLocalDataDir();
const STORE_FILE = path.join(STORE_DIR, "meta-webhook-events.json");

/**
 * Local/mock persistence when Supabase credentials are absent.
 * Production-shaped path: status language stays `local` / `seeded`, never "live healthy".
 */

/** @returns {Promise<Array<Record<string, unknown>>>} */
async function readAll() {
  try {
    const raw = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @param {Record<string, unknown>} event
 * @returns {Promise<{ mode: 'local_mock', id: string, event: Record<string, unknown> }>}
 */
export async function appendMetaWebhookMockEvent(event) {
  await mkdir(STORE_DIR, { recursive: true });
  const existing = await readAll();
  const id =
    typeof event.id === "string" && event.id
      ? event.id
      : `local_${Date.now()}_${existing.length + 1}`;
  const row = { ...event, id, stored_at: new Date().toISOString() };
  existing.push(row);
  // Keep file bounded for local/dev
  const trimmed = existing.slice(-500);
  await writeFile(STORE_FILE, JSON.stringify(trimmed, null, 2), "utf8");
  return { mode: "local_mock", id, event: row };
}

/** @returns {Promise<Array<Record<string, unknown>>>} */
export async function listMetaWebhookMockEvents() {
  return readAll();
}
