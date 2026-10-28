/**
 * Normalize phone numbers to E.164 for WhatsApp Cloud API campaigns.
 * Default region: UAE (+971). Local mobiles like 05xxxxxxxx → +9715xxxxxxx.
 */

export const DEFAULT_REGION = "AE";
export const UAE_COUNTRY_CODE = "971";

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function digitsOnly(raw) {
  return String(raw ?? "").replace(/\D+/g, "");
}

/**
 * @param {string} digits
 * @returns {boolean}
 */
function isPlausibleE164Digits(digits) {
  // E.164: country code + subscriber, 8–15 digits total (no leading 0).
  return /^[1-9]\d{7,14}$/.test(digits);
}

/**
 * Normalize a raw phone into E.164.
 * @param {unknown} raw
 * @param {{ defaultRegion?: string }} [opts]
 * @returns {{
 *   ok: boolean,
 *   phone_e164: string | null,
 *   phone_digits: string | null,
 *   error: string | null,
 *   raw: string,
 * }}
 */
export function normalizePhoneToE164(raw, opts = {}) {
  const defaultRegion = (opts.defaultRegion || DEFAULT_REGION).toUpperCase();
  const original = String(raw ?? "").trim();

  if (!original) {
    return {
      ok: false,
      phone_e164: null,
      phone_digits: null,
      error: "missing_phone",
      raw: original,
    };
  }

  // Keep intentional +; strip other punctuation / spaces.
  let working = original.replace(/[^\d+]/g, "");
  if (working.includes("+") && !working.startsWith("+")) {
    return {
      ok: false,
      phone_e164: null,
      phone_digits: null,
      error: "invalid_plus_placement",
      raw: original,
    };
  }

  // International prefix 00… → treat as +
  if (working.startsWith("00")) {
    working = `+${working.slice(2)}`;
  }

  let digits = digitsOnly(working);

  if (!digits) {
    return {
      ok: false,
      phone_e164: null,
      phone_digits: null,
      error: "no_digits",
      raw: original,
    };
  }

  // Already UAE international (971…)
  if (digits.startsWith(UAE_COUNTRY_CODE) && digits.length >= 11 && digits.length <= 12) {
    if (!isPlausibleE164Digits(digits)) {
      return invalid(original, "invalid_length");
    }
    return ok(digits, original);
  }

  // Explicit other-country +… (non-UAE default path when + present)
  if (working.startsWith("+")) {
    if (!isPlausibleE164Digits(digits)) {
      return invalid(original, "invalid_e164");
    }
    return ok(digits, original);
  }

  // UAE local mobile: 05xxxxxxxx (10 digits) or 5xxxxxxxx (9 digits)
  if (defaultRegion === "AE") {
    if (/^05\d{8}$/.test(digits)) {
      digits = `${UAE_COUNTRY_CODE}${digits.slice(1)}`;
      return ok(digits, original);
    }
    if (/^5\d{8}$/.test(digits)) {
      digits = `${UAE_COUNTRY_CODE}${digits}`;
      return ok(digits, original);
    }
    // UAE landline-ish local 0[2-9]xxxxxxx → drop trunk 0
    if (/^0[2-9]\d{7,8}$/.test(digits)) {
      digits = `${UAE_COUNTRY_CODE}${digits.slice(1)}`;
      if (isPlausibleE164Digits(digits)) return ok(digits, original);
    }
  }

  // Bare digits that already look like full E.164 (no leading 0)
  if (isPlausibleE164Digits(digits) && digits.length >= 10) {
    return ok(digits, original);
  }

  return invalid(original, "unrecognized_local_format");
}

/**
 * @param {string} digits
 * @param {string} raw
 */
function ok(digits, raw) {
  return {
    ok: true,
    phone_e164: `+${digits}`,
    phone_digits: digits,
    error: null,
    raw,
  };
}

/**
 * @param {string} raw
 * @param {string} error
 */
function invalid(raw, error) {
  return {
    ok: false,
    phone_e164: null,
    phone_digits: null,
    error,
    raw,
  };
}

/**
 * Meta Cloud API `to` field: digits only, no leading +.
 * @param {unknown} rawOrE164
 * @returns {string | null}
 */
export function toWhatsAppRecipient(rawOrE164) {
  const result = normalizePhoneToE164(rawOrE164);
  return result.ok ? result.phone_digits : null;
}
