/**
 * Brand helpers for channel templates (WhatsApp / email / multi-channel).
 */

import { BRAND, brandLogoUrl, warmGreeting } from "./identity";
import { brandedWhatsAppTemplateComponents, wrapWhatsAppMessage } from "./wrap-message";
import { wrapEmailMessage } from "./wrap-email";

/**
 * Apply Triada branding to a channel template body before save/send.
 * @param {{
 *   platform?: string,
 *   name?: string,
 *   body?: string,
 *   subject?: string,
 *   greetingKind?: string,
 *   customerName?: string,
 * }} input
 */
export function wrapChannelTemplate(input = {}) {
  const platform = String(input.platform || "whatsapp").toLowerCase();
  const body = String(input.body || "").trim();
  const greetingKind = input.greetingKind || "default";

  if (platform === "email") {
    const email = wrapEmailMessage({
      subject: input.subject || `${BRAND.name}: ${input.name || "update"}`,
      bodyText: body,
      greetingKind,
      customerName: input.customerName,
    });
    return {
      platform,
      branded: true,
      body: email.text,
      html: email.html,
      subject: email.subject,
      logo_url: email.logo_url,
      greeting: email.greeting,
      preview: email.text,
    };
  }

  if (platform === "whatsapp") {
    const components = brandedWhatsAppTemplateComponents({
      body,
      greetingKind,
      customerName: input.customerName,
    });
    const wa = wrapWhatsAppMessage({
      body,
      greetingKind,
      customerName: input.customerName,
      compactFooter: true,
    });
    return {
      platform,
      branded: true,
      body: wa.text,
      components: components.components,
      logo_url: brandLogoUrl(),
      greeting: wa.greeting,
      preview: components.preview_text,
      header_image_url: brandLogoUrl(),
    };
  }

  // Other channels: plain branded text with greeting + address footer.
  const plain = wrapWhatsAppMessage({
    body,
    greetingKind,
    customerName: input.customerName,
  });
  return {
    platform,
    branded: true,
    body: plain.text,
    logo_url: brandLogoUrl(),
    greeting: plain.greeting,
    preview: plain.text,
  };
}

/**
 * Seed / catalog helper: ensure template body starts with a warm greeting.
 * @param {string} body
 * @param {string} [greetingKind]
 */
export function ensureTemplateGreeting(body, greetingKind = "default") {
  const text = String(body || "").trim();
  if (/warm greetings/i.test(text)) return text;
  return `${warmGreeting(greetingKind)}\n\n${text}`;
}
