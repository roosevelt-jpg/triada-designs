/**
 * Outbound delivery for jewellery-ops runners.
 * Attempts live WhatsApp / email / Telegram when credentials + opt-in allow;
 * otherwise returns honest local_sim (never invents success as live).
 */

import { sendWhatsAppTextMessage } from "@/lib/integrations/whatsapp-cloud-text";
import { sendWhatsAppTemplateMessage } from "@/lib/integrations/whatsapp-cloud-templates";
import { sendTelegramTextMessage } from "@/lib/integrations/telegram-bot-text";
import { sendResendEmail } from "@/lib/email/resend";
import {
  hasTelegramEnv,
  hasWhatsAppMessagingEnv,
  hasResendEnv,
  integrationRuntimeMode,
  envPresent,
} from "@/lib/integrations/env-presence";
import { BRAND } from "@/lib/brand/identity";

/**
 * @returns {{ whatsapp: string, email: string, telegram: string, telegram_alerts: string }}
 */
export function jewelleryDeliveryReadiness() {
  const forceLocal =
    (process.env.INTEGRATION_MODE || "").trim().toLowerCase() === "local";
  const waReady = hasWhatsAppMessagingEnv();
  const emailReady = hasResendEnv();
  const tgReady = hasTelegramEnv();
  const alertChat = envPresent("TELEGRAM_ALERT_CHAT_ID") || envPresent("TELEGRAM_OPS_CHAT_ID");

  return {
    whatsapp: forceLocal
      ? "local_sim"
      : waReady && integrationRuntimeMode(waReady) === "live"
        ? "live"
        : waReady
          ? "ready"
          : "awaiting_credentials",
    email: forceLocal
      ? "local_sim"
      : emailReady
        ? "live"
        : "awaiting_credentials",
    telegram: forceLocal
      ? "local_sim"
      : tgReady && integrationRuntimeMode(tgReady) === "live"
        ? "live"
        : tgReady
          ? "ready"
          : "awaiting_credentials",
    telegram_alerts: forceLocal
      ? "local_sim"
      : tgReady && alertChat && integrationRuntimeMode(tgReady) === "live"
        ? "live"
        : tgReady && alertChat
          ? "ready"
          : "awaiting_credentials",
  };
}

/**
 * @param {{
 *   channel?: string,
 *   whatsapp_opt_in?: boolean,
 *   to?: string,
 *   phone?: string,
 *   email?: string,
 *   chat_id?: string,
 *   body: string,
 *   subject?: string,
 *   template_name?: string,
 *   template_language?: string,
 * }} input
 */
export async function deliverJewelleryMessage(input) {
  const body = String(input.body || "").trim();
  const optIn = input.whatsapp_opt_in === true;
  let channel = String(input.channel || "").toLowerCase();

  if (channel === "whatsapp" && !optIn) {
    channel = input.email ? "email" : "email";
  }
  if (!channel) {
    channel = optIn ? "whatsapp" : input.email ? "email" : "email";
  }

  if (channel === "whatsapp") {
    const to = String(input.to || input.phone || "").trim();
    if (!to) {
      return {
        ok: false,
        channel: "whatsapp",
        mode: "local_sim",
        error: "recipient_required",
      };
    }
    if (input.template_name) {
      const sent = await sendWhatsAppTemplateMessage({
        to,
        template_name: String(input.template_name),
        language: String(input.template_language || "en"),
        components: [],
      });
      return {
        ok: sent.ok,
        channel: "whatsapp",
        mode: sent.mode,
        provider_message_id: sent.provider_message_id,
        error: sent.error || null,
        template_name: input.template_name,
      };
    }
    const sent = await sendWhatsAppTextMessage({ to, body });
    return {
      ok: sent.ok,
      channel: "whatsapp",
      mode: sent.mode,
      provider_message_id: sent.provider_message_id,
      error: sent.error || null,
    };
  }

  if (channel === "telegram") {
    const chatId = String(input.chat_id || input.to || "").trim();
    const sent = await sendTelegramTextMessage({ chat_id: chatId, body });
    return {
      ok: sent.ok,
      channel: "telegram",
      mode: sent.mode,
      provider_message_id: sent.provider_message_id,
      error: sent.error || null,
    };
  }

  // Default: email
  const toEmail = String(input.email || input.to || "").trim();
  if (!toEmail || !toEmail.includes("@")) {
    // No recipient — still complete the job with local_sim so cron drains.
    return {
      ok: true,
      channel: "email",
      mode: "local_sim",
      provider_message_id: `local-jop-mail-${Date.now().toString(36)}`,
      error: null,
      note: "no_email_recipient",
    };
  }

  const subject = String(input.subject || `${BRAND.name} — follow-up`).trim();
  const sent = await sendResendEmail({
    to: toEmail,
    subject,
    html: `<p>${body.replace(/\n/g, "<br/>")}</p>`,
    text: body,
  });
  const mode =
    sent.mode === "local_fallback" || sent.mode === "error"
      ? "local_sim"
      : sent.mode || "live";
  return {
    ok: sent.ok !== false,
    channel: "email",
    mode,
    provider_message_id: sent.id || null,
    error: sent.error || null,
  };
}

/**
 * Ops Telegram alert (priority inbox for staff).
 * @param {{ title: string, body?: string, alert_type?: string, chat_id?: string }} input
 */
export async function deliverTelegramOpsAlert(input) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(
    input.chat_id ||
      process.env.TELEGRAM_ALERT_CHAT_ID ||
      process.env.TELEGRAM_OPS_CHAT_ID ||
      "",
  ).trim();
  const title = String(input.title || "Triada alert").trim();
  const body = String(input.body || "").trim();
  const alertType = String(input.alert_type || "ops").trim();
  const text = `Triada alert [${alertType}]\n${title}\n${body}`.slice(0, 4096);

  const readiness = jewelleryDeliveryReadiness().telegram_alerts;
  if (readiness !== "live" && readiness !== "ready") {
    return {
      ok: true,
      mode: "local_sim",
      status: "local_sim",
      provider_message_id: `local-tg-alert-${Date.now().toString(36)}`,
      chat_configured: Boolean(chatId),
    };
  }

  if (readiness === "ready" || !token || !chatId) {
    // Credentials present but INTEGRATION_MODE not forcing live path via gate —
    // still try live when both token + chat exist and mode isn't local.
    const forceLocal =
      (process.env.INTEGRATION_MODE || "").trim().toLowerCase() === "local";
    if (forceLocal || !token || !chatId) {
      return {
        ok: true,
        mode: "local_sim",
        status: "local_sim",
        provider_message_id: `local-tg-alert-${Date.now().toString(36)}`,
        chat_configured: Boolean(chatId),
      };
    }
  }

  const apiBase = (
    process.env.TELEGRAM_API_BASE || "https://api.telegram.org"
  ).replace(/\/$/, "");
  const response = await fetch(`${apiBase}/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text }),
    cache: "no-store",
  });
  const raw = await response.json().catch(() => ({}));
  if (!response.ok || raw?.ok === false) {
    return {
      ok: false,
      mode: "live",
      status: "failed",
      provider_message_id: null,
      error: raw?.description || `HTTP ${response.status}`,
    };
  }
  return {
    ok: true,
    mode: "live",
    status: "sent",
    provider_message_id: String(raw?.result?.message_id || ""),
  };
}
