/**
 * Brand wrappers for WhatsApp / chat-style outbound text.
 * Logo cannot embed in plain WhatsApp text — header uses brand name + greeting;
 * Meta templates may attach HEADER IMAGE separately via Graph components.
 *
 * Footers resolve from admin Settings brand contact (shared with invoices),
 * not Meta business-profile address or static-only hardcoded identity.
 */

import {
  BRAND,
  brandLogoUrl,
  warmGreeting,
} from "./identity";
import {
  brandContactOneLine,
  brandContactPlain,
  getBrandContactSettings,
  getBrandContactSync,
} from "./brand-contact-settings";

/**
 * @typedef {{
 *   body: string,
 *   greetingKind?: string,
 *   customerName?: string,
 *   language?: string,
 *   includeGreeting?: boolean,
 *   includeFooter?: boolean,
 *   compactFooter?: boolean,
 *   contact?: import("./brand-contact-settings").BrandContactSettings | Record<string, unknown> | null,
 * }} WrapWhatsAppOpts
 */

/**
 * Wrap a WhatsApp / chat body with warm greeting + address footer.
 * Does not invent off-brand phrases — only Triada identity + caller body.
 * @param {WrapWhatsAppOpts} opts
 */
export function wrapWhatsAppMessage(opts) {
  const body = String(opts.body || "").trim();
  const includeGreeting = opts.includeGreeting !== false;
  const includeFooter = opts.includeFooter !== false;
  const contact = opts.contact || getBrandContactSync();
  const greeting = includeGreeting
    ? warmGreeting(opts.greetingKind || "default", {
        customerName: opts.customerName,
        language: opts.language,
      })
    : "";
  const footer = includeFooter
    ? opts.compactFooter
      ? brandContactOneLine(contact)
      : brandContactPlain(contact)
    : "";

  const parts = [];
  if (greeting) parts.push(greeting);
  if (body) parts.push(body);
  if (footer) parts.push(`—\n${footer}`);

  const text = parts.join("\n\n");
  return {
    channel: "whatsapp",
    text,
    body,
    greeting,
    footer,
    brand: BRAND.name,
    logo_url: brandLogoUrl(),
    /** Meta Cloud HEADER IMAGE component when submitting templates. */
    header_image_url: brandLogoUrl(),
    branded: true,
    brand_contact: {
      address_line: contact.address_line || getBrandContactSync().address_line,
      ops_email: contact.ops_email || getBrandContactSync().ops_email,
      phones: contact.phones || getBrandContactSync().phones,
    },
  };
}

/**
 * Build Meta WhatsApp template components with brand TEXT HEADER + branded BODY + FOOTER.
 * IMAGE headers require a Meta Resumable Upload handle (not a public logo URL).
 * @param {{ body: string, greetingKind?: string, customerName?: string, language?: string, variables?: string[], contact?: import("./brand-contact-settings").BrandContactSettings | null }} opts
 */
export function brandedWhatsAppTemplateComponents(opts) {
  const contact = opts.contact || getBrandContactSync();
  const wrapped = wrapWhatsAppMessage({
    body: opts.body,
    greetingKind: opts.greetingKind,
    customerName: opts.customerName,
    includeFooter: false,
    includeGreeting: true,
    contact,
  });
  const text = wrapped.text;
  const variables = Array.isArray(opts.variables) ? opts.variables.map(String) : [];
  /** @type {Record<string, unknown>} */
  const bodyComponent = { type: "BODY", text };
  const placeholders = [...String(text).matchAll(/\{\{(\d+)\}\}/g)];
  if (placeholders.length) {
    let max = 0;
    for (const m of placeholders) max = Math.max(max, Number(m[1]) || 0);
    const samples = [];
    for (let i = 1; i <= max; i += 1) {
      const key = String(variables[i - 1] || "").toLowerCase();
      samples.push(
        key === "name" || key === "customer_name"
          ? opts.customerName || "Alex"
          : key === "order_number"
            ? "TD-1042"
            : `Sample ${i}`,
      );
    }
    bodyComponent.example = { body_text: [samples] };
  }
  const footerLine = brandContactOneLine(contact);
  return {
    language: opts.language || "en_US",
    components: [
      {
        type: "HEADER",
        format: "TEXT",
        text: "Triada Designs",
      },
      bodyComponent,
      {
        type: "FOOTER",
        text: footerLine.slice(0, 60),
      },
    ],
    preview_text: `${text}\n\n${footerLine}`,
    logo_url: brandLogoUrl(),
  };
}

/**
 * Ensure an outbound plain string carries Triada greeting + Settings brand footer.
 * Warms brand contact from shared Settings/invoice source before wrapping.
 * @param {string} text
 * @param {{ greetingKind?: string, customerName?: string, language?: string, contact?: import("./brand-contact-settings").BrandContactSettings | null }} [opts]
 */
export async function ensureBrandedOutboundText(text, opts = {}) {
  const contact = opts.contact || (await getBrandContactSettings());
  const raw = String(text || "").trim();
  const opsEmail = String(contact.ops_email || "").trim();
  const addressBit = String(contact.address_line || "")
    .trim()
    .slice(0, 24);
  const already =
    /triada designs/i.test(raw) &&
    (/warm greetings|salutări calde|herzliche grüße|chaleureuses salutations|тёплые приветствия|saludos cordiales|saudações calorosas|تحيات دافئة/i.test(
      raw,
    ) ||
      (opsEmail && raw.toLowerCase().includes(opsEmail.toLowerCase())) ||
      /info@triada-designs\.com/i.test(raw) ||
      (addressBit.length >= 8 && raw.includes(addressBit)));
  if (already) {
    return {
      text: raw,
      branded: true,
      already_branded: true,
      logo_url: brandLogoUrl(),
      brand_contact: contact,
    };
  }
  return wrapWhatsAppMessage({
    body: raw,
    greetingKind: opts.greetingKind,
    customerName: opts.customerName,
    language: opts.language,
    contact,
  });
}
