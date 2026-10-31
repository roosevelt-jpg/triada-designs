/**
 * Capture website / webchat / popup visitors as CRM leads (crm_leads).
 * Dual-run via upsertLead — no new auth or tables.
 */

import { extractEmail } from "@/lib/crm/extract-contact-fields";
import { listLeads, upsertLead } from "@/lib/crm/leads-store";

const SOURCE_CHANNELS = new Set([
  "website",
  "webchat",
  "popup",
  "triada_site",
]);

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function cleanText(value) {
  const text = String(value || "").trim();
  return text || null;
}

/**
 * @param {string | null | undefined} page
 * @returns {string | null}
 */
function pagePathLabel(page) {
  const raw = cleanText(page);
  if (!raw) return null;
  try {
    const url = new URL(raw, "https://triada-designs.com");
    const path = `${url.pathname || "/"}${url.search || ""}`;
    return path.length > 120 ? `${path.slice(0, 117)}…` : path;
  } catch {
    return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
  }
}

/**
 * @param {Record<string, unknown>} input
 * @returns {Record<string, string | null>}
 */
export function extractUtmFields(input = {}) {
  const keys = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
  ];
  /** @type {Record<string, string | null>} */
  const out = {};
  for (const key of keys) {
    const direct = cleanText(input[key]);
    if (direct) {
      out[key] = direct;
      continue;
    }
    const nested =
      input.utm && typeof input.utm === "object"
        ? /** @type {Record<string, unknown>} */ (input.utm)[key.replace(/^utm_/, "")]
        : null;
    const nestedFull =
      input.utm && typeof input.utm === "object"
        ? /** @type {Record<string, unknown>} */ (input.utm)[key]
        : null;
    out[key] = cleanText(nestedFull) || cleanText(nested);
  }
  return out;
}

/**
 * Pull UTM params from a page URL when the client omitted them.
 * @param {string | null | undefined} page
 * @returns {Record<string, string | null>}
 */
export function utmFromPageUrl(page) {
  const raw = cleanText(page);
  if (!raw) {
    return extractUtmFields({});
  }
  try {
    const url = new URL(raw, "https://triada-designs.com");
    return extractUtmFields({
      utm_source: url.searchParams.get("utm_source"),
      utm_medium: url.searchParams.get("utm_medium"),
      utm_campaign: url.searchParams.get("utm_campaign"),
      utm_term: url.searchParams.get("utm_term"),
      utm_content: url.searchParams.get("utm_content"),
    });
  } catch {
    return extractUtmFields({});
  }
}

/**
 * @param {string | null | undefined} origin
 * @param {string | null | undefined} referer
 * @returns {boolean}
 */
export function isAllowedVisitorOrigin(origin, referer) {
  const candidates = [origin, referer].filter(Boolean).map(String);
  if (!candidates.length) return false;
  for (const candidate of candidates) {
    try {
      const host = new URL(candidate).hostname.toLowerCase();
      if (
        host === "triada-designs.com" ||
        host.endsWith(".triada-designs.com") ||
        host === "localhost" ||
        host === "127.0.0.1"
      ) {
        return true;
      }
    } catch {
      /* ignore */
    }
  }
  return false;
}

/**
 * Find an existing lead by visitor_id (metadata) or email.
 * @param {{ visitor_id?: string | null, email?: string | null }} opts
 */
export async function findVisitorLead(opts = {}) {
  const visitorId = cleanText(opts.visitor_id);
  const email = extractEmail(opts.email) || cleanText(opts.email)?.toLowerCase() || null;
  const listed = await listLeads();
  if (visitorId) {
    const byVisitor = listed.data.find(
      (lead) =>
        lead.metadata &&
        typeof lead.metadata === "object" &&
        String(/** @type {Record<string, unknown>} */ (lead.metadata).visitor_id || "") ===
          visitorId,
    );
    if (byVisitor) return { lead: byVisitor, mode: listed.mode, match: "visitor_id" };
  }
  if (email) {
    const byEmail = listed.data.find(
      (lead) =>
        lead.contact_email &&
        String(lead.contact_email).toLowerCase() === email,
    );
    if (byEmail) return { lead: byEmail, mode: listed.mode, match: "email" };
  }
  return { lead: null, mode: listed.mode, match: null };
}

/**
 * Upsert a CRM lead from a public site / widget visit.
 *
 * @param {{
 *   visitor_id?: string | null,
 *   page?: string | null,
 *   page_url?: string | null,
 *   referrer?: string | null,
 *   email?: string | null,
 *   name?: string | null,
 *   contact_name?: string | null,
 *   phone?: string | null,
 *   contact_phone?: string | null,
 *   source?: string | null,
 *   source_channel?: string | null,
 *   title?: string | null,
 *   utm_source?: string | null,
 *   utm_medium?: string | null,
 *   utm_campaign?: string | null,
 *   utm_term?: string | null,
 *   utm_content?: string | null,
 *   utm?: Record<string, unknown> | null,
 *   metadata?: Record<string, unknown> | null,
 * }} input
 */
export async function captureVisitorAsLead(input = {}) {
  const visitorId = cleanText(input.visitor_id);
  const page = cleanText(input.page) || cleanText(input.page_url);
  const referrer = cleanText(input.referrer);
  const email =
    extractEmail(input.email) ||
    extractEmail(input.contact_email) ||
    null;
  const name =
    cleanText(input.name) ||
    cleanText(input.contact_name) ||
    null;
  const phone =
    cleanText(input.phone) ||
    cleanText(input.contact_phone) ||
    null;

  const sourceRaw = String(
    input.source_channel || input.source || "website",
  )
    .trim()
    .toLowerCase();
  const source_channel = SOURCE_CHANNELS.has(sourceRaw)
    ? sourceRaw === "triada_site"
      ? "website"
      : sourceRaw
    : "website";

  if (!visitorId && !email && !page) {
    return {
      ok: false,
      status: 422,
      message: "visitor_id, email, or page is required.",
    };
  }

  const fromQuery = utmFromPageUrl(page);
  const fromBody = extractUtmFields(input);
  /** @type {Record<string, string | null>} */
  const utm = {};
  for (const key of Object.keys(fromQuery)) {
    utm[key] = fromBody[key] || fromQuery[key] || null;
  }

  const found = await findVisitorLead({ visitor_id: visitorId, email });
  const previous = found.lead;
  const pathLabel = pagePathLabel(page);
  const defaultTitle = email
    ? `Website lead · ${email}`
    : pathLabel
      ? `Website visitor · ${pathLabel}`
      : visitorId
        ? `Website visitor · ${visitorId.slice(0, 18)}`
        : "Website visitor";

  const prevMeta =
    previous?.metadata && typeof previous.metadata === "object"
      ? /** @type {Record<string, unknown>} */ (previous.metadata)
      : {};
  const extraMeta =
    input.metadata && typeof input.metadata === "object" ? input.metadata : {};

  const now = new Date().toISOString();
  const metadata = {
    ...prevMeta,
    ...extraMeta,
    visitor_id: visitorId || prevMeta.visitor_id || null,
    page: page || prevMeta.page || null,
    landing_page: prevMeta.landing_page || page || null,
    referrer: referrer || prevMeta.referrer || null,
    ...utm,
    last_seen_at: now,
    capture_source: source_channel,
    first_captured_at: prevMeta.first_captured_at || now,
  };

  const result = await upsertLead({
    ...(previous || {}),
    id: previous?.id,
    title:
      cleanText(input.title) ||
      (previous?.contact_email || email
        ? previous?.title || defaultTitle
        : defaultTitle),
    stage: previous?.stage || "new_lead",
    contact_name: name || previous?.contact_name || null,
    contact_email: email || previous?.contact_email || null,
    contact_phone: phone || previous?.contact_phone || null,
    source_channel: previous?.source_channel || source_channel,
    metadata,
  });

  return {
    ok: true,
    status: result.created ? 201 : 200,
    mode: result.mode,
    created: result.created,
    lead: result.lead,
    match: found.match,
  };
}
