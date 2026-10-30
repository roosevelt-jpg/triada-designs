/**
 * Deliver an admin/human Unified Inbox reply live on the conversation's channel.
 * Uses the same send adapters as AI Support (WA Cloud, Page Messaging, Support text).
 */

import {
  SUPPORT_PAGE_MESSAGING_CHANNELS,
  SUPPORT_TEXT_CHANNELS,
  appendOutboundReply,
  getConversation,
  patchConversation,
} from "@/lib/crm/conversations-store";
import { sendWhatsAppTextMessage } from "@/lib/integrations/whatsapp-cloud-text";
import { sendPageMessagingText } from "@/lib/integrations/meta-page-text";
import { sendSupportChannelText } from "@/lib/integrations/support-channel-send";
import { formatChatMessageBody } from "@/lib/crm/format-chat-message";

/**
 * @param {{
 *   conversationId: string,
 *   body: string,
 * }} input
 * @returns {Promise<{
 *   ok: boolean,
 *   conversation: Record<string, unknown> | null,
 *   send: Record<string, unknown> | null,
 *   error: string | null,
 * }>}
 */
export async function sendHumanInboxReply(input) {
  const conversationId = String(input.conversationId || "").trim();
  const body = formatChatMessageBody(input.body);
  if (!conversationId) {
    return { ok: false, conversation: null, send: null, error: "conversation_required" };
  }
  if (!body) {
    return { ok: false, conversation: null, send: null, error: "body_required" };
  }

  const conversation = await getConversation(conversationId);
  if (!conversation) {
    return { ok: false, conversation: null, send: null, error: "not_found" };
  }

  const channel = String(conversation.channel || "").toLowerCase();
  const meta =
    conversation.metadata && typeof conversation.metadata === "object"
      ? /** @type {Record<string, unknown>} */ (conversation.metadata)
      : {};
  const customerName =
    typeof meta.contact_name === "string" ? meta.contact_name : undefined;
  const externalUserId = String(conversation.external_user_id || "").trim();

  /** @type {Record<string, unknown>} */
  let send;

  if (channel === "whatsapp") {
    const to =
      externalUserId ||
      (typeof meta.wa_id === "string" ? meta.wa_id : "") ||
      "";
    send = await sendWhatsAppTextMessage({ to: String(to).trim(), body });
  } else if (SUPPORT_PAGE_MESSAGING_CHANNELS.includes(channel)) {
    send = await sendPageMessagingText({
      channel,
      recipient_id: externalUserId,
      body,
      page_or_account_id: String(conversation.page_or_account_id || "").trim(),
    });
  } else if (SUPPORT_TEXT_CHANNELS.includes(channel)) {
    send = await sendSupportChannelText({
      channel,
      body,
      external_user_id: externalUserId,
      subject: conversation.subject
        ? `Re: ${String(conversation.subject)}`
        : undefined,
      customer_name: customerName,
      metadata: meta,
    });
  } else {
    send = {
      ok: false,
      mode: "local_sim",
      channel,
      provider_message_id: null,
      error: "unsupported_channel",
      raw: {},
    };
  }

  if (!send?.ok) {
    return {
      ok: false,
      conversation: conversation,
      send,
      error: String(send?.error || "send_failed"),
    };
  }

  // Flip to human mode so AI stops answering this thread, then persist trail.
  await patchConversation(conversationId, { automation_mode: "human" });

  const saved = await appendOutboundReply(conversationId, {
    body,
    agent_key: "human",
    provider_message_id: send?.provider_message_id
      ? String(send.provider_message_id)
      : null,
    send_mode: send?.mode || null,
    send_ok: true,
    send_error: null,
  });

  return {
    ok: true,
    conversation: saved,
    send,
    error: null,
  };
}
