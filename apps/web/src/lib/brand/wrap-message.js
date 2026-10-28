/**
 * Brand wrappers for WhatsApp / chat-style outbound text.
 * Logo cannot embed in plain WhatsApp text — header uses brand name + greeting;
 * Meta templates may attach HEADER IMAGE separately via Graph components.
 */

import {
  BRAND,
  brandAddressOneLine,
  brandAddressPlain,
  brandLogoUrl,
  warmGreeting,
} from "./identity";

/**
 * @typedef {{
 *   body: string,
 *   greetingKind?: string,
 *   customerName?: string,
 *   includeGreeting?: boolean,
 *   includeFooter?: boolean,
 *   compactFooter?: boolean,
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
  const greeting = includeGreeting
    ? warmGreeting(opts.greetingKind || "default", {
        customerName: opts.customerName,
      })
    : "";
  const footer = includeFooter
    ? opts.compactFooter
      ? brandAddressOneLine()
      : brandAddressPlain()
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
  };
}

/**
 * Build Meta WhatsApp template components with brand TEXT HEADER + branded BODY + FOOTER.
 * IMAGE headers require a Meta Resumable Upload handle (not a public logo URL).
 * @param {{ body: string, greetingKind?: string, customerName?: string, language?: string, variables?: string[] }} opts
 */
export function brandedWhatsAppTemplateComponents(opts) {
  const wrapped = wrapWhatsAppMessage({
    body: opts.body,
    greetingKind: opts.greetingKind,
    customerName: opts.customerName,
    includeFooter: false,
    includeGreeting: true,
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
        text: brandAddressOneLine().slice(0, 60),
      },
    ],
    preview_text: `${text}\n\n${brandAddressOneLine()}`,
    logo_url: brandLogoUrl(),
  };
}

/**
 * Ensure an outbound plain string carries Triada greeting + footer when missing.
 * @param {string} text
 * @param {{ greetingKind?: string, customerName?: string }} [opts]
 */
export function ensureBrandedOutboundText(text, opts = {}) {
  const raw = String(text || "").trim();
  const already =
    /triada designs/i.test(raw) &&
    (/warm greetings/i.test(raw) || /info@triada-designs\.com/i.test(raw));
  if (already) {
    return {
      text: raw,
      branded: true,
      already_branded: true,
      logo_url: brandLogoUrl(),
    };
  }
  return wrapWhatsAppMessage({
    body: raw,
    greetingKind: opts.greetingKind,
    customerName: opts.customerName,
  });
}
