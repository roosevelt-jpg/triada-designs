/**
 * Smoke: list search helpers + store/API q filters for Inbox-adjacent lists.
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-list-search.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import { matchesListQuery } from "@/lib/list-search.js";
import { listProducts, upsertProduct } from "@/lib/commerce/products-store.js";
import { listLeads, upsertLead } from "@/lib/crm/leads-store.js";

const stamp = Date.now().toString(36);

if (!matchesListQuery(["Alice Smith", "whatsapp", "need size 54"], "alice")) {
  throw new Error("expected name match");
}
if (!matchesListQuery(["Alice", "instagram", "hello"], "Instagram")) {
  throw new Error("expected channel match (case-insensitive)");
}
if (!matchesListQuery(["Bob", "email", "looking for gold band"], "gold band")) {
  throw new Error("expected snippet match");
}
if (matchesListQuery(["Carol", "telegram", "hi"], "whatsapp")) {
  throw new Error("unexpected false-positive match");
}
if (!matchesListQuery(["x"], "")) {
  throw new Error("empty query should match all");
}
console.log("ok matchesListQuery");

const product = await upsertProduct({
  title: `Smoke Search Ring ${stamp}`,
  sku: `SKU-SRCH-${stamp}`,
  description: `Hand-carved smoke search ${stamp}`,
  price: 120,
  currency: "AED",
  metadata: {
    specs: {
      collection: `SearchColl-${stamp}`,
      category: "Rings",
      metal: "18K gold",
    },
  },
});
if (!product?.product?.id && !product?.id) {
  // upsertProduct may return { product, created } or the record
}
const productId = product?.product?.id || product?.id;
if (!productId) {
  throw new Error(`product upsert failed: ${JSON.stringify(product)}`);
}

const byTitle = await listProducts({ q: `Smoke Search Ring ${stamp}` });
if (!byTitle.data.some((p) => p.id === productId)) {
  throw new Error("products q by title missed upserted row");
}
const bySku = await listProducts({ q: `SKU-SRCH-${stamp}` });
if (!bySku.data.some((p) => p.id === productId)) {
  throw new Error("products q by sku missed upserted row");
}
const byCollection = await listProducts({ q: `SearchColl-${stamp}` });
if (!byCollection.data.some((p) => p.id === productId)) {
  throw new Error("products q by collection missed upserted row");
}
const missProduct = await listProducts({ q: `zzz-no-such-${stamp}` });
if (missProduct.data.some((p) => p.id === productId)) {
  throw new Error("products q should exclude non-matching row");
}
console.log("ok products q filter", productId);

const leadResult = await upsertLead({
  title: `Smoke Search Lead ${stamp}`,
  contact_name: `Search Contact ${stamp}`,
  contact_email: `search.${stamp}@example.com`,
  contact_phone: `+9715000${String(stamp).slice(-4)}`,
  source_channel: "instagram",
  stage: "new_lead",
});
const leadId = leadResult?.lead?.id || leadResult?.id;
if (!leadId) {
  throw new Error(`lead upsert failed: ${JSON.stringify(leadResult)}`);
}

const byLeadName = await listLeads({ q: `Search Contact ${stamp}` });
if (!byLeadName.data.some((l) => l.id === leadId)) {
  throw new Error("leads q by contact name missed upserted row");
}
const byLeadChannel = await listLeads({ q: "instagram" });
if (!byLeadChannel.data.some((l) => l.id === leadId)) {
  throw new Error("leads q by channel missed upserted row");
}
const byLeadPhone = await listLeads({
  q: `+9715000${String(stamp).slice(-4)}`,
});
if (!byLeadPhone.data.some((l) => l.id === leadId)) {
  throw new Error("leads q by phone missed upserted row");
}
const missLead = await listLeads({ q: `zzz-no-such-${stamp}` });
if (missLead.data.some((l) => l.id === leadId)) {
  throw new Error("leads q should exclude non-matching row");
}
console.log("ok leads q filter", leadId);

console.log("smoke-list-search: all ok");
