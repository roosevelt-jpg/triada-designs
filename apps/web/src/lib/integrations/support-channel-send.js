/**
 * Outbound send adapters for Support-owned non-Meta channels.
 * Live when credentials exist; otherwise local_sim (same gate pattern as WA/Graph).
 */

import {
  hasLinkedInEnv,
  hasResendEnv,
  hasTelegramEnv,
  hasTikTokEnv,
  integrationRuntimeMode,
} from "@/lib/integrations/env-presence";
import { sendTelegramTextMessage } from "@/lib/integrations/telegram-bot-text";
import { sendResendEmail } from "@/lib/email/resend";
import { wrapEmailMessage } from "@/lib/brand/wrap-email";
import { BRAND } from "@/lib/brand/identity";
import { formatChatMessageBody } from "@/lib/crm/format-chat-message";
import { SUPPORT_TEXT_CHANNELS } from "@/lib/crm/conversations-store";

/**
 * @param {string} channel
 * @param {boolean} ready
 */
function isLive(ready) {
  const forceLocal =
    (process.env.INTEGRATION_MODE || "").trim().toLowerCase() === "local";
  return !forceLocal && ready && integrationRuntimeMode(ready) === "live";
}

/**
 * Webchat "send" = deliver reply to the widget response (already in pipeline).
 * Always succeeds; mode local_sim marks widget delivery (no third-party API).
 * @param {{ body: string, visitor_id?: string }} input
 */
export async function sendWebchatTextMessage(input) {
  const body = formatChatMessageBody(input.body);
  if (!body) {
    return {
      ok: false,
      mode: "local_sim",
      channel: "webchat",
      provider_message_id: null,
      error: "body_required",
      raw: {},
    };
  }
  return {
    ok: true,
    mode: "local_sim",
    channel: "webchat",
    provider_message_id: `webchat-out-${Date.now().toString(36)}`,
    error: null,
    raw: {
      visitor_id: input.visitor_id || null,
      delivered_to_widget: true,
      body: body.slice(0, 4000),
    },
  };
}

/**
 * @param {{
 *   to: string,
 *   body: string,
 *   subject?: string,
 *   customer_name?: string,
 * }} input
 */
export async function sendEmailSupportReply(input) {
  const to = String(input.to || "").trim().toLowerCase();
  const body = formatChatMessageBody(input.body);
  const subject =
    String(input.subject || "").trim() ||
    `Re: your message to ${BRAND.name}`;

  if (!to) {
    return {
      ok: false,
      mode: "local_sim",
      channel: "email",
      provider_message_id: null,
      error: "to_required",
      raw: {},
    };
  }
  if (!body) {
    return {
      ok: false,
      mode: "local_sim",
      channel: "email",
      provider_message_id: null,
      error: "body_required",
      raw: {},
    };
  }

  const wrapped = wrapEmailMessage({
    subject,
    bodyText: body,
    customerName: input.customer_name,
  });

  const ready = hasResendEnv();
  if (!isLive(ready)) {
    return {
      ok: true,
      mode: "local_sim",
      channel: "email",
      provider_message_id: `local-email-${Date.now().toString(36)}`,
      error: null,
      raw: { to, subject, simulated: true },
    };
  }

  // Allow Resend local_fallback in non-prod even when INTEGRATION_MODE drifts.
  process.env.TRIADA_ALLOW_EMAIL_FALLBACK =
    process.env.TRIADA_ALLOW_EMAIL_FALLBACK || "1";

  const sent = await sendResendEmail({
    to,
    subject: wrapped.subject || subject,
    html: wrapped.html,
    text: wrapped.text || body,
    tags: [{ name: "channel", value: "support_inbound_reply" }],
  });

  return {
    ok: Boolean(sent.ok),
    mode: sent.mode === "local_fallback" ? "local_sim" : "live",
    channel: "email",
    provider_message_id: sent.id ? String(sent.id) : null,
    error: sent.error || null,
    raw: sent,
  };
}

/**
 * LinkedIn Messaging — live when token present; otherwise local_sim.
 * Uses LinkedIn REST messaging when LINKEDIN_ACCESS_TOKEN is set.
 * @param {{
 *   recipient_id: string,
 *   body: string,
 * }} input
 */
export async function sendLinkedInTextMessage(input) {
  const recipientId = String(input.recipient_id || "").trim();
  const body = String(input.body || "").trim();

  if (!recipientId) {
    return {
      ok: false,
      mode: "local_sim",
      channel: "linkedin",
      provider_message_id: null,
      error: "recipient_required",
      raw: {},
    };
  }
  if (!body) {
    return {
      ok: false,
      mode: "local_sim",
      channel: "linkedin",
      provider_message_id: null,
      error: "body_required",
      raw: {},
    };
  }

  const token = String(
    process.env.LINKEDIN_ACCESS_TOKEN || process.env.LINKEDIN_API_KEY || "",
  ).trim();
  const ready = hasLinkedInEnv() && Boolean(token);

  if (!isLive(ready)) {
    return {
      ok: true,
      mode: "local_sim",
      channel: "linkedin",
      provider_message_id: `local-li-text-${Date.now().toString(36)}`,
      error: null,
      raw: { recipient_id: recipientId, simulated: true, body: body.slice(0, 500) },
    };
  }

  // LinkedIn Marketing / Messaging API shape (versioned REST).
  const version =
    process.env.LINKEDIN_API_VERSION ||
    process.env.LINKEDIN_REST_VERSION ||
    "202410";
  const response = await fetch("https://api.linkedin.com/rest/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": version,
      "X-Restli-Protocol-Version": "2.0.0",
      Accept: "application/json",
    },
    body: JSON.stringify({
      recipients: [`urn:li:person:${recipientId.replace(/^urn:li:person:/, "")}`],
      subject: BRAND.name,
      body: body.slice(0, 3000),
      messageType: "MEMBER_TO_MEMBER",
    }),
    cache: "no-store",
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      mode: "live",
      channel: "linkedin",
      provider_message_id: null,
      error:
        raw?.message ||
        raw?.error_description ||
        raw?.status ||
        `HTTP ${response.status}`,
      raw,
    };
  }

  return {
    ok: true,
    mode: "live",
    channel: "linkedin",
    provider_message_id: raw?.id ? String(raw.id) : `li-${Date.now().toString(36)}`,
    error: null,
    raw,
  };
}

/**
 * TikTok inbound DM reply — local_sim until Business Messaging credentials land.
 * @param {{
 *   recipient_id: string,
 *   body: string,
 * }} input
 */
export async function sendTikTokTextMessage(input) {
  const recipientId = String(input.recipient_id || "").trim();
  const body = String(input.body || "").trim();

  if (!recipientId) {
    return {
      ok: false,
      mode: "local_sim",
      channel: "tiktok",
      provider_message_id: null,
      error: "recipient_required",
      raw: {},
    };
  }
  if (!body) {
    return {
      ok: false,
      mode: "local_sim",
      channel: "tiktok",
      provider_message_id: null,
      error: "body_required",
      raw: {},
    };
  }

  const token = String(
    process.env.TIKTOK_ACCESS_TOKEN || process.env.TIKTOK_API_KEY || "",
  ).trim();
  const ready = hasTikTokEnv() && Boolean(token);

  // Live when TIKTOK_ACCESS_TOKEN (or TIKTOK_API_KEY) is present — same gate as LinkedIn.
  // Partner-gated Business Messaging may still reject at the API; do not fall back to local_sim.
  if (!isLive(ready)) {
    return {
      ok: true,
      mode: "local_sim",
      channel: "tiktok",
      provider_message_id: `local-tt-text-${Date.now().toString(36)}`,
      error: null,
      raw: { recipient_id: recipientId, simulated: true, body: body.slice(0, 500) },
    };
  }

  const openId = String(
    process.env.TIKTOK_OPEN_ID ||
      process.env.TIKTOK_BUSINESS_ID ||
      process.env.TIKTOK_BUSINESS_ACCOUNT_ID ||
      "",
  ).trim();
  const response = await fetch(
    "https://business-api.tiktok.com/open_api/v1.3/business/message/send/",
    {
      method: "POST",
      headers: {
        "Access-Token": token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        ...(openId ? { business_id: openId } : {}),
        recipient_id: recipientId,
        receiver_id: recipientId,
        message_type: "TEXT",
        text: { body: body.slice(0, 2000) },
      }),
      cache: "no-store",
    },
  );

  const raw = await response.json().catch(() => ({}));
  const code = Number(raw?.code);
  if (!response.ok || (Number.isFinite(code) && code !== 0)) {
    return {
      ok: false,
      mode: "live",
      channel: "tiktok",
      provider_message_id: null,
      error: raw?.message || raw?.error?.message || `HTTP ${response.status}`,
      raw,
    };
  }

  return {
    ok: true,
    mode: "live",
    channel: "tiktok",
    provider_message_id: raw?.data?.message_id
      ? String(raw.data.message_id)
      : `tt-${Date.now().toString(36)}`,
    error: null,
    raw,
  };
}

/**
 * Dispatch Support outbound by channel.
 * @param {{
 *   channel: string,
 *   body: string,
 *   external_user_id?: string,
 *   subject?: string,
 *   customer_name?: string,
 *   metadata?: Record<string, unknown>,
 * }} input
 */
export async function sendSupportChannelText(input) {
  const channel = String(input.channel || "").toLowerCase();
  const body = formatChatMessageBody(input.body);
  const externalUserId = String(input.external_user_id || "").trim();

  if (!SUPPORT_TEXT_CHANNELS.includes(channel)) {
    return {
      ok: false,
      mode: "local_sim",
      channel,
      provider_message_id: null,
      error: "unsupported_channel",
      raw: {},
    };
  }

  switch (channel) {
    case "telegram":
      return sendTelegramTextMessage({
        chat_id:
          String(input.metadata?.chat_id || "").trim() || externalUserId,
        body,
      });
    case "email":
      return sendEmailSupportReply({
        to:
          String(input.metadata?.email || "").trim() ||
          externalUserId,
        body,
        subject: input.subject,
        customer_name: input.customer_name,
      });
    case "webchat":
      return sendWebchatTextMessage({
        body,
        visitor_id: externalUserId,
      });
    case "linkedin":
      return sendLinkedInTextMessage({
        recipient_id: externalUserId,
        body,
      });
    case "tiktok":
      return sendTikTokTextMessage({
        recipient_id: externalUserId,
        body,
      });
    default:
      return {
        ok: false,
        mode: "local_sim",
        channel,
        provider_message_id: null,
        error: "unsupported_channel",
        raw: {},
      };
  }
}

export { hasTelegramEnv, hasLinkedInEnv, hasTikTokEnv };
