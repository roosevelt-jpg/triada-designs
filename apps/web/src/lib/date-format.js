/** International (ISO 8601) date helpers for dashboard date fields. */

/** @param {number} n */
function pad(n) {
  return String(n).padStart(2, "0");
}

/**
 * @param {Date} date
 * @returns {string} YYYY-MM-DD
 */
export function toIntlDateValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * @param {Date} date
 * @returns {string} YYYY-MM-DDTHH:mm (datetime-local compatible)
 */
export function toIntlDateTimeValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${toIntlDateValue(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Display string for a date-only value (always YYYY-MM-DD).
 * @param {string|Date|null|undefined} value
 */
export function formatIntlDate(value) {
  if (!value) return "";
  if (value instanceof Date) return toIntlDateValue(value);
  const s = String(value).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : toIntlDateValue(d);
}

/**
 * Display string for a datetime value (YYYY-MM-DD HH:mm).
 * @param {string|Date|null|undefined} value
 */
export function formatIntlDateTime(value) {
  if (!value) return "";
  if (value instanceof Date) {
    const v = toIntlDateTimeValue(value);
    return v ? v.replace("T", " ") : "";
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}):(\d{2})/);
  if (m) return `${m[1]} ${m[2]}:${m[3]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return formatIntlDate(s);
  return formatIntlDateTime(d);
}

/**
 * Parse a date or datetime field value into a local Date.
 * @param {string|Date|null|undefined} value
 * @returns {Date|null}
 */
export function parseIntlDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const s = String(value).trim();
  const dt = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (dt) {
    const y = Number(dt[1]);
    const mo = Number(dt[2]) - 1;
    const d = Number(dt[3]);
    const h = Number(dt[4] || 0);
    const mi = Number(dt[5] || 0);
    const se = Number(dt[6] || 0);
    const date = new Date(y, mo, d, h, mi, se);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}
