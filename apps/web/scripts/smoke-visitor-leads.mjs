/**
 * Smoke: website / webchat visitor capture → CRM leads.
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-visitor-leads.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import {
  captureVisitorAsLead,
  extractUtmFields,
  findVisitorLead,
  isAllowedVisitorOrigin,
  utmFromPageUrl,
} from "@/lib/crm/visitor-leads.js";
import { getLead, listLeads } from "@/lib/crm/leads-store.js";

const stamp = Date.now().toString(36);
const visitorId = `v_smoke_${stamp}`;

if (!isAllowedVisitorOrigin("https://triada-designs.com", null)) {
  throw new Error("expected triada-designs.com origin allowed");
}
if (!isAllowedVisitorOrigin("https://www.triada-designs.com/shop", null)) {
  throw new Error("expected www subdomain allowed");
}
if (!isAllowedVisitorOrigin("https://dashboard.triada-designs.com/login", null)) {
  throw new Error("expected dashboard origin allowed");
}
if (isAllowedVisitorOrigin("https://evil.example", null)) {
  throw new Error("unexpected allow for evil.example");
}
console.log("ok origin allowlist");

const utm = utmFromPageUrl(
  "https://triada-designs.com/rings?utm_source=ig&utm_medium=social&utm_campaign=spring",
);
if (utm.utm_source !== "ig" || utm.utm_campaign !== "spring") {
  throw new Error(`utmFromPageUrl failed: ${JSON.stringify(utm)}`);
}
const merged = extractUtmFields({
  utm_source: "newsletter",
  page: "https://triada-designs.com/?utm_source=ig",
});
if (merged.utm_source !== "newsletter") {
  throw new Error("extractUtmFields should prefer body utm_source");
}
console.log("ok utm helpers");

const first = await captureVisitorAsLead({
  visitor_id: visitorId,
  page: `https://triada-designs.com/collections/new?utm_source=google&utm_medium=cpc&utm_campaign=smoke-${stamp}`,
  referrer: "https://www.google.com/",
  source: "website",
});
if (!first.ok || !first.created || !first.lead?.id) {
  throw new Error(`first capture failed: ${JSON.stringify(first)}`);
}
if (first.lead.source_channel !== "website") {
  throw new Error(`expected source_channel website, got ${first.lead.source_channel}`);
}
if (first.lead.metadata?.utm_source !== "google") {
  throw new Error(`expected utm_source google in metadata: ${JSON.stringify(first.lead.metadata)}`);
}
if (first.lead.metadata?.referrer !== "https://www.google.com/") {
  throw new Error("referrer missing on lead metadata");
}
console.log("ok pageview lead", first.lead.id);

const second = await captureVisitorAsLead({
  visitor_id: visitorId,
  page: "https://triada-designs.com/about",
  referrer: "https://triada-designs.com/collections/new",
  email: `visitor.smoke+${stamp}@example.com`,
  name: "Smoke Visitor",
  source: "webchat",
});
if (!second.ok || second.created) {
  throw new Error(`expected upsert (not create) on same visitor: ${JSON.stringify(second)}`);
}
if (second.lead.id !== first.lead.id) {
  throw new Error("visitor_id dedupe failed — new lead created");
}
if (second.lead.contact_email !== `visitor.smoke+${stamp}@example.com`) {
  throw new Error(`email not stored: ${second.lead.contact_email}`);
}
if (second.lead.metadata?.page !== "https://triada-designs.com/about") {
  throw new Error("page not updated on revisit");
}
if (second.lead.metadata?.landing_page !== first.lead.metadata?.landing_page) {
  throw new Error("landing_page should stay sticky from first hit");
}
console.log("ok dedupe + email enrich", second.lead.id);

const found = await findVisitorLead({ visitor_id: visitorId });
if (!found.lead || found.lead.id !== first.lead.id) {
  throw new Error("findVisitorLead by visitor_id failed");
}
const byEmail = await findVisitorLead({
  email: `visitor.smoke+${stamp}@example.com`,
});
if (!byEmail.lead || byEmail.lead.id !== first.lead.id) {
  throw new Error("findVisitorLead by email failed");
}

const listed = await listLeads({ q: stamp });
const hit = listed.data.find((row) => row.id === first.lead.id);
if (!hit) {
  throw new Error("listLeads did not return captured lead");
}
const loaded = await getLead(first.lead.id);
if (!loaded?.metadata?.visitor_id) {
  throw new Error("getLead missing visitor metadata");
}

console.log("SMOKE_PASS visitor-leads", first.lead.id, listed.mode);
