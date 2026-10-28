import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  hasSupabaseAdminCredentials,
} from "@/lib/supabase/config";
import { ADMIN_EMAIL } from "@/lib/auth/supabase-auth";
import { connectionLabel, modelNickname } from "./brand-labels";
import { decryptSecret, encryptSecret } from "./credential-crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getLocalDataDir } from "@/lib/local-data-dir";

const TABLE = "integration_secrets";
const WORKSPACE_ID = "triada-ops";
const PROVIDER = "anthropic";
const SECRET_TYPE = "api_key";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "integration-secrets.json");

/** Anthropic keys are `sk-ant-…` — reject other shapes so typos fail closed. */
export function isValidAnthropicKeyFormat(value) {
  const key = String(value || "").trim();
  return /^sk-ant-[A-Za-z0-9_-]{16,}$/.test(key);
}

function envAnthropicKey() {
  return (process.env.ANTHROPIC_API_KEY || "").trim();
}

function envAnthropicModel() {
  return (process.env.ANTHROPIC_MODEL || "").trim() || DEFAULT_MODEL;
}

/**
 * Presence-only status shape (never includes secret values).
 * @param {{ has_credentials: boolean, model?: string, source?: string, honesty?: string }} opts
 */
export function anthropicStatusPayload(opts) {
  const has = Boolean(opts.has_credentials);
  const model = opts.model || envAnthropicModel();
  const status = has ? "connected" : "awaiting_credentials";
  const summary = has
    ? "Claude is connected for agents and creative intelligence."
    : "Waiting for Claude credentials on Vercel.";
  return {
    provider: PROVIDER,
    configured_provider: has ? "anthropic" : "local",
    display_name: "Anthropic (Claude)",
    status,
    status_label: connectionLabel(status, { hasCredentials: has }),
    has_credentials: has,
    model,
    model_label: modelNickname(model),
    mode: has ? "live" : "local",
    source: opts.source || (has ? "stored" : "none"),
    summary,
    // Kept for older clients; UI should prefer summary / status_label.
    honesty: opts.honesty || summary,
    ui_hint: "Claude credentials are managed on the host (Vercel).",
  };
}

async function readLocalStore() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** @param {Record<string, unknown>} data */
async function writeLocalStore(data) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(data, null, 2), "utf8");
}

/**
 * @returns {Promise<{ ciphertext?: string, model?: string, storage: string } | null>}
 */
async function readStoredRow() {
  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("ciphertext, metadata, key_version")
        .eq("workspace_id", WORKSPACE_ID)
        .eq("provider", PROVIDER)
        .eq("secret_type", SECRET_TYPE)
        .maybeSingle();

      if (!error && data?.ciphertext) {
        const meta =
          data.metadata && typeof data.metadata === "object" ? data.metadata : {};
        return {
          ciphertext: data.ciphertext,
          model: typeof meta.model === "string" ? meta.model : undefined,
          storage: "supabase_table",
        };
      }

      // Table missing or empty — try Auth app_metadata fallback (no migration required).
      const fromMeta = await readAppMetadataSecret(supabase);
      if (fromMeta) return fromMeta;
    }
  }

  const local = await readLocalStore();
  const row = local?.[PROVIDER];
  if (row && typeof row === "object" && typeof row.ciphertext === "string") {
    return {
      ciphertext: row.ciphertext,
      model: typeof row.model === "string" ? row.model : undefined,
      storage: "local_mock",
    };
  }
  return null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function findAdminUserId(supabase) {
  const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listed.error) return null;
  const hit = (listed.data?.users || []).find(
    (u) => (u.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase(),
  );
  return hit?.id || null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function readAppMetadataSecret(supabase) {
  const userId = await findAdminUserId(supabase);
  if (!userId) return null;
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  const blob = data.user.app_metadata?.triada_secrets?.anthropic;
  if (!blob || typeof blob !== "object") return null;
  if (typeof blob.ciphertext !== "string" || !blob.ciphertext) return null;
  return {
    ciphertext: blob.ciphertext,
    model: typeof blob.model === "string" ? blob.model : undefined,
    storage: "supabase_app_metadata",
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ ciphertext: string, model: string } | null} payload null clears
 */
async function writeAppMetadataSecret(supabase, payload) {
  const userId = await findAdminUserId(supabase);
  if (!userId) return { ok: false, reason: "admin_user_missing" };
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) return { ok: false, reason: error?.message || "user_read_failed" };

  const prevMeta = { ...(data.user.app_metadata || {}) };
  const prevSecrets =
    prevMeta.triada_secrets && typeof prevMeta.triada_secrets === "object"
      ? { ...prevMeta.triada_secrets }
      : {};

  if (!payload) {
    delete prevSecrets.anthropic;
  } else {
    prevSecrets.anthropic = {
      ciphertext: payload.ciphertext,
      model: payload.model,
      has_credentials: true,
      key_version: "v1",
      updated_at: new Date().toISOString(),
    };
  }

  const updated = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...prevMeta,
      triada_secrets: prevSecrets,
    },
  });
  if (updated.error) return { ok: false, reason: updated.error.message };
  return { ok: true, storage: "supabase_app_metadata" };
}

/**
 * @returns {Promise<ReturnType<typeof anthropicStatusPayload>>}
 */
export async function getAnthropicStatus() {
  const envKey = envAnthropicKey();
  if (envKey) {
    return anthropicStatusPayload({
      has_credentials: true,
      model: envAnthropicModel(),
      source: "env",
      honesty: "Claude is connected for agents and creative intelligence.",
    });
  }

  const stored = await readStoredRow();
  if (stored?.ciphertext) {
    return anthropicStatusPayload({
      has_credentials: true,
      model: stored.model || envAnthropicModel(),
      source: stored.storage,
      honesty: "Claude is connected for agents and creative intelligence.",
    });
  }

  return anthropicStatusPayload({ has_credentials: false });
}

/**
 * Persist Anthropic credentials. Accepts presence of valid `sk-ant-…` format;
 * does not call Anthropic to validate the key live.
 *
 * @param {{ api_key?: string, model?: string }} input
 * @returns {Promise<{ ok: true, anthropic: ReturnType<typeof anthropicStatusPayload>, storage: string } | { ok: false, status: number, message: string }>}
 */
export async function saveAnthropicCredentials(input) {
  const apiKey = String(input?.api_key || "").trim();
  const model = String(input?.model || "").trim() || envAnthropicModel();

  if (apiKey && !isValidAnthropicKeyFormat(apiKey)) {
    return {
      ok: false,
      status: 422,
      message: "Invalid Claude API key format. Please paste a valid Anthropic key.",
    };
  }

  const existing = await readStoredRow();
  if (!apiKey && !existing?.ciphertext && !envAnthropicKey()) {
    return {
      ok: false,
      status: 422,
      message: "Provide a Claude API key to connect.",
    };
  }

  let ciphertext = existing?.ciphertext;
  if (apiKey) {
    ciphertext = encryptSecret(apiKey);
  }

  if (!ciphertext && envAnthropicKey()) {
    // Model-only update while env supplies the key — persist model marker without copying env secret.
    const status = anthropicStatusPayload({
      has_credentials: true,
      model,
      source: "env",
      honesty: "Claude model preference updated. Host credentials remain in place.",
    });
    return { ok: true, anthropic: status, storage: "env" };
  }

  if (!ciphertext) {
    return {
      ok: false,
      status: 422,
      message: "Provide a Claude API key to connect.",
    };
  }

  const meta = {
    model,
    provider: PROVIDER,
    has_credentials: true,
    source: "integrations_ui",
    updated_at: new Date().toISOString(),
  };

  let storage = "local_mock";

  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      const { error } = await supabase.from(TABLE).upsert(
        {
          workspace_id: WORKSPACE_ID,
          provider: PROVIDER,
          secret_type: SECRET_TYPE,
          ciphertext,
          key_version: "v1",
          metadata: meta,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,provider,secret_type" },
      );

      if (!error) {
        storage = "supabase_table";
      } else {
        // Table may not exist yet — fall back to Auth app_metadata (no DDL required).
        const metaWrite = await writeAppMetadataSecret(supabase, {
          ciphertext,
          model,
        });
        if (metaWrite.ok) {
          storage = "supabase_app_metadata";
        } else {
          // Last resort: local file (dev / same-instance).
          const local = await readLocalStore();
          local[PROVIDER] = { ciphertext, model, key_version: "v1", ...meta };
          await writeLocalStore(local);
          storage = "local_mock";
        }
      }
    }
  } else {
    const local = await readLocalStore();
    local[PROVIDER] = { ciphertext, model, key_version: "v1", ...meta };
    await writeLocalStore(local);
    storage = "local_mock";
  }

  const status = anthropicStatusPayload({
    has_credentials: true,
    model,
    source: storage,
    honesty: "Claude is connected for agents and creative intelligence.",
  });

  return { ok: true, anthropic: status, storage };
}

/**
 * Clear Integrations-stored Anthropic key (env key unaffected).
 * @returns {Promise<{ ok: true, anthropic: ReturnType<typeof anthropicStatusPayload>, storage: string }>}
 */
export async function clearAnthropicCredentials() {
  let storage = "none";

  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      await supabase
        .from(TABLE)
        .delete()
        .eq("workspace_id", WORKSPACE_ID)
        .eq("provider", PROVIDER)
        .eq("secret_type", SECRET_TYPE);
      await writeAppMetadataSecret(supabase, null);
      storage = "supabase";
    }
  }

  const local = await readLocalStore();
  if (local[PROVIDER]) {
    delete local[PROVIDER];
    await writeLocalStore(local);
    if (storage === "none") storage = "local_mock";
  }

  const envStill = Boolean(envAnthropicKey());
  return {
    ok: true,
    anthropic: anthropicStatusPayload({
      has_credentials: envStill,
      model: envAnthropicModel(),
      source: envStill ? "env" : "none",
      honesty: envStill
        ? "Stored key cleared. Host credentials remain connected."
        : "Stored Claude key cleared.",
    }),
    storage,
  };
}

/**
 * Decrypt stored key for server-side adapters only. Never send to clients.
 * @returns {Promise<string>}
 */
export async function resolveAnthropicApiKey() {
  const envKey = envAnthropicKey();
  if (envKey) return envKey;
  const stored = await readStoredRow();
  if (!stored?.ciphertext) return "";
  try {
    return decryptSecret(stored.ciphertext).trim();
  } catch {
    return "";
  }
}
