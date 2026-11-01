/**
 * Live Meta Graph webhook subscription for Page + Instagram Messaging.
 *
 * Dashboard "Subscribe webhook" previously only stored local metadata.
 * This module:
 *  1) POST/DELETE /{page-id}/subscribed_apps (Page token) — Messenger/Page fields
 *  2) POST /{app-id}/subscriptions object=instagram (app token) when app secret is available
 *
 * Never returns or logs access tokens / app secrets.
 */

import { integrationRuntimeMode } from "@/lib/integrations/env-presence";
import {
  loadMetaCredentialFields,
  resolvePageMessagingCredentials,
} from "@/lib/integrations/meta-credentials";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH_BASE = (
  process.env.META_GRAPH_BASE || "https://graph.facebook.com"
).replace(/\/$/, "");

const CALLBACK_URL =
  process.env.META_WEBHOOK_CALLBACK_URL?.trim() ||
  "https://dashboard.triada-designs.com/api/webhooks/meta";

/** Page / Messenger Platform subscribed_fields. */
export const PAGE_MESSAGING_SUBSCRIBED_FIELDS = [
  "messages",
  "messaging_postbacks",
  "messaging_optins",
  "message_deliveries",
  "message_reads",
  "messaging_referrals",
  "messaging_handovers",
  "standby",
];

/** Instagram object webhook fields (App Dashboard /app subscriptions). */
export const INSTAGRAM_WEBHOOK_FIELDS = [
  "messages",
  "messaging_postbacks",
  "message_edit",
];

const DEFAULT_VERIFY_TOKEN = "triada-meta-verify-2026";

function graphUrl(resourcePath) {
  return `${GRAPH_BASE}/${GRAPH_VERSION}/${String(resourcePath).replace(/^\//, "")}`;
}

/**
 * @param {unknown} err
 */
function isExpiredGraphToken(err) {
  const code = /** @type {{ code?: number, subcode?: number }} */ (err || {});
  return code.code === 190 || code.subcode === 463 || code.subcode === 460;
}

/**
 * @param {string} pageAccessToken
 * @param {string} resourcePath
 * @param {Record<string, string | number | undefined>} [params]
 * @param {"GET" | "POST" | "DELETE"} [method]
 */
async function graphRequest(
  pageAccessToken,
  resourcePath,
  params = {},
  method = "GET",
) {
  const url = new URL(graphUrl(resourcePath));
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    if (method === "GET") url.searchParams.set(key, String(value));
    else body.set(key, String(value));
  }
  url.searchParams.set("access_token", pageAccessToken);

  /** @type {RequestInit} */
  const init = {
    method,
    headers: { Accept: "application/json" },
    cache: "no-store",
  };
  if (method !== "GET") {
    init.headers = {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    };
    init.body = body.toString();
  }

  const response = await fetch(url.toString(), init);
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = raw?.error || {};
    const message = String(err.message || `graph_http_${response.status}`);
    const code = err.code != null ? Number(err.code) : response.status;
    const subcode =
      err.error_subcode != null ? Number(err.error_subcode) : null;
    const error = new Error(message.slice(0, 240));
    error.code = code;
    error.subcode = subcode;
    error.httpStatus = response.status;
    error.graph = {
      code,
      error_subcode: subcode,
      type: err.type || null,
      message: message.slice(0, 240),
    };
    throw error;
  }
  return raw;
}

/**
 * @param {string} pageAccessToken
 */
async function resolvePageId(pageAccessToken) {
  const envPage =
    (process.env.META_PAGE_ID || "").trim() ||
    (process.env.META_FACEBOOK_PAGE_ID || "").trim();

  try {
    const me = await graphRequest(pageAccessToken, "me", { fields: "id,name" });
    if (me?.id) {
      return {
        pageId: String(me.id),
        pageName: me.name ? String(me.name) : null,
      };
    }
  } catch (err) {
    if (isExpiredGraphToken(err)) throw err;
  }

  if (envPage) return { pageId: envPage, pageName: null };
  return { pageId: "", pageName: null };
}

/**
 * @returns {Promise<{
 *   appId: string,
 *   appSecret: string,
 *   verifyToken: string,
 *   hasAppSecret: boolean,
 * }>}
 */
async function resolveAppCredentials() {
  const fields = await loadMetaCredentialFields();
  const appId = String(
    fields.app_id ||
      process.env.META_APP_ID ||
      process.env.FACEBOOK_APP_ID ||
      "",
  ).trim();
  const appSecret = String(
    fields.app_secret ||
      process.env.META_APP_SECRET ||
      process.env.FACEBOOK_APP_SECRET ||
      "",
  ).trim();
  const verifyToken = String(
    fields.verify_token ||
      process.env.META_VERIFY_TOKEN ||
      process.env.META_HUB_VERIFY_TOKEN ||
      DEFAULT_VERIFY_TOKEN,
  ).trim();
  return {
    appId,
    appSecret,
    verifyToken,
    hasAppSecret: Boolean(appId && appSecret),
  };
}

/**
 * Presence-only Graph webhook subscription status (no secrets).
 * @returns {Promise<Record<string, unknown>>}
 */
export async function getMetaWebhookSubscriptionStatus() {
  const creds = await resolvePageMessagingCredentials();
  const app = await resolveAppCredentials();
  const forceLocal =
    (process.env.INTEGRATION_MODE || "").trim().toLowerCase() === "local";
  const ready = Boolean(creds.pageAccessToken);
  const live =
    !forceLocal && ready && integrationRuntimeMode(ready) === "live";

  /** @type {Record<string, unknown>} */
  const out = {
    ok: true,
    mode: live ? "live" : "local_sim",
    callback_url: CALLBACK_URL,
    verify_token_configured: true,
    page_id_present: false,
    page_subscribed_apps: null,
    instagram_app_subscription: null,
    session_expired: false,
    has_app_secret: app.hasAppSecret,
    token_source: creds.tokenSource,
    message: "",
  };

  if (!live) {
    out.message =
      "Meta Page token not live — cannot query Graph subscribed_apps.";
    return out;
  }

  try {
    const { pageId, pageName } = await resolvePageId(creds.pageAccessToken);
    out.page_id_present = Boolean(pageId);
    out.page_name = pageName;
    if (!pageId) {
      out.message = "Could not resolve Facebook Page id from the Page token.";
      return out;
    }

    const apps = await graphRequest(
      creds.pageAccessToken,
      `${pageId}/subscribed_apps`,
      { fields: "id,name,subscribed_fields" },
    );
    const rows = Array.isArray(apps?.data) ? apps.data : [];
    out.page_subscribed_apps = {
      count: rows.length,
      apps: rows.map((row) => ({
        id: row?.id ? String(row.id) : null,
        name: row?.name ? String(row.name) : null,
        subscribed_fields: Array.isArray(row?.subscribed_fields)
          ? row.subscribed_fields.map((f) => String(f))
          : [],
      })),
      messages_field:
        rows.some(
          (row) =>
            Array.isArray(row?.subscribed_fields) &&
            row.subscribed_fields.map(String).includes("messages"),
        ) || rows.length > 0,
    };

    if (app.hasAppSecret) {
      try {
        const appToken = `${app.appId}|${app.appSecret}`;
        const subs = await graphRequest(appToken, `${app.appId}/subscriptions`);
        const list = Array.isArray(subs?.data) ? subs.data : [];
        const ig = list.find(
          (row) => String(row?.object || "").toLowerCase() === "instagram",
        );
        const pageObj = list.find(
          (row) => String(row?.object || "").toLowerCase() === "page",
        );
        out.instagram_app_subscription = {
          present: Boolean(ig),
          callback_url: ig?.callback_url ? String(ig.callback_url) : null,
          fields: Array.isArray(ig?.fields)
            ? ig.fields.map((f) =>
                typeof f === "object" && f?.name ? String(f.name) : String(f),
              )
            : [],
          active: ig?.active !== false,
        };
        out.page_app_subscription = {
          present: Boolean(pageObj),
          callback_url: pageObj?.callback_url
            ? String(pageObj.callback_url)
            : null,
          fields: Array.isArray(pageObj?.fields)
            ? pageObj.fields.map((f) =>
                typeof f === "object" && f?.name ? String(f.name) : String(f),
              )
            : [],
          active: pageObj?.active !== false,
        };
      } catch (err) {
        out.instagram_app_subscription = {
          present: false,
          error: err instanceof Error ? err.message.slice(0, 200) : "graph_error",
          code: /** @type {{ code?: number }} */ (err).code ?? null,
        };
      }
    } else {
      out.instagram_app_subscription = {
        present: null,
        message:
          "App secret not stored — cannot query Instagram app webhook subscriptions via Graph. Configure Instagram → Webhooks in Meta Developer Console, or save App Secret on Integrations.",
      };
    }

    out.message = "Graph webhook subscription status loaded.";
    return out;
  } catch (err) {
    if (isExpiredGraphToken(err)) out.session_expired = true;
    out.message =
      err instanceof Error
        ? err.message.slice(0, 240)
        : "Failed to load webhook subscription status.";
    out.graph_error = {
      code: /** @type {{ code?: number }} */ (err).code ?? null,
      error_subcode: /** @type {{ subcode?: number }} */ (err).subcode ?? null,
    };
    return out;
  }
}

/**
 * Subscribe (or unsubscribe) Page + Instagram messaging webhooks via Graph.
 * @param {{
 *   channel?: string,
 *   subscribed?: boolean,
 * }} [opts]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function subscribeMetaMessagingWebhooks(opts = {}) {
  const subscribed = opts.subscribed !== false;
  const channel = String(opts.channel || "instagram").toLowerCase();
  const creds = await resolvePageMessagingCredentials();
  const app = await resolveAppCredentials();
  const forceLocal =
    (process.env.INTEGRATION_MODE || "").trim().toLowerCase() === "local";
  const ready = Boolean(creds.pageAccessToken);
  const live =
    !forceLocal && ready && integrationRuntimeMode(ready) === "live";

  /** @type {Record<string, unknown>} */
  const result = {
    ok: false,
    mode: live ? "live" : "local_sim",
    channel,
    subscribed,
    callback_url: CALLBACK_URL,
    page_subscribe: null,
    instagram_app_subscribe: null,
    session_expired: false,
    has_app_secret: app.hasAppSecret,
    token_source: creds.tokenSource,
    verify_token_hint: DEFAULT_VERIFY_TOKEN,
    message: "",
    next_steps: /** @type {string[]} */ ([]),
  };

  if (!live) {
    result.message =
      "Cannot call Meta Graph — Page access token missing or INTEGRATION_MODE=local.";
    result.next_steps.push(
      "Ensure Integrations → Meta has a valid Page access token (Connected).",
    );
    return result;
  }

  try {
    const { pageId, pageName } = await resolvePageId(creds.pageAccessToken);
    result.page_id_present = Boolean(pageId);
    result.page_name = pageName;
    if (!pageId) {
      result.message = "Could not resolve Facebook Page id from the Page token.";
      return result;
    }

    if (subscribed) {
      const pageRes = await graphRequest(
        creds.pageAccessToken,
        `${pageId}/subscribed_apps`,
        { subscribed_fields: PAGE_MESSAGING_SUBSCRIBED_FIELDS.join(",") },
        "POST",
      );
      result.page_subscribe = {
        ok: pageRes?.success === true || pageRes === true || Boolean(pageRes),
        subscribed_fields: PAGE_MESSAGING_SUBSCRIBED_FIELDS,
      };
    } else {
      const pageRes = await graphRequest(
        creds.pageAccessToken,
        `${pageId}/subscribed_apps`,
        {},
        "DELETE",
      );
      result.page_subscribe = {
        ok: pageRes?.success === true || pageRes === true || Boolean(pageRes),
        subscribed: false,
      };
    }

    // Instagram object webhooks require app access token (app_id|app_secret).
    if (app.hasAppSecret) {
      const appToken = `${app.appId}|${app.appSecret}`;
      if (subscribed) {
        const igRes = await graphRequest(
          appToken,
          `${app.appId}/subscriptions`,
          {
            object: "instagram",
            callback_url: CALLBACK_URL,
            fields: INSTAGRAM_WEBHOOK_FIELDS.join(","),
            include_values: "true",
            verify_token: app.verifyToken || DEFAULT_VERIFY_TOKEN,
          },
          "POST",
        );
        result.instagram_app_subscribe = {
          ok: igRes?.success === true || igRes === true || Boolean(igRes),
          object: "instagram",
          fields: INSTAGRAM_WEBHOOK_FIELDS,
          callback_url: CALLBACK_URL,
        };

        // Also ensure Page object subscription points at the same callback.
        try {
          const pageObjRes = await graphRequest(
            appToken,
            `${app.appId}/subscriptions`,
            {
              object: "page",
              callback_url: CALLBACK_URL,
              fields: PAGE_MESSAGING_SUBSCRIBED_FIELDS.join(","),
              include_values: "true",
              verify_token: app.verifyToken || DEFAULT_VERIFY_TOKEN,
            },
            "POST",
          );
          result.page_app_subscribe = {
            ok:
              pageObjRes?.success === true ||
              pageObjRes === true ||
              Boolean(pageObjRes),
            object: "page",
            fields: PAGE_MESSAGING_SUBSCRIBED_FIELDS,
          };
        } catch (err) {
          result.page_app_subscribe = {
            ok: false,
            error:
              err instanceof Error ? err.message.slice(0, 200) : "graph_error",
            code: /** @type {{ code?: number }} */ (err).code ?? null,
          };
        }
      } else {
        // Meta DELETE subscription is per-object.
        try {
          await graphRequest(
            appToken,
            `${app.appId}/subscriptions`,
            { object: "instagram" },
            "DELETE",
          );
          result.instagram_app_subscribe = { ok: true, subscribed: false };
        } catch (err) {
          result.instagram_app_subscribe = {
            ok: false,
            error:
              err instanceof Error ? err.message.slice(0, 200) : "graph_error",
          };
        }
      }
    } else {
      result.instagram_app_subscribe = {
        ok: false,
        skipped: true,
        message:
          "App secret not available — Page subscribed_apps updated, but Instagram object webhooks must be set in Meta Developer Console (Instagram → Webhooks → messages) or by saving App Secret.",
      };
      result.next_steps.push(
        "Meta Developer App → Instagram → Webhooks: callback https://dashboard.triada-designs.com/api/webhooks/meta, verify token triada-meta-verify-2026, subscribe field messages (and messaging_postbacks).",
      );
      result.next_steps.push(
        "Optional: save Meta App Secret on Integrations so Triada can subscribe Instagram object webhooks via Graph.",
      );
    }

    const pageOk = Boolean(
      result.page_subscribe &&
        /** @type {{ ok?: boolean }} */ (result.page_subscribe).ok,
    );
    const ig = /** @type {{ ok?: boolean, skipped?: boolean }} */ (
      result.instagram_app_subscribe || {}
    );
    result.ok = pageOk && (ig.ok === true || ig.skipped === true);
    result.message = subscribed
      ? pageOk
        ? ig.skipped
          ? "Page subscribed_apps updated. Instagram App webhook fields still need Meta Console (or App Secret)."
          : "Page + Instagram webhook subscriptions updated via Graph."
        : "Page subscribed_apps call did not succeed."
      : "Webhook unsubscribe requested via Graph.";

    result.next_steps.push(
      "Retest from a personal Instagram account that does NOT have a role on the Triada Facebook Page (admin/tester self-DMs often produce no webhooks).",
    );
    result.next_steps.push(
      "After a customer DM, Unified Inbox → Instagram should show the inbound within a few seconds and AI Support should reply.",
    );

    return result;
  } catch (err) {
    if (isExpiredGraphToken(err)) result.session_expired = true;
    result.ok = false;
    result.message =
      err instanceof Error
        ? err.message.slice(0, 240)
        : "Meta webhook subscribe failed.";
    result.graph_error = {
      code: /** @type {{ code?: number }} */ (err).code ?? null,
      error_subcode: /** @type {{ subcode?: number }} */ (err).subcode ?? null,
    };
    if (result.session_expired) {
      result.next_steps.push(
        "Page access token session expired (Graph 190/463). Refresh and re-save via Integrations → Meta.",
      );
    }
    return result;
  }
}
