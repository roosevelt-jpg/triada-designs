/**
 * After-sale care / review / complete-the-set / UGC invite jobs.
 */

import { AI_DISCLOSURE } from "@/lib/jewellery-ops/knowledge";
import { deliverJewelleryMessage } from "@/lib/jewellery-ops/delivery";
import { listProducts } from "@/lib/commerce/products-store";
import {
  listJewelleryOpsRecords,
  newJewelleryOpsId,
  upsertJewelleryOpsRecord,
} from "@/lib/jewellery-ops/store";

const BODIES = {
  en: {
    care_tips: `${AI_DISCLOSURE} Care tip: store dry, avoid harsh chemicals and perfume on metal, gently wipe with a soft cloth.`,
    review_request: `${AI_DISCLOSURE} If you are happy with your piece, a short review helps other clients — only if you wish.`,
    complete_the_set: `${AI_DISCLOSURE} A gentle complete-the-set idea from our approved collection.`,
    ugc_invite: `${AI_DISCLOSURE} We would love a photo or reel tagging Triada Designs — small thank-you (discount or feature) when you share.`,
    default: `${AI_DISCLOSURE} After-sale follow-up from Triada Designs.`,
  },
};

/**
 * @param {Record<string, unknown>} input
 */
export async function scheduleAfterSaleJobs(input = {}) {
  const base = Date.now();
  const contactId = input.contact_id || null;
  const orderId = input.order_id || input.commerce_order_id || null;
  const phone = input.phone || null;
  const email = input.email || null;
  const optIn = input.whatsapp_opt_in === true;
  const language = String(input.language || "en");

  const plan = [
    { job_type: "care_tips", delay_ms: 2 * 86400000 },
    { job_type: "review_request", delay_ms: 5 * 86400000 },
    { job_type: "complete_the_set", delay_ms: 7 * 86400000 },
    { job_type: "ugc_invite", delay_ms: 10 * 86400000 },
  ];

  const jobs = [];
  for (const step of plan) {
    const id = newJewelleryOpsId("aftersale");
    const runAt = new Date(base + step.delay_ms).toISOString();
    const saved = await upsertJewelleryOpsRecord({
      id,
      kind: "after_sale",
      status: "scheduled",
      run_at: runAt,
      payload: {
        job_type: step.job_type,
        contact_id: contactId,
        commerce_order_id: orderId,
        phone,
        email,
        whatsapp_opt_in: optIn,
        language,
        channel: optIn ? "whatsapp" : "email",
      },
    });
    jobs.push(saved.record);
  }
  return { ok: true, jobs, scheduled: jobs.length };
}

/**
 * @param {string} lang
 * @param {string} jobType
 */
function bodyFor(lang, jobType) {
  const table = BODIES[lang] || BODIES.en;
  return table[jobType] || table.default;
}

/**
 * @param {{ limit?: number }} [opts]
 */
export async function processDueAfterSale(opts = {}) {
  const now = new Date().toISOString();
  const listed = await listJewelleryOpsRecords({
    kind: "after_sale",
    status: "scheduled",
    due_before: now,
    limit: Math.min(Number(opts.limit) || 50, 50),
  });

  const results = [];
  for (const row of listed.data) {
    const payload = row.payload || {};
    const jobType = String(payload.job_type || "care_tips");
    const lang = String(payload.language || "en");
    let body = bodyFor(lang, jobType);
    /** @type {unknown[]} */
    let suggestions = [];

    if (jobType === "complete_the_set") {
      const products = await listProducts();
      suggestions = products.data
        .filter((p) => p.published_status === "published")
        .slice(0, 2)
        .map((p) => ({
          sku: p.sku,
          title: p.title,
          price: p.price,
          currency: p.currency,
          product_url: p.product_url,
        }));
      if (suggestions.length) {
        const lines = suggestions
          .map((s) => `• ${s.title} (${s.price} ${s.currency}) ${s.product_url}`)
          .join("\n");
        body = `${body}\n${lines}`;
      }
    }

    const optIn = payload.whatsapp_opt_in === true;
    const delivery = await deliverJewelleryMessage({
      channel: optIn ? "whatsapp" : String(payload.channel || "email"),
      whatsapp_opt_in: optIn,
      phone: payload.phone ? String(payload.phone) : undefined,
      to: payload.phone ? String(payload.phone) : undefined,
      email: payload.email ? String(payload.email) : undefined,
      body,
      subject: `Triada Designs — ${jobType.replaceAll("_", " ")}`,
      template_name: optIn
        ? jobType === "care_tips"
          ? "after_sale_care"
          : jobType === "review_request"
            ? "after_sale_review"
            : jobType === "complete_the_set"
              ? "after_sale_complete_set"
              : jobType === "ugc_invite"
                ? "ugc_invite"
                : undefined
        : undefined,
    });

    if (jobType === "ugc_invite") {
      await upsertJewelleryOpsRecord({
        id: newJewelleryOpsId("ugc"),
        kind: "ugc",
        status: "new",
        payload: {
          item_type: "invite",
          contact_id: payload.contact_id || null,
          commerce_order_id: payload.commerce_order_id || null,
          reward_offer:
            "Thank-you discount or feature on our page (subject to approval).",
          source: "after_sale",
        },
      });
    }

    const updated = await upsertJewelleryOpsRecord({
      ...row,
      status: "sent",
      payload: {
        ...payload,
        sent_at: now,
        body,
        language: lang,
        suggestions,
        delivery: {
          channel: delivery.channel,
          mode: delivery.mode,
          provider_message_id: delivery.provider_message_id || null,
          error: delivery.error || null,
        },
      },
    });

    results.push({
      id: updated.record.id,
      job_type: jobType,
      status: "sent",
      delivery,
    });
  }

  return {
    ok: true,
    worker: "after_sale",
    processed: results.length,
    jobs: results,
    storage: listed.storage,
  };
}

export async function listAfterSaleJobs() {
  const listed = await listJewelleryOpsRecords({ kind: "after_sale", limit: 100 });
  return {
    data: listed.data.map((r) => ({
      id: r.id,
      status: r.status,
      run_at: r.run_at,
      ...r.payload,
    })),
    storage: listed.storage,
  };
}
