/**
 * Durable manufacturer_orders — push, ack, status tracking.
 * Delivery mode is never local_sim.
 */

import {
  WORKSPACE_ID,
  getManufacturerRow,
  listManufacturerRows,
  newManufacturerId,
  nowIso,
  upsertManufacturerRow,
} from "@/lib/manufacturer/persistence";
import { getPrimaryManufacturerContact } from "@/lib/manufacturer/contacts";
import { estimateManufacturerCost } from "@/lib/manufacturer/materials";
import { sendManufacturerJob } from "@/lib/manufacturer/send";

const TABLE = "manufacturer_orders";

export const MANUFACTURER_STATUSES = [
  "queued",
  "sent",
  "acknowledged",
  "accepted",
  "in_production",
  "ready",
  "shipped",
  "cancelled",
];

/**
 * @param {Partial<object> & Record<string, unknown>} input
 */
export function shapeManufacturerOrder(input = {}) {
  const status = String(input.status || "queued");
  let deliveryMode = String(input.delivery_mode || "awaiting_credentials");
  if (deliveryMode === "local_sim" || deliveryMode === "local_fallback") {
    deliveryMode = "awaiting_credentials";
  }
  return {
    id: String(input.id || newManufacturerId("mfrord")),
    workspace_id: String(input.workspace_id || WORKSPACE_ID),
    commerce_order_id: input.commerce_order_id != null ? String(input.commerce_order_id) : null,
    manufacturer_contact_id:
      input.manufacturer_contact_id != null
        ? String(input.manufacturer_contact_id)
        : null,
    external_ref: input.external_ref != null ? String(input.external_ref) : null,
    status,
    piece: input.piece != null ? String(input.piece) : null,
    sku: input.sku != null ? String(input.sku) : null,
    size: input.size != null ? String(input.size) : null,
    metal: input.metal != null ? String(input.metal) : null,
    engraving: input.engraving != null ? String(input.engraving) : null,
    cost: input.cost != null ? Number(input.cost) : null,
    sell_price: input.sell_price != null ? Number(input.sell_price) : null,
    profit: input.profit != null ? Number(input.profit) : null,
    delivery_mode: deliveryMode,
    provider_message_id:
      input.provider_message_id != null ? String(input.provider_message_id) : null,
    payload:
      input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
        ? input.payload
        : {},
    sent_at: input.sent_at ? String(input.sent_at) : null,
    acked_at: input.acked_at ? String(input.acked_at) : null,
    acked_by: input.acked_by != null ? String(input.acked_by) : null,
    status_updated_at: input.status_updated_at
      ? String(input.status_updated_at)
      : nowIso(),
    created_at: String(input.created_at || nowIso()),
    updated_at: String(input.updated_at || nowIso()),
  };
}

/**
 * @param {object} row
 */
export function presentManufacturerOrder(row) {
  const o = shapeManufacturerOrder(row);
  return {
    id: o.id,
    commerce_order_id: o.commerce_order_id,
    manufacturer_contact_id: o.manufacturer_contact_id,
    external_ref: o.external_ref,
    status: o.status,
    piece: o.piece,
    sku: o.sku,
    size: o.size,
    metal: o.metal,
    engraving: o.engraving,
    cost: o.cost,
    sell_price: o.sell_price,
    profit: o.profit,
    delivery_mode: o.delivery_mode,
    provider_message_id: o.provider_message_id,
    sent_at: o.sent_at,
    acked_at: o.acked_at,
    acked_by: o.acked_by,
    status_updated_at: o.status_updated_at,
    placement_confirmed: Boolean(o.acked_at) || ["acknowledged", "accepted", "in_production", "ready", "shipped"].includes(o.status),
    payload: o.payload,
    created_at: o.created_at,
    updated_at: o.updated_at,
  };
}

export async function listManufacturerOrders(limit = 50) {
  const listed = await listManufacturerRows(TABLE, { limit });
  return {
    data: listed.data.map((r) => presentManufacturerOrder(r)),
    storage: listed.storage,
  };
}

/**
 * Push a paid commerce order to the manufacturer contact.
 * @param {{
 *   commerce_order: object,
 *   manufacturer_contact_id?: string | null,
 * }} input
 */
export async function pushManufacturerOrder(input) {
  const order = input.commerce_order || {};
  const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
  const item = /** @type {Record<string, unknown>} */ (lineItems[0] || {});
  const metal = String(item.metal || "silver_gold_plate");
  const grams = Number(item.grams ?? 8) || 8;
  const { cost } = await estimateManufacturerCost(metal, grams);
  const sell = Number(item.price ?? order.total ?? 0) || 0;
  const profit = Math.round((sell - cost) * 100) / 100;
  const orderNumber = String(order.order_number || order.external_ref || order.id || "order");

  let contact = null;
  if (input.manufacturer_contact_id) {
    const found = await getManufacturerRow(
      "manufacturer_contacts",
      String(input.manufacturer_contact_id),
    );
    contact = found.row;
  }
  if (!contact) {
    const primary = await getPrimaryManufacturerContact();
    contact = primary.contact;
  }

  const externalRef = `MFR-${orderNumber}`;
  const piece = String(item.title || item.name || "Jewellery piece");
  const jobPayload = {
    external_ref: externalRef,
    order_number: orderNumber,
    piece,
    sku: item.sku != null ? String(item.sku) : null,
    size: item.size != null ? String(item.size) : null,
    metal,
    engraving: item.engraving != null ? String(item.engraving) : null,
    grams,
    sell_price: sell,
    currency: String(order.currency || "AED"),
  };

  const delivery = await sendManufacturerJob(contact, jobPayload);
  const liveSent =
    delivery.ok &&
    (delivery.delivery_mode === "email" || delivery.delivery_mode === "whatsapp");

  const shaped = shapeManufacturerOrder({
    id: newManufacturerId("mfrord"),
    commerce_order_id: order.id || null,
    manufacturer_contact_id: contact?.id || null,
    external_ref: externalRef,
    status: liveSent ? "sent" : "queued",
    piece,
    sku: jobPayload.sku,
    size: jobPayload.size,
    metal,
    engraving: jobPayload.engraving,
    cost,
    sell_price: sell,
    profit,
    delivery_mode: delivery.delivery_mode,
    provider_message_id: delivery.provider_message_id,
    sent_at: liveSent ? nowIso() : null,
    payload: {
      order_number: orderNumber,
      line_items: lineItems,
      recipient: delivery.recipient || null,
      channel: delivery.channel || null,
      send_error: delivery.error || null,
      body_preview: delivery.body_preview || null,
      contact_name: contact?.name || null,
      contact_email: contact?.email || null,
    },
  });

  const saved = await upsertManufacturerRow(TABLE, shaped);
  return {
    ok: true,
    manufacturer_order: presentManufacturerOrder(saved.row),
    cost,
    sell_price: sell,
    profit,
    delivery,
    storage: saved.storage,
  };
}

/**
 * Admin confirms the manufacturer received / placed the job.
 * @param {string} id
 * @param {{ acked_by?: string, note?: string }} [opts]
 */
export async function acknowledgeManufacturerOrder(id, opts = {}) {
  const found = await getManufacturerRow(TABLE, id);
  if (!found.row) return { ok: false, error: "not_found" };

  const shaped = shapeManufacturerOrder({
    ...found.row,
    status:
      found.row.status === "queued" || found.row.status === "sent"
        ? "acknowledged"
        : found.row.status,
    acked_at: nowIso(),
    acked_by: opts.acked_by || "admin",
    status_updated_at: nowIso(),
    payload: {
      ...(found.row.payload && typeof found.row.payload === "object"
        ? found.row.payload
        : {}),
      ack_note: opts.note || null,
    },
  });
  // If still awaiting credentials but admin confirms placement, mark recorded.
  if (
    shaped.delivery_mode === "awaiting_credentials" ||
    shaped.delivery_mode === "local_sim"
  ) {
    shaped.delivery_mode = "recorded";
  }
  if (!shaped.sent_at) shaped.sent_at = nowIso();

  const saved = await upsertManufacturerRow(TABLE, shaped);
  return {
    ok: true,
    manufacturer_order: presentManufacturerOrder(saved.row),
    storage: saved.storage,
  };
}

/**
 * @param {string} id
 * @param {{ status: string, note?: string }} input
 */
export async function updateManufacturerOrderStatus(id, input) {
  const status = String(input.status || "").trim();
  if (!MANUFACTURER_STATUSES.includes(status)) {
    return { ok: false, error: "invalid_status", allowed: MANUFACTURER_STATUSES };
  }
  const found = await getManufacturerRow(TABLE, id);
  if (!found.row) return { ok: false, error: "not_found" };

  const shaped = shapeManufacturerOrder({
    ...found.row,
    status,
    status_updated_at: nowIso(),
    acked_at:
      status === "acknowledged" || status === "accepted"
        ? found.row.acked_at || nowIso()
        : found.row.acked_at,
    acked_by:
      status === "acknowledged" || status === "accepted"
        ? found.row.acked_by || "admin"
        : found.row.acked_by,
    payload: {
      ...(found.row.payload && typeof found.row.payload === "object"
        ? found.row.payload
        : {}),
      status_note: input.note || null,
    },
  });

  const saved = await upsertManufacturerRow(TABLE, shaped);
  return {
    ok: true,
    manufacturer_order: presentManufacturerOrder(saved.row),
    storage: saved.storage,
  };
}

/**
 * Resend a queued/awaiting job through the live channel path.
 * @param {string} id
 */
export async function resendManufacturerOrder(id) {
  const found = await getManufacturerRow(TABLE, id);
  if (!found.row) return { ok: false, error: "not_found" };

  let contact = null;
  if (found.row.manufacturer_contact_id) {
    const c = await getManufacturerRow(
      "manufacturer_contacts",
      String(found.row.manufacturer_contact_id),
    );
    contact = c.row;
  }
  if (!contact) {
    const primary = await getPrimaryManufacturerContact();
    contact = primary.contact;
  }

  const payload =
    found.row.payload && typeof found.row.payload === "object"
      ? found.row.payload
      : {};
  const delivery = await sendManufacturerJob(contact, {
    external_ref: String(found.row.external_ref || found.row.id),
    order_number: String(payload.order_number || found.row.commerce_order_id || found.row.id),
    piece: String(found.row.piece || "Jewellery piece"),
    sku: found.row.sku,
    size: found.row.size,
    metal: found.row.metal,
    engraving: found.row.engraving,
    sell_price: found.row.sell_price,
  });

  const liveSent =
    delivery.ok &&
    (delivery.delivery_mode === "email" || delivery.delivery_mode === "whatsapp");

  const shaped = shapeManufacturerOrder({
    ...found.row,
    manufacturer_contact_id: contact?.id || found.row.manufacturer_contact_id,
    status: liveSent ? "sent" : found.row.status === "acknowledged" ? "acknowledged" : "queued",
    delivery_mode: delivery.delivery_mode,
    provider_message_id: delivery.provider_message_id || found.row.provider_message_id,
    sent_at: liveSent ? nowIso() : found.row.sent_at,
    status_updated_at: nowIso(),
    payload: {
      ...payload,
      recipient: delivery.recipient || payload.recipient || null,
      channel: delivery.channel || payload.channel || null,
      send_error: delivery.error || null,
      last_resend_at: nowIso(),
    },
  });

  const saved = await upsertManufacturerRow(TABLE, shaped);
  return {
    ok: true,
    manufacturer_order: presentManufacturerOrder(saved.row),
    delivery,
    storage: saved.storage,
  };
}
