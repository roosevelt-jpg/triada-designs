/**
 * AI Support — Telegram / webchat / email / TikTok / LinkedIn inbound auto-reply.
 * Webhook or simulate → inbox conversation → Support draft → channel send adapter.
 */

import { setSharedKv } from "./shared-memory";
import { draftInboundSupportReply } from "./support-draft";
import {
  finalizeHumanHandoff,
  maybeHumanHandoffReply,
} from "./human-handoff";
import {
  SUPPORT_TEXT_CHANNELS,
  appendOutboundReply,
  findConversationByExternal,
  ingestInboundDm,
} from "@/lib/crm/conversations-store";
import { linkInboundContact } from "@/lib/crm/link-inbound-contact";
import { sendSupportChannelText } from "@/lib/integrations/support-channel-send";
import { deliverOutbound } from "@/lib/runtime/background-outbound";

/**
 * Draft + send a Support reply for one Support text-channel conversation.
 * @param {{
 *   conversation: Record<string, unknown>,
 *   dry_run?: boolean,
 *   background_send?: boolean,
 * }} input
 */
export async function replySupportChannel(input) {
  const conversation = input.conversation || {};
  const dryRun = input.dry_run === true;
  const backgroundSend = input.background_send === true;
  const channel = String(conversation.channel || "webchat").toLowerCase();
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

  const metaPreview =
    conversation.metadata && typeof conversation.metadata === "object"
      ? /** @type {Record<string, unknown>} */ (conversation.metadata)
      : {};
  const customerName =
    typeof metaPreview.contact_name === "string"
      ? metaPreview.contact_name
      : undefined;

  const handoff = await maybeHumanHandoffReply(inbound);
  if (handoff) {
    const replyText = String(handoff.text || "").trim();
    /** @type {Record<string, unknown> | null} */
    let send = null;
    /** @type {Record<string, unknown> | null} */
    let saved = null;
    let sendPending = false;
    if (!dryRun) {
      const delivered = await deliverOutbound({
        background: backgroundSend,
        send: () =>
          sendSupportChannelText({
            channel,
            body: replyText,
            external_user_id: String(conversation.external_user_id || "").trim(),
            subject: conversation.subject
              ? `Re: ${String(conversation.subject)}`
              : undefined,
            customer_name: customerName,
            metadata: metaPreview,
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
      ok: true,
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
      send_ok: send ? Boolean(send.ok) : true,
      send_error: send && !send.ok ? send.error : null,
      reviews: [],
    };
  }

  const collab = await draftInboundSupportReply({
    message: inbound,
    customerName,
    channel,
    conversation,
    dry_run: dryRun,
    context: { support_text_channel: true },
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
    const meta = metaPreview;
    const delivered = await deliverOutbound({
      background: backgroundSend,
      send: () =>
        sendSupportChannelText({
          channel,
          body: replyText,
          external_user_id: String(conversation.external_user_id || "").trim(),
          subject: conversation.subject
            ? `Re: ${String(conversation.subject)}`
            : undefined,
          customer_name: customerName,
          metadata: meta,
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
    tags: [channel, "support", "auto_reply"],
  }).catch(() => null);

  return {
    // Pipeline succeeded when a reply was drafted. Provider delivery may be
    // pending when background_send is set (reported via send_pending).
    ok: true,
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
 * Ingest an inbound Support text-channel message and auto-reply.
 * @param {{
 *   channel: string,
 *   body: string,
 *   subject?: string,
 *   external_user_id: string,
 *   external_conversation_id?: string,
 *   provider_message_id?: string,
 *   contact_name?: string | null,
 *   page_or_account_id?: string,
 *   metadata?: Record<string, unknown>,
 *   auto_reply?: boolean,
 *   dry_run?: boolean,
 *   background_send?: boolean,
 * }} input
 */
export async function handleInboundSupportChannel(input) {
  const channel = String(input.channel || "").toLowerCase();
  if (!SUPPORT_TEXT_CHANNELS.includes(channel)) {
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

  const subject =
    String(input.subject || "").trim() ||
    String(input.body || "").trim() ||
    `${channel} message`;

  const conversation = await ingestInboundDm({
    channel,
    body: input.body,
    subject,
    conversation_id: existing?.id || undefined,
    contact_id: existing?.contact_id || undefined,
    external_user_id: externalUserId,
    external_conversation_id: externalConversationId,
    provider_message_id: input.provider_message_id,
    contact_name: input.contact_name || null,
    page_or_account_id: input.page_or_account_id,
    agent_key: "ai_support",
    metadata: {
      ...(input.metadata || {}),
      contact_name: input.contact_name || null,
      support_text_channel: true,
    },
  });

  const scheduleContactLink = () => {
    void linkInboundContact({
      conversationId: conversation?.id,
      channel,
      body: input.body,
      externalUserId,
      contactName: input.contact_name || null,
      metadata: {
        ...(input.metadata || {}),
        contact_name: input.contact_name || null,
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

  const reply = await replySupportChannel({
    conversation,
    dry_run: input.dry_run === true,
    background_send: input.background_send === true,
  });

  scheduleContactLink();

  return {
    ok: Boolean(reply.ok),
    conversation: reply.conversation || conversation,
    replied: Boolean(reply.reply && !reply.skipped),
    reply,
    deduplicated: false,
  };
}
