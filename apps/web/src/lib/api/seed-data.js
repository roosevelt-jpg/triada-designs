/**
 * Production-shaped seeded catalog + ops payloads for Next dual-run
 * when Laravel API_ORIGIN is down. Prefer live/seeded language — never "demo".
 */

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
    product_url: "https://triada-designs.com/",
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
    },
  },
  {
    id: "prod-imago",
    workspace_id: WORKSPACE.id,
    sku: "TD-RING-IMAGO-02",
    title: "Imago Dei Ring",
    description: "Statement ring from the Salt & Spirit collection. Confirm size against published guide.",
    product_url: "https://triada-designs.com/",
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
    },
  },
  {
    id: "prod-waves",
    workspace_id: WORKSPACE.id,
    sku: "TD-RING-WAVES-03",
    title: "Open Waves",
    description: "Sculptural open band ring — spiral design. Everyday Salt & Spirit piece.",
    product_url: "https://triada-designs.com/",
    price: 980,
    currency: "AED",
    availability_status: "in_stock_snapshot",
    published_status: "published",
    approved_claims: ["silver with gold plating", "made to order ~7 days"],
    metadata: {
      photo_url: "/brand/jewellery/open-waves.png",
      category: "ring",
      collection: "Salt & Spirit",
    },
  },
  {
    id: "prod-tides",
    workspace_id: WORKSPACE.id,
    sku: "TD-EAR-TIDES-04",
    title: "Tides Treasure",
    description: "Irregular gold stud earrings with flat freshwater pearls.",
    product_url: "https://triada-designs.com/",
    price: 720,
    currency: "AED",
    availability_status: "in_stock_snapshot",
    published_status: "published",
    approved_claims: ["silver with gold plating", "freshwater pearl"],
    metadata: {
      photo_url: "/brand/jewellery/tides-treasure.jpg",
      category: "earrings",
      collection: "Salt & Spirit",
    },
  },
  {
    id: "prod-footprints",
    workspace_id: WORKSPACE.id,
    sku: "TD-PEND-FOOT-05",
    title: "Footprints in the Sand",
    description:
      "Sculptural tricolor pendant — rose, white & yellow gold — on a delicate gold-plated silver chain.",
    product_url: "https://triada-designs.com/",
    price: 1250,
    currency: "AED",
    availability_status: "in_stock_snapshot",
    published_status: "published",
    approved_claims: ["gold-plated silver", "tricolor", "made to order ~7 days"],
    metadata: {
      photo_url: "/brand/jewellery/footprints-sand.jpg",
      category: "pendant",
      collection: "Salt & Spirit",
    },
  },
  {
    id: "prod-shell",
    workspace_id: WORKSPACE.id,
    sku: "TD-RING-SHELL-06",
    title: "Shell Signet",
    description: "Signet ring with mother of pearl. Completes Salt & Spirit sets.",
    product_url: "https://triada-designs.com/",
    price: 890,
    currency: "AED",
    availability_status: "in_stock_snapshot",
    published_status: "published",
    approved_claims: ["silver with gold plating", "mother of pearl"],
    metadata: {
      photo_url: "/brand/jewellery/shell-signet.png",
      category: "ring",
      collection: "Salt & Spirit",
    },
  },
  {
    id: "prod-necklace",
    workspace_id: WORKSPACE.id,
    sku: "TD-NECK-TRIADA-07",
    title: "The Triada Necklace",
    description: "Signature Triada necklace. 14K/18K gold on request; human quote for custom.",
    product_url: "https://triada-designs.com/",
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
    },
  },
  {
    id: "prod-convertible",
    workspace_id: WORKSPACE.id,
    sku: "TD-EAR-CONV-08",
    title: "Convertible Earrings",
    description: "Convertible stone-pendant earrings — worn multiple ways.",
    product_url: "https://triada-designs.com/",
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

/** Presence-only env check — never returns secret values. */
export function envPresent(name) {
  const v = process.env[name];
  return Boolean(v && String(v).trim());
}

export function buildIntegrationsList() {
  const metaReady =
    envPresent("META_PAGE_ACCESS_TOKEN") ||
    envPresent("META_WA_ACCESS_TOKEN") ||
    envPresent("META_APP_ID");
  const gemini = envPresent("GEMINI_API_KEY");
  const resend = envPresent("RESEND_API_KEY");

  const rows = [
    {
      id: "int-wordpress",
      provider: "wordpress",
      display_name: "WordPress CMS",
      status: "seeded",
      external_account_id: "wordpress-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["posts.read", "posts.draft", "webhooks"],
    },
    {
      id: "int-zoho",
      provider: "zoho",
      display_name: "Zoho CRM + Books",
      status: "awaiting_credentials",
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
      external_account_id: "facebook-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["messages.send", "messages.receive", "webhooks", "pages"],
    },
    {
      id: "int-instagram",
      provider: "instagram",
      display_name: "Instagram Messaging",
      status: metaReady ? "connected" : "awaiting_credentials",
      external_account_id: "instagram-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["messages.send", "messages.receive", "webhooks"],
    },
    {
      id: "int-whatsapp",
      provider: "whatsapp",
      display_name: "WhatsApp Cloud API",
      status: envPresent("META_WA_ACCESS_TOKEN") ? "connected" : "awaiting_credentials",
      external_account_id: "whatsapp-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["messages.send", "messages.receive", "templates", "webhooks"],
    },
    {
      id: "int-shopify",
      provider: "shopify",
      display_name: "Shopify",
      status: "awaiting_credentials",
      external_account_id: "shopify-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["products.sync", "orders", "webhooks"],
      metadata: { store_hint: "jwtjzw-nu.myshopify.com" },
    },
    {
      id: "int-telegram",
      provider: "telegram",
      display_name: "Telegram",
      status: "awaiting_credentials",
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
      external_account_id: "linkedin-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["posts.draft"],
    },
    {
      id: "int-gemini",
      provider: "gemini",
      display_name: "Google Gemini",
      status: gemini ? "connected" : "awaiting_credentials",
      external_account_id: "gemini-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["llm.generate"],
    },
    {
      id: "int-anthropic",
      provider: "anthropic",
      display_name: "Anthropic Claude",
      status: "awaiting_credentials",
      external_account_id: "anthropic-primary",
      last_health_check_at: nowIso(),
      last_error_code: null,
      capabilities: ["llm.generate"],
    },
  ];

  return rows;
}

export function buildIntegrationsHealth() {
  const metaReady =
    envPresent("META_PAGE_ACCESS_TOKEN") || envPresent("META_APP_ID");
  const waReady = envPresent("META_WA_ACCESS_TOKEN");
  const gemini = envPresent("GEMINI_API_KEY");
  const channelHealth = (key, ready) => ({
    status: ready ? "connected" : "awaiting_credentials",
    health: {
      status: ready ? "healthy" : "awaiting_credentials",
      message: ready
        ? `${key} credentials present on host (Next dual-run).`
        : `Awaiting ${key} credentials on Integrations.`,
    },
  });

  return {
    mode: "local",
    wordpress: {
      status: "seeded",
      message: "WordPress posts served from seeded Next dual-run catalog.",
    },
    zoho: {
      status: "awaiting_credentials",
      message: "Zoho OAuth not configured on this host.",
      credentials: {
        has_credentials: false,
        status: "awaiting_credentials",
        honesty: "No Zoho client/refresh tokens on this host.",
      },
      books: {
        status: "awaiting_credentials",
        message: "Zoho Books awaiting credentials.",
      },
    },
    zoho_books: {
      status: "awaiting_credentials",
      message: "Zoho Books awaiting credentials.",
    },
    meta: {
      connected: metaReady || waReady,
      channels: {
        facebook: channelHealth("facebook", metaReady),
        instagram: channelHealth("instagram", metaReady),
        whatsapp: channelHealth("whatsapp", waReady),
      },
    },
    anthropic: {
      has_credentials: false,
      status: "awaiting_credentials",
      model: "claude-sonnet-4-20250514",
      honesty:
        "Anthropic key not stored on this host yet — paste on Integrations to enable live Claude.",
    },
    llm: {
      configured_provider: gemini ? "gemini" : "local",
      provider: gemini ? "gemini" : "local_sim",
      model: gemini ? "gemini-2.0-flash" : "local-heuristic",
      status: gemini ? "live" : "awaiting_credentials",
      has_credentials: gemini,
      honesty: gemini
        ? "Gemini credentials present; Anthropic remains primary when keyed."
        : "No live LLM credentials — local heuristic responses only.",
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
      "Delayed abandonment follow-up via Vercel Cron.",
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

export function buildDashboard() {
  const integrations = buildIntegrationsList();
  return {
    workspace_id: WORKSPACE.id,
    metrics: {
      total_conversations: 12,
      open_conversations: 4,
      unanswered_conversations: 2,
      ai_handled_conversations: 8,
      human_escalations: 1,
      contacts: 18,
      new_leads: 3,
      qualified_leads: 2,
      open_tasks: 4,
      content_awaiting_approval: 1,
      integration_failures: integrations.filter((i) => i.last_error_code).length,
    },
    channel_health: integrations.map((i) => ({
      id: i.id,
      provider: i.provider,
      display_name: i.display_name,
      status: i.status,
      last_health_check_at: i.last_health_check_at,
      last_error_code: i.last_error_code,
    })),
    notes: [
      "Metrics served by Next dual-run seed while Laravel API_ORIGIN is unavailable.",
      "Estimated AI cost is omitted until LLM usage events are recorded.",
    ],
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
      scheduled_for: isoDaysAgo(-3),
      campaign_key: "salt-spirit-dubai",
      approval_version: 0,
      updated_at: nowIso(),
    },
    {
      id: "content-tides",
      workspace_id: WORKSPACE.id,
      title: "Tides Treasure — pearl studs",
      content_type: "campaign",
      objective: "conversion",
      status: "approved",
      body: "Freshwater pearl studs for everyday Gulf light.",
      channel: "facebook",
      scheduled_for: isoDaysAgo(-1),
      campaign_key: "salt-spirit-dubai",
      approval_version: 1,
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
  return [
    {
      id: "agent-answer",
      workspace_id: WORKSPACE.id,
      name: "Jewellery answer-bot",
      description: "Sizes, materials, care, shipping, price list — human handoff when unsure.",
      status: "active",
      config: { disclosure: true },
    },
    {
      id: "agent-gift",
      workspace_id: WORKSPACE.id,
      name: "Gift finder",
      description: "Recommends verified catalog pieces for gift intent.",
      status: "active",
      config: {},
    },
    {
      id: "agent-creative",
      workspace_id: WORKSPACE.id,
      name: "Creative media",
      description: "Post-aligned images/variants when Gemini/Anthropic keyed.",
      status: "paused",
      config: {},
    },
  ];
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
