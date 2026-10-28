/**
 * Google Places / Maps presence helpers for Integrations + popup location picker.
 * Keys live on Vercel — never collected in the dashboard UI.
 *
 * Accepted env (first non-empty wins for the browser Maps JS key):
 *   GOOGLE_PLACES_API_KEY
 *   GOOGLE_MAPS_API_KEY
 *   NEXT_PUBLIC_GOOGLE_PLACES_API_KEY
 *   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
 */

import { connectionLabel } from "@/lib/integrations/brand-labels";
import { hasGooglePlacesEnv as envHasGooglePlaces } from "@/lib/integrations/env-presence";

const KEY_NAMES = [
  "GOOGLE_PLACES_API_KEY",
  "GOOGLE_MAPS_API_KEY",
  "NEXT_PUBLIC_GOOGLE_PLACES_API_KEY",
  "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
];

/** True when a Places / Maps API key is present on the host. */
export function hasGooglePlacesEnv() {
  return envHasGooglePlaces();
}

/**
 * Resolve the Maps JS / Places key for browser Autocomplete.
 * Prefer Places-named keys, then Maps, then NEXT_PUBLIC mirrors.
 * @returns {string}
 */
export function resolveGooglePlacesApiKey() {
  for (const name of KEY_NAMES) {
    const v = process.env[name];
    if (v && String(v).trim()) return String(v).trim();
  }
  return "";
}

/**
 * Status payload for Integrations health / google-places config routes.
 * Never returns secret material in list views — browser_key only on the
 * dedicated config endpoint when Connected.
 */
export function googlePlacesStatus(opts = {}) {
  const includeKey = Boolean(opts.includeBrowserKey);
  const present = hasGooglePlacesEnv();
  const status = present ? "connected" : "awaiting_credentials";
  const payload = {
    provider: "google_places",
    display_name: "Google Places",
    has_credentials: present,
    status,
    status_label: connectionLabel(status, { hasCredentials: present }),
    summary: present
      ? "Google Places is connected for popup location capture."
      : "Waiting for GOOGLE_PLACES_API_KEY or GOOGLE_MAPS_API_KEY on Vercel.",
    capabilities: ["places.autocomplete", "maps.pin", "geocode"],
  };
  if (includeKey && present) {
    payload.browser_key = resolveGooglePlacesApiKey();
  }
  return payload;
}

/**
 * Parse Google Place address_components into country / city / town.
 * @param {Array<{ long_name?: string, short_name?: string, types?: string[] }>|undefined} components
 */
export function parsePlaceAddressComponents(components) {
  const list = Array.isArray(components) ? components : [];
  /** @type {Record<string, string>} */
  const byType = {};
  for (const c of list) {
    const name = String(c.long_name || c.short_name || "").trim();
    if (!name) continue;
    for (const t of c.types || []) {
      if (!byType[t]) byType[t] = name;
    }
  }

  const country = byType.country || "";
  const city =
    byType.locality ||
    byType.administrative_area_level_1 ||
    byType.postal_town ||
    "";
  const town =
    byType.sublocality ||
    byType.sublocality_level_1 ||
    byType.neighborhood ||
    byType.administrative_area_level_2 ||
    byType.postal_town ||
    (byType.locality && byType.locality !== city ? byType.locality : "") ||
    "";

  return { country, city, town };
}
