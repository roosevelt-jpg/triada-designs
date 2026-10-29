/**
 * Telegram Bot API text send — customer Support replies (not ops alerts).
 * POST https://api.telegram.org/bot{token}/sendMessage
 */

import {
  hasTelegramEnv,
  integrationRuntimeMode,
} from "@/lib/integrations/env-presence";
import { formatChatMessageBody } from "@/lib/crm/format-chat-message";

const TELEGRAM_API = (
  process.env.TELEGRAM_API_BASE || "https://api.telegram.org"
).replace(/\/$/, "");

/**
 * @returns {{ live: boolean, token: string }}
 */
function resolveSendGate() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const forceLocal =
    (process.env.INTEGRATION_MODE || "").trim().toLowerCase() === "local";
  const ready = hasTelegramEnv() && Boolean(token);
  const live =
    !forceLocal && ready && integrationRuntimeMode(ready) === "live";
  return { live, token };
}

/**
 * @param {{
 *   chat_id: string | number,
 *   body: string,
 * }} input
 */
export async function sendTelegramTextMessage(input) {
  const chatId = String(input.chat_id || "").trim();
  const body = formatChatMessageBody(input.body);

  if (!chatId) {
    return {
      ok: false,
      mode: "local_sim",
      channel: "telegram",
      provider_message_id: null,
      error: "chat_id_required",
      raw: {},
    };
  }
  if (!body) {
    return {
      ok: false,
      mode: "local_sim",
      channel: "telegram",
      provider_message_id: null,
      error: "body_required",
      raw: {},
    };
  }

  const payload = {
    chat_id: chatId,
    text: body.slice(0, 4096),
  };

  const { live, token } = resolveSendGate();
  if (!live) {
    return {
      ok: true,
      mode: "local_sim",
      channel: "telegram",
      provider_message_id: `local-tg-text-${Date.now().toString(36)}`,
      error: null,
      raw: { chat_id: chatId, simulated: true, ...payload },
    };
  }

  const response = await fetch(
    `${TELEGRAM_API}/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );

  const raw = await response.json().catch(() => ({}));
  if (!response.ok || raw?.ok === false) {
    return {
      ok: false,
      mode: "live",
      channel: "telegram",
      provider_message_id: null,
      error: raw?.description || `HTTP ${response.status}`,
      raw,
    };
  }

  return {
    ok: true,
    mode: "live",
    channel: "telegram",
    provider_message_id: raw?.result?.message_id
      ? String(raw.result.message_id)
      : null,
    error: null,
    raw,
  };
}
