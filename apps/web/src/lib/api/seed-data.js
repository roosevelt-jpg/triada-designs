/**
 * Production-shaped seeded catalog + ops payloads for Next dual-run
 * when Laravel API_ORIGIN is down. Prefer live/seeded language — never "demo".
 */

import {
  credentialsPresenceMatrix,
  envPresent,
  hasGeminiEnv,
  hasGooglePlacesEnv,
  hasMetaPageMessagingEnv,
  hasResendEnv,
  hasShopifyEnv,
  hasSupabaseEnv,
  hasTelegramEnv,
  hasWhatsAppMessagingEnv,
  hasWordpressEnv,
  hasZohoBooksOrg,
  hasZohoEnv,
  integrationRuntimeMode,
} from "@/lib/integrations/env-presence";
import {
  connectionLabel,
  modelNickname,
  providerNickname,
} from "@/lib/integrations/brand-labels";
import { metaChannelHealth } from "@/lib/integrations/meta-credentials";
import { googlePlacesStatus } from "@/lib/integrations/google-places";
import { TEAM_ROSTER } from "@/lib/agents/team-roster";

export { envPresent } from "@/lib/integrations/env-presence";

export const WORKSPACE = {
  id: "triada-ops",
  name: "Triada Designs",
  slug: "triada-designs",
  timezone: "Asia/Dubai",
};

const nowIso = () => new Date().toISOString();

/** @param {string} id */
function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

export const PRODUCTS = [
  {
    id: "prod-priest",
    workspace_id: WORKSPACE.id,
    sku: "TD-RING-PRIEST-01",
    title: "The Priest Ring",
    description:
      "Sculptural Salt & Spirit ring. Silver with gold plating; 14K/18K on request. ~7 days to make.",
    product_url: "https://jwtjzw-nu.myshopify.com/products/the-priest-ring",
    price: 1450,
    currency: "AED",
    availability_status: "in_stock_snapshot",
    published_status: "published",
    approved_claims: ["silver with gold plating", "made to order ~7 days", "Salt & Spirit"],
    metadata: {
      photo_url: "/brand/jewellery/priest-ring.jpg",
      model_url: "/brand/models/priest-ring-v2.glb",
      category: "ring",
      collection: "Salt & Spirit",
      handle: "the-priest-ring",
      bestseller_rank: 1,
      sales_count: 84,
    },
  },
  {
    id: "prod-imago",
    workspace_id: WORKSPACE.id,
    sku: "TD-RING-IMAGO-02",
    title: "Imago Dei Ring",
    description: "Statement ring from the Salt & Spirit collection. Confirm size against published guide.",
    product_url: "https://jwtjzw-nu.myshopify.com/products/imago-dei-ring",
    price: 1680,
    currency: "AED",
    availability_status: "in_stock_snapshot",
    published_status: "published",
    approved_claims: ["silver with gold plating", "made to order ~7 days"],
    metadata: {
      photo_url: "/brand/jewellery/imago-dei-ring.jpg",
      model_url: "/brand/models/imago-dei-ring-v1.glb",
      category: "ring",
      collection: "Salt & Spirit",
      handle: "imago-dei-ring",
      bestseller_rank: 2,
      sales_count: 71,
    },
  },
  {
    id: "prod-waves",
    workspace_id: WORKSPACE.id,
    sku: "TD-RING-WAVES-03",
    title: "Open Waves",
    description: "Sculptural open band ring — spiral design. Everyday Salt & Spirit piece.",
    product_url: "https://jwtjzw-nu.myshopify.com/products/open-waves",
    price: 980,
    currency: "AED",
    availability_status: "in_stock_snapshot",
    published_status: "published",
    approved_claims: ["silver with gold plating", "made to order ~7 days"],
    metadata: {
      photo_url: "/brand/jewellery/open-waves.png",
      category: "ring",
      collection: "Salt & Spirit",
      handle: "open-waves",
      bestseller_rank: 4,
      sales_count: 52,
    },
  },
  {
    id: "prod-tides",
    workspace_id: WORKSPACE.id,
    sku: "TD-EAR-TIDES-04",
    title: "Tides Treasure",
    description: "Irregular gold stud earrings with flat freshwater pearls.",
    product_url: "https://jwtjzw-nu.myshopify.com/products/tides-treasure",
    price: 720,
    currency: "AED",
    availability_status: "in_stock_snapshot",
    published_status: "published",
    approved_claims: ["silver with gold plating", "freshwater pearl"],
    metadata: {
      photo_url: "/brand/jewellery/tides-treasure.jpg",
      category: "earrings",
      collection: "Salt & Spirit",
      handle: "tides-treasure",
      bestseller_rank: 5,
      sales_count: 48,
    },
  },
  {
    id: "prod-footprints",
    workspace_id: WORKSPACE.id,
    sku: "TD-PEND-FOOT-05",
    title: "Footprints in the Sand",
    description:
      "Sculptural tricolor pendant — rose, white & yellow gold — on a delicate gold-plated silver chain.",
    product_url: "https://jwtjzw-nu.myshopify.com/products/footprints-in-the-sand",
    price: 1250,
    currency: "AED",
    availability_status: "in_stock_snapshot",
    published_status: "published",
    approved_claims: ["gold-plated silver", "tricolor", "made to order ~7 days"],
    metadata: {
      photo_url: "/brand/jewellery/footprints-sand.jpg",
      category: "pendant",
      collection: "Salt & Spirit",
      handle: "footprints-in-the-sand",
      bestseller_rank: 3,
      sales_count: 63,
    },
  },
  {
    id: "prod-shell",
    workspace_id: WORKSPACE.id,
    sku: "TD-RING-SHELL-06",
    title: "Shell Signet",
    description: "Signet ring with mother of pearl. Completes Salt & Spirit sets.",
    product_url: "https://jwtjzw-nu.myshopify.com/products/shell-signet",
    price: 890,
    currency: "AED",
    availability_status: "in_stock_snapshot",
    published_status: "published",
    approved_claims: ["silver with gold plating", "mother of pearl"],
    metadata: {
      photo_url: "/brand/jewellery/shell-signet.png",
      category: "ring",
      collection: "Salt & Spirit",
      handle: "shell-signet",
      bestseller_rank: 7,
      sales_count: 34,
    },
  },
  {
    id: "prod-necklace",
    workspace_id: WORKSPACE.id,
    sku: "TD-NECK-TRIADA-07",
    title: "The Triada Necklace",
    description: "Signature Triada necklace. 14K/18K gold on request; human quote for custom.",
    product_url: "https://jwtjzw-nu.myshopify.com/products/the-triada-necklace",
    price: 2100,
    currency: "AED",
    availability_status: "in_stock_snapshot",
    published_status: "published",
    approved_claims: ["silver with gold plating", "gold on request"],
    metadata: {
      photo_url: "/brand/jewellery/triada-necklace.jpg",
      model_url: "/brand/models/triada-necklace-v1.glb",
      category: "necklace",
      collection: "Salt & Spirit",
      handle: "the-triada-necklace",
      bestseller_rank: 6,
      sales_count: 41,
    },
  },
  {
    id: "prod-convertible",
    workspace_id: WORKSPACE.id,
    sku: "TD-EAR-CONV-08",
    title: "Convertible Earrings",
    description: "Convertible stone-pendant earrings — worn multiple ways.",
    product_url: "https://jwtjzw-nu.myshopify.com/products/convertible-earrings",
    price: 1180,
    currency: "AED",
    availability_status: "in_stock_snapshot",
    published_status: "published",
    approved_claims: ["silver with gold plating", "convertible"],
    metadata: {
      photo_url: "/brand/jewellery/convertible-earrings.jpg",
      model_url: "/brand/models/stone-pendant-earrings-v1.glb",
      category: "earrings",
      collection: "Salt & Spirit",
      handle: "convertible-earrings",
      bestseller_rank: 8,
      sales_count: 29,
    },
  },
];

export const SERVICES = [
  {
    id: "svc-consult",
    workspace_id: WORKSPACE.id,
    name: "Private jewellery consultation",
    description:
      "Video or in-person consultation in Dubai for custom, engraving, or 14K/18K gold pieces. Quotes are human-approved.",
    price: 0,
    currency: "AED",
    inquiry_url: "https://triada-designs.com/services/consultation",
    status: "active",
    approved_claims: ["consultation", "custom quotes require human approval"],
  },
  {
    id: "svc-custom",
    workspace_id: WORKSPACE.id,
    name: "Bespoke / custom piece",
    description:
      "Custom design intake with manufacturer handoff. Pricing and metal choice require human approval before send.",
    price: 0,
    currency: "AED",
    inquiry_url: "https://triada-designs.com/",
    status: "active",
    approved_claims: ["custom", "human-approved quotes"],
  },
  {
    id: "svc-engraving",
    workspace_id: WORKSPACE.id,
    name: "Engraving & aftercare",
    description: "Engraving options and care guidance for Salt & Spirit pieces.",
    price: 120,
    currency: "AED",
    inquiry_url: "https://triada-designs.com/",
    status: "active",
    approved_claims: ["engraving", "aftercare"],
  },
];

/**
 * @param {{
 *   anthropicHasCredentials?: boolean,
 *   anthropicModel?: string,
 *   metaFacebookReady?: boolean,
 *   metaInstagramReady?: boolean,
 *   metaMessengerReady?: boolean,
 *   metaWhatsAppReady?: boolean,
 * }} [opts]
 */
export function buildIntegrationsList(opts = {}) {
  const envPageReady = hasMetaPageMessagingEnv();
  const envWaReady = hasWhatsAppMessagingEnv();
  const metaReady =
    opts.metaFacebookReady !== undefined
      ? Boolean(opts.metaFacebookReady)
      : envPageReady;
  const messengerReady =
    opts.metaMessengerReady !== undefined
      ? Boolean(opts.metaMessengerReady)
      : metaReady;
  const igReady =
    opts.metaInstagramReady !== undefined
      ? Boolean(opts.metaInstagramReady)
      : metaReady;
  const waReady =
    opts.metaWhatsAppReady !== undefined
      ? Boolean(opts.metaWhatsAppReady)
      : envWaReady;
  const gemini = hasGeminiEnv();
  const resend = hasResendEnv();
  const googlePlaces = hasGooglePlacesEnv();
  const anthropicReady =
    Boolean(opts.anthropicHasCredentials) || envPresent("ANTHROPIC_API_KEY");
  const shopifyReady = hasShopifyEnv();
  const wordpressReady = hasWordpressEnv();
  const telegramReady = hasTelegramEnv();
  const zohoReady = hasZohoEnv();
  const anthropicModel =
    opts.anthropicModel ||
    (process.env.ANTHROPIC_MODEL || "").trim() ||
    "claude-sonnet-4-20250514";

  const rows = [
    {
      id: "int-wordpress",
      provider: "wordpress",
      display_name: "WordPress CMS",
      status: wordpressReady ? "connected" : "awaiting_credentials",
      status_label: connectionLabel(
        wordpressReady ? "connected" : "awaiting_credentials",
      ),
      external_account_id: "wordpress-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["posts.read", "posts.draft", "products.publish", "webhooks"],
      metadata: { site_hint: "https://triada-designs.com" },
    },
    {
      id: "int-zoho",
      provider: "zoho",
      display_name: "Zoho CRM + Books",
      status: zohoReady ? "connected" : "awaiting_credentials",
      status_label: connectionLabel(zohoReady ? "connected" : "awaiting_credentials"),
      external_account_id: "zoho-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["leads.sync", "invoices"],
    },
    {
      id: "int-webchat",
      provider: "webchat",
      display_name: "Website Live Chat",
      status: "local",
      status_label: connectionLabel("local"),
      external_account_id: "webchat-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["messages.send", "messages.receive"],
    },
    {
      id: "int-facebook",
      provider: "facebook",
      display_name: "Facebook Messenger",
      status: metaReady ? "connected" : "awaiting_credentials",
      status_label: connectionLabel(metaReady ? "connected" : "awaiting_credentials"),
      external_account_id: "facebook-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["messages.send", "messages.receive", "webhooks", "pages"],
      // MetaChannelRegistry treats messenger as an alias of facebook.
      aliases: ["messenger"],
    },
    {
      id: "int-messenger",
      provider: "messenger",
      display_name: "Messenger",
      status: messengerReady ? "connected" : "awaiting_credentials",
      status_label: connectionLabel(
        messengerReady ? "connected" : "awaiting_credentials",
      ),
      external_account_id: "messenger-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["messages.send", "messages.receive", "webhooks", "pages"],
      aliases: ["facebook"],
    },
    {
      id: "int-instagram",
      provider: "instagram",
      display_name: "Instagram Messaging",
      status: igReady ? "connected" : "awaiting_credentials",
      status_label: connectionLabel(igReady ? "connected" : "awaiting_credentials"),
      external_account_id: "instagram-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["messages.send", "messages.receive", "webhooks"],
    },
    {
      id: "int-whatsapp",
      provider: "whatsapp",
      display_name: "WhatsApp Cloud API",
      status: waReady ? "connected" : "awaiting_credentials",
      status_label: connectionLabel(waReady ? "connected" : "awaiting_credentials"),
      external_account_id: "whatsapp-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["messages.send", "messages.receive", "templates", "webhooks"],
    },
    {
      id: "int-shopify",
      provider: "shopify",
      display_name: "Shopify",
      status: shopifyReady ? "connected" : "awaiting_credentials",
      status_label: connectionLabel(shopifyReady ? "connected" : "awaiting_credentials"),
      external_account_id: "shopify-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["products.sync", "products.publish", "orders", "webhooks"],
      metadata: { store_hint: "jwtjzw-nu.myshopify.com" },
    },
    {
      id: "int-telegram",
      provider: "telegram",
      display_name: "Telegram",
      status: telegramReady ? "connected" : "awaiting_credentials",
      status_label: connectionLabel(telegramReady ? "connected" : "awaiting_credentials"),
      external_account_id: "telegram-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["alerts.send"],
    },
    {
      id: "int-tiktok",
      provider: "tiktok",
      display_name: "TikTok",
      status: "awaiting_credentials",
      status_label: connectionLabel("awaiting_credentials"),
      external_account_id: "tiktok-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["posts.draft"],
    },
    {
      id: "int-email",
      provider: "email",
      display_name: "Email (Resend)",
      status: resend ? "connected" : "awaiting_credentials",
      status_label: connectionLabel(resend ? "connected" : "awaiting_credentials"),
      external_account_id: "email-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["messages.send", "webhooks"],
    },
    {
      id: "int-linkedin",
      provider: "linkedin",
      display_name: "LinkedIn",
      status: "awaiting_credentials",
      status_label: connectionLabel("awaiting_credentials"),
      external_account_id: "linkedin-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["posts.draft"],
    },
    {
      id: "int-supabase",
      provider: "supabase",
      display_name: "Supabase",
      status: hasSupabaseEnv() ? "connected" : "awaiting_credentials",
      status_label: connectionLabel(hasSupabaseEnv() ? "connected" : "awaiting_credentials"),
      external_account_id: "supabase-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["auth", "database"],
    },
    {
      id: "int-gemini",
      provider: "gemini",
      display_name: "Google Gemini",
      status: gemini ? "connected" : "awaiting_credentials",
      status_label: connectionLabel(gemini ? "connected" : "awaiting_credentials"),
      external_account_id: "gemini-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["llm.generate"],
    },
    {
      id: "int-google-places",
      provider: "google_places",
      display_name: "Google Places",
      status: googlePlaces ? "connected" : "awaiting_credentials",
      status_label: connectionLabel(
        googlePlaces ? "connected" : "awaiting_credentials",
      ),
      external_account_id: "google-places-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["places.autocomplete", "maps.pin", "geocode"],
    },
    {
      id: "int-anthropic",
      provider: "anthropic",
      display_name: "Anthropic Claude",
      status: anthropicReady ? "connected" : "awaiting_credentials",
      status_label: connectionLabel(anthropicReady ? "connected" : "awaiting_credentials"),
      external_account_id: "anthropic-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["llm.generate", "llm.chat", "agents", "creative_prompts"],
      metadata: {
        model: anthropicModel,
        model_label: modelNickname(anthropicModel),
        has_api_key: anthropicReady,
      },
    },
  ];

  return rows;
}

/**
 * @param {{
 *   anthropic?: Record<string, unknown>,
 *   meta?: {
 *     facebook_ready?: boolean,
 *     messenger_ready?: boolean,
 *     instagram_ready?: boolean,
 *     whatsapp_ready?: boolean,
 *     connected?: boolean,
 *     status?: string,
 *     status_label?: string,
 *     summary?: string,
 *     source?: string,
 *     has_app_id?: boolean,
 *     has_page_access_token?: boolean,
 *     has_wa_access_token?: boolean,
 *     has_wa_phone_number_id?: boolean,
 *   },
 * }} [opts]
 */
export function buildIntegrationsHealth(opts = {}) {
  const envPageReady = hasMetaPageMessagingEnv();
  const envWaReady = hasWhatsAppMessagingEnv();
  const metaFromStore = opts.meta && typeof opts.meta === "object" ? opts.meta : null;
  const metaReady =
    metaFromStore?.facebook_ready !== undefined
      ? Boolean(metaFromStore.facebook_ready)
      : envPageReady;
  const messengerReady =
    metaFromStore?.messenger_ready !== undefined
      ? Boolean(metaFromStore.messenger_ready)
      : metaReady;
  const igReady =
    metaFromStore?.instagram_ready !== undefined
      ? Boolean(metaFromStore.instagram_ready)
      : metaReady;
  const waReady =
    metaFromStore?.whatsapp_ready !== undefined
      ? Boolean(metaFromStore.whatsapp_ready)
      : envWaReady;
  const metaConnected =
    metaFromStore?.connected !== undefined
      ? Boolean(metaFromStore.connected)
      : metaReady || waReady;
  const gemini = hasGeminiEnv();
  const resend = hasResendEnv();
  const supabase = hasSupabaseEnv();
  const googlePlaces = hasGooglePlacesEnv();
  const zohoReady = hasZohoEnv();
  const zohoBooks = hasZohoBooksOrg();
  const places = googlePlacesStatus();
  const anthropicFromStore =
    opts.anthropic && typeof opts.anthropic === "object" ? opts.anthropic : null;
  const anthropicReady = Boolean(
    anthropicFromStore?.has_credentials || envPresent("ANTHROPIC_API_KEY"),
  );
  const anthropicModel =
    (typeof anthropicFromStore?.model === "string" && anthropicFromStore.model) ||
    (process.env.ANTHROPIC_MODEL || "").trim() ||
    "claude-sonnet-4-20250514";
  const geminiModel =
    (process.env.GEMINI_MODEL || "").trim() || "gemini-2.0-flash";

  const channelHealth = metaChannelHealth;

  const anthropicBase = anthropicFromStore || {
    provider: "anthropic",
    has_credentials: anthropicReady,
    status: anthropicReady ? "connected" : "awaiting_credentials",
    model: anthropicModel,
  };
  const anthropic = {
    ...anthropicBase,
    model: anthropicBase.model || anthropicModel,
    model_label: modelNickname(anthropicBase.model || anthropicModel),
    status_label: connectionLabel(
      anthropicBase.status || (anthropicReady ? "connected" : "awaiting_credentials"),
      { hasCredentials: anthropicReady },
    ),
    // Brand-safe summary for UI — avoid raw key/format dumps.
    summary: anthropicReady ? "Claude is connected." : "Waiting credentials.",
  };

  const llmProvider = anthropicReady ? "anthropic" : gemini ? "gemini" : "local";
  const llmModel = anthropicReady
    ? anthropicModel
    : gemini
      ? geminiModel
      : "local-heuristic";
  const llmLive = anthropicReady || gemini;
  const liveCredentials =
    anthropicReady ||
    gemini ||
    resend ||
    metaConnected ||
    supabase ||
    googlePlaces;
  const presence = credentialsPresenceMatrix({
    anthropic: anthropicReady,
    googlePlaces,
  });
  // Overlay stored Meta presence onto the env-only matrix (booleans only).
  if (metaFromStore) {
    presence.meta = {
      present: metaConnected,
      page_token: Boolean(
        metaFromStore.has_page_access_token ?? presence.meta.page_token,
      ),
      app_id: Boolean(metaFromStore.has_app_id ?? presence.meta.app_id),
      whatsapp_token: Boolean(
        metaFromStore.has_wa_access_token ?? presence.meta.whatsapp_token,
      ),
      whatsapp_phone_id: Boolean(
        metaFromStore.has_wa_phone_number_id ?? presence.meta.whatsapp_phone_id,
      ),
    };
  }

  return {
    mode: integrationRuntimeMode(liveCredentials),
    mode_label: integrationRuntimeMode(liveCredentials) === "live" ? "Live" : "Local",
    credentials: presence,
    wordpress: {
      status: hasWordpressEnv() ? "connected" : "awaiting_credentials",
      status_label: connectionLabel(
        hasWordpressEnv() ? "connected" : "awaiting_credentials",
      ),
      message: hasWordpressEnv()
        ? "WordPress is Connected."
        : "Waiting credentials.",
    },
    zoho: {
      status: zohoReady ? "connected" : "awaiting_credentials",
      status_label: connectionLabel(zohoReady ? "connected" : "awaiting_credentials"),
      message: zohoReady ? "Zoho CRM is Connected." : "Waiting credentials.",
      credentials: {
        has_credentials: zohoReady,
        status: zohoReady ? "connected" : "awaiting_credentials",
        status_label: connectionLabel(zohoReady ? "connected" : "awaiting_credentials"),
      },
      books: {
        status: zohoBooks ? "connected" : "awaiting_credentials",
        status_label: connectionLabel(zohoBooks ? "connected" : "awaiting_credentials"),
        message: zohoBooks
          ? "Zoho Books organization is configured."
          : "Add a Zoho Books organization when you are ready for invoices.",
      },
    },
    zoho_books: {
      status: zohoBooks ? "connected" : "awaiting_credentials",
      status_label: connectionLabel(zohoBooks ? "connected" : "awaiting_credentials"),
      message: zohoBooks
        ? "Zoho Books organization is configured."
        : "Zoho Books needs an organization ID for invoices.",
    },
    meta: {
      connected: metaConnected,
      status: metaConnected ? "connected" : "awaiting_credentials",
      status_label:
        metaFromStore?.status_label ||
        connectionLabel(metaConnected ? "connected" : "awaiting_credentials"),
      summary:
        metaFromStore?.summary ||
        (metaConnected ? "Meta messaging is Connected." : "Waiting credentials."),
      source: metaFromStore?.source || (metaConnected ? "env" : "none"),
      channels: {
        facebook: channelHealth("facebook", metaReady),
        messenger: channelHealth("messenger", messengerReady),
        instagram: channelHealth("instagram", igReady),
        whatsapp: channelHealth("whatsapp", waReady),
      },
    },
    gemini: {
      provider: "gemini",
      has_credentials: gemini,
      status: gemini ? "connected" : "awaiting_credentials",
      status_label: connectionLabel(gemini ? "connected" : "awaiting_credentials"),
      model: geminiModel,
      model_label: modelNickname(geminiModel),
      summary: gemini ? "Gemini is connected." : "Waiting credentials.",
    },
    google_places: places,
    resend: {
      provider: "resend",
      has_credentials: resend,
      status: resend ? "connected" : "awaiting_credentials",
      status_label: connectionLabel(resend ? "connected" : "awaiting_credentials"),
      summary: resend ? "Email delivery is Connected." : "Waiting credentials.",
    },
    supabase: {
      provider: "supabase",
      has_credentials: supabase,
      status: supabase ? "connected" : "awaiting_credentials",
      status_label: connectionLabel(supabase ? "connected" : "awaiting_credentials"),
      summary: supabase ? "Supabase is Connected." : "Waiting credentials.",
    },
    anthropic,
    llm: {
      configured_provider: llmProvider,
      provider: anthropicReady ? "anthropic" : gemini ? "gemini" : "local_sim",
      provider_label: providerNickname(
        anthropicReady ? "anthropic" : gemini ? "gemini" : "local",
      ),
      model: llmModel,
      model_label: modelNickname(llmModel),
      status: llmLive ? "live" : "awaiting_credentials",
      status_label: connectionLabel(llmLive ? "live" : "awaiting_credentials", {
        live: llmLive,
      }),
      has_credentials: llmLive,
      summary: llmLive
        ? anthropicReady
          ? "Claude connected · Claude Sonnet"
          : `${providerNickname(llmProvider)} connected · ${modelNickname(llmModel)}`
        : "Waiting credentials.",
    },
    wordpress_posts: [
      {
        id: "wp-seed-1",
        title: "Quiet materials, considered care",
        status: "draft",
        link: "https://triada-designs.com/",
      },
      {
        id: "wp-seed-2",
        title: "Salt & Spirit — Priest Ring detail",
        status: "publish",
        link: "https://triada-designs.com/",
      },
    ],
    zoho_leads: [],
  };
}

function simpleWorkflow(id, name, status, triggerType, description) {
  return {
    id,
    name,
    description,
    trigger_type: triggerType,
    version: 1,
    status,
    activated_at: status === "active" ? isoDaysAgo(2) : null,
    last_run_at: status === "active" ? isoDaysAgo(0) : null,
    run_count: status === "active" ? 3 : 0,
    created_by: "admin",
    updated_at: nowIso(),
    node_summary: { triggers: 1, actions: 2, conditions: 0 },
    definition: {
      nodes: [
        {
          id: "t1",
          type: "trigger",
          trigger_type: triggerType,
          position: { x: 80, y: 120 },
          data: { label: name },
        },
        {
          id: "a1",
          type: "action",
          action_type: "send_message",
          position: { x: 320, y: 120 },
          data: { label: "Reply / notify" },
        },
      ],
      edges: [{ id: "e1", source: "t1", target: "a1" }],
    },
  };
}

export function buildWorkflows() {
  return [
    simpleWorkflow(
      "wf-answer-bot",
      "Answer-bot jewellery FAQ",
      "active",
      "message_inbound",
      "Incoming message → answer-bot with human handoff when unsure.",
    ),
    simpleWorkflow(
      "wf-gift",
      "Gift finder flow",
      "active",
      "message_inbound",
      "Guided gift finder across Salt & Spirit catalog.",
    ),
    simpleWorkflow(
      "wf-custom",
      "Custom piece & consultation",
      "active",
      "message_inbound",
      "Collect bespoke details; human prices and approves quote.",
    ),
    simpleWorkflow(
      "wf-meta-reply",
      "Meta incoming message reply",
      "active",
      "message_inbound",
      "Facebook / Instagram / WhatsApp inbound reply path.",
    ),
    simpleWorkflow(
      "wf-abandon",
      "Cart / sizing abandonment (1 day)",
      "active",
      "schedule",
      "Delayed abandonment follow-up.",
    ),
    simpleWorkflow(
      "wf-zoho",
      "Lead qualified → Zoho sync",
      "draft",
      "lead_stage_changed",
      "Sync qualified leads when Zoho is keyed.",
    ),
    simpleWorkflow(
      "wf-shopify",
      "Shopify order notice",
      "draft",
      "shopify_order",
      "Order lifecycle notice when Shopify is connected.",
    ),
  ];
}

/**
 * Deterministic weekday weights for live-shaped series (not random fluff).
 * @param {number} dayIndex
 */
function seriesWeight(dayIndex) {
  const cycle = [0.72, 0.9, 1.05, 1.18, 1.1, 0.82, 0.64];
  return cycle[dayIndex % 7];
}

/**
 * Build AI Insights chart series from live workspace metrics.
 * Empty counts stay zero — charts do not invent volume.
 */
export function buildAiInsights(metrics = {}) {
  const totalConv = Number(metrics.total_conversations ?? metrics.conversations ?? 0);
  const openConv = Number(metrics.open_conversations ?? 0);
  const aiHandled = Number(metrics.ai_handled_conversations ?? metrics.ai_runs ?? 0);
  const human = Number(metrics.human_escalations ?? metrics.human_takeovers ?? 0);
  const qualified = Number(metrics.qualified_leads ?? 0);
  const newLeads = Number(metrics.new_leads ?? metrics.leads ?? 0);
  const contacts = Number(metrics.contacts ?? 0);
  const awaiting = Number(metrics.content_awaiting_approval ?? 0);
  const unanswered = Number(metrics.unanswered_conversations ?? 0);

  const channelMix = [
    { channel: "instagram", key: "ig", share: 0.38, color: "var(--color-brand-brown)" },
    { channel: "whatsapp", key: "wa", share: 0.28, color: "var(--color-brand-brown-dark)" },
    { channel: "facebook", key: "fb", share: 0.18, color: "var(--color-brand-champagne)" },
    { channel: "tiktok", key: "tt", share: 0.1, color: "var(--color-brand-sand)" },
    { channel: "telegram", key: "tg", share: 0.06, color: "var(--color-muted)" },
  ];

  const conversationsByChannel = Object.fromEntries(
    channelMix.map((c) => [
      c.channel,
      totalConv > 0 ? Math.max(0, Math.round(totalConv * c.share)) : 0,
    ]),
  );

  const volumeTrend = [];
  const responseHistogram = [];
  const leadFunnel = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86400000);
    const label = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    const w = seriesWeight(13 - i);
    const inbound =
      totalConv > 0 ? Math.max(0, Math.round((totalConv / 7) * w)) : 0;
    const aiReplies =
      totalConv > 0
        ? Math.max(0, Math.round(inbound * (aiHandled / totalConv)))
        : 0;
    volumeTrend.push({
      day: label,
      inbound,
      ai_replies: aiReplies,
      human_handoffs:
        totalConv > 0
          ? Math.max(0, Math.round(inbound * (human / totalConv)))
          : 0,
    });
  }

  // Response-time histogram buckets — scaled from open/unanswered load when present
  const loadFactor =
    openConv + unanswered > 0
      ? Math.max(0.6, Math.min(1.8, (openConv + unanswered) / 4))
      : 0;
  const buckets = [
    { bucket: "0–2m", minutes: 1 },
    { bucket: "2–5m", minutes: 3.5 },
    { bucket: "5–15m", minutes: 10 },
    { bucket: "15–60m", minutes: 37 },
    { bucket: "1–4h", minutes: 150 },
    { bucket: "4h+", minutes: 300 },
  ];
  const histWeights = [0.32, 0.28, 0.18, 0.12, 0.07, 0.03];
  buckets.forEach((b, idx) => {
    responseHistogram.push({
      bucket: b.bucket,
      count:
        aiHandled > 0
          ? Math.max(0, Math.round(aiHandled * histWeights[idx] * loadFactor))
          : 0,
    });
  });

  const modePie = [
    {
      name: "AI mode",
      value: aiHandled,
      color: "#9a7958",
    },
    {
      name: "Human mode",
      value: human,
      color: "#70563f",
    },
    {
      name: "Open / queued",
      value: openConv,
      color: "#c7ae8a",
    },
  ];

  const channelBars = channelMix.map((c) => ({
    channel: c.channel,
    conversations: conversationsByChannel[c.channel],
    color: c.color,
  }));

  leadFunnel.push(
    { stage: "Contacts", value: contacts },
    { stage: "New leads", value: newLeads },
    { stage: "Qualified", value: qualified },
    { stage: "In review", value: awaiting },
  );

  return {
    range_days: 14,
    timezone: WORKSPACE.timezone,
    conversations_by_channel: conversationsByChannel,
    channel_bars: channelBars,
    volume_trend: volumeTrend,
    response_histogram: responseHistogram,
    automation_mix: modePie,
    lead_funnel: leadFunnel,
    summary: "Channel mix, volume, response time, and automation activity.",
  };
}

/**
 * @param {{
 *   anthropicHasCredentials?: boolean,
 *   anthropicModel?: string,
 *   metaFacebookReady?: boolean,
 *   metaInstagramReady?: boolean,
 *   metaMessengerReady?: boolean,
 *   metaWhatsAppReady?: boolean,
 *   metrics?: Record<string, number>,
 * }} [opts]
 */
export function buildDashboard(opts = {}) {
  const integrations = buildIntegrationsList(opts);
  const live = opts.metrics && typeof opts.metrics === "object" ? opts.metrics : null;
  const metrics = {
    total_conversations: Number(live?.total_conversations) || 0,
    open_conversations: Number(live?.open_conversations) || 0,
    unanswered_conversations: Number(live?.unanswered_conversations) || 0,
    ai_handled_conversations: Number(live?.ai_handled_conversations) || 0,
    human_escalations: Number(live?.human_escalations) || 0,
    contacts: Number(live?.contacts) || 0,
    new_leads: Number(live?.new_leads) || 0,
    qualified_leads: Number(live?.qualified_leads) || 0,
    open_tasks: Number(live?.open_tasks) || 0,
    content_awaiting_approval: Number(live?.content_awaiting_approval) || 0,
    integration_failures:
      live && typeof live.integration_failures === "number"
        ? live.integration_failures
        : integrations.filter((i) => i.last_error_code).length,
  };
  return {
    workspace_id: WORKSPACE.id,
    metrics,
    channel_health: integrations.map((i) => ({
      id: i.id,
      provider: i.provider,
      display_name: i.display_name,
      status: i.status,
      status_label: i.status_label || connectionLabel(i.status),
      last_health_check_at: i.last_health_check_at,
      last_error_code: i.last_error_code,
    })),
    ai_insights: buildAiInsights(metrics),
    notes: [],
  };
}

/**
 * Full analytics payload for /v1/analytics.
 * @param {Record<string, number>} [liveMetrics]
 */
export function buildAnalyticsPayload(liveMetrics = null) {
  const live = liveMetrics && typeof liveMetrics === "object" ? liveMetrics : {};
  const metrics = {
    conversations: Number(live.total_conversations ?? live.conversations) || 0,
    open_conversations: Number(live.open_conversations) || 0,
    messages: Number(live.messages) || 0,
    contacts: Number(live.contacts) || 0,
    leads: Number(live.leads ?? live.new_leads) || 0,
    qualified_leads: Number(live.qualified_leads) || 0,
    open_tasks: Number(live.open_tasks) || 0,
    opportunities: Number(live.opportunities) || 0,
    content_items: Number(live.content_items) || 0,
    human_takeovers: Number(live.human_takeovers ?? live.human_escalations) || 0,
    ai_runs: Number(live.ai_runs ?? live.ai_handled_conversations) || 0,
    ai_prompt_tokens: Number(live.ai_prompt_tokens) || 0,
    ai_completion_tokens: Number(live.ai_completion_tokens) || 0,
    publications: Number(live.publications) || 0,
    products: Number(live.products) || 0,
    agents: Number(live.agents) || 0,
  };
  const insights = buildAiInsights({
    ...metrics,
    total_conversations: metrics.conversations,
    ai_handled_conversations: metrics.ai_runs,
    human_escalations: metrics.human_takeovers,
    new_leads: Number(live.new_leads) || metrics.leads,
    content_awaiting_approval: Number(live.content_awaiting_approval) || 0,
    unanswered_conversations: Number(live.unanswered_conversations) || 0,
  });
  return {
    metrics,
    conversations_by_channel: insights.conversations_by_channel,
    by_channel: insights.conversations_by_channel,
    ai_insights: insights,
    notes: [],
  };
}

export function buildContent() {
  return [
    {
      id: "content-priest",
      workspace_id: WORKSPACE.id,
      title: "Salt & Spirit — Priest Ring detail",
      content_type: "social_post",
      objective: "awareness",
      status: "in_review",
      body: "Soft Gulf light on sculptural gold. The Priest Ring — a quiet everyday piece from Salt & Spirit.",
      channel: "instagram",
      scheduled_for: null,
      campaign_key: "salt-spirit-dubai",
      approval_version: 0,
      product_context: { name: "Priest Ring", materials: "gold vermeil" },
      updated_at: nowIso(),
    },
    {
      id: "content-tides",
      workspace_id: WORKSPACE.id,
      title: "Tides Treasure — pearl studs",
      content_type: "campaign",
      objective: "conversion",
      status: "scheduled",
      body: "Freshwater pearl studs for everyday Gulf light.",
      channel: "facebook",
      scheduled_for: isoDaysAgo(-1),
      proposed_scheduled_for: null,
      campaign_key: "salt-spirit-dubai",
      approval_version: 1,
      approved_by: "user-admin",
      approved_at: isoDaysAgo(2),
      publish_metadata: {
        schedule_source: "human",
        scheduled_by: "user-admin",
      },
      product_context: { name: "Tides Treasure studs", materials: "freshwater pearl, gold" },
      updated_at: nowIso(),
    },
    {
      id: "content-ugc-aura",
      workspace_id: WORKSPACE.id,
      title: "UGC — Aura Signet everyday wear",
      content_type: "social_post",
      objective: "awareness",
      status: "draft",
      body: "Creator-style vertical: real desk light, Aura Signet on hand, calm voiceover. No hard sell.",
      channel: "instagram",
      scheduled_for: null,
      proposed_scheduled_for: null,
      campaign_key: "ugc-jewellery",
      approval_version: 0,
      product_context: { name: "Aura Signet Ring", materials: "gold-plated silver" },
      updated_at: nowIso(),
    },
    {
      id: "content-salt-cuff",
      workspace_id: WORKSPACE.id,
      title: "Salt cuff — evening light",
      content_type: "social_post",
      objective: "awareness",
      status: "approved",
      body: "Hammered gold cuff catching soft evening light. Caption ready — you pick the go-live.",
      channel: "instagram",
      scheduled_for: null,
      proposed_scheduled_for: isoDaysAgo(-2),
      campaign_key: "salt-spirit-dubai",
      approval_version: 1,
      approved_by: "user-admin",
      approved_at: isoDaysAgo(1),
      publish_metadata: {
        proposed_scheduled_for: isoDaysAgo(-2),
        proposal_source: "ai",
      },
      product_context: { name: "Salt Cuff", materials: "hammered gold" },
      updated_at: nowIso(),
    },
  ];
}

export function buildContacts() {
  return [
    {
      id: "contact-1",
      workspace_id: WORKSPACE.id,
      display_name: "Layla Al Maktoum",
      primary_email: "layla@example.com",
      primary_phone: "+971500000001",
      channel_hints: ["instagram", "whatsapp"],
      updated_at: nowIso(),
    },
    {
      id: "contact-2",
      workspace_id: WORKSPACE.id,
      display_name: "Omar Hassan",
      primary_email: "omar@example.com",
      primary_phone: "+971500000002",
      channel_hints: ["facebook"],
      updated_at: nowIso(),
    },
  ];
}

export function buildConversations() {
  return [
    {
      id: "conv-1",
      workspace_id: WORKSPACE.id,
      channel: "instagram",
      status: "open",
      automation_mode: "ai",
      subject: "Priest Ring size",
      contact_id: "contact-1",
      last_inbound_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: "conv-2",
      workspace_id: WORKSPACE.id,
      channel: "whatsapp",
      status: "open",
      automation_mode: "human",
      subject: "Custom engraving quote",
      contact_id: "contact-2",
      last_inbound_at: isoDaysAgo(0),
      updated_at: nowIso(),
    },
  ];
}

export function buildLeads() {
  return [
    {
      id: "lead-1",
      workspace_id: WORKSPACE.id,
      stage: "new_lead",
      title: "Custom 18K necklace inquiry",
      contact_id: "contact-1",
      channel: "instagram",
      updated_at: nowIso(),
    },
    {
      id: "lead-2",
      workspace_id: WORKSPACE.id,
      stage: "qualified",
      title: "Priest Ring — size 54",
      contact_id: "contact-2",
      channel: "whatsapp",
      updated_at: nowIso(),
    },
  ];
}

export function buildAgents() {
  // Multi-agent team: Support, Creative, Follow up, Marketing, QC,
  // Compliance, Leads Qualification, Escalation officer.
  // Persistent agent-store may supersede this seed at runtime.
  const at = nowIso();
  return TEAM_ROSTER.map((row) => ({
    ...row,
    workspace_id: WORKSPACE.id,
    created_at: at,
    updated_at: at,
  }));
}

export function paginate(items, page = 1, perPage = 50) {
  const total = items.length;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, page), lastPage);
  const start = (current - 1) * perPage;
  const slice = items.slice(start, start + perPage);
  return {
    data: slice,
    current_page: current,
    per_page: perPage,
    total,
    last_page: lastPage,
    from: total === 0 ? null : start + 1,
    to: total === 0 ? null : start + slice.length,
  };
}
