import { createHash } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { appendMetaWebhookMockEvent } from "@/lib/supabase/mock-store";
import { normalizeMetaInboundMessages } from "@/lib/meta/normalize-inbound";
import { handleInboundWhatsApp } from "@/lib/agents/support-whatsapp";
import { handleInboundPageMessaging } from "@/lib/agents/support-page-messaging";
import { handleInboundSocialDm } from "@/lib/agents/social-media-manager";
import {
  SOCIAL_DM_CHANNELS,
  SUPPORT_PAGE_MESSAGING_CHANNELS,
} from "@/lib/crm/conversations-store";
import { mapParallel } from "@/lib/runtime/parallel-map";

const TABLE = "meta_webhook_events";

/** Default concurrency for multi-message Meta payloads. */
const INBOUND_PARALLEL = 6;

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
 * Persist raw webhook row (Supabase or local mock).
 * @param {{
 *   payload: unknown,
 *   rawBody: string,
 * }} input
 */
async function storeWebhookEvent(input) {
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

/**
 * Store the raw webhook, then route inbound messages to inbox + AI auto-reply.
 * Store + inbound processing run in parallel so Graph send is not blocked on
 * webhook row insert latency.
 *
 * HTTP route handlers should call this via `runAfterResponse` so Meta gets an
 * early 200 before draft/Graph work. Direct callers (smoke) still await fully.
 *
 * WhatsApp → AI Support (draft + Cloud API text send).
 * Instagram / Messenger / Facebook → AI Support (draft + Page Graph send).
 * Other social (e.g. LinkedIn sim) → Social Media Manager inbox reply.
 *
 * @param {{
 *   payload: unknown,
 *   rawBody: string,
 *   headers?: Record<string, string | null | undefined>,
 *   background_send?: boolean,
 * }} input
 */
export async function ingestMetaWebhook(input) {
  const { payload, rawBody } = input;
  const started = Date.now();
  const backgroundSend = input.background_send === true;

  // Critical path: process inbound (draft + Graph) in parallel with store.
  const [stored, processed] = await Promise.all([
    storeWebhookEvent({ payload, rawBody }),
    processInboundMessages(payload, { background_send: backgroundSend }),
  ]);

  // Status update is non-blocking — never delay Meta 200 / customer send.
  if (stored.id && hasSupabaseAdminCredentials() && stored.storage === "supabase") {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      void supabase
        .from(TABLE)
        .update({
          processing_status: processed.messages.length
            ? processed.failed
              ? "partial"
              : "processed"
            : "ignored",
          processed_at: new Date().toISOString(),
        })
        .eq("id", stored.id)
        .then(() => null)
        .catch(() => null);
    }
  }

  return {
    ...stored,
    channel: processed.channel,
    messages: processed.messages,
    automations: processed.automations,
    replied: processed.replied,
    processing: processed,
    latency_ms: Date.now() - started,
  };
}

/**
 * @param {unknown} payload
 * @param {{ background_send?: boolean }} [opts]
 */
async function processInboundMessages(payload, opts = {}) {
  const normalized = normalizeMetaInboundMessages(payload);
  const backgroundSend = opts.background_send === true;

  const outcomes = await mapParallel(
    normalized,
    async (item) => {
      try {
        if (item.channel === "whatsapp") {
          const handled = await handleInboundWhatsApp({
            body: item.body || "Hi",
            external_user_id: item.external_user_id,
            external_conversation_id: item.external_conversation_id,
            provider_message_id: item.provider_message_id,
            contact_name:
              typeof item.metadata?.contact_name === "string"
                ? item.metadata.contact_name
                : null,
            page_or_account_id: item.page_or_account_id,
            message_type: item.message_type,
            metadata: item.metadata,
            auto_reply: true,
            dry_run: false,
            background_send: backgroundSend,
          });
          return {
            channel: item.channel,
            message: {
              channel: "whatsapp",
              provider_message_id: item.provider_message_id,
              conversation_id: handled.conversation?.id || null,
              deduplicated: Boolean(handled.deduplicated),
              body: item.body,
            },
            automation: {
              agent_key: "ai_support",
              replied: Boolean(handled.replied),
              skipped: Boolean(handled.skipped),
              reason: handled.reason || handled.reply?.reason || null,
              send_mode: handled.reply?.send?.mode || null,
              send_ok: handled.reply?.send?.ok ?? null,
              send_pending: Boolean(handled.reply?.send_pending),
              fast_path: Boolean(handled.reply?.fast_path),
              draft_latency_ms: handled.reply?.latency_ms ?? null,
              conversation_id: handled.conversation?.id || null,
            },
            replied: Boolean(handled.replied),
            failed: handled.ok === false,
          };
        }

        if (SUPPORT_PAGE_MESSAGING_CHANNELS.includes(item.channel)) {
          const handled = await handleInboundPageMessaging({
            channel: item.channel,
            body: item.body || "Hi",
            external_user_id: item.external_user_id,
            external_conversation_id: item.external_conversation_id,
            provider_message_id: item.provider_message_id,
            page_or_account_id: item.page_or_account_id,
            message_type: item.message_type,
            metadata: item.metadata,
            auto_reply: true,
            dry_run: false,
            background_send: backgroundSend,
          });
          return {
            channel: item.channel,
            message: {
              channel: item.channel,
              provider_message_id: item.provider_message_id,
              conversation_id: handled.conversation?.id || null,
              deduplicated: Boolean(handled.deduplicated),
              body: item.body,
            },
            automation: {
              agent_key: "ai_support",
              channel: item.channel,
              replied: Boolean(handled.replied),
              skipped: Boolean(handled.skipped),
              reason: handled.reason || handled.reply?.reason || null,
              send_mode: handled.reply?.send?.mode || null,
              send_ok: handled.reply?.send?.ok ?? null,
              send_error:
                handled.reply?.send?.error || handled.reply?.error || null,
              send_pending: Boolean(handled.reply?.send_pending),
              fast_path: Boolean(handled.reply?.fast_path),
              draft_latency_ms: handled.reply?.latency_ms ?? null,
              conversation_id: handled.conversation?.id || null,
            },
            replied: Boolean(handled.replied),
            failed: handled.ok === false,
          };
        }

        if (SOCIAL_DM_CHANNELS.includes(item.channel)) {
          const handled = await handleInboundSocialDm({
            channel: item.channel,
            body: item.body || "Hi",
            subject: item.body || `${item.channel} DM`,
            conversation_id: undefined,
            auto_reply: true,
            dry_run: false,
          });
          return {
            channel: item.channel,
            message: {
              channel: item.channel,
              provider_message_id: item.provider_message_id,
              conversation_id: handled.conversation?.id || null,
              body: item.body,
            },
            automation: {
              agent_key: "social_media_manager",
              replied: Boolean(handled.replied),
              conversation_id: handled.conversation?.id || null,
            },
            replied: Boolean(handled.replied),
            failed: false,
          };
        }

        return {
          channel: item.channel,
          message: {
            channel: item.channel,
            provider_message_id: item.provider_message_id,
            ignored: true,
            reason: "unsupported_channel",
          },
          automation: null,
          replied: false,
          failed: false,
        };
      } catch (error) {
        console.error("[meta-webhook] inbound processing failed", {
          channel: item.channel,
          provider_message_id: item.provider_message_id,
          error: String(error?.message || error),
        });
        return {
          channel: item.channel,
          message: null,
          automation: {
            ok: false,
            channel: item.channel,
            provider_message_id: item.provider_message_id,
            error: String(error?.message || error),
          },
          replied: false,
          failed: true,
        };
      }
    },
    { concurrency: INBOUND_PARALLEL },
  );

  /** @type {Array<Record<string, unknown>>} */
  const messages = [];
  /** @type {Array<Record<string, unknown>>} */
  const automations = [];
  let replied = 0;
  let failed = 0;
  let channel = null;

  for (const outcome of outcomes) {
    if (outcome.channel) channel = outcome.channel;
    if (outcome.message) messages.push(outcome.message);
    if (outcome.automation) automations.push(outcome.automation);
    if (outcome.replied) replied += 1;
    if (outcome.failed) failed += 1;
  }

  if (normalized.length) {
    console.info("[meta-webhook] processed inbound", {
      count: normalized.length,
      channel,
      replied,
      failed,
      parallel: true,
    });
  }

  return {
    channel,
    messages,
    automations,
    replied,
    failed,
    normalized_count: normalized.length,
  };
}
