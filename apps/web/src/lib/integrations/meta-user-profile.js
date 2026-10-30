/**
 * Best-effort Meta Graph profile lookup (name + profile picture).
 * Server-only — never returns or logs access tokens.
 */

import { resolvePageMessagingCredentials } from "@/lib/integrations/meta-credentials";
import { integrationRuntimeMode } from "@/lib/integrations/env-presence";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH_BASE = (
  process.env.META_GRAPH_BASE || "https://graph.facebook.com"
).replace(/\/$/, "");

/**
 * @param {string} psid
 * @returns {Promise<{
 *   ok: boolean,
 *   mode: 'live' | 'local_sim' | 'skipped',
 *   name: string | null,
 *   avatar_url: string | null,
 *   error: string | null,
 * }>}
 */
export async function fetchMetaUserProfile(psid) {
  const id = String(psid || "").trim();
  if (!id) {
    return {
      ok: false,
      mode: "skipped",
      name: null,
      avatar_url: null,
      error: "psid_required",
    };
  }

  const forceLocal =
    (process.env.INTEGRATION_MODE || "").trim().toLowerCase() === "local";
  const creds = await resolvePageMessagingCredentials();
  const live =
    !forceLocal &&
    Boolean(creds.pageAccessToken) &&
    integrationRuntimeMode(Boolean(creds.pageAccessToken)) === "live";

  if (!live) {
    return {
      ok: true,
      mode: "local_sim",
      name: null,
      avatar_url: null,
      error: null,
    };
  }

  const url = new URL(`${GRAPH_BASE}/${GRAPH_VERSION}/${encodeURIComponent(id)}`);
  url.searchParams.set("fields", "name,first_name,last_name,profile_pic");
  url.searchParams.set("access_token", creds.pageAccessToken);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        mode: "live",
        name: null,
        avatar_url: null,
        error:
          (raw && raw.error && raw.error.message) ||
          `graph_http_${res.status}`,
      };
    }
    const name =
      String(raw.name || "").trim() ||
      [raw.first_name, raw.last_name].filter(Boolean).join(" ").trim() ||
      null;
    const avatar =
      typeof raw.profile_pic === "string" && raw.profile_pic.startsWith("http")
        ? String(raw.profile_pic).trim()
        : null;
    return {
      ok: true,
      mode: "live",
      name,
      avatar_url: avatar,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      mode: "live",
      name: null,
      avatar_url: null,
      error: err instanceof Error ? err.message : "profile_fetch_failed",
    };
  }
}
