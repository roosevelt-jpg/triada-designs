/**
 * Branded invoice / receipt HTML suitable for PDF print or email attachment preview.
 * Logo header + warm greeting + Triada address footer.
 */

import {
  BRAND,
  brandLogoUrl,
  warmGreeting,
} from "./identity";
import { wrapEmailMessage } from "./wrap-email";

/**
 * @typedef {{
 *   documentType?: "invoice" | "receipt",
 *   number?: string,
 *   orderId?: string,
 *   customerName?: string,
 *   customerEmail?: string,
 *   currency?: string,
 *   total?: number,
 *   status?: string,
 *   issuedAt?: string,
 *   lineItems?: Array<{ title?: string, sku?: string, qty?: number, price?: number }>,
 *   notes?: string,
 *   greeting?: string,
 *   preparedFor?: string,
 * }} InvoiceDocInput
 */

/**
 * @param {InvoiceDocInput} input
 */
export function wrapInvoiceDocument(input = {}) {
  const docType = input.documentType === "receipt" ? "receipt" : "invoice";
  const title = docType === "receipt" ? "Receipt" : "Invoice";
  const defaultGreeting = warmGreeting(docType === "receipt" ? "receipt" : "invoice", {
    customerName: input.customerName,
  });
  const greeting = String(input.greeting || "").trim() || defaultGreeting;
  const logo = brandLogoUrl();
  const currency = input.currency || "AED";
  const total = Number(input.total ?? 0);
  const lines = Array.isArray(input.lineItems) ? input.lineItems : [];
  const number = input.number || `INV-${Date.now().toString(36).toUpperCase()}`;
  const issuedAt = input.issuedAt || new Date().toISOString();
  const preparedForCustom = String(input.preparedFor || "").trim();
  const preparedForHtml = preparedForCustom
    ? escapeHtml(preparedForCustom)
    : input.customerName
      ? `Prepared for <strong>${escapeHtml(input.customerName)}</strong>`
      : "Prepared for our valued client";

  const rowsHtml =
    lines.length > 0
      ? lines
          .map((line) => {
            const qty = Number(line.qty ?? 1);
            const price = Number(line.price ?? 0);
            return `<tr>
              <td style="padding:8px 0;border-bottom:1px solid ${BRAND.colors.line};">${escapeHtml(line.title || "Item")}${
                line.sku ? `<br/><span style="color:${BRAND.colors.brown};font-size:12px;">${escapeHtml(line.sku)}</span>` : ""
              }</td>
              <td style="padding:8px 0;border-bottom:1px solid ${BRAND.colors.line};text-align:center;">${qty}</td>
              <td style="padding:8px 0;border-bottom:1px solid ${BRAND.colors.line};text-align:right;">${formatMoney(price, currency)}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="3" style="padding:8px 0;color:${BRAND.colors.brown};">No line items listed.</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(BRAND.name)} ${title} ${escapeHtml(number)}</title>
  <style>
    @page { margin: 18mm; }
    body { margin: 0; font-family: Georgia, "Times New Roman", serif; color: ${BRAND.colors.ink}; background: #fff; }
    .sheet { max-width: 720px; margin: 0 auto; padding: 32px; }
    .header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; border-bottom: 1px solid ${BRAND.colors.line}; padding-bottom: 20px; }
    .logo { max-width: 200px; height: auto; }
    .meta { text-align: right; font-size: 13px; color: ${BRAND.colors.brown}; }
    .greeting { margin: 24px 0 12px; font-size: 16px; }
    table.items { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px; }
    .total { margin-top: 16px; text-align: right; font-size: 18px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid ${BRAND.colors.line}; font-size: 12px; color: ${BRAND.colors.brown}; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <img class="logo" src="${escapeAttr(logo)}" alt="${escapeAttr(BRAND.name)}" />
        <p style="margin:8px 0 0;font-size:12px;color:${BRAND.colors.brown};">${escapeHtml(BRAND.tagline)}</p>
      </div>
      <div class="meta">
        <strong style="color:${BRAND.colors.ink};font-size:18px;">${escapeHtml(title)}</strong><br/>
        ${escapeHtml(number)}<br/>
        ${escapeHtml(new Date(issuedAt).toUTCString())}<br/>
        Status: ${escapeHtml(input.status || "issued")}
      </div>
    </div>
    <p class="greeting">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 8px;font-size:14px;">
      ${preparedForHtml}
      ${input.customerEmail ? ` · ${escapeHtml(input.customerEmail)}` : ""}
      ${input.orderId ? `<br/>Order: ${escapeHtml(input.orderId)}` : ""}
    </p>
    <table class="items">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px 0;border-bottom:2px solid ${BRAND.colors.ink};">Item</th>
          <th style="text-align:center;padding:8px 0;border-bottom:2px solid ${BRAND.colors.ink};">Qty</th>
          <th style="text-align:right;padding:8px 0;border-bottom:2px solid ${BRAND.colors.ink};">Amount</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <p class="total"><strong>Total ${escapeHtml(currency)} ${formatMoney(total, currency)}</strong></p>
    ${input.notes ? `<p style="font-size:13px;color:${BRAND.colors.brown};">${escapeHtml(input.notes)}</p>` : ""}
    <div class="footer">
      <strong style="color:${BRAND.colors.ink};">${escapeHtml(BRAND.name)}</strong><br/>
      ${escapeHtml(BRAND.address.singleLine)}<br/>
      ${escapeHtml(BRAND.opsEmail)} · ${escapeHtml(BRAND.phones.join(" · "))}<br/>
      ${escapeHtml(BRAND.siteUrl)}
    </div>
  </div>
</body>
</html>`;

  const email = wrapEmailMessage({
    subject: `${BRAND.name} ${title} ${number}`,
    greetingKind: docType === "receipt" ? "receipt" : "invoice",
    customerName: input.customerName,
    bodyHtml: `<p>Please find your ${title.toLowerCase()} <strong>${escapeHtml(number)}</strong> for ${escapeHtml(formatMoney(total, currency))} ${escapeHtml(currency)}.</p>`,
    bodyText: `Please find your ${title.toLowerCase()} ${number} for ${formatMoney(total, currency)} ${currency}.`,
  });

  return {
    document_type: docType,
    number,
    html,
    pdf_mode: "html_print",
    logo_url: logo,
    greeting,
    branded: true,
    email,
    summary: {
      number,
      order_id: input.orderId || null,
      customer_name: input.customerName || null,
      currency,
      total,
      status: input.status || "issued",
      issued_at: issuedAt,
    },
  };
}

/** @param {number} amount @param {string} currency */
function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat("en-AE", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
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
