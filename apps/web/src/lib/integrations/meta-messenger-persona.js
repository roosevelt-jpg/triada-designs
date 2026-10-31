/**
 * Messenger Page Personas — the only Meta surface that supports a custom
 * per-reply sender name + profile picture for admin human replies.
 *
 * Create: POST /me/personas { name, profile_picture_url }
 * Send:   include persona_id on POST /me/messages
 *
 * Instagram Messaging does not support personas.
 */

import { integrationRuntimeMode } from "@/lib/integrations/env-presence";
import { resolvePageMessagingCredentials } from "@/lib/integrations/meta-credentials";
import {
  normalizeDisplayName,
  publicHttpsAvatarUrl,
} from "@/lib/agents/admin-profile-settings";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH_BASE = (
  process.env.META_GRAPH_BASE || "https://graph.facebook.com"
).replace(/\/$/, "");

function graphUrl(resourcePath) {
  return `${GRAPH_BASE}/${GRAPH_VERSION}/${String(resourcePath).replace(/^\//, "")}`;
}

/**
 * @returns {Promise<{ live: boolean, creds: Awaited<ReturnType<typeof resolvePageMessagingCredentials>> }>}
 */
async function resolvePersonaGate() {
  const creds = await resolvePageMessagingCredentials();
  const forceLocal =
    (process.env.INTEGRATION_MODE || "").trim().toLowerCase() === "local";
  const live =
    !forceLocal &&
    Boolean(creds.pageAccessToken) &&
    integrationRuntimeMode(Boolean(creds.pageAccessToken)) === "live";
  return { live, creds };
}

/**
 * Ensure a Messenger persona exists for the admin profile photo.
 * Reuses messenger_persona_id when the picture URL has not changed.
 *
 * @param {{
 *   display_name?: string | null,
 *   avatar_url?: string | null,
 *   messenger_persona_id?: string | null,
 *   messenger_persona_picture_url?: string | null,
 * }} profile
 */
export async function ensureMessengerPersona(profile) {
  const name = normalizeDisplayName(profile?.display_name);
  const pictureUrl = publicHttpsAvatarUrl(profile?.avatar_url);
  const existingId =
    typeof profile?.messenger_persona_id === "string" &&
    profile.messenger_persona_id.trim()
      ? String(profile.messenger_persona_id).trim()
      : null;
  const existingPic = publicHttpsAvatarUrl(
    profile?.messenger_persona_picture_url,
  );

  if (!pictureUrl) {
    return {
      ok: false,
      skipped: true,
      reason: "https_avatar_required",
      note: "Messenger Personas need a publicly reachable https profile_picture_url. Local/data URLs stay dashboard-only until Storage serves https.",
      persona_id: existingId,
      profile_picture_url: null,
      mode: "local_sim",
    };
  }

  if (existingId && existingPic === pictureUrl) {
    return {
      ok: true,
      reused: true,
      persona_id: existingId,
      profile_picture_url: pictureUrl,
      mode: "cached",
    };
  }

  const { live, creds } = await resolvePersonaGate();
  if (!live) {
    const simId =
      existingId || `local-persona-${Date.now().toString(36)}`;
    return {
      ok: true,
      mode: "local_sim",
      persona_id: simId,
      profile_picture_url: pictureUrl,
      simulated: true,
      note: "Personas sync simulated until Page Messaging credentials are live.",
    };
  }

  const response = await fetch(graphUrl("me/personas"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.pageAccessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      name: name.slice(0, 50),
      profile_picture_url: pictureUrl,
    }),
    cache: "no-store",
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      mode: "live",
      persona_id: existingId,
      profile_picture_url: pictureUrl,
      error: raw?.error?.message || `HTTP ${response.status}`,
      raw: { error: raw?.error || undefined },
    };
  }

  const personaId = raw?.id ? String(raw.id) : null;
  if (!personaId) {
    return {
      ok: false,
      mode: "live",
      persona_id: existingId,
      profile_picture_url: pictureUrl,
      error: "persona_id_missing",
      raw,
    };
  }

  return {
    ok: true,
    mode: "live",
    persona_id: personaId,
    profile_picture_url: pictureUrl,
    raw: { id: personaId },
  };
}
