/**
 * Meta Graph Conversations API → Unified Inbox backfill.
 * Pulls existing Messenger + Instagram threads when Page messaging is Connected.
 * Live webhooks remain the source of truth for NEW messages; this fills history.
 *
 * Graph: GET /{page-id}/conversations?platform=messenger|instagram
 * Scopes used by Triada Page token: pages_messaging, pages_manage_metadata,
 * pages_read_engagement, instagram_manage_messages, instagram_basic.
 * Limitation: Graph returns detail for roughly the 20 newest messages per thread.
 * Never returns access tokens.
 */

import { integrationRuntimeMode } from "@/lib/integrations/env-presence";
import { resolvePageMessagingCredentials } from "@/lib/integrations/meta-credentials";
import { upsertHistoricalDmThread } from "@/lib/crm/conversations-store";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH_BASE = (
  process.env.META_GRAPH_BASE || "https://graph.facebook.com"
).replace(/\/$/, "");

const DEFAULT_PLATFORMS = ["messenger", "instagram"];
const DEFAULT_CONVERSATION_LIMIT = 40;
const DEFAULT_MESSAGE_LIMIT = 20;

function graphUrl(resourcePath) {
  return `${GRAPH_BASE}/${GRAPH_VERSION}/${String(resourcePath).replace(/^\//, "")}`;
}

/**
 * @param {string} pageAccessToken
 * @param {string} resourcePath
 * @param {Record<string, string | number | undefined>} [params]
 */
async function graphGet(pageAccessToken, resourcePath, params = {}) {
  const url = new URL(graphUrl(resourcePath));
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set("access_token", pageAccessToken);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = raw?.error || {};
    const message = String(err.message || `graph_http_${response.status}`);
    const code = err.code != null ? Number(err.code) : response.status;
    const subcode =
      err.error_subcode != null ? Number(err.error_subcode) : null;
    const error = new Error(message);
    error.code = code;
    error.subcode = subcode;
    error.httpStatus = response.status;
    error.graph = {
      code,
      error_subcode: subcode,
      type: err.type || null,
      // Never include token material from Graph error extras.
      message: message.slice(0, 240),
    };
    throw error;
  }
  return raw;
}

/**
 * @returns {Promise<{
 *   live: boolean,
 *   creds: Awaited<ReturnType<typeof resolvePageMessagingCredentials>>,
 * }>}
 */
async function resolveBackfillGate() {
  const creds = await resolvePageMessagingCredentials();
  const forceLocal =
    (process.env.INTEGRATION_MODE || "").trim().toLowerCase() === "local";
  const ready = Boolean(creds.pageAccessToken);
  const live =
    !forceLocal && ready && integrationRuntimeMode(ready) === "live";
  return { live, creds };
}

/**
 * Resolve Page id (+ linked IG business account) for Conversations API.
 * @param {string} pageAccessToken
 * @param {string} [preferredIgUserId]
 */
async function resolvePageContext(pageAccessToken, preferredIgUserId = "") {
  /** @type {{ pageId: string, pageName: string | null, igUserId: string | null, igUsername: string | null }} */
  const ctx = {
    pageId: "",
    pageName: null,
    igUserId: preferredIgUserId || null,
    igUsername: null,
  };

  try {
    const me = await graphGet(pageAccessToken, "me", {
      fields: "id,name",
    });
    if (me?.id) {
      ctx.pageId = String(me.id);
      ctx.pageName = me.name ? String(me.name) : null;
    }
  } catch {
    // Page tokens sometimes only list via /me/accounts
  }

  try {
    const accounts = await graphGet(pageAccessToken, "me/accounts", {
      fields: "id,name,tasks,instagram_business_account{id,username}",
      limit: 25,
    });
    const rows = Array.isArray(accounts?.data) ? accounts.data : [];
    const preferred =
      rows.find((row) => {
        const tasks = Array.isArray(row?.tasks)
          ? row.tasks.map((t) => String(t).toUpperCase())
          : [];
        return tasks.includes("MESSAGING") || tasks.includes("MODERATE");
      }) || rows[0];
    if (preferred?.id) {
      ctx.pageId = String(preferred.id);
      ctx.pageName = preferred.name ? String(preferred.name) : ctx.pageName;
      const ig = preferred.instagram_business_account || {};
      if (ig?.id) {
        ctx.igUserId = String(ig.id);
        ctx.igUsername = ig.username ? String(ig.username) : null;
      }
    }
  } catch {
    // Page access tokens cannot call /me/accounts (field does not exist).
    // Keep me-derived page id and resolve IG from the Page node below.
  }

  // Page tokens: IG Professional link lives on the Page node, not /me/accounts.
  if (!ctx.igUserId && ctx.pageId) {
    try {
      const page = await graphGet(pageAccessToken, ctx.pageId, {
        fields: "instagram_business_account{id,username}",
      });
      const ig = page?.instagram_business_account || {};
      if (ig?.id) {
        ctx.igUserId = String(ig.id);
        ctx.igUsername = ig.username ? String(ig.username) : ctx.igUsername;
      }
    } catch {
      // Leave ig unset; preferredIgUserId / env may still apply.
    }
  }

  if (!ctx.igUserId && preferredIgUserId) {
    ctx.igUserId = preferredIgUserId;
  }
  return ctx;
}

/**
 * @param {unknown} participants
 * @param {{ pageId: string, igUserId: string | null }} business
 * @param {'messenger' | 'instagram'} platform
 */
function pickCustomerParticipant(participants, business, platform) {
  const rows = Array.isArray(participants?.data)
    ? participants.data
    : Array.isArray(participants)
      ? participants
      : [];
  const businessIds = new Set(
    [business.pageId, business.igUserId].filter(Boolean).map(String),
  );
  const customer =
    rows.find((p) => p?.id && !businessIds.has(String(p.id))) || rows[0];
  if (!customer?.id) return null;
  const name =
    (typeof customer.name === "string" && customer.name.trim()) ||
    (typeof customer.username === "string" && customer.username.trim()) ||
    null;
  return {
    id: String(customer.id),
    name,
    platform,
  };
}

/**
 * @param {unknown} from
 * @param {{ pageId: string, igUserId: string | null }} business
 */
function messageDirection(from, business) {
  const fromId = from && typeof from === "object" ? String(from.id || "") : "";
  if (!fromId) return "inbound";
  if (fromId === String(business.pageId || "")) return "outbound";
  if (business.igUserId && fromId === String(business.igUserId)) {
    return "outbound";
  }
  return "inbound";
}

/**
 * Local-sim historical threads when Page token is absent / INTEGRATION_MODE=local.
 * @param {string[]} platforms
 */
function localSimConversations(platforms) {
  const now = Date.now();
  /** @type {Array<{ platform: string, conversation_id: string, updated_time: string, customer: { id: string, name: string | null }, messages: Array<{ id: string, created_time: string, from: { id: string }, message: string }> }>} */
  const out = [];
  if (platforms.includes("messenger")) {
    out.push({
      platform: "messenger",
      conversation_id: "t_local_sim_messenger_1",
      updated_time: new Date(now - 3600_000).toISOString(),
      customer: { id: "MSGR_LOCAL_HIST_1", name: "Aisha Khan" },
      messages: [
        {
          id: "mid.local.msgr.1",
          created_time: new Date(now - 7200_000).toISOString(),
          from: { id: "MSGR_LOCAL_HIST_1" },
          message: "Hi — is the gold hoop pair still available?",
        },
        {
          id: "mid.local.msgr.2",
          created_time: new Date(now - 3600_000).toISOString(),
          from: { id: "PAGE_LOCAL" },
          message: "Yes — we can hold a pair for you today.",
        },
      ],
    });
  }
  if (platforms.includes("instagram")) {
    out.push({
      platform: "instagram",
      conversation_id: "t_local_sim_instagram_1",
      updated_time: new Date(now - 1800_000).toISOString(),
      customer: { id: "IG_LOCAL_HIST_1", name: "nora.atelier" },
      messages: [
        {
          id: "mid.local.ig.1",
          created_time: new Date(now - 5400_000).toISOString(),
          from: { id: "IG_LOCAL_HIST_1" },
          message: "Love the pearl drop — shipping to Dubai?",
        },
        {
          id: "mid.local.ig.2",
          created_time: new Date(now - 1800_000).toISOString(),
          from: { id: "IG_LOCAL" },
          message: "Yes — UAE delivery is available this week.",
        },
      ],
    });
  }
  return out;
}

/**
 * @param {string} pageAccessToken
 * @param {string} pageId
 * @param {'messenger' | 'instagram'} platform
 * @param {number} conversationLimit
 * @param {number} messageLimit
 */
async function listPlatformConversations(
  pageAccessToken,
  pageId,
  platform,
  conversationLimit,
  messageLimit,
) {
  const fields = [
    "id",
    "updated_time",
    "participants",
    `messages.limit(${Math.min(20, Math.max(1, messageLimit))}){id,created_time,from,message}`,
  ].join(",");

  const raw = await graphGet(pageAccessToken, `${pageId}/conversations`, {
    platform,
    limit: Math.min(100, Math.max(1, conversationLimit)),
    fields,
  });
  return Array.isArray(raw?.data) ? raw.data : [];
}

/**
 * Backfill Messenger + Instagram conversation history into Unified Inbox.
 * @param {{
 *   platforms?: Array<'messenger' | 'instagram' | string>,
 *   conversation_limit?: number,
 *   message_limit?: number,
 *   dry_run?: boolean,
 * }} [opts]
 */
export async function backfillMetaConversationHistory(opts = {}) {
  const platforms = (opts.platforms || DEFAULT_PLATFORMS)
    .map((p) => String(p || "").toLowerCase())
    .filter((p) => p === "messenger" || p === "instagram");
  const conversationLimit =
    Number.isFinite(Number(opts.conversation_limit)) &&
    Number(opts.conversation_limit) > 0
      ? Math.min(100, Number(opts.conversation_limit))
      : DEFAULT_CONVERSATION_LIMIT;
  const messageLimit =
    Number.isFinite(Number(opts.message_limit)) && Number(opts.message_limit) > 0
      ? Math.min(20, Number(opts.message_limit))
      : DEFAULT_MESSAGE_LIMIT;
  const dryRun = opts.dry_run === true;

  const { live, creds } = await resolveBackfillGate();
  /** @type {Record<string, unknown>} */
  const summary = {
    ok: true,
    mode: live ? "live" : "local_sim",
    token_source: creds.tokenSource,
    platforms,
    conversations_seen: 0,
    threads_created: 0,
    threads_updated: 0,
    messages_added: 0,
    skipped: 0,
    errors: /** @type {Array<Record<string, unknown>>} */ ([]),
    page_id_present: false,
    ig_user_id_present: false,
    session_expired: false,
  };

  if (!live) {
    const sims = localSimConversations(platforms);
    summary.conversations_seen = sims.length;
    if (dryRun) {
      summary.dry_run = true;
      summary.preview = sims.map((s) => ({
        channel: s.platform,
        external_user_id: s.customer.id,
        messages: s.messages.length,
      }));
      return summary;
    }
    for (const sim of sims) {
      const channel = sim.platform === "instagram" ? "instagram" : "messenger";
      const business = {
        pageId: "PAGE_LOCAL",
        igUserId: "IG_LOCAL",
      };
      const mapped = sim.messages.map((m) => ({
        direction: messageDirection(m.from, business),
        body: m.message,
        at: m.created_time,
        provider_message_id: m.id,
      }));
      const result = await upsertHistoricalDmThread({
        channel,
        external_user_id: sim.customer.id,
        external_conversation_id: sim.conversation_id,
        page_or_account_id:
          channel === "instagram" ? business.igUserId : business.pageId,
        contact_name: sim.customer.name,
        subject: mapped.find((m) => m.direction === "inbound")?.body,
        metadata: {
          source: "graph_history_backfill",
          platform: sim.platform,
          local_sim: true,
        },
        messages: mapped,
      });
      if (result.created) summary.threads_created += 1;
      else if (result.added > 0) summary.threads_updated += 1;
      else summary.skipped += 1;
      summary.messages_added += result.added;
    }
    summary.message =
      "Imported local sample Messenger / Instagram threads into Unified Inbox.";
    return summary;
  }

  let pageCtx;
  try {
    pageCtx = await resolvePageContext(
      creds.pageAccessToken,
      creds.igUserId || "",
    );
  } catch (err) {
    const code = /** @type {{ code?: number, subcode?: number, graph?: Record<string, unknown> }} */ (
      err
    );
    summary.ok = false;
    summary.session_expired =
      code.code === 190 ||
      code.subcode === 463 ||
      code.subcode === 460;
    summary.errors.push({
      step: "resolve_page",
      ...(code.graph || {
        message: err instanceof Error ? err.message : "resolve_page_failed",
      }),
    });
    summary.message = summary.session_expired
      ? "Page access token expired. Refresh Meta Page token, then import again."
      : "Could not resolve Meta Page for conversation import.";
    return summary;
  }

  summary.page_id_present = Boolean(pageCtx.pageId);
  summary.ig_user_id_present = Boolean(pageCtx.igUserId);
  if (!pageCtx.pageId) {
    summary.ok = false;
    summary.message =
      "Page id missing from Graph. Confirm the Page access token includes Messaging.";
    return summary;
  }

  const business = {
    pageId: pageCtx.pageId,
    igUserId: pageCtx.igUserId,
  };

  for (const platform of platforms) {
    if (platform === "instagram" && !pageCtx.igUserId) {
      summary.errors.push({
        platform,
        message:
          "Instagram business account not linked on this Page — skipped IG import.",
      });
      continue;
    }
    let rows = [];
    try {
      rows = await listPlatformConversations(
        creds.pageAccessToken,
        pageCtx.pageId,
        platform,
        conversationLimit,
        messageLimit,
      );
    } catch (err) {
      const code = /** @type {{ code?: number, subcode?: number, graph?: Record<string, unknown> }} */ (
        err
      );
      if (code.code === 190 || code.subcode === 463 || code.subcode === 460) {
        summary.session_expired = true;
        summary.ok = false;
      }
      summary.errors.push({
        platform,
        step: "list_conversations",
        ...(code.graph || {
          message:
            err instanceof Error ? err.message : "list_conversations_failed",
        }),
      });
      continue;
    }

    summary.conversations_seen += rows.length;

    for (const row of rows) {
      const conversationId = row?.id ? String(row.id) : "";
      const customer = pickCustomerParticipant(
        row?.participants,
        business,
        platform,
      );
      if (!customer?.id) {
        summary.skipped += 1;
        continue;
      }

      const msgRows = Array.isArray(row?.messages?.data)
        ? row.messages.data
        : [];
      const mapped = msgRows
        .map((m) => {
          const body = String(m?.message || "").trim();
          if (!body) return null;
          return {
            direction: messageDirection(m?.from, business),
            body,
            at: m?.created_time
              ? String(m.created_time)
              : row?.updated_time
                ? String(row.updated_time)
                : undefined,
            provider_message_id: m?.id ? String(m.id) : null,
          };
        })
        .filter(Boolean);

      if (mapped.length === 0) {
        // Still create a stub so the thread appears, using updated_time.
        mapped.push({
          direction: "inbound",
          body: "(conversation imported — open in Meta for older messages)",
          at: row?.updated_time ? String(row.updated_time) : undefined,
          provider_message_id: conversationId
            ? `graph-conv-${conversationId}`
            : null,
        });
      }

      if (dryRun) {
        summary.threads_created += 1;
        summary.messages_added += mapped.length;
        continue;
      }

      const channel = platform === "instagram" ? "instagram" : "messenger";
      try {
        const result = await upsertHistoricalDmThread({
          channel,
          external_user_id: customer.id,
          external_conversation_id:
            conversationId || `${channel}:${customer.id}`,
          page_or_account_id:
            channel === "instagram" && pageCtx.igUserId
              ? pageCtx.igUserId
              : pageCtx.pageId,
          contact_name: customer.name,
          subject: mapped.find((m) => m.direction === "inbound")?.body,
          metadata: {
            source: "graph_history_backfill",
            platform,
            graph_conversation_id: conversationId || null,
            page_name: pageCtx.pageName,
            ig_username: pageCtx.igUsername,
          },
          messages: mapped,
        });
        if (result.created) summary.threads_created += 1;
        else if (result.added > 0) summary.threads_updated += 1;
        else summary.skipped += 1;
        summary.messages_added += result.added;
      } catch (err) {
        summary.errors.push({
          platform,
          conversation_id: conversationId || null,
          message: err instanceof Error ? err.message : "upsert_failed",
        });
      }
    }
  }

  if (summary.session_expired) {
    summary.message =
      "Page access token expired. Refresh Meta Page token, then import again.";
  } else if (summary.conversations_seen === 0 && summary.errors.length === 0) {
    summary.message =
      "No Messenger / Instagram conversations returned by Graph yet. New DMs still appear via webhook after connect.";
  } else {
    summary.message = `Imported ${summary.threads_created + summary.threads_updated} thread(s), ${summary.messages_added} message(s) into Unified Inbox.`;
  }
  if (dryRun) summary.dry_run = true;
  return summary;
}
