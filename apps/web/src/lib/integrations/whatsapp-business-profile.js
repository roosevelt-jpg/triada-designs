/**
 * WhatsApp Cloud API business profile picture sync.
 *
 * Honest limits:
 * - Session text/media send APIs have NO per-message sender avatar.
 * - Customers always see the WhatsApp Business phone-number profile photo
 *   (one photo per phone_number_id — not per admin agent).
 * - Updating that photo requires Resumable Upload → profile_picture_handle →
 *   POST /{phone-number-id}/whatsapp_business_profile.
 */

import { integrationRuntimeMode } from "@/lib/integrations/env-presence";
import {
  resolveWhatsAppCloudCredentials,
} from "@/lib/integrations/meta-credentials";
import { publicHttpsAvatarUrl } from "@/lib/agents/admin-profile-settings";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH_BASE = (
  process.env.META_GRAPH_BASE || "https://graph.facebook.com"
).replace(/\/$/, "");

function graphUrl(resourcePath) {
  return `${GRAPH_BASE}/${GRAPH_VERSION}/${String(resourcePath).replace(/^\//, "")}`;
}

function resolveAppId() {
  return String(
    process.env.META_APP_ID ||
      process.env.FACEBOOK_APP_ID ||
      process.env.META_CLIENT_ID ||
      "",
  ).trim();
}

/**
 * @returns {Promise<{ live: boolean, creds: Awaited<ReturnType<typeof resolveWhatsAppCloudCredentials>> }>}
 */
async function resolveProfileGate() {
  const creds = await resolveWhatsAppCloudCredentials();
  const forceLocal =
    (process.env.INTEGRATION_MODE || "").trim().toLowerCase() === "local";
  const live =
    !forceLocal &&
    creds.sendReady &&
    integrationRuntimeMode(creds.sendReady) === "live";
  return { live, creds };
}

/**
 * @param {string} url
 * @returns {Promise<{ ok: boolean, bytes?: Buffer, mime_type?: string, error?: string }>}
 */
async function fetchAvatarBytes(url) {
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    });
    if (!response.ok) {
      return { ok: false, error: `avatar_fetch_http_${response.status}` };
    }
    const mime =
      String(response.headers.get("content-type") || "")
        .split(";")[0]
        .trim() || "image/jpeg";
    if (!/^image\/(jpeg|jpg|png)/i.test(mime)) {
      return {
        ok: false,
        error: "avatar_mime_unsupported",
        mime_type: mime,
      };
    }
    const ab = await response.arrayBuffer();
    const bytes = Buffer.from(ab);
    if (!bytes.length) return { ok: false, error: "avatar_empty" };
    if (bytes.length > 5 * 1024 * 1024) {
      return { ok: false, error: "avatar_too_large" };
    }
    return { ok: true, bytes, mime_type: mime };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "avatar_fetch_failed",
    };
  }
}

/**
 * Meta Resumable Upload → file handle for WhatsApp business profile picture.
 * @param {{
 *   appId: string,
 *   accessToken: string,
 *   bytes: Buffer,
 *   mime_type: string,
 *   filename?: string,
 * }} input
 */
async function createProfilePictureHandle(input) {
  const appId = String(input.appId || "").trim();
  const accessToken = String(input.accessToken || "").trim();
  if (!appId || !accessToken) {
    return { ok: false, error: "app_id_or_token_missing", handle: null };
  }

  const sessionUrl = new URL(graphUrl(`${appId}/uploads`));
  sessionUrl.searchParams.set("file_length", String(input.bytes.length));
  sessionUrl.searchParams.set("file_type", input.mime_type || "image/jpeg");
  sessionUrl.searchParams.set(
    "file_name",
    input.filename || "admin-profile.jpg",
  );
  sessionUrl.searchParams.set("access_token", accessToken);

  const sessionRes = await fetch(sessionUrl.toString(), {
    method: "POST",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const sessionRaw = await sessionRes.json().catch(() => ({}));
  if (!sessionRes.ok || !sessionRaw?.id) {
    return {
      ok: false,
      error:
        sessionRaw?.error?.message ||
        `upload_session_http_${sessionRes.status}`,
      handle: null,
      raw: sessionRaw,
    };
  }

  const uploadRes = await fetch(graphUrl(String(sessionRaw.id)), {
    method: "POST",
    headers: {
      Authorization: `OAuth ${accessToken}`,
      file_offset: "0",
      "Content-Type": input.mime_type || "application/octet-stream",
      Accept: "application/json",
    },
    body: input.bytes,
    cache: "no-store",
  });
  const uploadRaw = await uploadRes.json().catch(() => ({}));
  const handle =
    typeof uploadRaw?.h === "string"
      ? uploadRaw.h
      : typeof uploadRaw?.handle === "string"
        ? uploadRaw.handle
        : null;
  if (!uploadRes.ok || !handle) {
    return {
      ok: false,
      error:
        uploadRaw?.error?.message || `upload_bytes_http_${uploadRes.status}`,
      handle: null,
      raw: uploadRaw,
    };
  }

  return { ok: true, handle, raw: uploadRaw };
}

/**
 * Best-effort sync of admin avatar → WhatsApp Business Profile picture.
 * Account-level only — overwrites the phone number's public profile photo.
 *
 * @param {string | null | undefined} avatarUrl
 * @param {{ synced_url?: string | null }} [opts]
 */
export async function syncWhatsAppBusinessProfilePicture(avatarUrl, opts = {}) {
  const pictureUrl = publicHttpsAvatarUrl(avatarUrl);
  const prior = publicHttpsAvatarUrl(opts.synced_url);

  if (!pictureUrl) {
    return {
      ok: false,
      skipped: true,
      reason: "https_avatar_required",
      note: "WhatsApp business profile updates need a public https image URL.",
      mode: "local_sim",
      account_level: true,
    };
  }

  if (prior && prior === pictureUrl) {
    return {
      ok: true,
      reused: true,
      mode: "cached",
      profile_picture_url: pictureUrl,
      account_level: true,
      note: "WhatsApp business profile already matches this photo (account-level).",
    };
  }

  const { live, creds } = await resolveProfileGate();
  if (!live) {
    return {
      ok: true,
      mode: "local_sim",
      simulated: true,
      profile_picture_url: pictureUrl,
      account_level: true,
      note: "WhatsApp business-profile picture sync simulated until Cloud API credentials are live. Live sync is account-level (one photo per phone number).",
    };
  }

  const appId = resolveAppId();
  if (!appId) {
    return {
      ok: false,
      mode: "live",
      account_level: true,
      error: "meta_app_id_required",
      note: "Set META_APP_ID to upload a WhatsApp profile_picture_handle.",
      profile_picture_url: pictureUrl,
    };
  }

  const fetched = await fetchAvatarBytes(pictureUrl);
  if (!fetched.ok || !fetched.bytes) {
    // If Storage URL needs auth, try reading via admin client when path known — otherwise fail honestly.
    if (hasSupabaseAdminCredentials() && /supabase/i.test(pictureUrl)) {
      try {
        createAdminSupabaseClient();
      } catch {
        /* ignore */
      }
    }
    return {
      ok: false,
      mode: "live",
      account_level: true,
      error: fetched.error || "avatar_fetch_failed",
      profile_picture_url: pictureUrl,
    };
  }

  const handleResult = await createProfilePictureHandle({
    appId,
    accessToken: creds.accessToken,
    bytes: fetched.bytes,
    mime_type: fetched.mime_type || "image/jpeg",
    filename: "admin-profile.jpg",
  });
  if (!handleResult.ok || !handleResult.handle) {
    return {
      ok: false,
      mode: "live",
      account_level: true,
      error: handleResult.error || "profile_picture_handle_failed",
      profile_picture_url: pictureUrl,
      raw: handleResult.raw,
    };
  }

  const response = await fetch(
    graphUrl(`${creds.phoneNumberId}/whatsapp_business_profile`),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        profile_picture_handle: handleResult.handle,
      }),
      cache: "no-store",
    },
  );
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      mode: "live",
      account_level: true,
      error: raw?.error?.message || `HTTP ${response.status}`,
      profile_picture_url: pictureUrl,
      raw: { error: raw?.error || undefined },
      note: "WhatsApp profile picture is account-level. Meta may reject handles that do not meet image rules.",
    };
  }

  return {
    ok: true,
    mode: "live",
    account_level: true,
    profile_picture_url: pictureUrl,
    raw,
    note: "Updated WhatsApp Business phone-number profile picture (shared by all agents on this number).",
  };
}
