/**
 * WhatsApp campaign / broadcast promo helpers.
 * Resolves product & promo URLs for body text, ranks best-sellers,
 * and drafts AI-ready copy with optional image/video media (PR #39).
 */

import { completeAnthropic } from "@/lib/agents/anthropic-client";
import { marketingSystemPrompt } from "@/lib/agents/role-prompts";
import { BRAND, warmGreeting } from "@/lib/brand/identity";
import { listProducts, getProduct } from "@/lib/commerce/products-store";
import { shopifyShopDomain } from "@/lib/commerce/shopify-admin";
import { PUBLIC_SITE_URL } from "@/lib/constants";

const DEFAULT_PROMO = `${PUBLIC_SITE_URL.replace(/\/$/, "")}/`;

/**
 * @param {string} title
 */
export function productHandleFromTitle(title) {
  return String(title || "piece")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "piece";
}

/**
 * Absolute URL for local brand media paths used as WhatsApp media_url.
 * @param {string | null | undefined} pathOrUrl
 */
export function absolutePublicMediaUrl(pathOrUrl) {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://dashboard.triada-designs.com"
  ).replace(/\/$/, "");
  return `${base}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

/**
 * Best storefront / promo URL for a catalog product.
 * Prefers Shopify sync link → product_url (non-homepage) → constructed Shopify handle → site.
 * @param {import("@/lib/commerce/products-store").ProductRecord | Record<string, unknown> | null | undefined} product
 */
export function resolveProductPromoUrl(product) {
  if (!product || typeof product !== "object") return DEFAULT_PROMO;

  const shopifyLink =
    product.channel_sync &&
    typeof product.channel_sync === "object" &&
    product.channel_sync.shopify &&
    typeof product.channel_sync.shopify === "object"
      ? String(product.channel_sync.shopify.link || "").trim()
      : "";
  if (shopifyLink && /^https?:\/\//i.test(shopifyLink)) return shopifyLink;

  const meta =
    product.metadata && typeof product.metadata === "object"
      ? /** @type {Record<string, unknown>} */ (product.metadata)
      : {};
  const promoMeta = String(meta.promo_url || meta.storefront_url || "").trim();
  if (promoMeta && /^https?:\/\//i.test(promoMeta)) return promoMeta;

  const productUrl = String(product.product_url || "").trim();
  if (
    productUrl &&
    /^https?:\/\//i.test(productUrl) &&
    !/^https?:\/\/(www\.)?triada-designs\.com\/?$/i.test(productUrl)
  ) {
    return productUrl;
  }

  const handle =
    String(meta.handle || meta.shopify_handle || "").trim() ||
    productHandleFromTitle(String(product.title || product.sku || "piece"));
  const shop = shopifyShopDomain();
  if (shop && handle) {
    return `https://${shop}/products/${handle}`;
  }

  return productUrl || DEFAULT_PROMO;
}

/**
 * Rank published products as best-sellers.
 * Uses metadata.bestseller_rank (asc), then sales_count (desc), then price (desc).
 * @param {import("@/lib/commerce/products-store").ProductRecord[]} products
 * @param {number} [limit]
 */
export function rankBestSellingProducts(products, limit = 3) {
  const rows = Array.isArray(products) ? [...products] : [];
  const published = rows.filter((p) => {
    const status = String(p.published_status || "").toLowerCase();
    const avail = String(p.availability_status || "").toLowerCase();
    if (status === "draft" || status === "archived") return false;
    if (avail.includes("out_of_stock") || avail === "sold_out") return false;
    return true;
  });

  published.sort((a, b) => {
    const ma =
      a.metadata && typeof a.metadata === "object"
        ? /** @type {Record<string, unknown>} */ (a.metadata)
        : {};
    const mb =
      b.metadata && typeof b.metadata === "object"
        ? /** @type {Record<string, unknown>} */ (b.metadata)
        : {};
    const rankA = Number(ma.bestseller_rank);
    const rankB = Number(mb.bestseller_rank);
    const hasRankA = Number.isFinite(rankA) && rankA > 0;
    const hasRankB = Number.isFinite(rankB) && rankB > 0;
    if (hasRankA && hasRankB && rankA !== rankB) return rankA - rankB;
    if (hasRankA && !hasRankB) return -1;
    if (!hasRankA && hasRankB) return 1;

    const salesA = Number(ma.sales_count) || 0;
    const salesB = Number(mb.sales_count) || 0;
    if (salesA !== salesB) return salesB - salesA;

    const priceA = Number(a.price) || 0;
    const priceB = Number(b.price) || 0;
    if (priceA !== priceB) return priceB - priceA;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });

  const capped = Math.min(Math.max(Number(limit) || 3, 1), 10);
  return published.slice(0, capped).map((p, index) => ({
    ...p,
    promo_url: resolveProductPromoUrl(p),
    bestseller_position: index + 1,
  }));
}

/**
 * @param {{ limit?: number, product_ids?: string[] }} [opts]
 */
export async function listBestSellingProducts(opts = {}) {
  const listed = await listProducts({});
  const limit = Math.min(Math.max(Number(opts.limit) || 3, 1), 10);
  const ids = Array.isArray(opts.product_ids)
    ? opts.product_ids.map(String).filter(Boolean)
    : [];

  if (ids.length) {
    const byId = new Map(listed.data.map((p) => [p.id, p]));
    const picked = [];
    for (const id of ids) {
      const row = byId.get(id);
      if (row) {
        picked.push({
          ...row,
          promo_url: resolveProductPromoUrl(row),
          bestseller_position: picked.length + 1,
        });
      }
    }
    return {
      mode: listed.mode,
      data: picked.slice(0, limit),
      source: "product_ids",
    };
  }

  return {
    mode: listed.mode,
    data: rankBestSellingProducts(listed.data, limit),
    source: "bestsellers",
  };
}

/**
 * Media fields from a product (photo / video) for WhatsApp HEADER / session send.
 * @param {Record<string, unknown> | null | undefined} product
 */
export function resolveProductCampaignMedia(product) {
  if (!product || typeof product !== "object") {
    return { media_url: null, media_type: null, media_link: null };
  }
  const meta =
    product.metadata && typeof product.metadata === "object"
      ? /** @type {Record<string, unknown>} */ (product.metadata)
      : {};
  const videoRaw = String(
    meta.video_url || meta.promo_video_url || meta.media_video || "",
  ).trim();
  const imageRaw = String(
    meta.photo_url || meta.image_url || meta.media_image || "",
  ).trim();

  if (videoRaw) {
    const abs = absolutePublicMediaUrl(videoRaw);
    return {
      media_url: abs,
      media_link: abs && /^https?:\/\//i.test(abs) ? abs : null,
      media_type: "video",
    };
  }
  if (imageRaw) {
    const abs = absolutePublicMediaUrl(imageRaw);
    return {
      media_url: abs,
      media_link: abs && /^https?:\/\//i.test(abs) ? abs : null,
      media_type: "image",
    };
  }
  return { media_url: null, media_type: null, media_link: null };
}

/**
 * Insert product / promo URLs into a campaign body.
 * Replaces {{product_url}}, {{promo_url}}, {{bestseller_url}}, {{product_urls}}.
 * Appends a soft product links block when URLs are present and body has none.
 * @param {string} body
 * @param {{
 *   products?: Array<Record<string, unknown>>,
 *   promo_url?: string | null,
 *   product_url?: string | null,
 * }} [opts]
 */
export function injectPromoUrlsIntoBody(body, opts = {}) {
  const products = Array.isArray(opts.products) ? opts.products : [];
  const urls = products
    .map((p) => String(p.promo_url || resolveProductPromoUrl(p) || "").trim())
    .filter((u) => /^https?:\/\//i.test(u));
  const primary =
    String(opts.promo_url || opts.product_url || "").trim() ||
    urls[0] ||
    DEFAULT_PROMO;
  if (primary && !urls.includes(primary) && /^https?:\/\//i.test(primary)) {
    urls.unshift(primary);
  }

  const unique = [...new Set(urls)];
  const productUrlsBlock = unique.join(" · ");
  let text = String(body || "").trim();

  if (!text) {
    const titles = products
      .map((p) => String(p.title || "").trim())
      .filter(Boolean)
      .slice(0, 3);
    const pieceLine = titles.length
      ? titles.join(", ")
      : "our best-loved pieces";
    text = [
      `${warmGreeting()},`,
      `Discover ${pieceLine} from ${BRAND.name}.`,
      `Shop: ${productUrlsBlock || primary}`,
      `Reply here with questions — or STOP to opt out.`,
      `— ${BRAND.name} · ${BRAND.opsEmail}`,
    ].join(" ");
  }

  text = text
    .replace(/\{\{\s*product_url\s*\}\}/gi, primary)
    .replace(/\{\{\s*promo_url\s*\}\}/gi, primary)
    .replace(/\{\{\s*bestseller_url\s*\}\}/gi, unique[0] || primary)
    .replace(/\{\{\s*product_urls\s*\}\}/gi, productUrlsBlock || primary)
    .replace(/\{\{\s*1\s*\}\}/g, (m) => m); // leave positional template vars alone

  // Named product placeholders {{product_1_url}} …
  unique.forEach((url, i) => {
    const n = i + 1;
    text = text.replace(
      new RegExp(`\\{\\{\\s*product_${n}_url\\s*\\}\\}`, "gi"),
      url,
    );
  });

  const hasAnyUrl = unique.some((u) => text.includes(u));
  if (!hasAnyUrl && unique.length) {
    text = `${text.trim()} Shop: ${productUrlsBlock}`;
  }

  return {
    body: text.trim(),
    promo_url: primary,
    product_urls: unique,
    urls_injected: unique.length > 0,
  };
}

/**
 * Build send-time BODY parameter components that carry product / promo URLs.
 * When `body` is freeform (session / caption), components may still carry URL params for templates.
 * @param {{
 *   components?: unknown[],
 *   body?: string,
 *   promo_url?: string | null,
 *   product_urls?: string[],
 *   contact_name?: string | null,
 * }} input
 */
export function buildPromoTemplateComponents(input = {}) {
  const existing = Array.isArray(input.components)
    ? input.components.filter((c) => c && typeof c === "object")
    : [];
  const urls = Array.isArray(input.product_urls)
    ? input.product_urls.filter((u) => /^https?:\/\//i.test(String(u)))
    : [];
  const primary = String(input.promo_url || urls[0] || "").trim();
  const name = String(input.contact_name || "friend").trim() || "friend";

  const hasBody = existing.some(
    (c) =>
      String(/** @type {Record<string, unknown>} */ (c).type || "").toUpperCase() ===
      "BODY",
  );

  if (hasBody) {
    return existing;
  }

  if (!primary && !urls.length && !String(input.body || "").trim()) {
    return existing;
  }

  /** Prefer filling common marketing template vars: name + product URL */
  const params = [{ type: "text", text: name }];
  if (primary) params.push({ type: "text", text: primary });
  for (const url of urls.slice(1, 3)) {
    params.push({ type: "text", text: url });
  }

  return [
    ...existing,
    {
      type: "body",
      parameters: params,
    },
  ];
}

/**
 * Per-recipient template components (name + promo URLs).
 * @param {{
 *   components?: unknown[],
 *   promo_url?: string | null,
 *   product_urls?: string[],
 *   body?: string,
 * }} promo
 * @param {{ name?: string | null }} contact
 * @param {Record<string, unknown>} [input]
 */
export function buildPromoComponentsForContact(promo, contact, input = {}) {
  const base = Array.isArray(input.components)
    ? input.components
    : Array.isArray(promo?.components)
      ? promo.components
      : [];
  const withoutBody = base.filter(
    (c) =>
      String(/** @type {Record<string, unknown>} */ (c).type || "").toUpperCase() !==
      "BODY",
  );
  return buildPromoTemplateComponents({
    components: withoutBody,
    body: promo?.body,
    promo_url: promo?.promo_url,
    product_urls: promo?.product_urls,
    contact_name: contact?.name || null,
  });
}

/**
 * Meta CTA URL button component for template create (static or dynamic suffix).
 * @param {string} url
 * @param {string} [label]
 */
export function buildPromoUrlButtonComponent(url, label = "Shop the piece") {
  const href = String(url || "").trim();
  if (!href || !/^https?:\/\//i.test(href)) return null;
  return {
    type: "BUTTONS",
    buttons: [
      {
        type: "URL",
        text: String(label || "Shop the piece").slice(0, 25),
        url: href,
      },
    ],
  };
}

/**
 * Resolve products + body + media for a campaign-send / draft request.
 * @param {Record<string, unknown>} input
 */
export async function resolveCampaignPromoPayload(input = {}) {
  const limit = Math.min(
    Math.max(Number(input.bestseller_count || input.limit || 3) || 3, 1),
    10,
  );
  const insertBestsellers =
    input.insert_bestsellers === true ||
    input.bestsellers === true ||
    String(input.insert_bestsellers || "").toLowerCase() === "true";

  /** @type {string[]} */
  let productIds = [];
  if (Array.isArray(input.product_ids)) {
    productIds = input.product_ids.map(String).filter(Boolean);
  } else if (input.product_id) {
    productIds = [String(input.product_id)];
  }

  let products = [];
  if (productIds.length) {
    const listed = await listBestSellingProducts({
      product_ids: productIds,
      limit,
    });
    products = listed.data;
  } else if (insertBestsellers) {
    const listed = await listBestSellingProducts({ limit });
    products = listed.data;
  } else if (input.product_id) {
    const one = await getProduct(String(input.product_id));
    if (one) {
      products = [
        {
          ...one,
          promo_url: resolveProductPromoUrl(one),
          bestseller_position: 1,
        },
      ];
    }
  }

  const explicitPromo = String(
    input.promo_url || input.product_url || "",
  ).trim();
  const injected = injectPromoUrlsIntoBody(
    String(input.body || input.promo_body || input.message || ""),
    {
      products,
      promo_url: explicitPromo || null,
      product_url: explicitPromo || null,
    },
  );

  const mediaFromInput = {
    media_id: input.media_id || input.header_media_id || null,
    media_url: absolutePublicMediaUrl(input.media_url) || null,
    media_link: absolutePublicMediaUrl(input.media_link) || null,
    media_base64: input.media_base64 || null,
    media_type: input.media_type || input.header_media_type || null,
  };
  const hasMedia =
    Boolean(mediaFromInput.media_id) ||
    Boolean(mediaFromInput.media_url) ||
    Boolean(mediaFromInput.media_link) ||
    Boolean(mediaFromInput.media_base64);

  let productMedia = {
    media_url: null,
    media_type: null,
    media_link: null,
  };
  if (!hasMedia && products[0]) {
    productMedia = resolveProductCampaignMedia(products[0]);
  }

  const components = buildPromoTemplateComponents({
    components: Array.isArray(input.components) ? input.components : [],
    body: injected.body,
    promo_url: injected.promo_url,
    product_urls: injected.product_urls,
    contact_name: input.contact_name ? String(input.contact_name) : null,
  });

  const mediaUrl = mediaFromInput.media_url || productMedia.media_url || null;
  const mediaLink = mediaFromInput.media_link || productMedia.media_link || null;

  return {
    body: injected.body,
    promo_url: injected.promo_url,
    product_urls: injected.product_urls,
    urls_injected: injected.urls_injected,
    products: products.map((p) => ({
      id: p.id,
      title: p.title,
      sku: p.sku,
      promo_url: p.promo_url || resolveProductPromoUrl(p),
      bestseller_position: p.bestseller_position || null,
      price: p.price,
      currency: p.currency,
    })),
    components,
    media: {
      media_id: mediaFromInput.media_id ? String(mediaFromInput.media_id) : null,
      media_url: mediaUrl,
      media_link: mediaLink,
      media_base64: mediaFromInput.media_base64
        ? String(mediaFromInput.media_base64)
        : null,
      media_type: mediaFromInput.media_type
        ? String(mediaFromInput.media_type)
        : productMedia.media_type,
    },
    insert_bestsellers: insertBestsellers || productIds.length > 0,
  };
}

/**
 * Local heuristic draft when Anthropic is not keyed.
 * @param {{
 *   products: Array<Record<string, unknown>>,
 *   objective?: string,
 *   language?: string,
 * }} opts
 */
export function localHeuristicCampaignDraft(opts = {}) {
  const products = Array.isArray(opts.products) ? opts.products : [];
  const titles = products.map((p) => String(p.title || "piece")).filter(Boolean);
  const urls = products
    .map((p) => String(p.promo_url || resolveProductPromoUrl(p)))
    .filter((u) => /^https?:\/\//i.test(u));
  const objective = String(opts.objective || "bestseller_promo").trim();
  const lead =
    objective === "vip_drop"
      ? "VIP first look — quiet luxury, no rush."
      : objective === "new_drop"
        ? "A new piece joins the collection."
        : "Our best-loved pieces, ready to wear.";

  const pieceLine =
    titles.length === 0
      ? "selected Triada favourites"
      : titles.length === 1
        ? titles[0]
        : `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;

  const body = [
    `${warmGreeting()},`,
    `${lead} Discover ${pieceLine}.`,
    urls.length ? `Shop: ${urls.join(" · ")}` : `Shop: ${DEFAULT_PROMO}`,
    `Reply INTERESTED and a specialist will help — or STOP to opt out.`,
    `— ${BRAND.name} · Timisoara · ${BRAND.opsEmail}`,
  ].join(" ");

  return {
    body,
    mode: "local",
    provider: "local_heuristic",
  };
}

/**
 * AI Marketing draft: insert best-seller product links (+ suggest media).
 * @param {Record<string, unknown>} input
 */
export async function draftWhatsAppCampaignWithBestsellers(input = {}) {
  const hasExplicitProducts =
    Boolean(input.product_id) ||
    (Array.isArray(input.product_ids) && input.product_ids.length > 0);
  const promo = await resolveCampaignPromoPayload({
    ...input,
    insert_bestsellers: hasExplicitProducts
      ? Boolean(input.insert_bestsellers || input.bestsellers)
      : input.insert_bestsellers !== false && input.bestsellers !== false,
    body: String(input.body || ""),
  });

  if (!promo.products.length) {
    const listed = await listBestSellingProducts({
      limit: Number(input.bestseller_count) || 3,
    });
    promo.products = listed.data.map((p) => ({
      id: p.id,
      title: p.title,
      sku: p.sku,
      promo_url: p.promo_url,
      bestseller_position: p.bestseller_position,
      price: p.price,
      currency: p.currency,
    }));
    const reinjected = injectPromoUrlsIntoBody(String(input.body || ""), {
      products: listed.data,
      promo_url: String(input.promo_url || input.product_url || "") || null,
    });
    promo.body = reinjected.body;
    promo.promo_url = reinjected.promo_url;
    promo.product_urls = reinjected.product_urls;
    promo.urls_injected = reinjected.urls_injected;
    if (!promo.media.media_url && listed.data[0]) {
      const media = resolveProductCampaignMedia(listed.data[0]);
      promo.media = {
        ...promo.media,
        media_url: media.media_url,
        media_link: media.media_link,
        media_type: media.media_type,
      };
    }
  }

  const productLines = promo.products
    .map(
      (p, i) =>
        `${i + 1}. ${p.title} — ${p.promo_url}${p.price != null ? ` (${p.currency || "AED"} ${p.price})` : ""}`,
    )
    .join("\n");

  const system = [
    marketingSystemPrompt(),
    "",
    "WhatsApp campaign draft rules:",
    "- Write one short broadcast body (2–5 sentences) that MUST include the exact product/promo HTTPS URLs provided.",
    "- Soft CTA only. No fake scarcity, invented discounts, or fabricated reviews.",
    "- Warm Triada tone. Include opt-out cue (STOP) for marketing.",
    "- Do not mention internal tools, providers, or pipelines.",
    "- Return ONLY the message body text — no markdown fences or title line.",
  ].join("\n");

  const userPrompt = [
    `Objective: ${String(input.objective || "bestseller_promo")}`,
    `Language: ${String(input.language || "en")}`,
    input.notes ? `Notes: ${String(input.notes)}` : "",
    "Best-selling products (include these exact links):",
    productLines || `(none — use ${DEFAULT_PROMO})`,
    promo.body ? `Starter body to refine:\n${promo.body}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const completion = await completeAnthropic({
    system,
    prompt: userPrompt,
    temperature: 0.35,
    max_tokens: 512,
  });

  let body = String(completion.text || "").trim();
  let mode = completion.mode || "local";
  let provider = completion.ok ? "anthropic" : "local_heuristic";

  if (!completion.ok || !body) {
    const local = localHeuristicCampaignDraft({
      products: promo.products,
      objective: String(input.objective || "bestseller_promo"),
      language: String(input.language || "en"),
    });
    body = local.body;
    mode = local.mode;
    provider = local.provider;
  }

  const ensured = injectPromoUrlsIntoBody(body, {
    products: promo.products,
    promo_url: promo.promo_url,
  });

  const suggestedTemplate =
    String(input.template_name || "").trim() ||
    (String(input.objective || "").includes("vip")
      ? "vip_drop_first_access"
      : String(input.objective || "").includes("new")
        ? "new_piece_preview"
        : "promo_product_spotlight");

  return {
    ok: true,
    mode,
    provider,
    body: ensured.body,
    promo_url: ensured.promo_url,
    product_urls: ensured.product_urls,
    products: promo.products,
    media: promo.media,
    suggested_template: suggestedTemplate,
    components: buildPromoTemplateComponents({
      body: ensured.body,
      promo_url: ensured.promo_url,
      product_urls: ensured.product_urls,
    }),
    urls_injected: ensured.urls_injected,
    source: "next_dual_run",
  };
}
