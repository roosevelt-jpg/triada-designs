/**
 * Smoke: WhatsApp campaign promo URLs + bestsellers + AI draft heuristic.
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-wa-campaign-promo.mjs
 */

import {
  injectPromoUrlsIntoBody,
  rankBestSellingProducts,
  localHeuristicCampaignDraft,
  buildPromoComponentsForContact,
  draftWhatsAppCampaignWithBestsellers,
  resolveCampaignPromoPayload,
} from "@/lib/integrations/whatsapp-campaign-promo.js";
import { PRODUCTS } from "@/lib/api/seed-data.js";
import { shapeProduct } from "@/lib/commerce/products-store.js";
import { triadaAutomationWhatsAppTemplateCatalog } from "@/lib/integrations/whatsapp-cloud-templates.js";

const shaped = PRODUCTS.map((p) => shapeProduct(p));
const top = rankBestSellingProducts(shaped, 3);
if (top.length !== 3) throw new Error("expected 3 bestsellers");
if (top[0].title !== "The Priest Ring") {
  throw new Error(`unexpected #1 bestseller: ${top[0].title}`);
}
for (const p of top) {
  if (!/^https?:\/\//i.test(p.promo_url)) {
    throw new Error(`missing promo url for ${p.title}`);
  }
  if (/triada-designs\.com\/?$/i.test(p.promo_url)) {
    throw new Error(`homepage URL not allowed for ${p.title}: ${p.promo_url}`);
  }
}

const injected = injectPromoUrlsIntoBody(
  "Warm greetings. Shop {{product_url}} and more {{product_urls}}",
  { products: top },
);
if (!injected.body.includes(top[0].promo_url)) {
  throw new Error("inject missed primary product_url");
}

const draft = localHeuristicCampaignDraft({
  products: top,
  objective: "bestseller_promo",
});
for (const p of top) {
  if (!draft.body.includes(p.promo_url)) {
    throw new Error(`draft missing ${p.promo_url}`);
  }
}

const comps = buildPromoComponentsForContact(
  { promo_url: top[0].promo_url, product_urls: top.map((p) => p.promo_url) },
  { name: "Alex" },
  {},
);
const body = comps.find((c) => String(c.type).toLowerCase() === "body");
if (!body?.parameters?.some((p) => String(p.text).includes("myshopify.com"))) {
  throw new Error("body params missing product URL");
}

const catalog = triadaAutomationWhatsAppTemplateCatalog();
const promoTpl = catalog.find((t) => t.name === "promo_product_spotlight");
if (!promoTpl) throw new Error("promo_product_spotlight missing");
if (!promoTpl.variables.includes("product_url")) {
  throw new Error("promo template missing product_url var");
}
if (!promoTpl.components.some((c) => c.type === "BUTTONS")) {
  throw new Error("promo template missing URL button");
}

const vip = catalog.find((t) => t.name === "vip_drop_first_access");
if (!String(vip?.body || "").includes("{{2}}")) {
  throw new Error("vip_drop body missing product URL placeholder");
}

const promo = await resolveCampaignPromoPayload({
  insert_bestsellers: true,
  bestseller_count: 2,
  body: "Hello — {{product_url}}",
});
if (!promo.urls_injected || promo.products.length !== 2) {
  throw new Error("resolveCampaignPromoPayload failed");
}
if (!promo.media.media_url && !promo.media.media_type) {
  // product photos should resolve
  throw new Error("expected product media suggestion");
}

const ai = await draftWhatsAppCampaignWithBestsellers({
  insert_bestsellers: true,
  bestseller_count: 3,
});
if (!ai.ok || !ai.body || !ai.product_urls?.length) {
  throw new Error("AI draft failed");
}
for (const url of ai.product_urls) {
  if (!ai.body.includes(url)) {
    throw new Error(`AI draft body missing ${url}`);
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      bestsellers: top.map((p) => p.title),
      promo_url: promo.promo_url,
      media_type: promo.media.media_type,
      ai_provider: ai.provider,
      suggested_template: ai.suggested_template,
    },
    null,
    2,
  ),
);
