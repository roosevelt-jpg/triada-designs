/**
 * AI Support — Telegram / webchat / email / TikTok / LinkedIn inbound auto-reply.
 * Webhook or simulate → inbox conversation → Support draft → channel send adapter.
 */

import { runTeamCollaboration } from "./team-orchestrator";
import { setSharedKv } from "./shared-memory";
import {
  SUPPORT_TEXT_CHANNELS,
  appendOutboundReply,
  findConversationByExternal,
  ingestInboundDm,
} from "@/lib/crm/conversations-store";
import { sendSupportChannelText } from "@/lib/integrations/support-channel-send";

/**
 * Draft + send a Support reply for one Support text-channel conversation.
 * @param {{
 *   conversation: Record<string, unknown>,
 *   dry_run?: boolean,
 * }} input
 */
export async function replySupportChannel(input) {
  const conversation = input.conversation || {};
  const dryRun = input.dry_run === true;
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

  const collab = await runTeamCollaboration({
    agent_key: "ai_support",
    purpose: "draft_reply",
    message: inbound,
    dry_run: dryRun,
    context: {
      channel,
      conversation_id: conversation.id,
      subject: conversation.subject,
      contact_id: conversation.contact_id,
      customer_message: inbound,
      external_user_id: conversation.external_user_id,
      support_text_channel: true,
    },
    collaborators: ["quality_control", "compliance"],
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

  if (!dryRun) {
    const meta =
      conversation.metadata && typeof conversation.metadata === "object"
        ? /** @type {Record<string, unknown>} */ (conversation.metadata)
        : {};
    send = await sendSupportChannelText({
      channel,
      body: replyText,
      external_user_id: String(conversation.external_user_id || "").trim(),
      subject: conversation.subject
        ? `Re: ${String(conversation.subject)}`
        : undefined,
      customer_name:
        typeof meta.contact_name === "string" ? meta.contact_name : undefined,
      metadata: meta,
    });
    saved = await appendOutboundReply(String(conversation.id), {
      body: replyText,
      agent_key: "ai_support",
      provider_message_id: send?.provider_message_id
        ? String(send.provider_message_id)
        : null,
      send_mode: send?.mode || null,
      send_ok: Boolean(send?.ok),
      send_error: send?.error || null,
    });
  }

  await setSharedKv({
    key: "collab.active_thread",
    value: {
      channel,
      conversation_id: conversation.id,
      agent_key: "ai_support",
      last_reply_preview: replyText.slice(0, 240),
      updated_at: new Date().toISOString(),
    },
    written_by: "ai_support",
    tags: [channel, "support", "auto_reply"],
  }).catch(() => null);

  return {
    // Pipeline succeeded when a reply was drafted (+ appended). Provider
    // delivery is reported separately via send_ok / send_error.
    ok: true,
    skipped: false,
    conversation_id: conversation.id,
    channel,
    reply: replyText,
    mode: collab.mode || send?.mode || "live",
    dry_run: dryRun,
    send,
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

  if (input.auto_reply === false) {
    return { ok: true, conversation, replied: false, queued: true };
  }

  if (conversation.automation_mode === "human") {
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
  });

  return {
    ok: Boolean(reply.ok),
    conversation: reply.conversation || conversation,
    replied: Boolean(reply.reply && !reply.skipped),
    reply,
    deduplicated: false,
  };
}
