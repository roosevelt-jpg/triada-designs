/**
 * Workspace warm-greeting + first-contact copy for outbound AI / channel wraps.
 * Plain-text admin editor on Settings — never expose snake_case keys or {{vars}}.
 * Persists via agent_shared_kv (Supabase when keyed) + local file mirror.
 * Blank fields fall back to identity.js / language-preference defaults.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setEnglishGreetingOverrides, WARM_GREETINGS } from "@/lib/brand/identity";
import { getLocalDataDir } from "@/lib/local-data-dir";
import { getSharedKv, setSharedKv } from "@/lib/agents/shared-memory";

const WORKSPACE_ID = "triada-ops";
const KV_KEY = "workspace.brand_greetings";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "brand-greeting-settings.json");

/** Default first-message body (English) — after the warm greeting line. */
export const DEFAULT_FIRST_MESSAGE_BODY =
  "Thanks for writing Triada Designs. How can we help with Salt & Spirit or a custom piece today?";

/** Default language preference question (English). */
export const DEFAULT_LANGUAGE_PREFERENCE_QUESTION =
  "Which language do you prefer to chat in? Reply with English, Arabic, Romanian, German, French, Russian, Spanish, Portuguese — or simply write in your preferred language.";

/** Default AI disclosure line (English). */
export const DEFAULT_AI_DISCLOSURE =
  "I’m Triada’s AI Support — say if you’d like a person instead.";

/** Admin-facing labels only — never show keys to the admin. */
export const GREETING_FIELD_LABELS = {
  default: "Default greeting",
  first_touch: "First message greeting",
  follow_up: "Follow-up greeting",
  thank_you: "Thank-you greeting",
  after_sale: "After-sale greeting",
  invoice: "Invoice greeting",
  receipt: "Receipt greeting",
  first_message_body: "First message body",
  language_preference_question: "Language preference question",
  ai_disclosure: "AI disclosure line",
};

/**
 * @typedef {{
 *   workspace_id: string,
 *   default: string,
 *   first_touch: string,
 *   follow_up: string,
 *   thank_you: string,
 *   after_sale: string,
 *   invoice: string,
 *   receipt: string,
 *   first_message_body: string,
 *   language_preference_question: string,
 *   ai_disclosure: string,
 *   updated_at: string,
 *   storage?: string,
 * }} BrandGreetingSettings
 */

/** @type {BrandGreetingSettings | null} */
let cache = null;

function nowIso() {
  return new Date().toISOString();
}

/** @returns {BrandGreetingSettings} */
export function defaultBrandGreetingSettings() {
  return {
    workspace_id: WORKSPACE_ID,
    default: WARM_GREETINGS.default,
    first_touch: WARM_GREETINGS.first_touch,
    follow_up: WARM_GREETINGS.follow_up,
    thank_you: WARM_GREETINGS.thank_you,
    after_sale: WARM_GREETINGS.after_sale,
    invoice: WARM_GREETINGS.invoice,
    receipt: WARM_GREETINGS.receipt,
    first_message_body: DEFAULT_FIRST_MESSAGE_BODY,
    language_preference_question: DEFAULT_LANGUAGE_PREFERENCE_QUESTION,
    ai_disclosure: DEFAULT_AI_DISCLOSURE,
    updated_at: nowIso(),
  };
}

/**
 * Strip accidental template / code plumbing admins might paste.
 * @param {unknown} raw
 * @returns {string}
 */
export function scrubGreetingPlainText(raw) {
  let s = String(raw ?? "").trim();
  if (!s) return "";
  // Drop {{var}} / {{1}} style placeholders — greetings are plain prose.
  s = s.replace(/\{\{[^}]*\}\}/g, "").trim();
  // Collapse leftover double spaces from scrub.
  s = s.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

/**
 * @param {unknown} raw
 * @returns {BrandGreetingSettings}
 */
export function shapeBrandGreetingSettings(raw) {
  const base = defaultBrandGreetingSettings();
  const src =
    raw && typeof raw === "object"
      ? /** @type {Record<string, unknown>} */ (raw)
      : {};

  /** @param {string} key @param {string} fallback */
  const field = (key, fallback) => {
    if (!Object.prototype.hasOwnProperty.call(src, key)) return fallback;
    const scrubbed = scrubGreetingPlainText(src[key]);
    return scrubbed || fallback;
  };

  return {
    workspace_id: WORKSPACE_ID,
    default: field("default", base.default),
    first_touch: field("first_touch", base.first_touch),
    follow_up: field("follow_up", base.follow_up),
    thank_you: field("thank_you", base.thank_you),
    after_sale: field("after_sale", base.after_sale),
    invoice: field("invoice", base.invoice),
    receipt: field("receipt", base.receipt),
    first_message_body: field("first_message_body", base.first_message_body),
    language_preference_question: field(
      "language_preference_question",
      base.language_preference_question,
    ),
    ai_disclosure: field("ai_disclosure", base.ai_disclosure),
    updated_at:
      typeof src.updated_at === "string" && src.updated_at
        ? src.updated_at
        : nowIso(),
  };
}

/**
 * Sync read of last loaded/saved greetings (or identity defaults).
 * Warm via getBrandGreetingSettings() on outbound / Settings paths.
 * @returns {BrandGreetingSettings}
 */
export function getBrandGreetingSync() {
  return cache || defaultBrandGreetingSettings();
}

/** @param {BrandGreetingSettings} settings */
function setCache(settings) {
  cache = settings;
  setEnglishGreetingOverrides({
    default: settings.default,
    first_touch: settings.first_touch,
    follow_up: settings.follow_up,
    thank_you: settings.thank_you,
    after_sale: settings.after_sale,
    invoice: settings.invoice,
    receipt: settings.receipt,
  });
  return settings;
}

async function readLocal() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    return shapeBrandGreetingSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** @param {BrandGreetingSettings} settings */
async function writeLocal(settings) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(settings, null, 2), "utf8");
}

/**
 * @returns {Promise<BrandGreetingSettings & { storage: string }>}
 */
export async function getBrandGreetingSettings() {
  try {
    const entry = await getSharedKv(KV_KEY);
    if (entry && entry.value && typeof entry.value === "object") {
      const shaped = shapeBrandGreetingSettings(entry.value);
      setCache(shaped);
      return { ...shaped, storage: "shared_kv" };
    }
  } catch {
    /* fall through */
  }

  const local = await readLocal();
  if (local) {
    setCache(local);
    return { ...local, storage: "local_file" };
  }

  const defaults = defaultBrandGreetingSettings();
  setCache(defaults);
  return { ...defaults, storage: "defaults" };
}

/**
 * @param {Partial<BrandGreetingSettings> & Record<string, unknown>} patch
 * @returns {Promise<BrandGreetingSettings & { storage: string }>}
 */
export async function saveBrandGreetingSettings(patch) {
  const current = await getBrandGreetingSettings();
  const next = shapeBrandGreetingSettings({
    ...current,
    ...patch,
    updated_at: nowIso(),
  });

  let storage = "local_file";
  try {
    await setSharedKv({
      key: KV_KEY,
      value: {
        workspace_id: next.workspace_id,
        default: next.default,
        first_touch: next.first_touch,
        follow_up: next.follow_up,
        thank_you: next.thank_you,
        after_sale: next.after_sale,
        invoice: next.invoice,
        receipt: next.receipt,
        first_message_body: next.first_message_body,
        language_preference_question: next.language_preference_question,
        ai_disclosure: next.ai_disclosure,
        updated_at: next.updated_at,
      },
      written_by: "admin",
      tags: ["settings", "brand_greetings", "outbound"],
    });
    storage = "shared_kv";
  } catch {
    storage = "local_file";
  }

  try {
    await writeLocal(next);
  } catch {
    /* best-effort local mirror */
  }

  setCache(next);
  return { ...next, storage };
}

/**
 * Resolve a warm greeting kind from Settings overrides (English table).
 * Localized tables in identity.js still apply when language ≠ en and no override
 * is needed for non-English — English admin fields drive first-touch / default EN.
 * @param {string} [kind]
 * @param {Partial<BrandGreetingSettings> | null | undefined} [settings]
 */
export function resolveWarmGreetingText(kind = "default", settings) {
  const s = settings || getBrandGreetingSync();
  const key = String(kind || "default").trim() || "default";
  const fromSettings =
    key in s ? scrubGreetingPlainText(/** @type {Record<string, unknown>} */ (s)[key]) : "";
  if (fromSettings) return fromSettings;
  return (
    WARM_GREETINGS[/** @type {keyof typeof WARM_GREETINGS} */ (key)] ||
    WARM_GREETINGS.default
  );
}
