import { createHash } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { appendMetaWebhookMockEvent } from "@/lib/supabase/mock-store";

const TABLE = "meta_webhook_events";

/**
 * @param {unknown} payload
 * @returns {string}
 */
function payloadHash(payload) {
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * @param {unknown} payload
 * @returns {string | null}
 */
function extractProviderEventId(payload) {
  if (!payload || typeof payload !== "object") return null;
  const body = /** @type {Record<string, unknown>} */ (payload);
  const entry = Array.isArray(body.entry) ? body.entry[0] : null;
  if (entry && typeof entry === "object") {
    const e = /** @type {Record<string, unknown>} */ (entry);
    if (typeof e.id === "string" && e.id) {
      const time = typeof e.time === "number" ? String(e.time) : "";
      return time ? `${e.id}:${time}` : e.id;
    }
  }
  if (typeof body.object === "string") {
    return `${body.object}:${payloadHash(payload).slice(0, 16)}`;
  }
  return null;
}

/**
 * Ingest stub: store to Supabase when service-role credentials exist; else local mock file.
 * Full MetaInboundProcessor parity (contacts/inbox) lands in a later migration slice.
 *
 * @param {{ payload: unknown, rawBody: string, headers?: Record<string, string | null | undefined> }} input
 */
export async function ingestMetaWebhook(input) {
  const { payload, rawBody } = input;
  const hash = payloadHash(rawBody || payload);
  const providerEventId = extractProviderEventId(payload);
  const objectType =
    payload && typeof payload === "object" && typeof /** @type {any} */ (payload).object === "string"
      ? /** @type {any} */ (payload).object
      : "unknown";

  const row = {
    provider: "meta",
    object_type: objectType,
    provider_event_id: providerEventId,
    payload_hash: hash,
    payload: payload ?? null,
    processing_status: "received",
    received_at: new Date().toISOString(),
  };

  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (!supabase) {
      const mock = await appendMetaWebhookMockEvent(row);
      return {
        ok: true,
        storage: mock.mode,
        id: mock.id,
        provider_event_id: providerEventId,
        message: "Stored locally (admin client unavailable).",
      };
    }

    const { data, error } = await supabase
      .from(TABLE)
      .insert(row)
      .select("id")
      .maybeSingle();

    if (error) {
      // Table missing or RLS — fall back so Meta retries are not poisoned by schema lag.
      console.error("[meta-webhook] supabase insert failed; using local mock", error.message);
      const mock = await appendMetaWebhookMockEvent({
        ...row,
        last_error: error.message,
      });
      return {
        ok: true,
        storage: mock.mode,
        id: mock.id,
        provider_event_id: providerEventId,
        warning: error.message,
      };
    }

    console.info("[meta-webhook] stored in supabase", {
      id: data?.id,
      provider_event_id: providerEventId,
      object_type: objectType,
    });

    return {
      ok: true,
      storage: "supabase",
      id: data?.id ?? null,
      provider_event_id: providerEventId,
    };
  }

  const mock = await appendMetaWebhookMockEvent(row);
  console.info("[meta-webhook] stored in local mock (no Supabase admin credentials)", {
    id: mock.id,
    provider_event_id: providerEventId,
  });

  return {
    ok: true,
    storage: mock.mode,
    id: mock.id,
    provider_event_id: providerEventId,
    message: "Awaiting Supabase credentials — local mock store.",
  };
}
