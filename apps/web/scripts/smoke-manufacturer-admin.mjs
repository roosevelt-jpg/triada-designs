/**
 * Smoke: manufacturer contacts, paid order push, ack + status (no local_sim).
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-manufacturer-admin.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";
process.env.TRIADA_ALLOW_EMAIL_FALLBACK = "1";

import {
  acknowledgeManufacturerOrder,
  getManufacturerOverview,
  listManufacturerContacts,
  updateManufacturerOrderStatus,
  upsertCommerceOrder,
  upsertManufacturerContact,
} from "@/lib/manufacturer/index.js";

const contact = await upsertManufacturerContact({
  name: "Smoke Workshop",
  company: "Smoke Mfr Co",
  email: "smoke-workshop@example.com",
  phone: "+971501112233",
  preferred_channel: "email",
  is_primary: true,
});
if (!contact.ok || !contact.contact?.email) {
  throw new Error(`contact upsert failed: ${JSON.stringify(contact)}`);
}
console.log("ok contact", {
  id: contact.contact.id,
  storage: contact.storage,
  primary: contact.contact.is_primary,
});

const listed = await listManufacturerContacts();
if (!listed.data.some((c) => c.id === contact.contact.id)) {
  throw new Error("contact missing from directory");
}
console.log("ok directory", { count: listed.data.length });

const created = await upsertCommerceOrder({
  lifecycle_status: "confirmed",
  paid: true,
  total: 890,
  currency: "AED",
  customer_email: "client@example.com",
  customer_name: "Smoke Client",
  line_items: [
    {
      sku: "TD-RING-AURA-01",
      title: "Aura Signet Ring",
      size: "54",
      metal: "silver_gold_plate",
      price: 890,
      grams: 8,
      engraving: "S",
    },
  ],
});

const mfr = created.manufacturer_order?.manufacturer_order || created.manufacturer_order;
if (!mfr?.id) {
  throw new Error(`expected manufacturer_order: ${JSON.stringify(created)}`);
}
if (mfr.delivery_mode === "local_sim") {
  throw new Error(`delivery_mode must not be local_sim: ${mfr.delivery_mode}`);
}
if (!["queued", "sent"].includes(mfr.status)) {
  throw new Error(`unexpected initial status: ${mfr.status}`);
}
if (mfr.cost == null || mfr.profit == null) {
  throw new Error(`expected cost/profit: ${JSON.stringify(mfr)}`);
}
console.log("ok paid push", {
  order: created.order?.order_number,
  mfr: mfr.external_ref,
  status: mfr.status,
  delivery_mode: mfr.delivery_mode,
  cost: mfr.cost,
  profit: mfr.profit,
  storage: created.storage,
});

const ack = await acknowledgeManufacturerOrder(mfr.id, {
  acked_by: "smoke@triada-designs.com",
  note: "Confirmed with workshop",
});
if (!ack.ok || !ack.manufacturer_order?.acked_at) {
  throw new Error(`ack failed: ${JSON.stringify(ack)}`);
}
if (!ack.manufacturer_order.placement_confirmed) {
  throw new Error("placement_confirmed should be true after ack");
}
if (ack.manufacturer_order.delivery_mode === "local_sim") {
  throw new Error("ack must not set local_sim");
}
console.log("ok ack", {
  status: ack.manufacturer_order.status,
  delivery_mode: ack.manufacturer_order.delivery_mode,
});

const status = await updateManufacturerOrderStatus(mfr.id, {
  status: "in_production",
});
if (!status.ok || status.manufacturer_order?.status !== "in_production") {
  throw new Error(`status update failed: ${JSON.stringify(status)}`);
}
console.log("ok status", { status: status.manufacturer_order.status });

const overview = await getManufacturerOverview();
if (!(overview.orders || []).some((o) => o.id === mfr.id)) {
  throw new Error("overview missing manufacturer order");
}
if (!(overview.contacts || []).length) {
  throw new Error("overview missing contacts");
}
if (!(overview.materials || []).length) {
  throw new Error("overview missing materials");
}
const boardOrder = overview.orders.find((o) => o.id === mfr.id);
if (boardOrder.delivery_mode === "local_sim") {
  throw new Error("board still shows local_sim");
}
console.log("ok overview", {
  open_jobs: overview.open_jobs,
  materials: overview.materials.length,
  contacts: overview.contacts.length,
  orders: overview.orders.length,
});

console.log("smoke-manufacturer-admin: PASS");
