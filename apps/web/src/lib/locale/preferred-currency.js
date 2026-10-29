/**
 * Preferred workspace currencies for Triada ops forms.
 * Default AED (Dubai / GCC jewellery trade).
 */

/** @type {readonly { code: string, label: string }[]} */
export const PREFERRED_CURRENCIES = Object.freeze([
  { code: "AED", label: "AED — UAE Dirham" },
  { code: "USD", label: "USD — US Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "RON", label: "RON — Romanian Leu" },
  { code: "SAR", label: "SAR — Saudi Riyal" },
  { code: "QAR", label: "QAR — Qatari Riyal" },
  { code: "KWD", label: "KWD — Kuwaiti Dinar" },
  { code: "BHD", label: "BHD — Bahraini Dinar" },
  { code: "OMR", label: "OMR — Omani Rial" },
  { code: "CHF", label: "CHF — Swiss Franc" },
  { code: "CAD", label: "CAD — Canadian Dollar" },
  { code: "AUD", label: "AUD — Australian Dollar" },
  { code: "INR", label: "INR — Indian Rupee" },
  { code: "TRY", label: "TRY — Turkish Lira" },
  { code: "EGP", label: "EGP — Egyptian Pound" },
]);

export const DEFAULT_CURRENCY = "AED";

const CODE_SET = new Set(PREFERRED_CURRENCIES.map((c) => c.code));

/**
 * @param {unknown} value
 * @param {string} [fallback]
 * @param {{ allowUnknown?: boolean }} [opts]
 */
export function normalizePreferredCurrency(
  value,
  fallback = DEFAULT_CURRENCY,
  opts = {},
) {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  if (CODE_SET.has(code)) return code;
  // Keep historically saved ISO-ish codes in the dropdown as “saved”.
  if (opts.allowUnknown && /^[A-Z]{3}$/.test(code)) return code;
  return fallback;
}
