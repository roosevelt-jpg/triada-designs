/**
 * AI Support — Instagram Messaging + Facebook Messenger inbound auto-reply.
 * Meta webhook → inbox conversation → Support draft → Graph Page Send API.
 */

import { runTeamCollaboration } from "./team-orchestrator";
import { setSharedKv } from "./shared-memory";
import {
  SUPPORT_PAGE_MESSAGING_CHANNELS,
  appendOutboundReply,
  findConversationByExternal,
  ingestInboundDm,
} from "@/lib/crm/conversations-store";
import { sendPageMessagingText } from "@/lib/integrations/meta-page-text";

/**
 * Draft + send a Support reply for one Page Messaging conversation.
 * @param {{
 *   conversation: Record<string, unknown>,
 *   dry_run?: boolean,
 * }} input
 */
export async function replyPageMessagingSupport(input) {
  const conversation = input.conversation || {};
  const dryRun = input.dry_run === true;
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
      page_or_account_id: conversation.page_or_account_id,
      page_messaging: true,
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
    const recipientId = String(conversation.external_user_id || "").trim();
    send = await sendPageMessagingText({
      channel,
      recipient_id: recipientId,
      body: replyText,
      page_or_account_id: String(conversation.page_or_account_id || "").trim(),
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
    tags: [channel, "support", "auto_reply", "page_messaging"],
  }).catch(() => null);

  return {
    ok: Boolean(send ? send.ok : true),
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

  const conversation = await ingestInboundDm({
    channel,
    body: input.body,
    subject: input.body || `${channel} message`,
    conversation_id: existing?.id || undefined,
    external_user_id: externalUserId,
    external_conversation_id: externalConversationId,
    provider_message_id: input.provider_message_id,
    page_or_account_id: input.page_or_account_id,
    agent_key: "ai_support",
    metadata: {
      ...(input.metadata || {}),
      page_messaging: true,
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

  const reply = await replyPageMessagingSupport({
    conversation,
    dry_run: input.dry_run === true,
  });

  return {
    ok: Boolean(reply.ok),
    conversation: reply.conversation || conversation,
    replied: Boolean(reply.ok && !reply.skipped),
    reply,
    deduplicated: false,
  };
}
