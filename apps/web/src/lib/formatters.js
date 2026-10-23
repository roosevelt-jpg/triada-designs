import { formatInWorkspace } from "@/lib/system-time";

/** @param {number|string|null|undefined} value */
export function formatCurrency(value, currency = "USD") {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  if (Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format timestamps with the live Date API and workspace timezone when synced.
 * @param {string|Date|null|undefined} value
 */
export function formatDateTime(value) {
  return formatInWorkspace(value, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Longer workspace-local date (no clock).
 * @param {string|Date|null|undefined} value
 */
export function formatDateLong(value) {
  return formatInWorkspace(value, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** @param {string} stage */
export function formatStage(stage) {
  return String(stage || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
