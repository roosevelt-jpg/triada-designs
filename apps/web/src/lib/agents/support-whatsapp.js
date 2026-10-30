/**
 * AI Support — WhatsApp inbound auto-reply.
 * Meta webhook → inbox conversation → Support draft → Cloud API text send.
 *
 * Latency: simple greetings use a deterministic fast path (no Anthropic);
 * other inbound drafts use latency_mode "fast" (one LLM, reviews deferred).
 */

import { setSharedKv } from "./shared-memory";
import { draftInboundSupportReply } from "./support-draft";
import {
  finalizeHumanHandoff,
  maybeHumanHandoffReply,
} from "./human-handoff";
import {
  appendOutboundReply,
  findConversationByExternal,
  ingestInboundDm,
  patchConversation,
} from "@/lib/crm/conversations-store";
import { upsertContacts } from "@/lib/crm/contacts-store";
import { sendWhatsAppTextMessage } from "@/lib/integrations/whatsapp-cloud-text";
import { rememberInboundWhatsAppPeer } from "@/lib/crm/meta-contact-sync";
import { deliverOutbound } from "@/lib/runtime/background-outbound";

/**
 * Upsert CRM contact + link conversation.contact_id (off the Graph hot path).
 * Inbox still shows metadata.contact_name immediately.
 * @param {{
 *   conversationId?: string | null,
 *   externalUserId: string,
 *   contactName?: string | null,
 * }} input
 */
async function linkWhatsAppContact(input) {
  const waId = String(input.externalUserId || "")
    .replace(/^\+/, "")
    .trim();
  if (!waId) return;
  const phone = `+${waId}`;
  try {
    const result = await upsertContacts([
      {
        name: input.contactName || null,
        phone,
        source: "whatsapp_inbound",
        metadata: { wa_id: waId },
      },
    ]);
    const contactId = result.upserted?.[0]?.id || null;
    if (contactId && input.conversationId) {
      await patchConversation(String(input.conversationId), {
        contact_id: contactId,
      });
    }
  } catch {
    /* non-blocking */
  }
  try {
    await rememberInboundWhatsAppPeer({
      phone,
      name: input.contactName || null,
      wa_id: waId,
    });
  } catch {
    /* non-blocking */
  }
}

/**
 * Draft + send a Support reply for one WhatsApp conversation.
 * @param {{
 *   conversation: Record<string, unknown>,
 *   dry_run?: boolean,
 *   background_send?: boolean,
 * }} input
 */
export async function replyWhatsAppSupport(input) {
  const conversation = input.conversation || {};
  const dryRun = input.dry_run === true;
  const backgroundSend = input.background_send === true;
  const inbound = String(
    conversation.last_inbound_body ||
      conversation.subject ||
      "Hello — thanks for writing Triada Designs.",
  ).trim();

  if (conversation.automation_mode === "human") {
    return {
      ok: true,
      skipped: true,
      reason: "human_takeover",
      conversation_id: conversation.id,
      channel: "whatsapp",
    };
  }

  const handoff = await maybeHumanHandoffReply(inbound);
  if (handoff) {
    const replyText = String(handoff.text || "").trim();
    /** @type {Record<string, unknown> | null} */
    let send = null;
    /** @type {Record<string, unknown> | null} */
    let saved = null;
    let sendPending = false;
    if (!dryRun) {
      const to = String(
        conversation.external_user_id ||
          conversation.metadata?.wa_id ||
          "",
      ).trim();
      const delivered = await deliverOutbound({
        background: backgroundSend,
        send: () => sendWhatsAppTextMessage({ to, body: replyText }),
        afterSend: async (result) => {
          const appended = await appendOutboundReply(String(conversation.id), {
            body: replyText,
            agent_key: "ai_support",
            provider_message_id: result?.provider_message_id
              ? String(result.provider_message_id)
              : null,
            send_mode: result?.mode || null,
            send_ok: Boolean(result?.ok),
            send_error: result?.error || null,
          });
          await finalizeHumanHandoff({
            conversation_id: String(conversation.id),
            channel: "whatsapp",
            inbound,
            reply: replyText,
            agent_key: "ai_support",
            whatsapp_number: handoff.whatsapp_number,
            call_number: handoff.call_number,
          });
          return appended;
        },
      });
      send = delivered.send;
      saved = /** @type {Record<string, unknown> | null} */ (delivered.saved);
      sendPending = delivered.send_pending;
    }
    return {
      ok: Boolean(send ? send.ok : true),
      skipped: false,
      human_handoff: true,
      conversation_id: conversation.id,
      channel: "whatsapp",
      reply: replyText,
      mode: send?.mode || "live",
      fast_path: false,
      latency_ms: null,
      dry_run: dryRun,
      send,
      send_pending: sendPending,
      conversation: saved,
      reviews: [],
      error: send && !send.ok ? send.error : null,
    };
  }

  const customerName =
    typeof conversation.metadata?.contact_name === "string"
      ? conversation.metadata.contact_name
      : undefined;

  const collab = await draftInboundSupportReply({
    message: inbound,
    customerName,
    channel: "whatsapp",
    conversation,
    dry_run: dryRun,
  });

  const replyText = String(collab.draft || collab.text || "").trim();
  if (!replyText) {
    return {
      ok: false,
      error: "empty_reply",
      conversation_id: conversation.id,
      channel: "whatsapp",
      collab,
    };
  }

  /** @type {Record<string, unknown> | null} */
  let send = null;
  /** @type {Record<string, unknown> | null} */
  let saved = null;
  let sendPending = false;

  if (!dryRun) {
    const to = String(
      conversation.external_user_id ||
        conversation.metadata?.wa_id ||
        "",
    ).trim();
    const delivered = await deliverOutbound({
      background: backgroundSend,
      send: () => sendWhatsAppTextMessage({ to, body: replyText }),
      afterSend: (result) =>
        appendOutboundReply(String(conversation.id), {
          body: replyText,
          agent_key: "ai_support",
          provider_message_id: result?.provider_message_id
            ? String(result.provider_message_id)
            : null,
          send_mode: result?.mode || null,
          send_ok: Boolean(result?.ok),
          send_error: result?.error || null,
        }),
    });
    send = delivered.send;
    saved = /** @type {Record<string, unknown> | null} */ (delivered.saved);
    sendPending = delivered.send_pending;
  }

  void setSharedKv({
    key: "collab.active_thread",
    value: {
      channel: "whatsapp",
      conversation_id: conversation.id,
      agent_key: "ai_support",
      last_reply_preview: replyText.slice(0, 240),
      fast_path: Boolean(collab.fast_path),
      updated_at: new Date().toISOString(),
    },
    written_by: "ai_support",
    tags: ["whatsapp", "support", "auto_reply"],
  }).catch(() => null);

  return {
    ok: Boolean(send ? send.ok : true),
    skipped: false,
    conversation_id: conversation.id,
    channel: "whatsapp",
    reply: replyText,
    mode: collab.mode || send?.mode || "live",
    fast_path: Boolean(collab.fast_path),
    latency_ms: collab.latency_ms ?? null,
    dry_run: dryRun,
    send,
    send_pending: sendPending,
    conversation: saved,
    reviews: collab.reviews || [],
    error: send && !send.ok ? send.error : null,
  };
}

/**
 * Ingest an inbound WhatsApp message and auto-reply via Support.
 * @param {{
 *   body: string,
 *   external_user_id: string,
 *   external_conversation_id?: string,
 *   provider_message_id?: string,
 *   contact_name?: string | null,
 *   page_or_account_id?: string,
 *   message_type?: string,
 *   metadata?: Record<string, unknown>,
 *   auto_reply?: boolean,
 *   dry_run?: boolean,
 *   background_send?: boolean,
 * }} input
 */
export async function handleInboundWhatsApp(input) {
  const externalUserId = String(input.external_user_id || "").trim();
  const externalConversationId =
    String(input.external_conversation_id || "").trim() ||
    (externalUserId ? `wa:${externalUserId}` : "");

  const existing = externalConversationId
    ? await findConversationByExternal({
        channel: "whatsapp",
        external_conversation_id: externalConversationId,
        external_user_id: externalUserId,
      })
    : null;

  if (
    input.provider_message_id &&
    existing &&
    Array.isArray(existing.provider_message_ids) &&
    existing.provider_message_ids.includes(String(input.provider_message_id))
  ) {
    return {
      ok: true,
      deduplicated: true,
      conversation: existing,
      replied: false,
    };
  }

  const conversation = await ingestInboundDm({
    channel: "whatsapp",
    body: input.body,
    subject: input.body || "WhatsApp message",
    conversation_id: existing?.id || undefined,
    contact_id: existing?.contact_id || undefined,
    external_user_id: externalUserId,
    external_conversation_id: externalConversationId,
    provider_message_id: input.provider_message_id,
    contact_name: input.contact_name || null,
    page_or_account_id: input.page_or_account_id,
    metadata: {
      ...(input.metadata || {}),
      contact_name: input.contact_name || null,
      wa_id: externalUserId,
    },
  });

  const scheduleContactLink = () => {
    if (!externalUserId) return;
    void linkWhatsAppContact({
      conversationId: conversation?.id,
      externalUserId,
      contactName: input.contact_name || null,
    }).catch(() => null);
  };

  if (input.auto_reply === false) {
    scheduleContactLink();
    return { ok: true, conversation, replied: false, queued: true };
  }

  if (conversation.automation_mode === "human") {
    scheduleContactLink();
    return {
      ok: true,
      conversation,
      replied: false,
      skipped: true,
      reason: "human_takeover",
    };
  }

  // Draft first; Graph send may run after HTTP 200 when background_send.
  const reply = await replyWhatsAppSupport({
    conversation,
    dry_run: input.dry_run === true,
    background_send: input.background_send === true,
  });

  scheduleContactLink();

  return {
    ok: Boolean(reply.ok),
    conversation: reply.conversation || conversation,
    replied: Boolean(reply.ok && !reply.skipped),
    reply,
    deduplicated: false,
  };
}
