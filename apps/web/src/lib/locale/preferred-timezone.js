/**
 * Preferred IANA timezones for Triada ops (Dubai HQ + Romania + core markets).
 */

/** @type {readonly { id: string, label: string }[]} */
export const PREFERRED_TIMEZONES = Object.freeze([
  { id: "Asia/Dubai", label: "Asia/Dubai — Gulf Standard" },
  { id: "Europe/Bucharest", label: "Europe/Bucharest — Romania" },
  { id: "UTC", label: "UTC" },
  { id: "Europe/London", label: "Europe/London" },
  { id: "Europe/Paris", label: "Europe/Paris" },
  { id: "Europe/Berlin", label: "Europe/Berlin" },
  { id: "Africa/Cairo", label: "Africa/Cairo" },
  { id: "Asia/Riyadh", label: "Asia/Riyadh" },
  { id: "Asia/Qatar", label: "Asia/Qatar" },
  { id: "Asia/Kuwait", label: "Asia/Kuwait" },
  { id: "Asia/Bahrain", label: "Asia/Bahrain" },
  { id: "Asia/Muscat", label: "Asia/Muscat" },
  { id: "Asia/Kolkata", label: "Asia/Kolkata" },
  { id: "Asia/Singapore", label: "Asia/Singapore" },
  { id: "Asia/Tokyo", label: "Asia/Tokyo" },
  { id: "Australia/Sydney", label: "Australia/Sydney" },
  { id: "America/New_York", label: "America/New_York" },
  { id: "America/Chicago", label: "America/Chicago" },
  { id: "America/Denver", label: "America/Denver" },
  { id: "America/Los_Angeles", label: "America/Los_Angeles" },
  { id: "America/Toronto", label: "America/Toronto" },
]);

export const DEFAULT_TIMEZONE = "Asia/Dubai";

const ID_SET = new Set(PREFERRED_TIMEZONES.map((t) => t.id));

/**
 * @param {unknown} value
 * @param {string} [fallback]
 */
export function normalizePreferredTimezone(value, fallback = DEFAULT_TIMEZONE) {
  const id = String(value || "").trim();
  if (ID_SET.has(id)) return id;
  // Accept other valid IANA ids already saved historically by keeping them
  // only if Intl accepts them; otherwise fall back.
  if (id) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: id });
      return id;
    } catch {
      /* fall through */
    }
  }
  return fallback;
}
