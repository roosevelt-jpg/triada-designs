/**
 * HTML email brand wrapper — Triada logo header, warm greeting, address footer.
 */

import {
  BRAND,
  brandLogoUrl,
  warmGreeting,
} from "./identity";
import { getBrandContactSync } from "./brand-contact-settings";

/**
 * @typedef {{
 *   subject?: string,
 *   bodyHtml?: string,
 *   bodyText?: string,
 *   greetingKind?: string,
 *   customerName?: string,
 *   includeGreeting?: boolean,
 *   addressLine?: string,
 *   opsEmail?: string,
 *   phones?: string,
 * }} WrapEmailOpts
 */

/**
 * @param {WrapEmailOpts} opts
 */
export function wrapEmailMessage(opts) {
  const includeGreeting = opts.includeGreeting !== false;
  const greeting = includeGreeting
    ? warmGreeting(opts.greetingKind || "default", {
        customerName: opts.customerName,
      })
    : "";
  const logo = brandLogoUrl();
  const ink = BRAND.colors.ink;
  const brown = BRAND.colors.brown;
  const ivory = BRAND.colors.ivory;
  const line = BRAND.colors.line;
  const brandContact = getBrandContactSync();
  const addressLine =
    String(opts.addressLine || "").trim() || brandContact.address_line;
  const opsEmail =
    String(opts.opsEmail || "").trim() || brandContact.ops_email;
  const phonesDisplay =
    String(opts.phones || "").trim() || brandContact.phones;

  const bodyHtml =
    opts.bodyHtml ||
    (opts.bodyText
      ? `<p style="margin:0 0 12px;white-space:pre-wrap;">${escapeHtml(opts.bodyText)}</p>`
      : "");

  const greetingHtml = greeting
    ? `<p style="margin:0 0 16px;font-size:16px;color:${ink};">${escapeHtml(greeting)}</p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(opts.subject || BRAND.name)}</title></head>
<body style="margin:0;padding:0;background:${ivory};font-family:Georgia,'Times New Roman',serif;color:${ink};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${ivory};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid ${line};">
        <tr>
          <td style="padding:28px 32px 20px;border-bottom:1px solid ${line};text-align:left;">
            <img src="${escapeAttr(logo)}" alt="${escapeAttr(BRAND.name)}" width="180" style="display:block;height:auto;max-width:180px;border:0;" />
            <p style="margin:10px 0 0;font-size:12px;letter-spacing:0.04em;color:${brown};">${escapeHtml(BRAND.tagline)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;font-size:15px;line-height:1.55;color:${ink};">
            ${greetingHtml}
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 28px;border-top:1px solid ${line};font-size:12px;line-height:1.5;color:${brown};">
            <strong style="color:${ink};">${escapeHtml(BRAND.name)}</strong><br/>
            ${escapeHtml(addressLine)}<br/>
            <a href="mailto:${escapeAttr(opsEmail)}" style="color:${brown};">${escapeHtml(opsEmail)}</a>
            · ${escapeHtml(phonesDisplay)}<br/>
            <a href="${escapeAttr(BRAND.siteUrl)}" style="color:${brown};">${escapeHtml(BRAND.siteUrl)}</a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textParts = [];
  if (greeting) textParts.push(greeting);
  if (opts.bodyText) textParts.push(opts.bodyText);
  else if (opts.bodyHtml) textParts.push(stripTags(opts.bodyHtml));
  textParts.push(
    [
      "—",
      BRAND.name,
      addressLine,
      opsEmail,
      phonesDisplay,
      BRAND.siteUrl,
    ].join("\n"),
  );

  return {
    channel: "email",
    subject: opts.subject || `${BRAND.name}`,
    html,
    text: textParts.join("\n\n"),
    greeting,
    logo_url: logo,
    branded: true,
  };
}

/** @param {string} value */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {string} value */
function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

/** @param {string} html */
function stripTags(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}
