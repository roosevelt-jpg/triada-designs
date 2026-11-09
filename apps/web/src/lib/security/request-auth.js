/**
 * Shared auth gates for cron, webhooks, and public widgets.
 * Secrets must be configured — never treat "unset" as open access.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * @param {string} a
 * @param {string} b
 */
export function timingSafeStringEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Require CRON_SECRET and a matching Bearer / x-cron-secret header.
 * @param {Request} request
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export function requireCronSecret(request) {
  const expected = (process.env.CRON_SECRET || "").trim();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: "CRON_SECRET is not configured.",
    };
  }
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const alt = (request.headers.get("x-cron-secret") || "").trim();
  const provided = bearer || alt;
  if (!provided || !timingSafeStringEqual(provided, expected)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
}

/**
 * Require a configured shared webhook secret header.
 * @param {Request} request
 * @param {{
 *   envKeys: string[],
 *   headerKeys?: string[],
 *   label?: string,
 * }} opts
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export function requireWebhookSecret(request, opts) {
  let expected = "";
  for (const key of opts.envKeys || []) {
    const value = String(process.env[key] || "").trim();
    if (value) {
      expected = value;
      break;
    }
  }
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: `${opts.label || "Webhook"} secret is not configured.`,
    };
  }

  const headers = opts.headerKeys || [
    "x-channel-webhook-secret",
    "x-webhook-secret",
  ];
  let provided = "";
  for (const header of headers) {
    const value = String(request.headers.get(header) || "").trim();
    if (value) {
      provided = value;
      break;
    }
  }
  if (!provided || !timingSafeStringEqual(provided, expected)) {
    return {
      ok: false,
      status: 401,
      error: `Invalid ${opts.label || "webhook"} secret.`,
    };
  }
  return { ok: true };
}

/**
 * Require WEBCHAT_WIDGET_TOKEN (or VISITOR_CAPTURE_TOKEN) match.
 * @param {string} token
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export function requireWidgetToken(token) {
  const expected = String(
    process.env.WEBCHAT_WIDGET_TOKEN ||
      process.env.VISITOR_CAPTURE_TOKEN ||
      "",
  ).trim();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: "Widget token is not configured.",
    };
  }
  const provided = String(token || "").trim();
  if (!provided || !timingSafeStringEqual(provided, expected)) {
    return { ok: false, status: 401, error: "Invalid widget token." };
  }
  return { ok: true };
}

/**
 * Verify Meta X-Hub-Signature-256 against META_APP_SECRET.
 * @param {string} rawBody
 * @param {string | null | undefined} signatureHeader
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export function requireMetaHubSignature(rawBody, signatureHeader) {
  const appSecret = String(
    process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || "",
  ).trim();
  if (!appSecret) {
    return {
      ok: false,
      status: 503,
      error: "META_APP_SECRET is not configured.",
    };
  }
  const header = String(signatureHeader || "").trim();
  const match = /^sha256=(.+)$/i.exec(header);
  if (!match) {
    return {
      ok: false,
      status: 401,
      error: "Missing Meta signature.",
    };
  }
  const expected = createHmac("sha256", appSecret)
    .update(rawBody || "", "utf8")
    .digest("hex");
  if (!timingSafeStringEqual(match[1], expected)) {
    return {
      ok: false,
      status: 401,
      error: "Invalid Meta signature.",
    };
  }
  return { ok: true };
}
