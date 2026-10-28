/**
 * Presence-only credential checks for Next dual-run.
 * Never returns or logs secret values — only boolean presence.
 */

import {
  hasSupabaseAdminCredentials,
  hasSupabaseAnonCredentials,
} from "@/lib/supabase/config";

/** @param {string} name */
export function envPresent(name) {
  const v = process.env[name];
  return Boolean(v && String(v).trim());
}

/** True when any of the named env vars is non-empty. */
export function envPresentAny(...names) {
  return names.some((name) => envPresent(name));
}

export function hasAnthropicEnv() {
  return envPresent("ANTHROPIC_API_KEY");
}

export function hasGeminiEnv() {
  return envPresentAny("GEMINI_API_KEY", "GOOGLE_GEMINI_API_KEY");
}

export function hasResendEnv() {
  return envPresentAny("RESEND_API_KEY", "EMAIL_CHANNEL_API_KEY");
}

/** Page / Messenger Graph token (primary + upload aliases). */
export function hasMetaPageToken() {
  return envPresentAny(
    "META_PAGE_ACCESS_TOKEN",
    "META_APP_ACCESS_TOKEN",
    "META_CLIENT_TOKEN",
  );
}

export function hasMetaAppId() {
  return envPresentAny("META_APP_ID", "FACEBOOK_APP_ID");
}

/** WhatsApp Cloud access token (META_WA_* + WHATSAPP_* mirrors). */
export function hasWhatsAppToken() {
  return envPresentAny("META_WA_ACCESS_TOKEN", "WHATSAPP_ACCESS_TOKEN");
}

export function hasWhatsAppPhoneId() {
  return envPresentAny("META_WA_PHONE_NUMBER_ID", "WHATSAPP_PHONE_NUMBER_ID");
}

export function hasWhatsAppBusinessId() {
  return envPresentAny(
    "META_WA_BUSINESS_ACCOUNT_ID",
    "WHATSAPP_BUSINESS_ACCOUNT_ID",
  );
}

/**
 * Facebook Messenger / Instagram Messaging: require App ID + Page token
 * (aliases honored). Matches Meta Graph setup; App ID alone is not Connected.
 */
export function hasMetaPageMessagingEnv() {
  return hasMetaAppId() && hasMetaPageToken();
}

/** @deprecated Prefer hasMetaPageMessagingEnv — kept for call sites. */
export function hasMetaMessagingEnv() {
  return hasMetaPageMessagingEnv();
}

/** WhatsApp Cloud ready when a WA access token alias is present. */
export function hasWhatsAppMessagingEnv() {
  return hasWhatsAppToken();
}

export function hasMetaAnyEnv() {
  return hasMetaPageMessagingEnv() || hasWhatsAppMessagingEnv();
}

export function hasTelegramEnv() {
  return envPresent("TELEGRAM_BOT_TOKEN");
}

export function hasShopifyEnv() {
  return envPresentAny("SHOPIFY_ACCESS_TOKEN", "SHOPIFY_ADMIN_ACCESS_TOKEN");
}

export function hasZohoEnv() {
  return (
    envPresent("ZOHO_CLIENT_ID") &&
    envPresent("ZOHO_CLIENT_SECRET") &&
    envPresent("ZOHO_REFRESH_TOKEN")
  );
}

export function hasZohoBooksOrg() {
  return envPresent("ZOHO_ORGANIZATION_ID");
}

export function hasSupabaseEnv() {
  return hasSupabaseAnonCredentials() || hasSupabaseAdminCredentials();
}

/** Google Places / Maps (popup location Autocomplete + map pin). */
export function hasGooglePlacesEnv() {
  return envPresentAny(
    "GOOGLE_PLACES_API_KEY",
    "GOOGLE_MAPS_API_KEY",
    "NEXT_PUBLIC_GOOGLE_PLACES_API_KEY",
    "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
  );
}

/**
 * Runtime mode for dual-run health.
 * Honors INTEGRATION_MODE=live; otherwise treats credentialed hosts as live.
 */
export function integrationRuntimeMode(hasLiveCredentials) {
  const explicit = (process.env.INTEGRATION_MODE || "").trim().toLowerCase();
  if (explicit === "live") return "live";
  if (explicit === "local") return hasLiveCredentials ? "live" : "local";
  return hasLiveCredentials ? "live" : "local";
}

/**
 * Presence-only matrix for Anthropic / Gemini / Meta / Resend / Supabase / Places.
 * Values are booleans only — never secret material.
 */
export function credentialsPresenceMatrix(extra = {}) {
  const anthropic = Boolean(extra.anthropic) || hasAnthropicEnv();
  const gemini = hasGeminiEnv();
  const meta = hasMetaAnyEnv();
  const resend = hasResendEnv();
  const supabase = hasSupabaseEnv();
  const googlePlaces = Boolean(extra.googlePlaces) || hasGooglePlacesEnv();
  return {
    anthropic: { present: anthropic },
    gemini: { present: gemini },
    meta: {
      present: meta,
      page_token: hasMetaPageToken(),
      app_id: hasMetaAppId(),
      whatsapp_token: hasWhatsAppToken(),
      whatsapp_phone_id: hasWhatsAppPhoneId(),
    },
    resend: { present: resend },
    supabase: {
      present: supabase,
      anon: hasSupabaseAnonCredentials(),
      admin: hasSupabaseAdminCredentials(),
    },
    google_places: { present: googlePlaces },
  };
}
