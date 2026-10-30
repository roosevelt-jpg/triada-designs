/**
 * Shape ConversationRecord rows for the Unified Inbox UI
 * (Laravel ConversationController-compatible fields).
 */

import { formatChatMessageBody } from "@/lib/crm/format-chat-message";

/**
 * @param {Record<string, unknown> | null | undefined} message
 */
export function shapeMessageForInbox(message) {
  if (!message || typeof message !== "object") return null;
  const direction =
    String(message.direction || "").toLowerCase() === "outbound"
      ? "outbound"
      : "inbound";
  const agentKey =
    typeof message.agent_key === "string" ? message.agent_key : null;
  let senderType = "customer";
  if (direction === "outbound") {
    senderType = agentKey === "human" ? "agent" : "bot";
  }
  return {
    id: String(message.id || ""),
    body: formatChatMessageBody(message.body),
    direction,
    sender_type: senderType,
    created_at: String(message.created_at || message.at || ""),
    agent_key: agentKey,
    provider_message_id: message.provider_message_id || null,
  };
}

/**
 * @param {Record<string, unknown>} conversation
 * @param {Record<string, unknown> | null} [contact]
 */
export function shapeConversationForInbox(conversation, contact = null) {
  const c = conversation && typeof conversation === "object" ? conversation : {};
  const meta =
    c.metadata && typeof c.metadata === "object"
      ? /** @type {Record<string, unknown>} */ (c.metadata)
      : {};
  const inboundAt = c.last_inbound_at ? String(c.last_inbound_at) : null;
  const outboundAt = c.last_outbound_at ? String(c.last_outbound_at) : null;
  let lastMessageAt = c.updated_at ? String(c.updated_at) : null;
  if (inboundAt && outboundAt) {
    lastMessageAt =
      new Date(outboundAt).getTime() >= new Date(inboundAt).getTime()
        ? outboundAt
        : inboundAt;
  } else if (outboundAt || inboundAt) {
    lastMessageAt = outboundAt || inboundAt;
  }

  const channel = String(c.channel || "");
  const contactName =
    (contact && typeof contact.name === "string" && contact.name.trim()) ||
    (typeof meta.contact_name === "string" && meta.contact_name.trim()) ||
    (typeof c.external_user_id === "string" && c.external_user_id.trim()) ||
    null;

  const contactEmail =
    (contact && contact.email) ||
    (typeof meta.email === "string" ? meta.email : null) ||
    null;

  const contactPhone =
    (contact && (contact.phone || contact.phone_e164)) ||
    (typeof meta.phone === "string" ? meta.phone : null) ||
    (channel === "whatsapp" && c.external_user_id
      ? String(c.external_user_id).startsWith("+")
        ? String(c.external_user_id)
        : `+${c.external_user_id}`
      : null);

  const avatarUrl =
    (contact &&
      (contact.avatar_url ||
        (contact.metadata &&
          typeof contact.metadata === "object" &&
          /** @type {Record<string, unknown>} */ (contact.metadata).avatar_url))) ||
    meta.avatar_url ||
    meta.profile_pic ||
    meta.picture ||
    null;
  const picture =
    typeof avatarUrl === "string" && /^https?:\/\//i.test(avatarUrl.trim())
      ? avatarUrl.trim()
      : null;

  const messages = Array.isArray(c.messages)
    ? c.messages.map(shapeMessageForInbox).filter(Boolean)
    : [];

  return {
    id: String(c.id || ""),
    workspace_id: c.workspace_id || "triada-ops",
    channel,
    status: String(c.status || "open"),
    automation_mode: String(c.automation_mode || "ai"),
    subject: String(c.subject || ""),
    contact_id: c.contact_id || contact?.id || null,
    assigned_agent_key: c.assigned_agent_key || null,
    external_user_id: c.external_user_id || null,
    external_conversation_id: c.external_conversation_id || null,
    last_inbound_at: inboundAt,
    last_outbound_at: outboundAt,
    last_message_at: lastMessageAt,
    last_inbound_body: c.last_inbound_body
      ? formatChatMessageBody(c.last_inbound_body)
      : null,
    last_outbound_body: c.last_outbound_body
      ? formatChatMessageBody(c.last_outbound_body)
      : null,
    unanswered: Boolean(c.unanswered),
    priority:
      typeof meta.priority === "string" ? meta.priority : "normal",
    detected_language:
      (typeof meta.detected_language === "string" && meta.detected_language) ||
      (contact && typeof contact.preferred_language === "string"
        ? contact.preferred_language
        : null),
    contact: {
      id: (contact && contact.id) || c.contact_id || null,
      name: contactName || "Unknown contact",
      email: contactEmail,
      phone: contactPhone,
      picture,
      avatar_url: picture,
      preferred_language:
        (contact && contact.preferred_language) || "en",
    },
    messages,
    metadata: meta,
    updated_at: c.updated_at ? String(c.updated_at) : lastMessageAt,
  };
}
