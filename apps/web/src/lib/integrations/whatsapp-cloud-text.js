/**
 * WhatsApp Cloud API session text send (24h customer care window).
 * POST /{phone-number-id}/messages with type: text
 */

import { integrationRuntimeMode } from "@/lib/integrations/env-presence";
import { resolveWhatsAppCloudCredentials } from "@/lib/integrations/meta-credentials";
import { formatChatMessageBody } from "@/lib/crm/format-chat-message";
import { toWhatsAppRecipient } from "@/lib/crm/phone-e164";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH_BASE = (
  process.env.META_GRAPH_BASE || "https://graph.facebook.com"
).replace(/\/$/, "");

function graphUrl(resourcePath) {
  return `${GRAPH_BASE}/${GRAPH_VERSION}/${String(resourcePath).replace(/^\//, "")}`;
}

/**
 * @returns {Promise<{ live: boolean, creds: Awaited<ReturnType<typeof resolveWhatsAppCloudCredentials>> }>}
 */
async function resolveSendGate() {
  const creds = await resolveWhatsAppCloudCredentials();
  const forceLocal =
    (process.env.INTEGRATION_MODE || "").trim().toLowerCase() === "local";
  const live =
    !forceLocal &&
    creds.sendReady &&
    integrationRuntimeMode(creds.sendReady) === "live";
  return { live, creds };
}

/**
 * Send an in-session WhatsApp text message.
 * @param {{
 *   to: string,
 *   body: string,
 *   preview_url?: boolean,
 * }} input
 */
export async function sendWhatsAppTextMessage(input) {
  const rawTo = String(input.to || "").trim();
  const to = toWhatsAppRecipient(rawTo) || rawTo.replace(/\D+/g, "");
  const body = formatChatMessageBody(input.body);

  if (!to) {
    return {
      ok: false,
      mode: "local_sim",
      provider_message_id: null,
      error: "to_required",
      raw: {},
    };
  }
  if (!body) {
    return {
      ok: false,
      mode: "local_sim",
      provider_message_id: null,
      error: "body_required",
      raw: {},
    };
  }

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: {
      preview_url: input.preview_url === true,
      body: body.slice(0, 4096),
    },
  };

  const { live, creds } = await resolveSendGate();
  if (!live) {
    return {
      ok: true,
      mode: "local_sim",
      provider_message_id: `local-wa-text-${Date.now().toString(36)}`,
      error: null,
      raw: { to, simulated: true, ...payload },
    };
  }

  const response = await fetch(graphUrl(`${creds.phoneNumberId}/messages`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
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
      provider_message_id: null,
      error: raw?.error?.message || `HTTP ${response.status}`,
      raw: { error: raw?.error || undefined },
    };
  }

  const messages = Array.isArray(raw?.messages) ? raw.messages : [];
  return {
    ok: true,
    mode: "live",
    provider_message_id: messages[0]?.id ? String(messages[0].id) : null,
    error: null,
    raw: { messages },
  };
}
