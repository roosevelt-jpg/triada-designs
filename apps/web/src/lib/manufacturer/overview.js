/**
 * Manufacturer board overview for GET /jewellery-ops/manufacturer.
 */

import { listManufacturerContacts } from "@/lib/manufacturer/contacts";
import {
  checkLowStock,
  ensureManufacturerMaterials,
} from "@/lib/manufacturer/materials";
import { listManufacturerOrders } from "@/lib/manufacturer/jobs";

export async function getManufacturerOverview() {
  const [materials, orders, contacts, lowStock] = await Promise.all([
    ensureManufacturerMaterials(),
    listManufacturerOrders(50),
    listManufacturerContacts(),
    checkLowStock(),
  ]);

  const openJobs = orders.data.filter((o) =>
    ["queued", "sent", "acknowledged", "accepted", "in_production", "ready"].includes(
      String(o.status),
    ),
  ).length;

  const awaitingAck = orders.data.filter(
    (o) =>
      !o.placement_confirmed &&
      ["queued", "sent"].includes(String(o.status)),
  ).length;

  return {
    materials: materials.data,
    orders: orders.data,
    contacts: contacts.data,
    low_stock: lowStock,
    low_stock_alerts: lowStock,
    open_jobs: openJobs,
    awaiting_ack: awaitingAck,
    honesty:
      "Manufacturer board — contacts, durable jobs, ack/status. Outbound uses email/WhatsApp when credentials are live.",
    storage: materials.storage,
  };
}
