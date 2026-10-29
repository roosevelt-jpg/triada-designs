/**
 * Commerce orders for admin /orders — durable Next+Supabase path.
 * Paid create triggers invoice doc + manufacturer push (not local_sim).
 */

import {
  WORKSPACE_ID,
  getManufacturerRow,
  listManufacturerRows,
  newManufacturerId,
  nowIso,
  upsertManufacturerRow,
} from "@/lib/manufacturer/persistence";
import { pushManufacturerOrder } from "@/lib/manufacturer/jobs";
import {
  parseLineItemsPlainText,
  upsertInvoiceDoc,
} from "@/lib/invoices/invoice-docs-store";

const TABLE = "commerce_orders";

/**
 * @param {Partial<object> & Record<string, unknown>} input
 */
export function shapeCommerceOrder(input = {}) {
  const status = String(
    input.lifecycle_status || input.status || "confirmed",
  );
  const lineItems = Array.isArray(input.line_items)
    ? input.line_items
    : typeof input.line_items_text === "string"
      ? parseLineItemsPlainText(input.line_items_text)
      : [];
  const total = Number(input.total ?? input.amount ?? 0) || 0;
  const orderNumber =
    String(input.order_number || input.external_ref || "").trim() ||
    `TD-${Date.now().toString().slice(-6)}`;

  return {
    id: String(input.id || newManufacturerId("ord")),
    workspace_id: String(input.workspace_id || WORKSPACE_ID),
    order_number: orderNumber,
    external_ref: input.external_ref != null ? String(input.external_ref) : orderNumber,
    channel: String(input.channel || "dashboard"),
    lifecycle_status: status,
    currency: String(input.currency || "AED"),
    subtotal: Number(input.subtotal ?? total) || 0,
    total,
    cost_total: input.cost_total != null ? Number(input.cost_total) : null,
    profit: input.profit != null ? Number(input.profit) : null,
    paid: input.paid === true || status === "paid" || status === "confirmed",
    whatsapp_opt_in: input.whatsapp_opt_in === true,
    customer_name:
      input.customer_name != null ? String(input.customer_name) : null,
    customer_phone:
      input.customer_phone != null
        ? String(input.customer_phone)
        : input.phone != null
          ? String(input.phone)
          : null,
    customer_email:
      input.customer_email != null
        ? String(input.customer_email)
        : input.email != null
          ? String(input.email)
          : null,
    tracking_number:
      input.tracking_number != null ? String(input.tracking_number) : null,
    tracking_url: input.tracking_url != null ? String(input.tracking_url) : null,
    line_items: lineItems,
    metadata:
      input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    confirmed_at:
      status === "confirmed" || input.paid === true
        ? String(input.confirmed_at || nowIso())
        : input.confirmed_at || null,
    in_production_at:
      status === "in_production"
        ? String(input.in_production_at || nowIso())
        : input.in_production_at || null,
    shipped_at:
      status === "shipped"
        ? String(input.shipped_at || nowIso())
        : input.shipped_at || null,
    delivered_at:
      status === "delivered"
        ? String(input.delivered_at || nowIso())
        : input.delivered_at || null,
    created_at: String(input.created_at || nowIso()),
    updated_at: String(input.updated_at || nowIso()),
  };
}

export async function listCommerceOrders() {
  const listed = await listManufacturerRows(TABLE, { limit: 100 });
  return {
    data: listed.data.map((r) => presentCommerceOrder(r)),
    storage: listed.storage,
  };
}

/**
 * @param {object} row
 */
export function presentCommerceOrder(row) {
  const shaped = shapeCommerceOrder(row);
  return {
    id: shaped.id,
    order_number: shaped.order_number,
    external_ref: shaped.external_ref,
    status: shaped.lifecycle_status,
    lifecycle_status: shaped.lifecycle_status,
    customer_name: shaped.customer_name,
    customer_email: shaped.customer_email,
    customer_phone: shaped.customer_phone,
    total: shaped.total,
    currency: shaped.currency,
    cost_total: shaped.cost_total,
    profit: shaped.profit,
    paid: shaped.paid,
    channel: shaped.channel,
    line_items: shaped.line_items,
    manufacturer_order_id: shaped.metadata?.manufacturer_order_id || null,
    created_at: shaped.created_at,
    updated_at: shaped.updated_at,
  };
}

/**
 * Create/update a commerce order. When paid/confirmed, issue invoice + push manufacturer.
 * @param {Record<string, unknown>} input
 */
export async function upsertCommerceOrder(input = {}) {
  const existingId = input.id ? String(input.id) : "";
  const existing = existingId
    ? await getManufacturerRow(TABLE, existingId)
    : { row: null };

  const shaped = shapeCommerceOrder({
    ...(existing.row || {}),
    ...input,
    id: existingId || newManufacturerId("ord"),
    created_at: existing.row?.created_at,
    metadata: {
      ...((existing.row && existing.row.metadata) || {}),
      ...((input.metadata && typeof input.metadata === "object" && input.metadata) || {}),
    },
  });

  const saved = await upsertManufacturerRow(TABLE, shaped);
  const order = shapeCommerceOrder(saved.row);

  let afterSale = null;
  if (order.lifecycle_status === "delivered") {
    try {
      const { scheduleAfterSaleJobs } = await import("@/lib/jewellery-ops/after-sale");
      afterSale = await scheduleAfterSaleJobs({
        contact_id: input.contact_id || null,
        order_id: order.id,
        phone: order.customer_phone,
        email: order.customer_email,
        whatsapp_opt_in: order.whatsapp_opt_in === true,
        language: input.language || "en",
      });
    } catch {
      afterSale = null;
    }
  }

  let invoice = null;
  const shouldInvoice =
    order.paid ||
    ["confirmed", "paid", "in_production"].includes(order.lifecycle_status);

  if (shouldInvoice) {
    const inv = await upsertInvoiceDoc({
      order_id: order.id,
      number: `INV-${order.order_number}`,
      customer_name: order.customer_name || "Customer",
      customer_email: order.customer_email || "",
      currency: order.currency,
      total: order.total,
      status: "issued",
      line_items: (order.line_items || []).map((li) => ({
        title: li.title || li.name || "Item",
        sku: li.sku || "",
        qty: Number(li.qty ?? li.quantity ?? 1) || 1,
        price: Number(li.price ?? li.amount ?? 0) || 0,
      })),
      notes: `Order ${order.order_number}`,
      source: "orders_admin",
    });
    invoice = inv.doc;
  }

  let manufacturer = null;
  if (shouldInvoice || order.paid) {
    manufacturer = await pushManufacturerOrder({
      commerce_order: order,
      manufacturer_contact_id: input.manufacturer_contact_id || null,
    });

    if (manufacturer?.manufacturer_order?.id) {
      const withMeta = shapeCommerceOrder({
        ...order,
        cost_total: manufacturer.cost ?? order.cost_total,
        profit: manufacturer.profit ?? order.profit,
        lifecycle_status:
          order.lifecycle_status === "confirmed" || order.lifecycle_status === "paid"
            ? "in_production"
            : order.lifecycle_status,
        in_production_at: nowIso(),
        metadata: {
          ...order.metadata,
          manufacturer_order_id: manufacturer.manufacturer_order.id,
          manufacturer_external_ref: manufacturer.manufacturer_order.external_ref,
          manufacturer_delivery_mode: manufacturer.manufacturer_order.delivery_mode,
        },
      });
      const updated = await upsertManufacturerRow(TABLE, withMeta);
      return {
        ok: true,
        order: presentCommerceOrder(updated.row),
        invoice: invoice
          ? {
              invoice: {
                id: invoice.id,
                invoice_number: invoice.number,
                status: invoice.status,
                amount: invoice.total,
                currency: invoice.currency,
              },
              ...invoice,
            }
          : null,
        manufacturer_order: manufacturer,
        after_sale: afterSale,
        storage: updated.storage,
      };
    }
  }

  return {
    ok: true,
    order: presentCommerceOrder(order),
    invoice: invoice
      ? {
          invoice: {
            id: invoice.id,
            invoice_number: invoice.number,
            status: invoice.status,
            amount: invoice.total,
            currency: invoice.currency,
          },
          ...invoice,
        }
      : null,
    manufacturer_order: manufacturer,
    after_sale: afterSale,
    storage: saved.storage,
  };
}

/**
 * @param {Record<string, unknown>} input
 */
export async function whereIsMyOrder(input = {}) {
  const query = String(input.query || input.order_number || input.external_ref || "")
    .trim()
    .toLowerCase();
  const listed = await listCommerceOrders();
  let order = listed.data.find((o) => {
    return (
      String(o.id).toLowerCase() === query ||
      String(o.order_number || "").toLowerCase() === query ||
      String(o.external_ref || "").toLowerCase() === query ||
      String(o.customer_email || "").toLowerCase() === query ||
      String(o.customer_phone || "").replace(/\D+/g, "") === query.replace(/\D+/g, "")
    );
  });
  if (!order && listed.data.length && !query) order = listed.data[0];

  if (!order) {
    return {
      ok: true,
      query,
      order: null,
      reply: "I couldn't find that order yet — share the order number and a person can look it up.",
      message:
        "I couldn't find that order yet — share the order number and a person can look it up.",
    };
  }

  const status = order.lifecycle_status || order.status || "in_production";
  const copy = {
    received: "We received your order and are confirming details.",
    confirmed: "Your order is confirmed.",
    in_production: "Your piece is with the manufacturer — about 7 days to make.",
    shipped: "Your order has shipped.",
    delivered: "Your order was delivered. We're here if you need care tips.",
    cancelled: "This order was cancelled.",
  };
  const eta =
    status === "in_production" || status === "confirmed" || status === "received"
      ? 5
      : null;
  const message = `${copy[status] || copy.in_production}${
    eta ? ` About ${eta} days remaining.` : ""
  }`;

  return {
    ok: true,
    query,
    order: {
      id: order.id,
      status,
      eta_days: eta,
      external_ref: order.order_number || order.id,
      tracking_url: order.tracking_url || null,
    },
    reply: message,
    message,
  };
}
