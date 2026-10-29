/**
 * Order lifecycle + where-is-my-order + after-sale scheduling on deliver.
 */

import { AI_DISCLOSURE } from "@/lib/jewellery-ops/knowledge";
import { deliverJewelleryMessage } from "@/lib/jewellery-ops/delivery";
import { sendTelegramAlert } from "@/lib/jewellery-ops/telegram-alerts";
import { scheduleAfterSaleJobs } from "@/lib/jewellery-ops/after-sale";
import {
  getJewelleryOpsRecord,
  listJewelleryOpsRecords,
  newJewelleryOpsId,
  upsertJewelleryOpsRecord,
} from "@/lib/jewellery-ops/store";

const STATUS_COPY = {
  received: "We received your order and are confirming details.",
  confirmed: "Your order is confirmed.",
  in_production: "Your piece is with the manufacturer — about 7 days to make.",
  shipped: "Your order has shipped.",
  delivered: "Your order was delivered. We're here if you need care tips.",
  cancelled: "This order was cancelled.",
};

/**
 * @param {Record<string, unknown>} input
 */
export async function upsertCommerceOrder(input = {}) {
  const id = input.id ? String(input.id) : newJewelleryOpsId("ord");
  const existing = input.id ? await getJewelleryOpsRecord(String(input.id)) : { record: null };
  const prev = existing.record?.payload || {};
  const status = String(input.status || input.lifecycle_status || prev.lifecycle_status || "received");
  const optIn = input.whatsapp_opt_in === true || prev.whatsapp_opt_in === true;
  const total = Number(input.total ?? prev.total ?? 0);

  const saved = await upsertJewelleryOpsRecord({
    id,
    kind: "commerce_order",
    status,
    payload: {
      ...prev,
      order_number: input.order_number || input.external_ref || prev.order_number || id,
      external_ref: input.external_ref || prev.external_ref || null,
      channel: input.channel || prev.channel || "shopify",
      lifecycle_status: status,
      currency: input.currency || prev.currency || "AED",
      total,
      customer_name: input.customer_name || prev.customer_name || null,
      customer_phone: input.customer_phone || input.phone || prev.customer_phone || null,
      customer_email: input.customer_email || input.email || prev.customer_email || null,
      whatsapp_opt_in: optIn,
      tracking_number: input.tracking_number || prev.tracking_number || null,
      tracking_url: input.tracking_url || prev.tracking_url || null,
      line_items: Array.isArray(input.line_items) ? input.line_items : prev.line_items || [],
      [`${status}_at`]: new Date().toISOString(),
    },
  });

  const copy = STATUS_COPY[status] || STATUS_COPY.confirmed;
  const body = `${AI_DISCLOSURE} ${copy}`;
  let delivery = null;
  if (optIn || saved.record.payload.customer_email) {
    delivery = await deliverJewelleryMessage({
      channel: optIn ? "whatsapp" : "email",
      whatsapp_opt_in: optIn,
      phone: saved.record.payload.customer_phone
        ? String(saved.record.payload.customer_phone)
        : undefined,
      to: saved.record.payload.customer_phone
        ? String(saved.record.payload.customer_phone)
        : undefined,
      email: saved.record.payload.customer_email
        ? String(saved.record.payload.customer_email)
        : undefined,
      body,
      subject: `Triada Designs order ${saved.record.payload.order_number}`,
      template_name: optIn ? "order_lifecycle_update" : undefined,
    });
  }

  let bigOrderAlert = null;
  if (total >= 5000 || Number(input.quantity || 0) >= 20) {
    bigOrderAlert = await sendTelegramAlert({
      alert_type: "big_order",
      title: `Big order ${saved.record.payload.order_number}`,
      body: `Total ${total} ${saved.record.payload.currency}`,
    });
  }

  let afterSale = null;
  if (status === "delivered") {
    afterSale = await scheduleAfterSaleJobs({
      contact_id: input.contact_id || null,
      order_id: saved.record.id,
      phone: saved.record.payload.customer_phone,
      email: saved.record.payload.customer_email,
      whatsapp_opt_in: optIn,
      language: input.language || "en",
    });
  }

  return {
    ok: true,
    order: {
      id: saved.record.id,
      status,
      external_ref: saved.record.payload.order_number,
      ...saved.record.payload,
    },
    delivery,
    big_order_alert: bigOrderAlert,
    after_sale: afterSale,
    storage: saved.storage,
  };
}

/**
 * @param {Record<string, unknown>} input
 */
export async function whereIsMyOrder(input = {}) {
  const query = String(input.query || input.order_number || input.external_ref || "").trim();
  const listed = await listJewelleryOpsRecords({ kind: "commerce_order", limit: 100 });
  let order = listed.data.find((r) => {
    const p = r.payload || {};
    return (
      r.id === query ||
      String(p.order_number || "") === query ||
      String(p.external_ref || "") === query
    );
  });
  if (!order && listed.data.length) order = listed.data[0];

  if (!order) {
    return {
      ok: true,
      query,
      order: null,
      message: `${AI_DISCLOSURE} I couldn't find that order yet — share the order number and a person can look it up.`,
    };
  }

  const status = String(order.payload?.lifecycle_status || order.status || "in_production");
  const eta =
    status === "in_production" || status === "confirmed" || status === "received" ? 5 : null;
  return {
    ok: true,
    query,
    order: {
      id: order.id,
      status,
      eta_days: eta,
      external_ref: order.payload?.order_number || order.id,
      tracking_url: order.payload?.tracking_url || null,
    },
    message: `${AI_DISCLOSURE} ${STATUS_COPY[status] || STATUS_COPY.in_production}${
      eta ? ` About ${eta} days remaining.` : ""
    }`,
  };
}

export async function listCommerceOrders() {
  const listed = await listJewelleryOpsRecords({ kind: "commerce_order", limit: 100 });
  return {
    data: listed.data.map((r) => ({
      id: r.id,
      external_ref: r.payload?.order_number || r.id,
      status: r.payload?.lifecycle_status || r.status,
      customer_name: r.payload?.customer_name || null,
      total: r.payload?.total ?? null,
      currency: r.payload?.currency || "AED",
    })),
    storage: listed.storage,
  };
}
