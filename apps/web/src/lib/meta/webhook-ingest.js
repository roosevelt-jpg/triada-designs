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
 * Store the raw webhook, then route inbound messages to inbox + AI auto-reply.
 * WhatsApp → AI Support (draft + Cloud API text send).
 * Instagram / Messenger / Facebook → AI Support (draft + Page Graph send).
 * Other social (e.g. LinkedIn sim) → Social Media Manager inbox reply.
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

  /** @type {{ ok: boolean, storage: string, id: string | null, provider_event_id: string | null, message?: string, warning?: string }} */
  let stored;

  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (!supabase) {
      const mock = await appendMetaWebhookMockEvent(row);
      stored = {
        ok: true,
        storage: mock.mode,
        id: mock.id,
        provider_event_id: providerEventId,
        message: "Stored locally (admin client unavailable).",
      };
    } else {
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
        stored = {
          ok: true,
          storage: mock.mode,
          id: mock.id,
          provider_event_id: providerEventId,
          warning: error.message,
        };
      } else {
        console.info("[meta-webhook] stored in supabase", {
          id: data?.id,
          provider_event_id: providerEventId,
          object_type: objectType,
        });
        stored = {
          ok: true,
          storage: "supabase",
          id: data?.id ?? null,
          provider_event_id: providerEventId,
        };
      }
    }
  } else {
    const mock = await appendMetaWebhookMockEvent(row);
    console.info("[meta-webhook] stored in local mock (no Supabase admin credentials)", {
      id: mock.id,
      provider_event_id: providerEventId,
    });
    stored = {
      ok: true,
      storage: mock.mode,
      id: mock.id,
      provider_event_id: providerEventId,
      message: "Awaiting Supabase credentials — local mock store.",
    };
  }

  const processed = await processInboundMessages(payload);

  if (stored.id && hasSupabaseAdminCredentials() && stored.storage === "supabase") {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      try {
        await supabase
          .from(TABLE)
          .update({
            processing_status: processed.messages.length
              ? processed.failed
                ? "partial"
                : "processed"
              : "ignored",
            processed_at: new Date().toISOString(),
          })
          .eq("id", stored.id);
      } catch {
        /* non-blocking status update */
      }
    }
  }

  return {
    ...stored,
    channel: processed.channel,
    messages: processed.messages,
    automations: processed.automations,
    replied: processed.replied,
    processing: processed,
  };
}

/**
 * @param {unknown} payload
 */
async function processInboundMessages(payload) {
  const normalized = normalizeMetaInboundMessages(payload);
  /** @type {Array<Record<string, unknown>>} */
  const messages = [];
  /** @type {Array<Record<string, unknown>>} */
  const automations = [];
  let replied = 0;
  let failed = 0;
  let channel = null;

  for (const item of normalized) {
    channel = item.channel;
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
        });
        messages.push({
          channel: "whatsapp",
          provider_message_id: item.provider_message_id,
          conversation_id: handled.conversation?.id || null,
          deduplicated: Boolean(handled.deduplicated),
          body: item.body,
        });
        automations.push({
          agent_key: "ai_support",
          replied: Boolean(handled.replied),
          skipped: Boolean(handled.skipped),
          reason: handled.reason || handled.reply?.reason || null,
          send_mode: handled.reply?.send?.mode || null,
          send_ok: handled.reply?.send?.ok ?? null,
          conversation_id: handled.conversation?.id || null,
        });
        if (handled.replied) replied += 1;
        if (handled.ok === false) failed += 1;
        continue;
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
        });
        messages.push({
          channel: item.channel,
          provider_message_id: item.provider_message_id,
          conversation_id: handled.conversation?.id || null,
          deduplicated: Boolean(handled.deduplicated),
          body: item.body,
        });
        automations.push({
          agent_key: "ai_support",
          channel: item.channel,
          replied: Boolean(handled.replied),
          skipped: Boolean(handled.skipped),
          reason: handled.reason || handled.reply?.reason || null,
          send_mode: handled.reply?.send?.mode || null,
          send_ok: handled.reply?.send?.ok ?? null,
          send_error: handled.reply?.send?.error || handled.reply?.error || null,
          conversation_id: handled.conversation?.id || null,
        });
        if (handled.replied) replied += 1;
        if (handled.ok === false) failed += 1;
        continue;
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
        messages.push({
          channel: item.channel,
          provider_message_id: item.provider_message_id,
          conversation_id: handled.conversation?.id || null,
          body: item.body,
        });
        automations.push({
          agent_key: "social_media_manager",
          replied: Boolean(handled.replied),
          conversation_id: handled.conversation?.id || null,
        });
        if (handled.replied) replied += 1;
        continue;
      }

      messages.push({
        channel: item.channel,
        provider_message_id: item.provider_message_id,
        ignored: true,
        reason: "unsupported_channel",
      });
    } catch (error) {
      failed += 1;
      console.error("[meta-webhook] inbound processing failed", {
        channel: item.channel,
        provider_message_id: item.provider_message_id,
        error: String(error?.message || error),
      });
      automations.push({
        ok: false,
        channel: item.channel,
        provider_message_id: item.provider_message_id,
        error: String(error?.message || error),
      });
    }
  }

  if (normalized.length) {
    console.info("[meta-webhook] processed inbound", {
      count: normalized.length,
      channel,
      replied,
      failed,
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
