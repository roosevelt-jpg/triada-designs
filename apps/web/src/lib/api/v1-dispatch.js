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
  importContactRows,
  listContacts,
  listWhatsAppCampaignRecipients,
  upsertContacts,
} from "@/lib/crm/contacts-store";
import { syncWhatsAppContactsToCrm } from "@/lib/crm/meta-contact-sync";
import { mapContactUploadRows } from "@/lib/crm/parse-contacts-file";
import { toWhatsAppRecipient } from "@/lib/crm/phone-e164";
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
  createAndSubmitWhatsAppTemplate,
  listWhatsAppTemplatesPayload,
  seedWhatsAppAutomationTemplates,
  sendWhatsAppTemplateMessage,
  syncWhatsAppTemplates,
  triadaAutomationWhatsAppTemplateCatalog,
  updateAndSubmitWhatsAppTemplate,
  whatsappTemplateStatus,
} from "@/lib/integrations/whatsapp-cloud-templates";
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
import { runAgentOrchestration } from "@/lib/agents/orchestrator";
import { runTeamCollaboration } from "@/lib/agents/team-orchestrator";
import {
  assignTask,
  createAgent,
  listAgents,
  listTasks,
  updateAgent,
  updateTask,
} from "@/lib/agents/agent-store";
import {
  getSharedKv,
  listSharedKv,
  setSharedKv,
} from "@/lib/agents/shared-memory";
import {
  deleteTrainingDoc,
  listTrainingDocs,
  retrieveTrainingDocs,
  upsertTrainingDoc,
} from "@/lib/training/training-docs-store";
import {
  TEMPLATE_CATEGORIES,
  isTemplateCategory,
  mapTemplateCategoryToMeta,
  normalizeTemplateCategory,
} from "@/lib/templates/categories";
import { wrapChannelTemplate } from "@/lib/brand/wrap-template";
import { wrapEmailMessage } from "@/lib/brand/wrap-email";
import { wrapInvoiceDocument } from "@/lib/brand/wrap-invoice";
import { ensureBrandedOutboundText } from "@/lib/brand/wrap-message";
import { BRAND, brandLogoUrl } from "@/lib/brand/identity";

/** @type {{ timezone: string, workflows: ReturnType<typeof buildWorkflows>, agents: Awaited<ReturnType<typeof listAgents>>["data"] }} */
const runtimeState = {
  timezone: WORKSPACE.timezone,
  workflows: buildWorkflows(),
  agents: buildAgents(),
};

let agentsHydrated = false;

async function hydrateAgents() {
  if (agentsHydrated) return runtimeState.agents;
  try {
    const listed = await listAgents();
    if (listed.data?.length) {
      runtimeState.agents = listed.data;
    }
  } catch {
    /* keep seed */
  }
  agentsHydrated = true;
  return runtimeState.agents;
}

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
    try {
      const payload = await listWhatsAppTemplatesPayload();
      return jsonOk(payload);
    } catch (err) {
      return jsonErr(
        err instanceof Error ? err.message : "Failed to list WhatsApp templates",
        502,
      );
    }
  }

  if (path === "integrations/whatsapp/templates/sync" && m === "POST") {
    try {
      const result = await syncWhatsAppTemplates();
      return jsonOk(result);
    } catch (err) {
      return jsonErr(
        err instanceof Error ? err.message : "WhatsApp template sync failed",
        502,
      );
    }
  }

  if (path === "integrations/whatsapp/templates/seed" && m === "POST") {
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    try {
      const result = await seedWhatsAppAutomationTemplates({
        submit: input.submit !== false && input.submit !== "false",
        force: input.force === true || input.force === "true",
        campaign_types: Array.isArray(input.campaign_types)
          ? input.campaign_types.map(String)
          : undefined,
      });
      return jsonOk(result, result.ok ? 200 : 207);
    } catch (err) {
      return jsonErr(
        err instanceof Error ? err.message : "WhatsApp template seed failed",
        502,
      );
    }
  }

  if (path === "integrations/whatsapp/templates/catalog" && m === "GET") {
    const catalog = triadaAutomationWhatsAppTemplateCatalog();
    return jsonOk({
      data: catalog,
      count: catalog.length,
      source: "automation_doc",
    });
  }

  if (path === "integrations/whatsapp/templates" && m === "POST") {
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    if (!input.name || !input.body) {
      return jsonErr("name and body are required to submit a WhatsApp template.", 422);
    }
    const result = await createAndSubmitWhatsAppTemplate(input);
    return jsonOk(result, result.ok ? 201 : 422);
  }

  if (path === "integrations/whatsapp/send-template" && m === "POST") {
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    if (!input.to || !input.template_name) {
      return jsonErr("to and template_name are required.", 422);
    }
    if (input.marketing_opt_out === true && input.purpose !== "transactional") {
      return {
        status: 422,
        body: { ok: false, error: "marketing_opt_out", eligibility: { eligible: false } },
      };
    }
    const result = await sendWhatsAppTemplateMessage({
      to: String(input.to),
      template_name: String(input.template_name),
      language: input.language ? String(input.language) : "en",
      components: Array.isArray(input.components) ? input.components : [],
    });
    return jsonOk(result, result.ok ? 200 : 422);
  }

  if (path.match(/^integrations\/whatsapp\/templates\/[^/]+$/) && (m === "PUT" || m === "PATCH")) {
    const templateId = segments[3];
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    const result = await updateAndSubmitWhatsAppTemplate(templateId, input);
    if (!result.template && result.error === "Template not found") {
      return jsonErr(result.error, 404);
    }
    return jsonOk(result, result.ok ? 200 : 422);
  }

  if (path === "integrations/whatsapp/status" && m === "GET") {
    const meta = await getMetaStatus();
    const waStatus = await whatsappTemplateStatus();
    const connected = meta.whatsapp_ready || hasWhatsAppToken() || waStatus.configured;
    return jsonOk({
      ...waStatus,
      connected,
      phone_number_id_present:
        waStatus.phone_number_id_present ||
        meta.has_wa_phone_number_id ||
        hasWhatsAppPhoneId(),
      status: connected
        ? waStatus.mode === "live"
          ? "live"
          : "connected"
        : "awaiting_credentials",
      status_label: connected
        ? waStatus.mode === "live"
          ? "Live Cloud API"
          : "Connected"
        : "Needs setup",
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
    const url = new URL(request.url);
    const q = url.searchParams.get("q") || "";
    const whatsappReady = ["1", "true", "yes"].includes(
      String(url.searchParams.get("whatsapp_ready") || "").toLowerCase(),
    );
    const listed = await listContacts({ q, whatsapp_ready: whatsappReady });
    return jsonOk({
      data: listed.data,
      mode: listed.mode,
      source: "next_dual_run",
    });
  }

  if (path === "contacts" && m === "POST") {
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    const result = await upsertContacts([
      {
        ...input,
        source: input.source || "manual",
      },
    ]);
    return jsonOk(
      {
        ...(result.upserted[0] || {}),
        mode: result.mode,
        source: "next_dual_run",
      },
      201,
    );
  }

  if (path === "contacts/import" && m === "POST") {
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    const format = String(input.format || "csv").toLowerCase();
    const source =
      format === "excel" || format === "xlsx" ? "excel_upload" : "csv_upload";
    const rawRows = Array.isArray(input.rows) ? input.rows : [];
    if (!rawRows.length) {
      return jsonErr("rows[] is required (parse CSV/Excel client-side first).", 422);
    }
    const mapped = mapContactUploadRows(
      /** @type {Record<string, string>[]} */ (rawRows),
      { defaultRegion: String(input.default_region || "AE"), source },
    );
    const imported = await importContactRows(mapped.rows, { source });
    return jsonOk({
      ok: true,
      mode: imported.mode,
      source: "next_dual_run",
      summary: imported.summary,
      invalid: imported.invalid,
      imported: imported.imported,
      preview_invalid: mapped.invalid.slice(0, 50),
    });
  }

  if (
    (path === "contacts/sync-whatsapp" || path === "contacts/sync-meta") &&
    m === "POST"
  ) {
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    try {
      const result = await syncWhatsAppContactsToCrm({
        phones: Array.isArray(input.phones) ? input.phones.map(String) : [],
        contacts: Array.isArray(input.contacts)
          ? /** @type {Array<{ phone?: string, name?: string, email?: string }>} */ (
              input.contacts
            )
          : [],
        include_inbound: input.include_inbound !== false,
        include_crm: input.include_crm === true,
        default_region: String(input.default_region || "AE"),
      });
      return jsonOk(
        {
          ...result,
          source: "next_dual_run",
        },
        result.ok ? 200 : 502,
      );
    } catch (err) {
      return jsonErr(
        err instanceof Error ? err.message : "WhatsApp contact sync failed",
        502,
      );
    }
  }

  if (path === "contacts/whatsapp-recipients" && m === "GET") {
    const listed = await listWhatsAppCampaignRecipients();
    return jsonOk({
      data: listed.data.map((c) => ({
        id: c.id,
        name: c.name,
        phone_e164: c.phone_e164,
        phone_normalized: c.phone_normalized,
        to: c.phone_normalized,
        marketing_opt_out: c.marketing_opt_out,
      })),
      mode: listed.mode,
      source: "next_dual_run",
    });
  }

  if (path.match(/^contacts\/[^/]+$/) && m === "GET") {
    const listed = await listContacts({});
    const c = listed.data.find((x) => x.id === segments[1]);
    return c
      ? jsonOk({ ...c, mode: listed.mode })
      : jsonErr("Contact not found.", 404);
  }

  if (path === "integrations/whatsapp/campaign-send" && m === "POST") {
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    const templateName = String(input.template_name || "").trim();
    if (!templateName) {
      return jsonErr("template_name is required.", 422);
    }
    if (input.marketing_opt_out === true && input.purpose !== "transactional") {
      return {
        status: 422,
        body: {
          ok: false,
          error: "marketing_opt_out",
          eligibility: { eligible: false },
        },
      };
    }

    const listed = await listWhatsAppCampaignRecipients();
    let recipients = listed.data;
    if (Array.isArray(input.contact_ids) && input.contact_ids.length) {
      const allow = new Set(input.contact_ids.map(String));
      recipients = recipients.filter((c) => allow.has(c.id));
    }

    const limit = Math.min(
      Math.max(Number(input.limit) || recipients.length, 0),
      100,
    );
    recipients = recipients.slice(0, limit);

    const results = [];
    for (const contact of recipients) {
      if (contact.marketing_opt_out && input.purpose !== "transactional") {
        results.push({
          contact_id: contact.id,
          to: contact.phone_normalized,
          ok: false,
          error: "marketing_opt_out",
        });
        continue;
      }
      const to =
        contact.phone_normalized ||
        toWhatsAppRecipient(contact.phone_e164 || contact.phone);
      if (!to) {
        results.push({
          contact_id: contact.id,
          to: null,
          ok: false,
          error: "invalid_phone",
        });
        continue;
      }
      const send = await sendWhatsAppTemplateMessage({
        to,
        template_name: templateName,
        language: input.language ? String(input.language) : "en",
        components: Array.isArray(input.components) ? input.components : [],
      });
      results.push({
        contact_id: contact.id,
        name: contact.name,
        to,
        phone_e164: contact.phone_e164,
        ok: send.ok,
        mode: send.mode,
        provider_message_id: send.provider_message_id,
        error: send.error,
      });
    }

    return jsonOk({
      ok: results.every((r) => r.ok),
      mode: listed.mode,
      template_name: templateName,
      attempted: results.length,
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
      source: "next_dual_run",
    });
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
    const url = new URL(request.url);
    const platform = (url.searchParams.get("platform") || "").toLowerCase();
    if (!platform || platform === "whatsapp") {
      const wa = await listWhatsAppTemplatesPayload();
      let data = Array.isArray(wa.data) ? wa.data : [];
      if (platform === "whatsapp") {
        return jsonOk({ data, meta: { source: "whatsapp_cloud", mode: wa.status?.mode } });
      }
      // All platforms: WhatsApp Cloud templates + a small multi-channel seed
      return jsonOk({
        data: [
          ...data,
          {
            id: "ct-ig-welcome",
            platform: "instagram",
            name: "ig_welcome",
            status: "draft",
            body: "Thanks for messaging Triada Designs on Instagram.",
          },
        ],
        meta: { source: "next_dual_run", whatsapp_mode: wa.status?.mode },
      });
    }
    return jsonOk({
      data: [
        {
          id: `ct-${platform}-seed`,
          platform,
          name: `${platform}_seed`,
          status: "draft",
          body: `Triada Designs ${platform} template draft.`,
        },
      ],
    });
  }

  if (path === "channel-templates/categories" && m === "GET") {
    return jsonOk({ data: TEMPLATE_CATEGORIES });
  }

  if (path === "channel-templates" && m === "POST") {
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    const platform = String(input.platform || "whatsapp").toLowerCase();
    const category = normalizeTemplateCategory(input.category, "product_inquiry");
    if (input.category != null && input.category !== "" && !isTemplateCategory(category)) {
      return jsonErr(
        `Category must be one of: ${TEMPLATE_CATEGORIES.map((c) => c.value).join(", ")}`,
        422,
      );
    }
    const branded = wrapChannelTemplate({
      platform,
      name: String(input.name || ""),
      body: String(input.body || ""),
      subject: input.subject ? String(input.subject) : undefined,
      greetingKind: input.greeting_kind ? String(input.greeting_kind) : "default",
    });
    if (platform === "whatsapp") {
      // Create + submit to Meta Graph (or local_sim) so dashboard approval path is live-capable.
      const result = await createAndSubmitWhatsAppTemplate({
        name: input.name,
        body: branded.body,
        category: mapTemplateCategoryToMeta(category),
        language: input.language || "en",
        variables: input.variables,
        components: input.components || branded.components,
      });
      return jsonOk(
        {
          template: {
            ...result.template,
            category,
            meta_category: mapTemplateCategoryToMeta(category),
            branded: true,
            logo_url: branded.logo_url,
            greeting: branded.greeting,
          },
          ok: result.ok,
          mode: result.mode,
          error: result.error,
          external: result.external,
          branded: true,
        },
        result.ok ? 201 : 422,
      );
    }
    return jsonOk(
      {
        template: {
          id: `ct-${Date.now()}`,
          status: "draft",
          platform,
          name: String(input.name || "template"),
          category,
          body: branded.body,
          html: branded.html || undefined,
          subject: branded.subject || undefined,
          branded: true,
          logo_url: branded.logo_url,
          greeting: branded.greeting,
          preview: branded.preview,
        },
      },
      201,
    );
  }

  if (path.match(/^channel-templates\/[^/]+$/) && (m === "GET" || m === "PUT" || m === "PATCH")) {
    const templateId = segments[1];
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    if (m === "GET") {
      const wa = await listWhatsAppTemplatesPayload();
      const hit = (wa.data || []).find((t) => String(t.id) === String(templateId));
      if (hit) return jsonOk({ template: hit });
      return jsonOk({
        template: {
          id: templateId,
          platform: "whatsapp",
          name: "welcome_triada",
          status: "approved",
        },
      });
    }
    // Prefer WhatsApp Cloud re-submit when the id is known there or platform is whatsapp.
    const waList = await listWhatsAppTemplatesPayload();
    const known = (waList.data || []).find((t) => String(t.id) === String(templateId));
    if (input.category != null && input.category !== "") {
      input.category = normalizeTemplateCategory(input.category, "general");
      if (!isTemplateCategory(input.category)) {
        return jsonErr(
          `Category must be one of: ${TEMPLATE_CATEGORIES.map((c) => c.value).join(", ")}`,
          422,
        );
      }
    }
    if (known || String(input.platform || "").toLowerCase() === "whatsapp") {
      const metaInput = {
        ...input,
        category: input.category
          ? mapTemplateCategoryToMeta(input.category)
          : input.category,
      };
      const result = await updateAndSubmitWhatsAppTemplate(templateId, metaInput);
      if (!result.template && result.error === "Template not found") {
        return jsonErr(result.error, 404);
      }
      return jsonOk({
        template: result.template,
        ok: result.ok,
        mode: result.mode,
        error: result.error,
      }, result.ok ? 200 : 422);
    }
    return jsonOk({
      template: {
        id: templateId,
        platform: input.platform || "facebook",
        status: "draft",
        ...input,
      },
    });
  }

  if (
    path.match(/^channel-templates\/[^/]+\/(submit-review|approve|reject|publish)$/) &&
    m === "POST"
  ) {
    const templateId = segments[1];
    const action = segments[2];
    if (action === "submit-review") {
      const wa = await listWhatsAppTemplatesPayload();
      const hit = (wa.data || []).find((t) => String(t.id) === String(templateId));
      if (hit) {
        const result = await updateAndSubmitWhatsAppTemplate(templateId, {
          name: hit.name,
          body: hit.body,
          category: mapTemplateCategoryToMeta(
            normalizeTemplateCategory(hit.category, "marketing"),
          ),
          language: hit.language,
        });
        return jsonOk(
          {
            ok: result.ok,
            mode: result.mode,
            template: result.template,
            error: result.error,
          },
          result.ok ? 200 : 422,
        );
      }
    }
    return jsonOk({
      ok: true,
      mode: "local_review",
      template: {
        id: templateId,
        status:
          action === "reject"
            ? "rejected"
            : action === "publish"
              ? "published"
              : action === "submit-review"
                ? "pending_approval"
                : "approved",
      },
    });
  }

  // ---- agents / ops lists ----
  if (path === "agents" && m === "GET") {
    const agents = await hydrateAgents();
    return jsonOk({ data: agents, team_size: agents.length });
  }

  if (path === "agents" && m === "POST") {
    try {
      const created = await createAgent(
        body && typeof body === "object" ? /** @type {any} */ (body) : { name: "" },
      );
      runtimeState.agents = (await listAgents()).data;
      agentsHydrated = true;
      return jsonOk({ ok: true, agent: created.agent, storage: created.storage }, 201);
    } catch (err) {
      return jsonErr(err instanceof Error ? err.message : "Create agent failed", 422);
    }
  }

  // Training docs + brand preview before agents/:id catch-all
  if (path === "agents/training-docs" && m === "GET") {
    const listed = await listTrainingDocs();
    return jsonOk({ data: listed.data, storage: listed.storage });
  }

  if (path === "agents/training-docs" && m === "POST") {
    const title = String(body?.title || "").trim();
    const docBody = String(body?.body || body?.file_text || "").trim();
    if (!title || !docBody) {
      return jsonErr("title and body are required.", 422);
    }
    const saved = await upsertTrainingDoc({
      ...(body && typeof body === "object" ? body : {}),
      title,
      body: docBody,
    });
    return jsonOk({ ok: true, doc: saved.doc, storage: saved.storage }, 201);
  }

  if (path === "agents/training-docs/retrieve" && m === "POST") {
    const query = String(body?.query || body?.message || "");
    const hits = await retrieveTrainingDocs(query, {
      limit: Number(body?.limit || 4),
      categories: Array.isArray(body?.categories) ? body.categories : undefined,
    });
    return jsonOk({
      data: hits,
      query,
      rule: "Agents must use retrieved training docs when unsure — never fabricate off-brand words.",
    });
  }

  if (path.match(/^agents\/training-docs\/[^/]+$/) && m === "DELETE") {
    const id = segments[2];
    const result = await deleteTrainingDoc(id);
    if (!result.ok) return jsonErr(result.message || "Delete failed", 400);
    return jsonOk(result);
  }

  if (path.match(/^agents\/training-docs\/[^/]+$/) && (m === "PUT" || m === "PATCH")) {
    const id = segments[2];
    const saved = await upsertTrainingDoc({
      ...(body && typeof body === "object" ? body : {}),
      id,
    });
    return jsonOk({ ok: true, doc: saved.doc, storage: saved.storage });
  }

  if (path === "agents/tasks" && m === "GET") {
    const url = new URL(request.url);
    const agentFilter = url.searchParams.get("agent_id") || url.searchParams.get("agent_key") || "";
    const listed = await listTasks(agentFilter || undefined);
    return jsonOk({ data: listed.data, storage: listed.storage });
  }

  if (path === "agents/tasks" && m === "POST") {
    try {
      const assigned = await assignTask(
        body && typeof body === "object" ? /** @type {any} */ (body) : { title: "" },
      );
      return jsonOk(
        { ok: true, task: assigned.task, agent: assigned.agent, storage: assigned.storage },
        201,
      );
    } catch (err) {
      return jsonErr(err instanceof Error ? err.message : "Assign task failed", 422);
    }
  }

  if (path.match(/^agents\/tasks\/[^/]+$/) && (m === "PATCH" || m === "PUT")) {
    try {
      const updated = await updateTask(
        segments[2],
        body && typeof body === "object" ? /** @type {Record<string, unknown>} */ (body) : {},
      );
      return jsonOk(updated);
    } catch (err) {
      return jsonErr(err instanceof Error ? err.message : "Update task failed", 404);
    }
  }

  if (path === "agents/shared-memory" && m === "GET") {
    const url = new URL(request.url);
    const prefix = url.searchParams.get("prefix") || "";
    const listed = await listSharedKv(prefix);
    return jsonOk({ data: listed.data, storage: listed.storage });
  }

  if (path === "agents/shared-memory" && m === "POST") {
    try {
      const key = String(body?.key || "").trim();
      if (!key) return jsonErr("key is required", 422);
      const saved = await setSharedKv({
        key,
        value: body?.value,
        written_by: String(body?.written_by || "admin"),
        tags: Array.isArray(body?.tags) ? body.tags.map(String) : [],
      });
      return jsonOk(saved, 201);
    } catch (err) {
      return jsonErr(err instanceof Error ? err.message : "Shared memory write failed", 422);
    }
  }

  if (path.match(/^agents\/shared-memory\/.+$/) && m === "GET") {
    const key = decodeURIComponent(path.slice("agents/shared-memory/".length));
    const entry = await getSharedKv(key);
    if (!entry) return jsonErr("Key not found", 404);
    return jsonOk({ entry });
  }

  if (path === "agents/collaborate" && m === "POST") {
    const result = await runTeamCollaboration({
      agent_key: String(body?.agent_key || body?.agent_id || "ai_support"),
      purpose: String(body?.purpose || "draft_reply"),
      message: String(body?.message || ""),
      dry_run: body?.dry_run !== false,
      context: body?.context && typeof body.context === "object" ? body.context : {},
      collaborators: Array.isArray(body?.collaborators) ? body.collaborators.map(String) : undefined,
    });
    return jsonOk(result);
  }

  if (path.match(/^agents\/[^/]+$/) && (m === "PATCH" || m === "PUT")) {
    const reserved = new Set([
      "training-docs",
      "llm",
      "activity",
      "test-run",
      "orchestrate",
      "tasks",
      "shared-memory",
      "collaborate",
    ]);
    if (reserved.has(segments[1])) {
      return jsonErr("Not found.", 404);
    }
    try {
      const updated = await updateAgent(
        segments[1],
        body && typeof body === "object" ? /** @type {Record<string, unknown>} */ (body) : {},
      );
      runtimeState.agents = (await listAgents()).data;
      agentsHydrated = true;
      return jsonOk(updated.agent);
    } catch (err) {
      return jsonErr(err instanceof Error ? err.message : "Agent not found.", 404);
    }
  }

  if (path === "agents/llm/status" && m === "GET") {
    const anthropic = await getAnthropicStatus();
    return jsonOk(buildIntegrationsHealth({ anthropic }).llm);
  }

  if (path === "agents/activity" && m === "GET") {
    const agents = await hydrateAgents();
    const tasks = await listTasks();
    return jsonOk({
      data: agents.slice(0, 8).map((a, i) => ({
        id: `act-${a.key}`,
        agent_key: a.key,
        agent: a.name,
        purpose: "team_ready",
        event: i === 0 ? "collaborating" : "listening",
        channel: (a.config?.channels || ["internal"])[0] || "internal",
        status: a.status === "active" ? "completed" : "paused",
        provider: "shared_memory",
        latency_ms: 0,
        at: new Date().toISOString(),
      })),
      metrics: {
        total_runs: agents.length,
        failed_runs: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        open_tasks: (tasks.data || []).filter((t) => t.status === "open").length,
      },
    });
  }

  if (path === "agents/test-run" && m === "POST") {
    await hydrateAgents();
    const agentId = String(body?.agent_id || body?.agent_key || "");
    const agent =
      runtimeState.agents.find(
        (a) => a.id === agentId || a.key === agentId || a.name === agentId,
      ) || runtimeState.agents[0];
    const collaborate = body?.collaborate === true;
    const result = collaborate
      ? await runTeamCollaboration({
          agent_key: agent?.key || agentId || "ai_support",
          purpose: String(body?.purpose || "draft_reply"),
          message: String(body?.message || ""),
          dry_run: body?.dry_run !== false,
          context: body?.context && typeof body.context === "object" ? body.context : {},
        })
      : await runAgentOrchestration({
          agent_key: agent?.key || agentId || "ai_support",
          agent,
          purpose: String(body?.purpose || "draft_reply"),
          message: String(body?.message || ""),
          dry_run: body?.dry_run !== false,
          context: body?.context && typeof body.context === "object" ? body.context : {},
        });
    return jsonOk(result);
  }

  if (path === "agents/orchestrate" && m === "POST") {
    const collaborate = body?.collaborate !== false;
    const result = collaborate
      ? await runTeamCollaboration({
          agent_key: String(body?.agent_key || body?.agent_id || "ai_support"),
          purpose: String(body?.purpose || "draft_reply"),
          message: String(body?.message || ""),
          dry_run: Boolean(body?.dry_run),
          context: body?.context && typeof body.context === "object" ? body.context : {},
          collaborators: Array.isArray(body?.collaborators)
            ? body.collaborators.map(String)
            : undefined,
        })
      : await runAgentOrchestration({
          agent_key: String(body?.agent_key || body?.agent_id || "ai_support"),
          purpose: String(body?.purpose || "draft_reply"),
          message: String(body?.message || ""),
          dry_run: Boolean(body?.dry_run),
          context: body?.context && typeof body.context === "object" ? body.context : {},
        });
    return jsonOk(result);
  }

  if (path === "brand/preview" && m === "POST") {
    const channel = String(body?.channel || "whatsapp").toLowerCase();
    const raw = String(body?.body || body?.message || "Thank you for choosing Triada Designs.");
    if (channel === "email") {
      return jsonOk(
        wrapEmailMessage({
          subject: body?.subject,
          bodyText: raw,
          customerName: body?.customer_name,
          greetingKind: body?.greeting_kind,
        }),
      );
    }
    if (channel === "invoice" || channel === "receipt") {
      return jsonOk(
        wrapInvoiceDocument({
          documentType: channel === "receipt" ? "receipt" : "invoice",
          number: body?.number,
          customerName: body?.customer_name,
          customerEmail: body?.customer_email,
          total: body?.total,
          currency: body?.currency,
          lineItems: body?.line_items,
          orderId: body?.order_id,
          notes: body?.notes,
        }),
      );
    }
    if (channel === "template") {
      return jsonOk(
        wrapChannelTemplate({
          platform: body?.platform || "whatsapp",
          name: body?.name,
          body: raw,
          subject: body?.subject,
          greetingKind: body?.greeting_kind,
          customerName: body?.customer_name,
        }),
      );
    }
    return jsonOk(
      ensureBrandedOutboundText(raw, {
        greetingKind: body?.greeting_kind,
        customerName: body?.customer_name,
      }),
    );
  }

  if (path === "knowledge" && m === "GET") {
    const training = await listTrainingDocs();
    return jsonOk({
      data: [
        {
          id: "ks-1",
          title: "Materials & making time",
          source_type: "faq",
          status: "published",
          body: "Silver with gold plating; 14K/18K on request. ~7 days to make. Prices from approved catalog only.",
          tags: ["materials", "making"],
          updated_at: new Date().toISOString(),
        },
        {
          id: "ks-2",
          title: "Care & plating",
          source_type: "faq",
          status: "published",
          body: "Store dry, wipe gently after wear, avoid harsh chemicals.",
          tags: ["care"],
          updated_at: new Date().toISOString(),
        },
        ...training.data.map((doc) => ({
          id: doc.id,
          title: doc.title,
          source_type: "training_doc",
          status: doc.status,
          body: doc.body,
          tags: doc.tags,
          category: doc.category,
          updated_at: doc.updated_at,
        })),
      ],
      brand: { name: BRAND.name, logo_url: brandLogoUrl() },
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
    const result = await runAgentOrchestration({
      agent_key: "ai_support",
      purpose: "draft_reply",
      message: String(body?.message || body?.query || ""),
      dry_run: Boolean(body?.dry_run),
      context: body && typeof body === "object" ? /** @type {Record<string, unknown>} */ (body) : {},
    });
    return jsonOk({
      ok: true,
      reply: result.text,
      mode: result.mode,
      provider: result.provider,
      training_used: result.training_used,
      branded: true,
      logo_url: result.logo_url,
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
    const branded = wrapInvoiceDocument({
      documentType: "invoice",
      number: "INV-TD-1001",
      orderId: "ord-1",
      customerName: "Layla Al Maktoum",
      total: 1450,
      currency: "AED",
      status: "draft",
      lineItems: [
        {
          title: "Aura Signet Ring",
          sku: "TD-RING-AURA-01",
          qty: 1,
          price: 1450,
        },
      ],
    });
    return jsonOk({
      data: [
        {
          id: "inv-1",
          order_id: "ord-1",
          status: "draft",
          total: 1450,
          currency: "AED",
          source: "local_seed",
          branded: true,
          logo_url: branded.logo_url,
          greeting: branded.greeting,
          html: branded.html,
          pdf_mode: branded.pdf_mode,
        },
      ],
    });
  }

  if (path === "jewellery-ops/invoices" && m === "POST") {
    const input = body && typeof body === "object" ? body : {};
    const branded = wrapInvoiceDocument({
      documentType: input.document_type === "receipt" ? "receipt" : "invoice",
      number: input.number || input.invoice_number,
      orderId: input.order_id,
      customerName: input.customer_name,
      customerEmail: input.customer_email,
      total: input.total,
      currency: input.currency || "AED",
      status: input.status || "issued",
      lineItems: Array.isArray(input.line_items) ? input.line_items : [],
      notes: input.notes,
    });
    return jsonOk(
      {
        ok: true,
        invoice: branded.summary,
        document: branded,
        branded: true,
      },
      201,
    );
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
