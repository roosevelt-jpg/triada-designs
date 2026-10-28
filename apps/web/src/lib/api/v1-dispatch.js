/**
 * Next dual-run dispatcher for /api/v1/* (except auth/{login,me,logout}).
 * Serves seeded / env-aware payloads so dashboard pages never 502 when
 * Laravel API_ORIGIN is dead. Filesystem routes win over next.config fallback.
 */

import {
  PRODUCTS,
  SERVICES,
  WORKSPACE,
  buildAgents,
  buildAnalyticsPayload,
  buildContacts,
  buildContent,
  buildConversations,
  buildDashboard,
  buildIntegrationsHealth,
  buildIntegrationsList,
  buildLeads,
  buildWorkflows,
  paginate,
} from "@/lib/api/seed-data";
import {
  clearAnthropicCredentials,
  getAnthropicStatus,
  saveAnthropicCredentials,
} from "@/lib/integrations/anthropic-credentials";
import {
  clearMetaCredentials,
  getMetaStatus,
  saveMetaCredentials,
} from "@/lib/integrations/meta-credentials";
import {
  hasGeminiEnv,
  hasMetaPageToken,
  hasShopifyEnv,
  hasWhatsAppPhoneId,
  hasWhatsAppToken,
} from "@/lib/integrations/env-presence";
import { creativeModeLabel } from "@/lib/integrations/brand-labels";
import {
  getUserFromAccessToken,
  readBearerToken,
} from "@/lib/auth/supabase-auth";

/** @type {{ timezone: string, workflows: ReturnType<typeof buildWorkflows>, agents: ReturnType<typeof buildAgents> }} */
const runtimeState = {
  timezone: WORKSPACE.timezone,
  workflows: buildWorkflows(),
  agents: buildAgents(),
};

/**
 * @param {Request} request
 * @returns {Promise<{ ok: true, user: import('@supabase/supabase-js').User } | { ok: false, status: number, message: string }>}
 */
export async function requireAuth(request) {
  const token = readBearerToken(request);
  return getUserFromAccessToken(token);
}

/** @param {unknown} body */
function jsonOk(body, status = 200) {
  return { status, body };
}

/** @param {string} message @param {number} [status] */
function jsonErr(message, status = 400) {
  return { status, body: { message } };
}

/**
 * Laravel-shaped system clock for WorkspaceClock / overview.
 * @param {string} timezone
 */
export function systemTimePayload(timezone = WORKSPACE.timezone) {
  const tz = timezone || "UTC";
  const utc = new Date();
  let offsetMinutes = 0;
  let workspaceLocal = utc.toISOString();
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = Object.fromEntries(
      fmt.formatToParts(utc).map((p) => [p.type, p.value]),
    );
    workspaceLocal = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
    // Approximate offset via locale string compare
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    offsetMinutes = Math.round((asUtc - utc.getTime()) / 60000);
    workspaceLocal = new Date(asUtc).toISOString().replace("Z", "");
    // Prefer ISO with offset
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMinutes);
    const oh = String(Math.floor(abs / 60)).padStart(2, "0");
    const om = String(abs % 60).padStart(2, "0");
    workspaceLocal = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${sign}${oh}:${om}`;
  } catch {
    // keep UTC
  }

  return {
    utc: utc.toISOString(),
    workspace_local: workspaceLocal,
    timezone: tz,
    unix_ms: Date.now(),
    offset_minutes: offsetMinutes,
    server_generated_at: utc.toISOString(),
  };
}

/**
 * @param {string} method
 * @param {string[]} segments path after /api/v1/
 * @param {Request} request
 * @param {unknown} [body]
 */
export async function dispatchV1(method, segments, request, body) {
  const path = segments.join("/");
  const m = method.toUpperCase();

  // ---- system / settings ----
  if (path === "system/time" && m === "GET") {
    return jsonOk(systemTimePayload(runtimeState.timezone));
  }

  if (path === "settings" && m === "GET") {
    return jsonOk({
      workspace: { ...WORKSPACE, timezone: runtimeState.timezone },
      source: "next_dual_run",
    });
  }

  if (path === "settings" && (m === "PATCH" || m === "PUT" || m === "POST")) {
    const fromRoot =
      body && typeof body === "object" && typeof body.timezone === "string"
        ? body.timezone.trim()
        : "";
    const fromWorkspace =
      body &&
      typeof body === "object" &&
      body.workspace &&
      typeof body.workspace === "object" &&
      typeof body.workspace.timezone === "string"
        ? body.workspace.timezone.trim()
        : "";
    const tz = fromRoot || fromWorkspace || runtimeState.timezone;
    if (tz) runtimeState.timezone = tz;
    return jsonOk({
      workspace: { ...WORKSPACE, timezone: runtimeState.timezone },
      ok: true,
    });
  }

  // ---- dashboard / catalog ----
  if (path === "dashboard" && m === "GET") {
    const anthropic = await getAnthropicStatus();
    return jsonOk(
      buildDashboard({
        anthropicHasCredentials: anthropic.has_credentials,
        anthropicModel: anthropic.model,
      }),
    );
  }

  if (path === "services" && m === "GET") {
    return jsonOk(paginate(SERVICES));
  }

  if (path === "products" && m === "GET") {
    return jsonOk(paginate(PRODUCTS));
  }

  if (path === "content" && m === "GET") {
    return jsonOk(paginate(buildContent()));
  }

  if (path.startsWith("content/") && m === "POST") {
    const parts = segments;
    const contentId = parts[1];
    const action = parts[2];
    const item = buildContent().find((c) => c.id === contentId) || {
      id: contentId,
      title: "Content",
      status: "approved",
    };
    if (action === "approve") {
      return jsonOk({
        content: { ...item, status: "approved", approved_at: new Date().toISOString() },
        creative: { ok: true, mode: "local_seed", variant_count: 0 },
        automations: [],
      });
    }
    if (action === "schedule" || action === "publish") {
      return jsonOk({
        ok: true,
        content: { ...item, status: action === "publish" ? "published" : "scheduled" },
        publication: {
          id: `pub-${contentId}`,
          channel: body?.channel || item.channel || "instagram",
          status: action === "publish" ? "published" : "scheduled",
        },
      });
    }
    if (
      action === "generate-image" ||
      action === "generate-variants" ||
      action === "generate-video" ||
      action === "generate-animation" ||
      action === "ensure-creative"
    ) {
      const live = hasGeminiEnv();
      return jsonOk({
        ok: true,
        mode: live ? "gemini" : "local_sim",
        mode_label: creativeModeLabel(live ? "gemini" : "local_sim"),
        message: "Creative generation ready on Next dual-run.",
        content_id: contentId,
      });
    }
    return jsonOk({ ok: true, content: item });
  }

  if (path.match(/^content\/[^/]+\/media$/) && m === "GET") {
    return jsonOk({ data: [], mode: "local_seed" });
  }

  if (path === "publications" && m === "GET") {
    return jsonOk({
      data: [
        {
          id: "pub-1",
          content_id: "content-tides",
          channel: "facebook",
          status: "scheduled",
          scheduled_for: new Date(Date.now() + 86400000).toISOString(),
        },
      ],
    });
  }

  if (path === "creative/status" && m === "GET") {
    const live = hasGeminiEnv();
    return jsonOk({
      mode: live ? "gemini" : "local_sim",
      mode_label: creativeModeLabel(live ? "gemini" : "local_sim"),
      has_gemini: live,
      image: {
        mode: live ? "gemini" : "local_sim",
        mode_label: creativeModeLabel(live ? "gemini" : "local_sim"),
        message: live
          ? "Image generation uses live AI."
          : "Image generation runs locally until AI keys are present.",
      },
      video: {
        mode: live ? "gemini" : "local_sim",
        mode_label: creativeModeLabel(live ? "gemini" : "local_sim"),
        message: live
          ? "Short video and animation use live AI."
          : "Video tools run locally until AI keys are present.",
      },
      resize_engine: "triada",
      summary: live
        ? "Creative AI is connected."
        : "Creative tools run locally until AI keys are present.",
    });
  }

  // ---- integrations ----
  if (path === "integrations" && m === "GET") {
    const [anthropic, meta] = await Promise.all([getAnthropicStatus(), getMetaStatus()]);
    return jsonOk({
      data: buildIntegrationsList({
        anthropicHasCredentials: anthropic.has_credentials,
        anthropicModel: anthropic.model,
        metaFacebookReady: meta.facebook_ready,
        metaMessengerReady: meta.messenger_ready,
        metaInstagramReady: meta.instagram_ready,
        metaWhatsAppReady: meta.whatsapp_ready,
      }),
    });
  }

  if (path === "integrations/health" && m === "GET") {
    const [anthropic, meta] = await Promise.all([getAnthropicStatus(), getMetaStatus()]);
    return jsonOk(buildIntegrationsHealth({ anthropic, meta }));
  }

  if (path === "integrations/wordpress/drafts" && m === "POST") {
    return jsonOk(
      {
        id: `wp-draft-${Date.now()}`,
        title: body?.title || "Untitled draft",
        status: "draft",
        source: "next_seed",
      },
      201,
    );
  }

  if (path === "integrations/wordpress/posts" && m === "GET") {
    const anthropic = await getAnthropicStatus();
    return jsonOk({
      mode: "local",
      data: buildIntegrationsHealth({ anthropic }).wordpress_posts,
    });
  }

  if (path === "integrations/anthropic" && m === "POST") {
    const input =
      body && typeof body === "object"
        ? /** @type {{ api_key?: string, model?: string }} */ (body)
        : {};
    const result = await saveAnthropicCredentials(input);
    if (!result.ok) {
      return jsonErr(result.message, result.status || 422);
    }
    return jsonOk({
      ok: true,
      anthropic: result.anthropic,
      storage: result.storage,
      source: "next_dual_run",
    });
  }

  if (path === "integrations/anthropic/clear" && m === "POST") {
    const result = await clearAnthropicCredentials();
    return jsonOk({
      ok: true,
      anthropic: result.anthropic,
      storage: result.storage,
      source: "next_dual_run",
    });
  }

  if (path === "integrations/anthropic/status" && m === "GET") {
    return jsonOk(await getAnthropicStatus());
  }

  if (path === "integrations/zoho" && m === "POST") {
    return jsonOk({
      ok: true,
      zoho: {
        has_credentials: Boolean(body?.client_id || body?.refresh_token),
        status:
          body?.client_id || body?.refresh_token
            ? "connected"
            : "awaiting_credentials",
        honesty: "Zoho credentials accepted in dual-run memory for this instance.",
      },
      books: { status: "awaiting_credentials" },
    });
  }

  if (path === "integrations/zoho/clear" && m === "POST") {
    return jsonOk({
      ok: true,
      zoho: { has_credentials: false, status: "awaiting_credentials" },
      books: { status: "awaiting_credentials" },
    });
  }

  if (path === "integrations/zoho/status" && m === "GET") {
    return jsonOk({
      zoho: buildIntegrationsHealth().zoho.credentials,
      books: buildIntegrationsHealth().zoho_books,
    });
  }

  if (path === "integrations/meta/status" && m === "GET") {
    const meta = await getMetaStatus();
    return jsonOk(buildIntegrationsHealth({ meta }).meta);
  }

  if (path === "integrations/meta" && m === "POST") {
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, string>} */ (body)
        : {};
    const result = await saveMetaCredentials(input);
    if (!result.ok) {
      return jsonErr(result.message, result.status || 422);
    }
    return jsonOk({
      ok: true,
      meta: result.meta,
      health: buildIntegrationsHealth({ meta: result.meta }).meta,
      storage: result.storage,
      source: "next_dual_run",
    });
  }

  if (path === "integrations/meta/clear" && m === "POST") {
    const result = await clearMetaCredentials();
    return jsonOk({
      ok: true,
      meta: result.meta,
      health: buildIntegrationsHealth({ meta: result.meta }).meta,
      storage: result.storage,
      source: "next_dual_run",
    });
  }

  if (path === "integrations/meta/accounts" && m === "GET") {
    const url = new URL(request.url);
    const channel = url.searchParams.get("channel") || "facebook";
    const meta = await getMetaStatus();
    const pageReady =
      channel === "whatsapp" ? meta.whatsapp_ready : meta.facebook_ready;
    return jsonOk({
      channel,
      data: pageReady || hasMetaPageToken()
        ? [
            {
              id: `${channel}-page-1`,
              name: `Triada Designs (${channel})`,
              status: "connected",
            },
          ]
        : [],
    });
  }

  if (path === "integrations/meta/connect" && m === "POST") {
    // Prefer credential persist when body carries Meta keys; else ack connect.
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, string>} */ (body)
        : {};
    const hasCredFields = Boolean(
      input.app_id ||
        input.page_access_token ||
        input.wa_access_token ||
        input.api_key ||
        input.access_token,
    );
    if (hasCredFields) {
      const normalized = {
        app_id: input.app_id,
        app_secret: input.app_secret,
        page_access_token:
          input.page_access_token || input.access_token || input.api_key,
        wa_access_token: input.wa_access_token,
        wa_phone_number_id: input.wa_phone_number_id || input.phone_number_id,
        wa_business_account_id:
          input.wa_business_account_id || input.business_account_id,
        verify_token: input.verify_token,
      };
      const result = await saveMetaCredentials(normalized);
      if (!result.ok) {
        return jsonErr(result.message, result.status || 422);
      }
      return jsonOk({
        ok: true,
        mode: "next_dual_run",
        meta: result.meta,
        health: buildIntegrationsHealth({ meta: result.meta }).meta,
        storage: result.storage,
        message: "Meta credentials saved. Channels marked Connected.",
        verify_token_hint: "triada-meta-verify-2026",
      });
    }
    return jsonOk({
      ok: true,
      mode: "next_dual_run",
      message: "integrations/meta/connect accepted on Next dual-run (Laravel offline).",
      verify_token_hint: "triada-meta-verify-2026",
    });
  }

  if (
    (path === "integrations/meta/disconnect" ||
      path === "integrations/meta/webhook/subscribe" ||
      path === "integrations/meta/verify-token/rotate" ||
      path === "integrations/meta/test-send" ||
      path === "integrations/meta/simulate-inbound") &&
    m === "POST"
  ) {
    if (path === "integrations/meta/disconnect") {
      const result = await clearMetaCredentials();
      return jsonOk({
        ok: true,
        mode: "next_dual_run",
        meta: result.meta,
        health: buildIntegrationsHealth({ meta: result.meta }).meta,
        message: "Stored Meta credentials cleared.",
        verify_token_hint: "triada-meta-verify-2026",
      });
    }
    return jsonOk({
      ok: true,
      mode: "next_dual_run",
      message: `${path} accepted on Next dual-run (Laravel offline).`,
      verify_token_hint: "triada-meta-verify-2026",
    });
  }

  if (path === "integrations/meta/webhook" && m === "GET") {
    return jsonOk({
      callback_url: "https://dashboard.triada-designs.com/api/webhooks/meta",
      verify_token_configured: true,
    });
  }

  if (path === "integrations/whatsapp/templates" && m === "GET") {
    return jsonOk({
      data: [
        {
          id: "wa-tpl-welcome",
          name: "welcome_triada",
          language: "en",
          status: "APPROVED",
          category: "MARKETING",
          body: "Welcome to Triada Designs — reply CARE for aftercare tips.",
        },
      ],
      mode: hasWhatsAppToken() ? "live_ready" : "local_seed",
    });
  }

  if (
    (path === "integrations/whatsapp/templates" ||
      path === "integrations/whatsapp/templates/sync" ||
      path === "integrations/whatsapp/send-template") &&
    m === "POST"
  ) {
    return jsonOk({
      ok: true,
      mode: "next_dual_run",
      template: body || { name: "welcome_triada" },
    });
  }

  if (path.match(/^integrations\/whatsapp\/templates\/[^/]+$/) && (m === "PUT" || m === "PATCH")) {
    return jsonOk({ ok: true, template: { id: segments[3], ...(body || {}) } });
  }

  if (path === "integrations/whatsapp/status" && m === "GET") {
    const meta = await getMetaStatus();
    const connected = meta.whatsapp_ready || hasWhatsAppToken();
    return jsonOk({
      connected,
      phone_number_id_present:
        meta.has_wa_phone_number_id || hasWhatsAppPhoneId(),
      status: connected ? "connected" : "awaiting_credentials",
      status_label: connected ? "Connected" : "Needs setup",
    });
  }

  if (path === "integrations/shopify/status" && m === "GET") {
    const connected = hasShopifyEnv();
    return jsonOk({
      connected,
      store: "jwtjzw-nu.myshopify.com",
      status: connected ? "connected" : "awaiting_credentials",
      status_label: connected ? "Connected" : "Needs setup",
      summary: connected
        ? "Shopify Admin API is connected."
        : "Connect Shopify Admin API on Integrations → Shopify.",
    });
  }

  if (
    (path === "integrations/shopify/connect" ||
      path === "integrations/shopify/disconnect" ||
      path === "integrations/shopify/sync") &&
    m === "POST"
  ) {
    return jsonOk({
      ok: true,
      mode: "next_dual_run",
      message: `${path} stubbed — provide Shopify credentials to go live.`,
    });
  }

  if (path === "integrations/channels/status" && m === "GET") {
    return jsonOk({
      data: buildIntegrationsList().filter((i) =>
        ["telegram", "tiktok", "email", "linkedin", "webchat"].includes(i.provider),
      ),
    });
  }

  if (
    (path === "integrations/channels/connect" ||
      path === "integrations/channels/disconnect" ||
      path === "integrations/channels/simulate-inbound" ||
      path === "integrations/channels/webchat-token") &&
    m === "POST"
  ) {
    return jsonOk({
      ok: true,
      token: path.includes("webchat") ? `webchat_${Date.now()}` : undefined,
      mode: "next_dual_run",
    });
  }

  // ---- CRM / inbox ----
  if (path === "contacts" && m === "GET") {
    return jsonOk({ data: buildContacts() });
  }

  if (path === "contacts" && m === "POST") {
    return jsonOk(
      {
        id: `contact-${Date.now()}`,
        workspace_id: WORKSPACE.id,
        ...(body && typeof body === "object" ? body : {}),
      },
      201,
    );
  }

  if (path.match(/^contacts\/[^/]+$/) && m === "GET") {
    const c = buildContacts().find((x) => x.id === segments[1]);
    return c ? jsonOk(c) : jsonErr("Contact not found.", 404);
  }

  if (path === "conversations" && m === "GET") {
    return jsonOk({ data: buildConversations() });
  }

  if (path.match(/^conversations\/[^/]+$/) && m === "GET") {
    const c = buildConversations().find((x) => x.id === segments[1]);
    return c
      ? jsonOk({ conversation: c, messages: [] })
      : jsonErr("Conversation not found.", 404);
  }

  if (path.match(/^conversations\/[^/]+\/(takeover|resume-ai|messages)$/) && m === "POST") {
    const action = segments[2];
    return jsonOk({
      id: segments[1],
      automation_mode: action === "takeover" ? "human" : "ai",
      ok: true,
    });
  }

  if (path === "leads" && m === "GET") {
    return jsonOk({ data: buildLeads() });
  }

  if (path.match(/^leads\/[^/]+\/sync-zoho$/) && m === "POST") {
    return jsonOk({
      ok: true,
      lead_id: segments[1],
      zoho: { status: "awaiting_credentials" },
      message: "Zoho sync queued on dual-run (credentials pending).",
    });
  }

  if (path === "opportunities" && m === "GET") {
    return jsonOk({
      data: [
        {
          id: "opp-1",
          title: "Custom 18K set",
          stage: "proposal",
          value: 4200,
          currency: "AED",
        },
      ],
    });
  }

  // ---- automations ----
  if (path === "automations" && m === "GET") {
    return jsonOk({
      data: runtimeState.workflows.map((w) => {
        const { definition, ...rest } = w;
        return rest;
      }),
      meta: {
        node_types: ["trigger", "action", "condition"],
        trigger_types: ["message_inbound", "schedule", "lead_stage_changed", "shopify_order"],
        action_types: ["send_message", "create_task", "sync_zoho", "notify_telegram"],
      },
    });
  }

  if (path === "automations/validate" && m === "POST") {
    return jsonOk({
      valid: true,
      validation: { valid: true, errors: [], warnings: [] },
    });
  }

  if (path.match(/^automations\/[^/]+$/) && m === "GET") {
    const wf = runtimeState.workflows.find((w) => w.id === segments[1]);
    if (!wf) return jsonErr("Workflow not found.", 404);
    return jsonOk({
      workflow: wf,
      meta: {
        node_types: ["trigger", "action", "condition"],
        trigger_types: ["message_inbound", "schedule", "lead_stage_changed", "shopify_order"],
        action_types: ["send_message", "create_task", "sync_zoho", "notify_telegram"],
      },
    });
  }

  if (path.match(/^automations\/[^/]+$/) && (m === "PUT" || m === "PATCH")) {
    const idx = runtimeState.workflows.findIndex((w) => w.id === segments[1]);
    if (idx < 0) return jsonErr("Workflow not found.", 404);
    const current = runtimeState.workflows[idx];
    const next = {
      ...current,
      ...(body && typeof body === "object" ? body : {}),
      id: current.id,
      updated_at: new Date().toISOString(),
      version: (current.version || 1) + (body?.definition ? 1 : 0),
    };
    if (body?.definition && current.status === "active") {
      next.status = "draft";
      next.activated_at = null;
    }
    runtimeState.workflows[idx] = next;
    return jsonOk({
      workflow: next,
      validation: { valid: true, errors: [], warnings: [] },
    });
  }

  if (path.match(/^automations\/[^/]+\/activate$/) && m === "POST") {
    const wf = runtimeState.workflows.find((w) => w.id === segments[1]);
    if (!wf) return jsonErr("Workflow not found.", 404);
    wf.status = "active";
    wf.activated_at = new Date().toISOString();
    return jsonOk({ workflow: wf, ok: true });
  }

  if (path.match(/^automations\/[^/]+\/deactivate$/) && m === "POST") {
    const wf = runtimeState.workflows.find((w) => w.id === segments[1]);
    if (!wf) return jsonErr("Workflow not found.", 404);
    wf.status = "disabled";
    return jsonOk({ workflow: wf, ok: true });
  }

  if (path.match(/^automations\/[^/]+\/(dry-run|run)$/) && m === "POST") {
    return jsonOk({
      ok: true,
      run: {
        id: `run-${Date.now()}`,
        workflow_id: segments[1],
        status: "completed",
        mode: segments[2] === "dry-run" ? "dry_run" : "live",
      },
    });
  }

  if (path.match(/^automations\/[^/]+\/runs$/) && m === "GET") {
    return jsonOk({
      data: [
        {
          id: "run-seed-1",
          workflow_id: segments[1],
          status: "completed",
          mode: "live",
          started_at: new Date(Date.now() - 3600000).toISOString(),
        },
      ],
    });
  }

  if (path.match(/^automations\/[^/]+\/runs\/[^/]+$/) && m === "GET") {
    return jsonOk({
      run: {
        id: segments[3],
        workflow_id: segments[1],
        status: "completed",
        mode: "live",
        steps: [],
      },
    });
  }

  // ---- channel templates ----
  if (path === "channel-templates" && m === "GET") {
    return jsonOk({
      data: [
        {
          id: "ct-wa-welcome",
          channel: "whatsapp",
          name: "welcome_triada",
          status: "approved",
          language: "en",
          body: "Welcome to Triada Designs.",
        },
      ],
    });
  }

  if (path === "channel-templates" && m === "POST") {
    return jsonOk(
      {
        template: {
          id: `ct-${Date.now()}`,
          status: "draft",
          ...(body && typeof body === "object" ? body : {}),
        },
      },
      201,
    );
  }

  if (path.match(/^channel-templates\/[^/]+$/) && (m === "GET" || m === "PUT" || m === "PATCH")) {
    return jsonOk({
      template: {
        id: segments[1],
        channel: "whatsapp",
        name: "welcome_triada",
        status: "approved",
        ...(body && typeof body === "object" ? body : {}),
      },
    });
  }

  if (
    path.match(/^channel-templates\/[^/]+\/(submit-review|approve|reject|publish)$/) &&
    m === "POST"
  ) {
    return jsonOk({
      ok: true,
      template: { id: segments[1], status: segments[2] === "reject" ? "rejected" : "approved" },
    });
  }

  // ---- agents / ops lists ----
  if (path === "agents" && m === "GET") {
    return jsonOk({ data: runtimeState.agents });
  }

  if (path.match(/^agents\/[^/]+$/) && (m === "PATCH" || m === "PUT")) {
    const idx = runtimeState.agents.findIndex((a) => a.id === segments[1]);
    if (idx < 0) return jsonErr("Agent not found.", 404);
    runtimeState.agents[idx] = {
      ...runtimeState.agents[idx],
      ...(body && typeof body === "object" ? body : {}),
      id: runtimeState.agents[idx].id,
    };
    if (body && typeof body === "object" && "paused" in body) {
      runtimeState.agents[idx].status = body.paused ? "paused" : "active";
    }
    return jsonOk(runtimeState.agents[idx]);
  }

  if (path === "agents/llm/status" && m === "GET") {
    const anthropic = await getAnthropicStatus();
    return jsonOk(buildIntegrationsHealth({ anthropic }).llm);
  }

  if (path === "agents/activity" && m === "GET") {
    return jsonOk({
      data: [
        {
          id: "act-1",
          agent: "Jewellery answer-bot",
          event: "replied",
          channel: "instagram",
          at: new Date().toISOString(),
        },
      ],
    });
  }

  if (path === "agents/test-run" && m === "POST") {
    const anthropic = await getAnthropicStatus();
    return jsonOk({
      ok: true,
      mode: buildIntegrationsHealth({ anthropic }).llm.provider,
      output: "Seeded answer-bot reply: silver with gold plating; ~7 days to make. Prices from approved catalog only.",
    });
  }

  if (path === "knowledge" && m === "GET") {
    return jsonOk({
      data: [
        {
          id: "ks-1",
          title: "Materials & making time",
          status: "published",
          updated_at: new Date().toISOString(),
        },
        {
          id: "ks-2",
          title: "Care & plating",
          status: "published",
          updated_at: new Date().toISOString(),
        },
      ],
    });
  }

  if (path === "calendar" && m === "GET") {
    return jsonOk({ data: buildContent().filter((c) => c.scheduled_for) });
  }

  if (path === "campaigns" && m === "GET") {
    const items = buildContent();
    const byObjective = {};
    for (const item of items) {
      const key = item.objective || "general";
      if (!byObjective[key]) byObjective[key] = [];
      byObjective[key].push(item);
    }
    return jsonOk({
      data: Object.entries(byObjective).map(([objective, group]) => ({
        objective,
        items: group,
        count: group.length,
      })),
    });
  }

  if (path === "analytics" && m === "GET") {
    return jsonOk(buildAnalyticsPayload());
  }

  if (path === "team" && m === "GET") {
    return jsonOk({
      data: [
        {
          id: "member-1",
          name: "Triada Admin",
          email: "info@triada-designs.com",
          role: "admin",
        },
      ],
    });
  }

  if (path === "audit-logs" && m === "GET") {
    return jsonOk({
      data: [
        {
          id: "audit-1",
          action: "auth.login",
          actor: "info@triada-designs.com",
          at: new Date().toISOString(),
        },
      ],
    });
  }

  // ---- jewellery ops ----
  if (path === "jewellery-ops/overview" && m === "GET") {
    return jsonOk({
      ok: true,
      automations: {
        one_inbox: "channels: instagram, facebook, tiktok, whatsapp, telegram → /inbox",
        answer_bot: true,
        gift_finder: true,
        custom_pieces: true,
        order_lifecycle_whatsapp: true,
        automatic_invoice: true,
        telegram_alerts: true,
        abandonment_followup: true,
        waitlist_vip_drops: true,
        after_sale: true,
        ugc: true,
        outreach_crm: true,
        popup_markets: true,
        manufacturer: true,
        content_schedule: true,
      },
      counts: {
        orders: 2,
        invoices: 1,
        gift_sessions: 1,
        custom_requests: 1,
        waitlist: 0,
        abandonment: 1,
        telegram_alerts: 0,
        after_sale_jobs: 0,
        ugc: 1,
        outreach_prospects: 1,
        popup_markets: 1,
      },
      source: "next_dual_run",
    });
  }

  if (path === "jewellery-ops/answer-bot" && m === "POST") {
    return jsonOk({
      ok: true,
      reply:
        "Our Salt & Spirit pieces are silver with gold plating; 14K/18K gold on request. About 7 days to make. Prices come from the approved catalog only.",
      mode: "local_seed",
      handoff: false,
    });
  }

  if (path === "jewellery-ops/gift-finder" && m === "POST") {
    return jsonOk({
      ok: true,
      recommendations: PRODUCTS.slice(0, 3).map((p) => ({
        product_id: p.id,
        title: p.title,
        price: p.price,
        currency: p.currency,
      })),
      mode: "local_seed",
    });
  }

  if (path === "jewellery-ops/orders" && m === "GET") {
    return jsonOk({
      data: [
        {
          id: "ord-1",
          external_ref: "TD-1001",
          status: "in_production",
          customer_name: "Layla Al Maktoum",
          total: 1450,
          currency: "AED",
        },
      ],
    });
  }

  if (path === "jewellery-ops/orders" && m === "POST") {
    return jsonOk(
      {
        order: {
          id: `ord-${Date.now()}`,
          status: "received",
          ...(body && typeof body === "object" ? body : {}),
        },
      },
      201,
    );
  }

  if (path === "jewellery-ops/orders/where-is-my-order" && m === "POST") {
    return jsonOk({
      ok: true,
      query: body?.query,
      order: { id: "ord-1", status: "in_production", eta_days: 5 },
      message: "Your piece is with the manufacturer — about 5 days remaining.",
    });
  }

  if (path === "jewellery-ops/invoices" && m === "GET") {
    return jsonOk({
      data: [
        {
          id: "inv-1",
          order_id: "ord-1",
          status: "draft",
          total: 1450,
          currency: "AED",
          source: "local_seed",
        },
      ],
    });
  }

  if (path === "jewellery-ops/manufacturer" && m === "GET") {
    return jsonOk({
      materials: [
        {
          material_key: "silver_gold_plate",
          display_name: "Silver with gold plating",
          stock_grams: 420,
          low_stock_threshold_grams: 80,
        },
        {
          material_key: "14k",
          display_name: "14K gold",
          stock_grams: 35,
          low_stock_threshold_grams: 40,
        },
        {
          material_key: "18k",
          display_name: "18K gold",
          stock_grams: 22,
          low_stock_threshold_grams: 25,
        },
      ],
      open_jobs: 1,
      honesty: "Manufacturer board from Next dual-run seed.",
    });
  }

  if (path === "jewellery-ops/ugc" && m === "GET") {
    return jsonOk({
      data: [
        {
          id: "ugc-1",
          handle: "@guest",
          channel: "instagram",
          status: "pending_permission",
          caption: "Loving my Priest Ring",
        },
      ],
    });
  }

  if (path === "jewellery-ops/ugc/repost-queue" && m === "GET") {
    return jsonOk({ data: [] });
  }

  if (path === "jewellery-ops/ugc/tags" && m === "POST") {
    return jsonOk({ ok: true, item: { id: `ugc-${Date.now()}`, ...(body || {}) } }, 201);
  }

  if (path.match(/^jewellery-ops\/ugc\/[^/]+\/request-permission$/) && m === "POST") {
    return jsonOk({ ok: true, item_id: segments[2], status: "permission_requested" });
  }

  if (path === "jewellery-ops/outreach/prospects" && m === "GET") {
    return jsonOk({
      data: [
        {
          id: "prospect-1",
          name: "Boutique partner",
          channel: "email",
          status: "new",
        },
      ],
    });
  }

  if (path === "jewellery-ops/outreach/prospects" && m === "POST") {
    return jsonOk(
      {
        prospect: {
          id: `prospect-${Date.now()}`,
          status: "new",
          ...(body && typeof body === "object" ? body : {}),
        },
      },
      201,
    );
  }

  if (path.match(/^jewellery-ops\/outreach\/prospects\/[^/]+\/draft$/) && m === "POST") {
    return jsonOk(
      {
        ok: true,
        message: {
          id: `om-${Date.now()}`,
          prospect_id: segments[3],
          status: "draft",
          body: "Hello — Triada Designs Salt & Spirit collection for your buyers.",
        },
      },
      201,
    );
  }

  if (path === "jewellery-ops/outreach/messages" && m === "GET") {
    return jsonOk({ data: [] });
  }

  if (path.match(/^jewellery-ops\/outreach\/messages\/[^/]+\/approve$/) && m === "POST") {
    return jsonOk({ ok: true, message_id: segments[3], status: "approved" });
  }

  if (path === "jewellery-ops/popups" && m === "GET") {
    return jsonOk({
      data: [
        {
          id: "popup-1",
          name: "Dubai Design Week",
          application_deadline: new Date(Date.now() + 14 * 86400000).toISOString(),
          status: "open",
        },
      ],
    });
  }

  if (path === "jewellery-ops/popups" && m === "POST") {
    return jsonOk(
      {
        market: {
          id: `popup-${Date.now()}`,
          ...(body && typeof body === "object" ? body : {}),
        },
      },
      201,
    );
  }

  if (path === "jewellery-ops/popups/scan-alerts" && m === "POST") {
    return jsonOk({ ok: true, alerts: [] });
  }

  if (path.match(/^jewellery-ops\/popups\/[^/]+\/draft-application$/) && m === "POST") {
    return jsonOk(
      {
        application: {
          id: `pa-${Date.now()}`,
          market_id: segments[2],
          status: "draft",
        },
      },
      201,
    );
  }

  if (path === "jewellery-ops/popup-applications" && m === "GET") {
    return jsonOk({ data: [] });
  }

  if (
    path.match(/^jewellery-ops\/popup-applications\/[^/]+\/approve$/) &&
    m === "POST"
  ) {
    return jsonOk({ ok: true, application_id: segments[2], status: "approved" });
  }

  // Fallback: never rewrite to dead Laravel — return empty-but-valid JSON
  if (m === "GET") {
    return jsonOk({
      data: [],
      ok: true,
      source: "next_dual_run",
      path: `/api/v1/${path}`,
      message: "Seeded empty response (Laravel API_ORIGIN offline).",
    });
  }

  return jsonOk({
    ok: true,
    source: "next_dual_run",
    path: `/api/v1/${path}`,
    message: "Accepted on Next dual-run stub.",
  });
}
