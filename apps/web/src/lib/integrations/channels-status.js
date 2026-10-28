/**
 * Sales-channels status payload for /integrations/channels.
 * Shape matches Laravel ChannelControlPlane::status (channels map + widget).
 * Presence-only — never returns secret values.
 */

import { connectionLabel } from "@/lib/integrations/brand-labels";
import {
  hasMetaPageMessagingEnv,
  hasResendEnv,
  hasShopifyEnv,
  hasTelegramEnv,
  hasWhatsAppMessagingEnv,
  integrationRuntimeMode,
} from "@/lib/integrations/env-presence";

/** Jewellery multi-channel list shown on /integrations/channels. */
export const SALES_CHANNEL_KEYS = [
  "webchat",
  "facebook",
  "instagram",
  "whatsapp",
  "shopify",
  "tiktok",
  "linkedin",
  "email",
  "telegram",
];

/** @param {string} channel */
function label(channel) {
  switch (channel) {
    case "webchat":
      return "Website Live Chat";
    case "facebook":
      return "Facebook";
    case "instagram":
      return "Instagram";
    case "whatsapp":
      return "WhatsApp";
    case "shopify":
      return "Shopify";
    case "tiktok":
      return "TikTok";
    case "linkedin":
      return "LinkedIn";
    case "email":
      return "Email";
    case "telegram":
      return "Telegram";
    default:
      return channel.charAt(0).toUpperCase() + channel.slice(1);
  }
}

/** @param {string} channel */
function hubPath(channel) {
  if (channel === "facebook" || channel === "instagram" || channel === "whatsapp") {
    return "/integrations/meta";
  }
  if (channel === "shopify") return "/integrations/shopify";
  return "/integrations/channels";
}

/**
 * @param {string} channel
 * @returns {string[]}
 */
function capabilities(channel) {
  switch (channel) {
    case "whatsapp":
      return ["messages.send", "messages.receive", "templates", "webhooks"];
    case "facebook":
      return ["messages.send", "messages.receive", "webhooks", "pages", "templates"];
    case "instagram":
      return ["messages.send", "messages.receive", "webhooks", "comments", "templates"];
    case "shopify":
      return ["products.read", "orders.read", "orders.notify", "templates"];
    case "email":
      return ["messages.send", "messages.receive", "templates"];
    case "telegram":
      return ["messages.send", "messages.receive", "webhooks", "templates"];
    case "webchat":
      return ["messages.send", "messages.receive", "widget"];
    case "tiktok":
      return ["posts.publish", "templates", "webhooks"];
    case "linkedin":
      return ["posts.publish", "templates", "messaging"];
    default:
      return ["messages.send", "messages.receive"];
  }
}

/**
 * TikTok / LinkedIn optional host env aliases (presence only).
 * @param {"tiktok"|"linkedin"} channel
 */
function hasOptionalSocialEnv(channel) {
  if (channel === "tiktok") {
    return Boolean(
      (process.env.TIKTOK_ACCESS_TOKEN || "").trim() ||
        (process.env.TIKTOK_API_KEY || "").trim(),
    );
  }
  if (channel === "linkedin") {
    return Boolean(
      (process.env.LINKEDIN_ACCESS_TOKEN || "").trim() ||
        (process.env.LINKEDIN_API_KEY || "").trim(),
    );
  }
  return false;
}

/**
 * @param {{
 *   meta?: {
 *     facebook_ready?: boolean,
 *     messenger_ready?: boolean,
 *     instagram_ready?: boolean,
 *     whatsapp_ready?: boolean,
 *     connected?: boolean,
 *     source?: string,
 *   },
 *   webchat_widget?: {
 *     id?: string,
 *     name?: string,
 *     public_token?: string,
 *     rate_limit_per_minute?: number,
 *     embed_path?: string,
 *   } | null,
 * }} [opts]
 */
export function buildSalesChannelsStatus(opts = {}) {
  const meta = opts.meta && typeof opts.meta === "object" ? opts.meta : {};
  const facebookReady =
    meta.facebook_ready !== undefined
      ? Boolean(meta.facebook_ready)
      : hasMetaPageMessagingEnv();
  const instagramReady =
    meta.instagram_ready !== undefined
      ? Boolean(meta.instagram_ready)
      : facebookReady || hasMetaPageMessagingEnv();
  const whatsappReady =
    meta.whatsapp_ready !== undefined
      ? Boolean(meta.whatsapp_ready)
      : hasWhatsAppMessagingEnv();
  const shopifyReady = hasShopifyEnv();
  const emailReady = hasResendEnv();
  const telegramReady = hasTelegramEnv();
  const tiktokReady = hasOptionalSocialEnv("tiktok");
  const linkedinReady = hasOptionalSocialEnv("linkedin");

  /** @type {Record<string, boolean>} */
  const readyByKey = {
    webchat: true,
    facebook: facebookReady,
    instagram: instagramReady,
    whatsapp: whatsappReady,
    shopify: shopifyReady,
    tiktok: tiktokReady,
    linkedin: linkedinReady,
    email: emailReady,
    telegram: telegramReady,
  };

  /** @type {Record<string, Record<string, unknown>>} */
  const channels = {};
  for (const key of SALES_CHANNEL_KEYS) {
    const hasCredentials = Boolean(readyByKey[key]);
    let status;
    if (key === "webchat") {
      // Website chat always works on a seed/widget token path.
      status = "local";
    } else if (hasCredentials) {
      status = "connected";
    } else {
      status = "awaiting_credentials";
    }
    const mode = integrationRuntimeMode(hasCredentials && key !== "webchat");
    channels[key] = {
      provider: key,
      display_name: label(key),
      status,
      status_label: connectionLabel(status, { hasCredentials: status === "connected" }),
      mode: key === "webchat" ? "local" : mode,
      has_credentials: hasCredentials,
      webhook_path:
        key === "facebook" || key === "instagram" || key === "whatsapp"
          ? "/api/webhooks/meta"
          : `/api/webhooks/${key}`,
      capabilities: capabilities(key),
      hub: hubPath(key),
    };
  }

  const credentialedMeta = facebookReady || instagramReady || whatsappReady;
  const summary = credentialedMeta
    ? "Meta messaging channels are Connected. Other channels show Connected or Waiting credentials."
    : "Each channel shows Connected or Waiting credentials.";

  return {
    summary,
    honesty: summary,
    channels,
    webchat_widget: opts.webchat_widget || null,
    meta_source: meta.source || (credentialedMeta ? "env" : "none"),
  };
}
