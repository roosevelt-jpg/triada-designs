/**
 * Meta Page Messaging text send — Facebook Messenger + Instagram Messaging.
 * Messenger: POST /me/messages (RESPONSE)
 * Instagram: POST /{ig-user-id}/messages
 */

import { integrationRuntimeMode } from "@/lib/integrations/env-presence";
import { resolvePageMessagingCredentials } from "@/lib/integrations/meta-credentials";
import { formatChatMessageBody } from "@/lib/crm/format-chat-message";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH_BASE = (
  process.env.META_GRAPH_BASE || "https://graph.facebook.com"
).replace(/\/$/, "");

function graphUrl(resourcePath) {
  return `${GRAPH_BASE}/${GRAPH_VERSION}/${String(resourcePath).replace(/^\//, "")}`;
}

/**
 * @returns {Promise<{ live: boolean, creds: Awaited<ReturnType<typeof resolvePageMessagingCredentials>> }>}
 */
async function resolveSendGate(channel) {
  const creds = await resolvePageMessagingCredentials();
  const forceLocal =
    (process.env.INTEGRATION_MODE || "").trim().toLowerCase() === "local";
  const ready =
    channel === "instagram" ? creds.instagramSendReady : creds.messengerSendReady;
  const live =
    !forceLocal && ready && integrationRuntimeMode(ready) === "live";
  return { live, creds };
}

/**
 * Send a Messenger / Facebook Page text reply.
 * @param {{
 *   recipient_id: string,
 *   body: string,
 *   page_id?: string,
 * }} input
 */
export async function sendMessengerTextMessage(input) {
  const recipientId = String(input.recipient_id || "").trim();
  const body = formatChatMessageBody(input.body);

  if (!recipientId) {
    return {
      ok: false,
      mode: "local_sim",
      channel: "messenger",
      provider_message_id: null,
      error: "recipient_required",
      raw: {},
    };
  }
  if (!body) {
    return {
      ok: false,
      mode: "local_sim",
      channel: "messenger",
      provider_message_id: null,
      error: "body_required",
      raw: {},
    };
  }

  const payload = {
    recipient: { id: recipientId },
    messaging_type: "RESPONSE",
    message: { text: body.slice(0, 2000) },
  };

  const { live, creds } = await resolveSendGate("messenger");
  if (!live) {
    return {
      ok: true,
      mode: "local_sim",
      channel: "messenger",
      provider_message_id: `local-fb-text-${Date.now().toString(36)}`,
      error: null,
      raw: { recipient_id: recipientId, simulated: true, ...payload },
    };
  }

  const response = await fetch(graphUrl("me/messages"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.pageAccessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      mode: "live",
      channel: "messenger",
      provider_message_id: null,
      error: raw?.error?.message || `HTTP ${response.status}`,
      raw: { error: raw?.error || undefined },
    };
  }

  return {
    ok: true,
    mode: "live",
    channel: "messenger",
    provider_message_id: raw?.message_id ? String(raw.message_id) : null,
    error: null,
    raw,
  };
}

/**
 * Send an Instagram Messaging text reply.
 * @param {{
 *   recipient_id: string,
 *   body: string,
 *   ig_user_id?: string,
 * }} input
 */
export async function sendInstagramTextMessage(input) {
  const recipientId = String(input.recipient_id || "").trim();
  const body = formatChatMessageBody(input.body);
  const { live, creds } = await resolveSendGate("instagram");
  const igUserId = String(
    input.ig_user_id || creds.igUserId || "",
  ).trim();

  if (!recipientId) {
    return {
      ok: false,
      mode: "local_sim",
      channel: "instagram",
      provider_message_id: null,
      error: "recipient_required",
      raw: {},
    };
  }
  if (!body) {
    return {
      ok: false,
      mode: "local_sim",
      channel: "instagram",
      provider_message_id: null,
      error: "body_required",
      raw: {},
    };
  }

  const payload = {
    recipient: { id: recipientId },
    message: { text: body.slice(0, 1000) },
  };

  if (!live) {
    return {
      ok: true,
      mode: "local_sim",
      channel: "instagram",
      provider_message_id: `local-ig-text-${Date.now().toString(36)}`,
      error: null,
      raw: {
        recipient_id: recipientId,
        ig_user_id: igUserId || null,
        simulated: true,
        ...payload,
      },
    };
  }

  if (!igUserId) {
    return {
      ok: false,
      mode: "live",
      channel: "instagram",
      provider_message_id: null,
      error: "ig_user_id_required",
      raw: {},
    };
  }

  const response = await fetch(graphUrl(`${igUserId}/messages`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.pageAccessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      mode: "live",
      channel: "instagram",
      provider_message_id: null,
      error: raw?.error?.message || `HTTP ${response.status}`,
      raw: { error: raw?.error || undefined },
    };
  }

  return {
    ok: true,
    mode: "live",
    channel: "instagram",
    provider_message_id: raw?.message_id ? String(raw.message_id) : null,
    error: null,
    raw,
  };
}

/**
 * Route a page-messaging text send by channel.
 * @param {{
 *   channel: string,
 *   recipient_id: string,
 *   body: string,
 *   page_or_account_id?: string,
 * }} input
 */
export async function sendPageMessagingText(input) {
  const channel = String(input.channel || "messenger").toLowerCase();
  const body = formatChatMessageBody(input.body);
  if (channel === "instagram") {
    return sendInstagramTextMessage({
      recipient_id: input.recipient_id,
      body,
      ig_user_id: input.page_or_account_id,
    });
  }
  // facebook + messenger share Page Send API
  return sendMessengerTextMessage({
    recipient_id: input.recipient_id,
    body,
    page_id: input.page_or_account_id,
  });
}
