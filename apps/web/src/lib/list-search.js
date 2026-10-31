/**
 * Shared list-filter helpers for long scroll pages.
 */

/**
 * Case-insensitive substring match across stringifiable parts.
 * @param {unknown[]} parts
 * @param {string} query
 */
export function matchesListQuery(parts, query) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return true;
  const hay = parts
    .map((p) => (p == null ? "" : String(p)))
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}
