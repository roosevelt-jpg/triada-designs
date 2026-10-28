/**
 * Resend outbound mail for Triada ops (invites, etc.).
 * Production: requires RESEND_API_KEY — no mock-only path when keyed.
 * Local/dev: graceful log fallback when key is missing.
 */

import { hasResendEnv } from "@/lib/integrations/env-presence";
import { BRAND } from "@/lib/brand/identity";

const RESEND_API = "https://api.resend.com/emails";

/**
 * @returns {{ configured: boolean, from: string, domain: string }}
 */
export function resendConfig() {
  const domain = String(
    process.env.RESEND_EMAIL_DOMAIN ||
      process.env.EMAIL_FROM_DOMAIN ||
      "triada-designs.com",
  )
    .trim()
    .replace(/^@/, "");
  const fromName = process.env.RESEND_FROM_NAME || BRAND.name;
  const fromAddress =
    process.env.RESEND_FROM_EMAIL ||
    process.env.MAIL_FROM_ADDRESS ||
    `ops@${domain}`;
  return {
    configured: hasResendEnv(),
    from: `${fromName} <${fromAddress}>`,
    domain,
  };
}

/**
 * @param {{
 *   to: string | string[],
 *   subject: string,
 *   html: string,
 *   text?: string,
 *   replyTo?: string,
 *   tags?: Array<{ name: string, value: string }>,
 * }} opts
 */
export async function sendResendEmail(opts) {
  const toList = Array.isArray(opts.to) ? opts.to : [opts.to];
  const recipients = toList
    .map((e) => String(e || "").trim().toLowerCase())
    .filter(Boolean);
  if (!recipients.length) {
    return { ok: false, mode: "error", error: "missing_recipient" };
  }

  const cfg = resendConfig();
  const apiKey = String(
    process.env.RESEND_API_KEY || process.env.EMAIL_CHANNEL_API_KEY || "",
  ).trim();

  if (!apiKey) {
    const allowFallback =
      process.env.NODE_ENV !== "production" ||
      process.env.TRIADA_ALLOW_EMAIL_FALLBACK === "1";
    if (!allowFallback) {
      return {
        ok: false,
        mode: "error",
        error: "resend_not_configured",
        message:
          "RESEND_API_KEY is required to send invitation emails in production.",
      };
    }
    console.info("[triada-email] Resend unset — local fallback (not sent)", {
      to: recipients,
      subject: opts.subject,
    });
    return {
      ok: true,
      mode: "local_fallback",
      id: `local-mail-${Date.now()}`,
      to: recipients,
      subject: opts.subject,
    };
  }

  try {
    const response = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: cfg.from,
        to: recipients,
        subject: opts.subject,
        html: opts.html,
        text: opts.text || undefined,
        reply_to: opts.replyTo || BRAND.opsEmail,
        tags: opts.tags || undefined,
      }),
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { message: text };
    }

    if (!response.ok) {
      return {
        ok: false,
        mode: "resend",
        error: data?.message || `resend_http_${response.status}`,
        status: response.status,
      };
    }

    return {
      ok: true,
      mode: "resend",
      id: data?.id || null,
      to: recipients,
      subject: opts.subject,
    };
  } catch (err) {
    return {
      ok: false,
      mode: "resend",
      error: err instanceof Error ? err.message : "resend_network_error",
    };
  }
}
