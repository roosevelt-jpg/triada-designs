/**
 * AI Support — Instagram Messaging + Facebook Messenger inbound auto-reply.
 * Meta webhook → inbox conversation → Support draft → Graph Page Send API.
 */

import { setSharedKv } from "./shared-memory";
import { draftInboundSupportReply } from "./support-draft";
import {
  finalizeHumanHandoff,
  maybeHumanHandoffReply,
} from "./human-handoff";
import {
  SUPPORT_PAGE_MESSAGING_CHANNELS,
  appendOutboundReply,
  findConversationByExternal,
  ingestInboundDm,
} from "@/lib/crm/conversations-store";
import { linkInboundContact } from "@/lib/crm/link-inbound-contact";
import { sendPageMessagingText } from "@/lib/integrations/meta-page-text";
import { deliverOutbound } from "@/lib/runtime/background-outbound";

/**
 * Draft + send a Support reply for one Page Messaging conversation.
 * @param {{
 *   conversation: Record<string, unknown>,
 *   dry_run?: boolean,
 *   background_send?: boolean,
 * }} input
 */
export async function replyPageMessagingSupport(input) {
  const conversation = input.conversation || {};
  const dryRun = input.dry_run === true;
  const backgroundSend = input.background_send === true;
  const channel = String(conversation.channel || "messenger").toLowerCase();
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
      channel,
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
      const recipientId = String(conversation.external_user_id || "").trim();
      const delivered = await deliverOutbound({
        background: backgroundSend,
        send: () =>
          sendPageMessagingText({
            channel,
            recipient_id: recipientId,
            body: replyText,
            page_or_account_id: String(
              conversation.page_or_account_id || "",
            ).trim(),
          }),
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
            channel,
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
      channel,
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
    channel,
    conversation,
    dry_run: dryRun,
    context: {
      page_or_account_id: conversation.page_or_account_id,
      page_messaging: true,
    },
  });

  const replyText = String(collab.draft || collab.text || "").trim();
  if (!replyText) {
    return {
      ok: false,
      error: "empty_reply",
      conversation_id: conversation.id,
      channel,
      collab,
    };
  }

  /** @type {Record<string, unknown> | null} */
  let send = null;
  /** @type {Record<string, unknown> | null} */
  let saved = null;
  let sendPending = false;

  if (!dryRun) {
    const recipientId = String(conversation.external_user_id || "").trim();
    const delivered = await deliverOutbound({
      background: backgroundSend,
      send: () =>
        sendPageMessagingText({
          channel,
          recipient_id: recipientId,
          body: replyText,
          page_or_account_id: String(
            conversation.page_or_account_id || "",
          ).trim(),
        }),
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
      channel,
      conversation_id: conversation.id,
      agent_key: "ai_support",
      last_reply_preview: replyText.slice(0, 240),
      fast_path: Boolean(collab.fast_path),
      updated_at: new Date().toISOString(),
    },
    written_by: "ai_support",
    tags: [channel, "support", "auto_reply", "page_messaging"],
  }).catch(() => null);

  return {
    ok: Boolean(send ? send.ok : true),
    skipped: false,
    conversation_id: conversation.id,
    channel,
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
 * Ingest an inbound Instagram / Messenger / Facebook message and auto-reply via Support.
 * @param {{
 *   channel: string,
 *   body: string,
 *   external_user_id: string,
 *   external_conversation_id?: string,
 *   provider_message_id?: string,
 *   page_or_account_id?: string,
 *   message_type?: string,
 *   metadata?: Record<string, unknown>,
 *   auto_reply?: boolean,
 *   dry_run?: boolean,
 *   background_send?: boolean,
 * }} input
 */
export async function handleInboundPageMessaging(input) {
  const channel = String(input.channel || "messenger").toLowerCase();
  if (!SUPPORT_PAGE_MESSAGING_CHANNELS.includes(channel)) {
    return {
      ok: false,
      error: "unsupported_channel",
      channel,
      replied: false,
    };
  }

  const externalUserId = String(input.external_user_id || "").trim();
  const externalConversationId =
    String(input.external_conversation_id || "").trim() ||
    (externalUserId ? `${channel}:${externalUserId}` : "");

  const existing = externalConversationId
    ? await findConversationByExternal({
        channel,
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

  const contactName =
    typeof input.metadata?.contact_name === "string"
      ? input.metadata.contact_name
      : null;

  const conversation = await ingestInboundDm({
    channel,
    body: input.body,
    subject: input.body || `${channel} message`,
    conversation_id: existing?.id || undefined,
    contact_id: existing?.contact_id || undefined,
    external_user_id: externalUserId,
    external_conversation_id: externalConversationId,
    provider_message_id: input.provider_message_id,
    contact_name: contactName,
    page_or_account_id: input.page_or_account_id,
    agent_key: "ai_support",
    metadata: {
      ...(input.metadata || {}),
      page_messaging: true,
    },
  });

  const scheduleContactLink = () => {
    void linkInboundContact({
      conversationId: conversation?.id,
      channel,
      body: input.body,
      externalUserId,
      contactName,
      metadata: {
        ...(input.metadata || {}),
        contact_name: contactName,
      },
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

  const reply = await replyPageMessagingSupport({
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
