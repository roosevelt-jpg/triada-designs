/**
 * Next dual-run dispatcher for /api/v1/* (except auth/{login,me,logout}).
 * Serves seeded / env-aware payloads so dashboard pages never 502 when
 * Laravel API_ORIGIN is dead. Filesystem routes win over next.config fallback.
 */

import {
  PRODUCTS,
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
  findContent,
  getContentItems,
  getPublications,
  listPendingApproval,
  listPendingReview,
  listScheduled,
  patchContent,
} from "@/lib/content-schedule-store";
import {
  notifyAdminPendingReview,
  syncPendingReviewNotifications,
} from "@/lib/content/admin-review-notify";
import {
  broadcastQuoteInspiration,
  generateQuoteInspiration,
  processQuoteInspirationCron,
} from "@/lib/content/quote-inspiration-engine";
import {
  WEEKDAY_LABELS,
  getQuoteInspirationSettings,
  listQuoteInspirationHistory,
  nextWeekdaySendAt,
  saveQuoteInspirationSettings,
} from "@/lib/content/quote-inspiration-store";
import {
  getMediaForContent,
  setMediaVariants,
  upsertMediaAsset,
} from "@/lib/creative/media-store";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationsFeedPayload,
  pushNotification,
  unreadNotificationCount,
} from "@/lib/notifications/notifications-store";
import {
  publishProductById,
  saveAndMaybePublishProduct,
  syncShopifyCatalogInbound,
} from "@/lib/commerce/product-channel-publish";
import { listProducts, getProduct } from "@/lib/commerce/products-store";
import {
  deleteService,
  getService,
  listServices,
  upsertService,
} from "@/lib/commerce/services-store";
import { shopifyStatusPayload } from "@/lib/commerce/shopify-admin";
import {
  buildPromoComponentsForContact,
  draftWhatsAppCampaignWithBestsellers,
  listBestSellingProducts,
  resolveCampaignPromoPayload,
} from "@/lib/integrations/whatsapp-campaign-promo";
import {
  upsertWordpressProductPost,
  wordpressStatusPayload,
} from "@/lib/commerce/wordpress-products";
import {
  importContactRows,
  listContacts,
  listWhatsAppCampaignRecipients,
  upsertContacts,
} from "@/lib/crm/contacts-store";
import {
  SOCIAL_DM_CHANNELS,
  SUPPORT_PAGE_MESSAGING_CHANNELS,
  SUPPORT_TEXT_CHANNELS,
  appendOutboundReply,
  conversationsStorageMode,
  getConversation,
  listConversations,
  listUnansweredSocialDms,
  patchConversation,
} from "@/lib/crm/conversations-store";
import { shapeConversationForInbox } from "@/lib/crm/inbox-shape";
import {
  handleInboundSocialDm,
  sweepUnansweredSocialDms,
} from "@/lib/agents/social-media-manager";
import { handleInboundWhatsApp } from "@/lib/agents/support-whatsapp";
import { handleInboundPageMessaging } from "@/lib/agents/support-page-messaging";
import { handleInboundSupportChannel } from "@/lib/agents/support-channel";
import {
  getHumanHandoffSettings,
  saveHumanHandoffSettings,
} from "@/lib/agents/human-handoff-settings";
import { normalizeWebchatInbound } from "@/lib/channels/normalize-inbound";
import { collectLiveDashboardMetrics } from "@/lib/api/dashboard-metrics";
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
  extractWhatsAppMediaInput,
  sendWhatsAppMediaMessage,
  uploadWhatsAppMedia,
} from "@/lib/integrations/whatsapp-cloud-media";
import {
  hasGeminiEnv,
  hasMetaPageToken,
  hasWhatsAppPhoneId,
  hasWhatsAppToken,
} from "@/lib/integrations/env-presence";
import { buildSalesChannelsStatus } from "@/lib/integrations/channels-status";
import { googlePlacesStatus } from "@/lib/integrations/google-places";
import { creativeModeLabel } from "@/lib/integrations/brand-labels";
import { composeCreativePackage } from "@/lib/creative/compose-package";
import {
  approvePopupApplication,
  draftPopupApplication,
  listPopupApplications,
  listPopupMarkets,
  scanPopupAlerts,
  upsertPopupMarket,
} from "@/lib/popups/popup-markets-store";
import {
  JEWELLERY_ACTION_TYPES,
  approveCustomQuote,
  approveOutreachMessage,
  announceVipDrop,
  buildJewelleryOpsOverview,
  collectCustomPiece,
  draftOutreachMessage,
  executeJewelleryWorkflowAction,
  joinWaitlist,
  jewelleryPolicies,
  listAbandonmentEvents,
  listAfterSaleJobs,
  listCustomPieces,
  listOutreachMessages,
  listOutreachProspects,
  listTelegramAlerts,
  listUgcItems,
  listUgcRepostQueue,
  listWaitlist,
  notifyWaitlistRestock,
  processDueAbandonment,
  processDueAfterSale,
  recordUgcTag,
  requestUgcPermission,
  sendTelegramAlert,
  suggestGifts,
  trackAbandonment,
  upsertOutreachProspect,
} from "@/lib/jewellery-ops";
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
  deleteInvoiceDoc,
  getInvoiceDoc,
  listInvoiceDocs,
  parseLineItemsPlainText,
  presentInvoiceDoc,
  shapeInvoiceDoc,
  upsertInvoiceDoc,
} from "@/lib/invoices/invoice-docs-store";
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
import {
  API_PERMISSION_RULES,
  PERMISSION_AREAS,
  canAccess,
} from "@/lib/team/permissions";
import { sendInviteEmail } from "@/lib/team/invite-email";
import {
  createInvite,
  createRole,
  inviteAppBaseUrl,
  listInvites,
  listMembers,
  listRoles,
  resolveMembershipForUser,
  revokeInvite,
  updateMember,
  updateRole,
} from "@/lib/team/team-store";
import {
  acknowledgeManufacturerOrder,
  getManufacturerOverview,
  listCommerceOrders,
  listManufacturerContacts,
  MANUFACTURER_STATUSES,
  pushManufacturerOrder,
  resendManufacturerOrder,
  updateManufacturerOrderStatus,
  upsertCommerceOrder,
  upsertManufacturerContact,
  whereIsMyOrder,
} from "@/lib/manufacturer";

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

/**
 * Attach membership + permissions for the authenticated user.
 * @param {Request} request
 */
export async function requireMembership(request) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth;
  let membership;
  try {
    membership = await resolveMembershipForUser(auth.user);
  } catch (err) {
    // Missing team_* tables (migration pending) must not 500 the whole dashboard.
    const msg = err instanceof Error ? err.message : String(err || "");
    const missingTeamTable =
      /Could not find the table|schema cache|PGRST205|team_roles|team_members|team_invites/i.test(
        msg,
      );
    if (!missingTeamTable) {
      return {
        ok: false,
        status: 500,
        message: err instanceof Error ? err.message : "Membership lookup failed.",
      };
    }
    const { ADMIN_EMAIL } = await import("@/lib/auth/supabase-auth");
    const { allPermissions } = await import("@/lib/team/permissions");
    const email = String(auth.user?.email || "").trim().toLowerCase();
    const isAdmin = email === String(ADMIN_EMAIL || "").toLowerCase();
    membership = {
      member: null,
      role: null,
      permissions: isAdmin ? allPermissions(true) : null,
      isAdmin,
    };
  }
  return {
    ok: true,
    user: auth.user,
    membership,
    isAdmin: Boolean(membership?.isAdmin),
    permissions: membership?.permissions || null,
  };
}

/**
 * @param {Awaited<ReturnType<typeof requireMembership>>} ctx
 * @param {string} area
 * @param {"view"|"manage"} [level]
 */
export function assertPermission(ctx, area, level = "view") {
  if (!ctx?.ok) {
    return { ok: false, status: ctx?.status || 401, message: ctx?.message || "Unauthenticated." };
  }
  if (ctx.isAdmin) return { ok: true };
  if (canAccess(ctx.permissions, area, level)) return { ok: true };
  return {
    ok: false,
    status: 403,
    message: `You do not have ${level} access to ${area}.`,
  };
}

/**
 * Enforce API path permission rules when configured.
 * @param {string} method
 * @param {string} path
 * @param {Awaited<ReturnType<typeof requireMembership>>} ctx
 */
export function enforceApiPermission(method, path, ctx) {
  if (ctx?.isAdmin) return { ok: true };
  const m = method.toUpperCase();
  for (const rule of API_PERMISSION_RULES) {
    if (!rule.match.test(path)) continue;
    if (rule.methods && !rule.methods.includes(m)) continue;
    return assertPermission(ctx, rule.area, rule.level || "view");
  }
  return { ok: true };
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
 * Resolve CRM contacts for inbox list/detail shaping.
 * @param {Array<{ contact_id?: string | null }>} conversations
 * @returns {Promise<Map<string, Record<string, unknown>>>}
 */
async function buildContactMapForConversations(conversations) {
  /** @type {Map<string, Record<string, unknown>>} */
  const map = new Map();
  const ids = [
    ...new Set(
      (conversations || [])
        .map((c) => (c?.contact_id ? String(c.contact_id) : ""))
        .filter(Boolean),
    ),
  ];
  if (!ids.length) return map;
  try {
    const listed = await listContacts({});
    for (const row of listed.data || []) {
      if (ids.includes(String(row.id))) {
        map.set(String(row.id), row);
      }
    }
  } catch {
    /* metadata.contact_name still used as fallback */
  }
  return map;
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
    const humanHandoff = await getHumanHandoffSettings();
    return jsonOk({
      workspace: { ...WORKSPACE, timezone: runtimeState.timezone },
      human_handoff: humanHandoff,
      source: "next_dual_run",
    });
  }

  if (path === "settings/human-handoff" && m === "GET") {
    const humanHandoff = await getHumanHandoffSettings();
    return jsonOk({ human_handoff: humanHandoff, ok: true });
  }

  if (
    path === "settings/human-handoff" &&
    (m === "PATCH" || m === "PUT" || m === "POST")
  ) {
    const patch =
      body && typeof body === "object"
        ? body.human_handoff && typeof body.human_handoff === "object"
          ? body.human_handoff
          : body
        : {};
    const humanHandoff = await saveHumanHandoffSettings(patch);
    return jsonOk({ human_handoff: humanHandoff, ok: true });
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

    let humanHandoff = await getHumanHandoffSettings();
    if (
      body &&
      typeof body === "object" &&
      body.human_handoff &&
      typeof body.human_handoff === "object"
    ) {
      humanHandoff = await saveHumanHandoffSettings(body.human_handoff);
    } else if (
      body &&
      typeof body === "object" &&
      (Object.prototype.hasOwnProperty.call(body, "whatsapp_number") ||
        Object.prototype.hasOwnProperty.call(body, "call_number") ||
        Object.prototype.hasOwnProperty.call(body, "handoff_enabled"))
    ) {
      humanHandoff = await saveHumanHandoffSettings({
        whatsapp_number: body.whatsapp_number,
        call_number: body.call_number,
        enabled:
          body.handoff_enabled !== undefined
            ? body.handoff_enabled !== false
            : body.enabled,
      });
    }

    return jsonOk({
      workspace: { ...WORKSPACE, timezone: runtimeState.timezone },
      human_handoff: humanHandoff,
      ok: true,
    });
  }

  // ---- dashboard / catalog ----
  if (path === "dashboard" && m === "GET") {
    // Same Meta store overlay as integrations/list — otherwise overview
    // falsely shows FB/IG/WA as awaiting when credentials live in app_metadata.
    // KPI metrics come from live stores / entity APIs (zeros when empty).
    const [anthropic, meta] = await Promise.all([
      getAnthropicStatus(),
      getMetaStatus(),
    ]);
    const integrationOpts = {
      anthropicHasCredentials: anthropic.has_credentials,
      anthropicModel: anthropic.model,
      metaFacebookReady: meta.facebook_ready,
      metaMessengerReady: meta.messenger_ready,
      metaInstagramReady: meta.instagram_ready,
      metaWhatsAppReady: meta.whatsapp_ready,
    };
    const metrics = await collectLiveDashboardMetrics(integrationOpts);
    return jsonOk(
      buildDashboard({
        ...integrationOpts,
        metrics,
      }),
    );
  }

  if (path === "services" && m === "GET") {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") || "";
    const status = url.searchParams.get("status") || "";
    const listed = await listServices({ q, status });
    return jsonOk({
      ...paginate(listed.data),
      mode: listed.mode,
      source: "next_dual_run",
    });
  }

  if (path === "services" && m === "POST") {
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    const name = String(input.name || "").trim();
    if (!name) return jsonErr("name is required.", 422);
    const result = await upsertService({ ...input, name, id: undefined });
    return jsonOk(
      {
        ...result.service,
        created: result.created,
        mode: result.mode,
        source: "next_dual_run",
      },
      201,
    );
  }

  if (path.match(/^services\/[^/]+$/) && m === "GET") {
    const id = segments[1];
    const service = await getService(id);
    if (!service) return jsonErr("Service not found", 404);
    return jsonOk({ ...service, source: "next_dual_run" });
  }

  if (path.match(/^services\/[^/]+$/) && (m === "PUT" || m === "PATCH")) {
    const id = segments[1];
    const existing = await getService(id);
    if (!existing) return jsonErr("Service not found", 404);
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    const name =
      input.name !== undefined ? String(input.name || "").trim() : existing.name;
    if (!name) return jsonErr("name is required.", 422);
    const result = await upsertService({ ...existing, ...input, name, id });
    return jsonOk({
      ...result.service,
      created: false,
      mode: result.mode,
      source: "next_dual_run",
    });
  }

  if (path.match(/^services\/[^/]+$/) && m === "DELETE") {
    const id = segments[1];
    const existing = await getService(id);
    if (!existing) return jsonErr("Service not found", 404);
    const result = await deleteService(id);
    if (!result.ok) return jsonErr(result.message || "Delete failed", 400);
    return jsonOk({ ok: true, id, mode: result.mode, source: "next_dual_run" });
  }

  if (path === "products" && m === "GET") {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") || "";
    const listed = await listProducts({ q });
    return jsonOk({
      ...paginate(listed.data),
      mode: listed.mode,
      shopify: shopifyStatusPayload(),
      wordpress: wordpressStatusPayload(),
      source: "next_dual_run",
    });
  }

  if (path === "products/bestsellers" && m === "GET") {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || 5);
    const listed = await listBestSellingProducts({ limit });
    return jsonOk({
      data: listed.data,
      mode: listed.mode,
      source: listed.source,
    });
  }

  if (path === "products" && m === "POST") {
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    const result = await saveAndMaybePublishProduct(input, {
      publish: Boolean(input.publish),
      channels: Array.isArray(input.channels) ? input.channels : ["all"],
    });
    if (!result.ok && result.status === 422) {
      return jsonErr(result.error || "Invalid product", 422);
    }
    return jsonOk(
      {
        ...result.product,
        created: result.created,
        published: result.published,
        awaiting_credentials: result.awaiting_credentials,
        channels: result.channels,
        summary: result.summary,
        mode: result.mode,
        source: "next_dual_run",
      },
      result.created ? 201 : 200,
    );
  }

  if (path.match(/^products\/[^/]+$/) && m === "GET") {
    const id = segments[1];
    const product = await getProduct(id);
    if (!product) return jsonErr("Product not found", 404);
    return jsonOk({ ...product, source: "next_dual_run" });
  }

  if (path.match(/^products\/[^/]+$/) && (m === "PUT" || m === "PATCH")) {
    const id = segments[1];
    const existing = await getProduct(id);
    if (!existing) return jsonErr("Product not found", 404);
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    const result = await saveAndMaybePublishProduct(
      { ...existing, ...input, id },
      {
        publish: Boolean(input.publish),
        channels: Array.isArray(input.channels) ? input.channels : ["all"],
      },
    );
    if (!result.ok && result.status === 422) {
      return jsonErr(result.error || "Invalid product", 422);
    }
    return jsonOk({
      ...result.product,
      created: false,
      published: result.published,
      awaiting_credentials: result.awaiting_credentials,
      channels: result.channels,
      summary: result.summary,
      mode: result.mode,
      source: "next_dual_run",
    });
  }

  if (path.match(/^products\/[^/]+\/publish$/) && m === "POST") {
    const id = segments[1];
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    const result = await publishProductById(id, {
      channels: Array.isArray(input.channels) ? input.channels : ["all"],
    });
    if (!result.ok && result.status === 404) {
      return jsonErr(result.error || "Product not found", 404);
    }
    return jsonOk({
      ok: result.ok,
      awaiting_credentials: result.awaiting_credentials,
      product: result.product,
      channels: result.channels,
      summary: result.summary,
      shopify_runtime: result.shopify_runtime,
      wordpress_runtime: result.wordpress_runtime,
      source: "next_dual_run",
    });
  }

  // ---- dashboard bell notifications feed (single store; TD-75 UI + content review) ----
  if (path === "notifications" && m === "GET") {
    // Same feed producer as generate-time notify — no second store.
    syncPendingReviewNotifications();
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get("unread") === "1";
    const limit = Number(url.searchParams.get("limit") || 50);
    return jsonOk(notificationsFeedPayload({ unreadOnly, limit }));
  }

  if (path === "notifications/unread-count" && m === "GET") {
    syncPendingReviewNotifications();
    return jsonOk({
      unread_count: unreadNotificationCount(),
      feed: "dashboard_bell",
      source: "next_dual_run",
    });
  }

  if (path === "notifications/read-all" && m === "POST") {
    return jsonOk(markAllNotificationsRead());
  }

  if (path.match(/^notifications\/[^/]+\/read$/) && m === "POST") {
    const id = segments[1];
    const row = markNotificationRead(id);
    if (!row) return jsonErr("Notification not found.", 404);
    return jsonOk({ ok: true, notification: row, unread_count: unreadNotificationCount() });
  }

  if (path === "notifications" && m === "POST") {
    // Internal/ops producers (and tests) may push into the same bell feed.
    const event = pushNotification({
      type: body?.type || "info",
      title: body?.title || "Notification",
      body: body?.body || "",
      href: body?.href || null,
      severity: body?.severity || "info",
      entity_type: body?.entity_type || null,
      entity_id: body?.entity_id || null,
      payload: body?.payload && typeof body.payload === "object" ? body.payload : {},
      dedupe: body?.dedupe !== false,
    });
    return jsonOk({ ok: true, notification: event, unread_count: unreadNotificationCount() }, 201);
  }

  if (path === "content" && m === "GET") {
    return jsonOk(paginate(getContentItems()));
  }

  // ---- Quote / Inspiration engine ----
  if (path === "content/inspiration" && m === "GET") {
    const [settings, history, recipients] = await Promise.all([
      getQuoteInspirationSettings(),
      listQuoteInspirationHistory(),
      listWhatsAppCampaignRecipients().catch(() => ({ data: [], mode: "local_sim" })),
    ]);
    const quotes = getContentItems().filter(
      (c) => c.content_type === "inspiration_quote",
    );
    return jsonOk({
      settings,
      history,
      quotes,
      weekday_labels: WEEKDAY_LABELS,
      next_send_at: nextWeekdaySendAt(settings),
      recipients_available: recipients.data?.length || 0,
      recipients_mode: recipients.mode || "local_sim",
      flow: "generate card → preview/approve → weekday schedule → WhatsApp broadcast",
      calendar_path: "/calendar",
      review_url: "/content/review",
      cron: { path: "/api/cron/quote-inspiration" },
    });
  }

  if (path === "content/inspiration/settings" && (m === "PUT" || m === "PATCH" || m === "POST")) {
    const patch =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    const settings = await saveQuoteInspirationSettings(patch);
    return jsonOk({
      ok: true,
      settings,
      next_send_at: nextWeekdaySendAt(settings),
      weekday_labels: WEEKDAY_LABELS,
    });
  }

  if (path === "content/inspiration/generate" && m === "POST") {
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    const result = await generateQuoteInspiration(input);
    if (result.content?.status === "in_review") {
      await notifyAdminPendingReview({
        contentId: result.content.id,
        kind: "inspiration quote card",
      });
    }
    return jsonOk(result, 201);
  }

  if (path === "content/inspiration/broadcast" && m === "POST") {
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    const result = await broadcastQuoteInspiration(input);
    if (!result.ok && result.error === "approval_required") {
      return jsonOk(result, 422);
    }
    if (!result.ok && result.error === "no_quote_content") {
      return jsonOk(result, 422);
    }
    return jsonOk(result);
  }

  if (path === "content/inspiration/run" && m === "POST") {
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    const result = await processQuoteInspirationCron({
      force: Boolean(input.force),
      generate_if_missing: input.generate_if_missing !== false,
    });
    return jsonOk(result);
  }

  if (path === "content/review" && m === "GET") {
    const { previewSvgDataUrl } = await import("@/lib/creative/preview-svg");
    const pending = listPendingReview();
    const data = pending.map((item) => {
      let media = getMediaForContent(item.id);
      if (!media.assets.length) {
        const fallback = upsertMediaAsset(item.id, {
          id: `asset-${item.id}-review-fallback`,
          kind: "image",
          mode: "local_sim",
          width: 1080,
          height: 1080,
          url: previewSvgDataUrl({
            title: item.product_context?.name || item.title || "Triada Designs",
            target: item.channel || "preview",
            prompt: item.body || "Pending creative review",
            kind: "image",
          }),
          mime_type: "image/svg+xml",
          metadata: { fallback_preview: true },
        });
        media = getMediaForContent(item.id);
        media.assets = media.assets.length ? media.assets : [fallback];
      }
      return {
        ...item,
        media,
        preview_asset:
          media.assets.find((a) => a.kind === "video") ||
          media.assets.find((a) => a.kind === "animation") ||
          media.assets.find((a) => a.kind === "image") ||
          null,
      };
    });
    return jsonOk({
      data,
      pending_count: data.length,
      review_url: "/content/review",
    });
  }

  if (path.startsWith("content/") && m === "POST") {
    const parts = segments;
    const contentId = parts[1];
    const action = parts[2];
    const item = findContent(contentId) || {
      id: contentId,
      title: "Content",
      status: "draft",
      approval_version: 0,
      channel: "instagram",
    };
    if (action === "approve") {
      const nextVersion = (item.approval_version || 0) + 1;
      const content = patchContent(contentId, {
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: "dual-run-admin",
        approval_version: nextVersion,
        review_notified_at: null,
      });
      // Clear matching bell alerts for this content item.
      for (const n of listNotifications({ limit: 100 })) {
        if (
          n.type === "content_pending_review" &&
          String(n.entity_id || n.payload?.content_id || "") === String(contentId) &&
          !n.read_at
        ) {
          markNotificationRead(n.id);
        }
      }
      return jsonOk({
        content,
        creative: { ok: true, mode: "local_sim", variant_count: 0 },
        automations: [],
      });
    }
    if (action === "schedule") {
      if (item.status !== "approved" && item.status !== "scheduled") {
        return jsonOk(
          { ok: false, error: "Only approved content can be scheduled.", gate: "approval_required" },
          422
        );
      }
      if (!body?.scheduled_for) {
        return jsonOk(
          {
            ok: false,
            error: "Admin must choose an explicit go-live datetime.",
            gate: "human_schedule_required",
          },
          422
        );
      }
      const when = body.scheduled_for;
      const wasScheduled = item.status === "scheduled";
      const nextMeta = { ...(item.publish_metadata || {}) };
      delete nextMeta.proposed_scheduled_for;
      delete nextMeta.proposal_source;
      nextMeta.schedule_source = "human";
      nextMeta.scheduled_by = "dual-run-admin";
      nextMeta.scheduled_at = new Date().toISOString();
      const content = patchContent(contentId, {
        status: "scheduled",
        scheduled_for: when,
        proposed_scheduled_for: null,
        publish_metadata: nextMeta,
      });
      return jsonOk({
        ok: true,
        content,
        action: wasScheduled ? "reschedule" : "schedule",
      });
    }
    if (action === "cancel-schedule") {
      if (item.status === "published") {
        return jsonOk(
          { ok: false, error: "Published content cannot be unscheduled.", gate: "already_published" },
          422
        );
      }
      if (item.status !== "scheduled" && !item.scheduled_for) {
        return jsonOk(
          { ok: false, error: "Content is not scheduled.", gate: "not_scheduled" },
          422
        );
      }
      const content = patchContent(contentId, {
        status: "approved",
        scheduled_for: null,
        publish_metadata: {
          ...(item.publish_metadata || {}),
          schedule_source: "human_cancelled",
          schedule_cancelled_by: "dual-run-admin",
          schedule_cancelled_at: new Date().toISOString(),
        },
      });
      return jsonOk({ ok: true, content });
    }
    if (action === "propose-schedule") {
      if (item.status === "published") {
        return jsonOk(
          {
            ok: false,
            error: "Published content cannot receive schedule proposals.",
            gate: "already_published",
          },
          422
        );
      }
      const proposed = body?.proposed_scheduled_for;
      if (!proposed) {
        return jsonOk(
          { ok: false, error: "proposed_scheduled_for is required.", gate: "proposal_required" },
          422
        );
      }
      const content = patchContent(contentId, {
        proposed_scheduled_for: proposed,
        publish_metadata: {
          ...(item.publish_metadata || {}),
          proposed_scheduled_for: proposed,
          proposal_source: "ai",
          proposed_at: new Date().toISOString(),
        },
      });
      return jsonOk({
        ok: true,
        content,
        note: "Proposal only — admin must confirm a go-live date on Calendar or Content Studio.",
      });
    }
    if (action === "publish") {
      if (item.status !== "approved" && item.status !== "scheduled") {
        return jsonOk(
          { ok: false, error: "Content must be human-approved before publish.", gate: "approval_required" },
          422
        );
      }
      const content = patchContent(contentId, {
        status: "published",
        published_at: new Date().toISOString(),
        publish_metadata: { adapter: body?.adapter || "meta_page", mode: "local_sim" },
      });
      return jsonOk({
        ok: true,
        content,
        publication: {
          id: `pub-${contentId}`,
          channel: body?.channel || item.channel || "instagram",
          adapter: body?.adapter || "meta_page",
          status: "published",
          approval_version_checked: item.approval_version || 0,
          published_at: content.published_at,
        },
        result: { ok: true, mode: "local_sim" },
      });
    }
    if (
      action === "generate-image" ||
      action === "generate-variants" ||
      action === "generate-video" ||
      action === "generate-ugc-video" ||
      action === "generate-animation" ||
      action === "ensure-creative"
    ) {
      const isUgc = action === "generate-ugc-video" || body?.style === "ugc";
      const composed = await composeCreativePackage({
        item,
        body: body || {},
        action,
      });
      const wasPending =
        item.status === "in_review" || item.status === "draft";
      // Media generation always enters pending review for preview-before-approval.
      const content = patchContent(contentId, {
        status:
          item.status === "approved" ||
          item.status === "scheduled" ||
          item.status === "published"
            ? item.status
            : "in_review",
        creative_brief: composed.creative_brief,
        // Re-notify when regenerating after leaving review, or first entry.
        ...(wasPending && item.review_notified_at && item.status === "in_review"
          ? {}
          : { review_notified_at: null }),
      });

      const storedAsset = upsertMediaAsset(contentId, {
        ...composed.asset,
        id: `asset-${contentId}-${action}`,
      });
      if (composed.variants?.length) {
        setMediaVariants(contentId, composed.variants);
      }
      if (action === "ensure-creative") {
        // Also store a hero image + animation when packing full creative.
        if (composed.asset?.kind !== "image") {
          upsertMediaAsset(contentId, {
            ...composed.asset,
            id: `asset-${contentId}-image`,
            kind: "image",
            height: 1080,
            width: 1080,
            duration_ms: null,
          });
        }
      }

      const kindLabel = isUgc
        ? "UGC video"
        : action.includes("video")
          ? "video"
          : action.includes("anim")
            ? "animation"
            : action.includes("variant")
              ? "platform variants"
              : "image";

      let notify = null;
      if (content.status === "in_review") {
        notify = await notifyAdminPendingReview({
          contentId,
          kind: kindLabel,
        });
      }

      return jsonOk({
        ok: composed.ok !== false,
        mode: composed.mode,
        mode_label: composed.mode_label || creativeModeLabel(composed.mode),
        message: composed.message,
        content_id: contentId,
        content,
        script: composed.script || content.creative_brief?.ugc_script || null,
        asset: storedAsset,
        variants: composed.variants || [],
        preview_required: true,
        review_url: "/content/review",
        admin_notified: Boolean(notify?.ok && !notify?.skipped),
        notify,
        sidecar: composed.sidecar,
        error: composed.error || null,
      });
    }
    return jsonOk({ ok: true, content: item });
  }

  if (path.match(/^content\/[^/]+\/media$/) && m === "GET") {
    const contentId = segments[1];
    const media = getMediaForContent(contentId);
    return jsonOk({
      ...media,
      mode: media.assets[0]?.mode || "local_sim",
      preview_ready: media.assets.some((a) => Boolean(a.url)),
    });
  }

  if (path === "publications" && m === "GET") {
    const pubs = getPublications();
    return jsonOk({
      data:
        pubs.length > 0
          ? pubs
          : [
              {
                id: "pub-1",
                content_item_id: "content-tides",
                channel: "facebook",
                adapter: "meta_page",
                status: "scheduled",
                scheduled_for: new Date(Date.now() + 86400000).toISOString(),
              },
            ],
    });
  }

  if (path === "creative/status" && m === "GET") {
    // Next dual-run: Gemini key drives live image + video pixels (Omni / Imagen cascade).
    const live = hasGeminiEnv();
    const mode = live ? "gemini" : "local_sim";
    return jsonOk({
      mode,
      mode_label: creativeModeLabel(mode),
      has_gemini: live,
      image: {
        mode,
        mode_label: creativeModeLabel(mode),
        message: live ? "Image generation is connected." : "Image generation is local.",
      },
      video: {
        mode,
        mode_label: creativeModeLabel(mode),
        message: live ? "Video generation is connected." : "Video generation is local.",
      },
      resize_engine: "triada",
      summary: "Generate, preview, approve, schedule, and publish.",
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

  if (path === "integrations/wordpress/status" && m === "GET") {
    return jsonOk(wordpressStatusPayload());
  }

  if (path === "integrations/google-places" && m === "GET") {
    // Browser key only on this dedicated route (HTTP-referrer restrict on Google Cloud).
    return jsonOk({
      ...googlePlacesStatus({ includeBrowserKey: true }),
      source: "next_dual_run",
    });
  }

  if (path === "integrations/wordpress/drafts" && m === "POST") {
    const wp = wordpressStatusPayload();
    if (!wp.connected) {
      return jsonOk(
        {
          id: `wp-draft-${Date.now()}`,
          title: body?.title || "Untitled draft",
          status: "awaiting_credentials",
          source: "next_dual_run",
          message: wp.message,
        },
        201,
      );
    }
    const draftProduct = {
      id: `draft-${Date.now()}`,
      title: String(body?.title || "Untitled draft"),
      description: String(body?.content || body?.excerpt || ""),
      published_status: "draft",
      channel_sync: { shopify: {}, wordpress: {} },
    };
    const result = await upsertWordpressProductPost(
      /** @type {import("@/lib/commerce/products-store").ProductRecord} */ (
        draftProduct
      ),
    );
    return jsonOk(
      {
        id: result.external_id || `wp-draft-${Date.now()}`,
        title: draftProduct.title,
        status: result.status === "synced" ? "draft" : result.status,
        link: result.link,
        source: "next_dual_run",
        message: result.message,
      },
      201,
    );
  }

  if (path === "integrations/wordpress/posts" && m === "GET") {
    const anthropic = await getAnthropicStatus();
    const wp = wordpressStatusPayload();
    return jsonOk({
      mode: wp.mode,
      status: wp.status,
      status_label: wp.status_label,
      message: wp.message,
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
        honesty: "Zoho credentials accepted.",
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
      message: "Meta connect accepted.",
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
    if (path === "integrations/meta/simulate-inbound") {
      const channel =
        body && typeof body === "object" && body.channel
          ? String(body.channel).toLowerCase()
          : "whatsapp";
      const inboundBody =
        body && typeof body === "object" && body.body
          ? String(body.body)
          : "Hi";
      if (channel === "whatsapp") {
        const from =
          body && typeof body === "object" && body.from
            ? String(body.from).replace(/\D+/g, "")
            : "15551234567";
        const handled = await handleInboundWhatsApp({
          body: inboundBody,
          external_user_id: from,
          external_conversation_id: `sim-meta-wa:${from}`,
          provider_message_id: `sim-meta-${Date.now().toString(36)}`,
          contact_name:
            body && typeof body === "object" && body.contact_name
              ? String(body.contact_name)
              : "Meta simulator",
          auto_reply: body?.auto_reply !== false,
          dry_run: body?.dry_run === true,
        });
        return jsonOk({
          ok: true,
          mode: "next_dual_run",
          channel: "whatsapp",
          agent_key: "ai_support",
          conversation: handled.conversation,
          replied: handled.replied,
          reply: handled.reply || null,
          messages: [
            {
              conversation: handled.conversation,
              body: inboundBody,
            },
          ],
          verify_token_hint: "triada-meta-verify-2026",
        });
      }
      if (SUPPORT_PAGE_MESSAGING_CHANNELS.includes(channel)) {
        const from =
          body && typeof body === "object" && body.from
            ? String(body.from)
            : `sim-${channel}-user`;
        const handled = await handleInboundPageMessaging({
          channel,
          body: inboundBody,
          external_user_id: from,
          external_conversation_id: `sim-meta-${channel}:${from}`,
          provider_message_id: `sim-meta-${channel}-${Date.now().toString(36)}`,
          page_or_account_id:
            body && typeof body === "object" && body.page_or_account_id
              ? String(body.page_or_account_id)
              : `sim-${channel}-page`,
          auto_reply: body?.auto_reply !== false,
          dry_run: body?.dry_run === true,
        });
        return jsonOk({
          ok: true,
          mode: "next_dual_run",
          channel,
          agent_key: "ai_support",
          conversation: handled.conversation,
          replied: handled.replied,
          reply: handled.reply || null,
          messages: [
            {
              conversation: handled.conversation,
              body: inboundBody,
            },
          ],
          verify_token_hint: "triada-meta-verify-2026",
        });
      }
      if (SUPPORT_TEXT_CHANNELS.includes(channel)) {
        const from =
          body && typeof body === "object" && body.from
            ? String(body.from)
            : channel === "email"
              ? "customer@example.com"
              : `sim-${channel}-user`;
        const handled = await handleInboundSupportChannel({
          channel,
          body: inboundBody,
          subject:
            body && typeof body === "object" && body.subject
              ? String(body.subject)
              : undefined,
          external_user_id: from,
          external_conversation_id: `sim-meta-${channel}:${from}`,
          provider_message_id: `sim-meta-${channel}-${Date.now().toString(36)}`,
          contact_name:
            body && typeof body === "object" && body.contact_name
              ? String(body.contact_name)
              : undefined,
          metadata:
            channel === "email"
              ? { email: from, contact_name: from }
              : channel === "telegram"
                ? { chat_id: from }
                : {},
          auto_reply: body?.auto_reply !== false,
          dry_run: body?.dry_run === true,
        });
        return jsonOk({
          ok: true,
          mode: "next_dual_run",
          channel,
          agent_key: "ai_support",
          conversation: handled.conversation,
          replied: handled.replied,
          reply: handled.reply || null,
          messages: [
            {
              conversation: handled.conversation,
              body: inboundBody,
            },
          ],
          verify_token_hint: "triada-meta-verify-2026",
        });
      }
      if (SOCIAL_DM_CHANNELS.includes(channel)) {
        const handled = await handleInboundSocialDm({
          channel,
          body: inboundBody,
          auto_reply: body?.auto_reply !== false,
          dry_run: body?.dry_run === true,
        });
        return jsonOk({
          ok: true,
          mode: "next_dual_run",
          channel,
          agent_key: "social_media_manager",
          conversation: handled.conversation,
          replied: handled.replied,
          reply: handled.reply || null,
          messages: [
            {
              conversation: handled.conversation,
              body: inboundBody,
            },
          ],
          verify_token_hint: "triada-meta-verify-2026",
        });
      }
    }
    return jsonOk({
      ok: true,
      mode: "next_dual_run",
      message: "Request accepted.",
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

  if (path === "integrations/whatsapp/upload-media" && m === "POST") {
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    const media = extractWhatsAppMediaInput(input);
    if (!media.media_url && !media.media_base64) {
      return jsonErr("media_url or media_base64 is required.", 422);
    }
    const result = await uploadWhatsAppMedia({
      media_url: media.media_url,
      media_base64: media.media_base64,
      mime_type: media.mime_type,
      media_type: media.media_type,
      filename: media.filename,
    });
    return jsonOk(result, result.ok ? 200 : 422);
  }

  if (path === "integrations/whatsapp/send-media" && m === "POST") {
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    if (!input.to) {
      return jsonErr("to is required.", 422);
    }
    const media = extractWhatsAppMediaInput(input);
    if (!media.media_id && !media.media_url && !media.media_base64 && !media.media_link) {
      return jsonErr("media_id, media_url, media_link, or media_base64 is required.", 422);
    }
    if (input.marketing_opt_out === true && input.purpose !== "transactional") {
      return {
        status: 422,
        body: { ok: false, error: "marketing_opt_out", eligibility: { eligible: false } },
      };
    }
    const result = await sendWhatsAppMediaMessage({
      to: String(input.to),
      ...media,
      caption: media.caption ? String(media.caption) : undefined,
    });
    return jsonOk(result, result.ok ? 200 : 422);
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
    const media = extractWhatsAppMediaInput(input);
    const result = await sendWhatsAppTemplateMessage({
      to: String(input.to),
      template_name: String(input.template_name),
      language: input.language ? String(input.language) : "en",
      components: Array.isArray(input.components) ? input.components : [],
      ...media,
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
        : "Waiting credentials",
    });
  }

  if (path === "integrations/shopify/status" && m === "GET") {
    return jsonOk(shopifyStatusPayload());
  }

  if (path === "integrations/shopify/connect" && m === "POST") {
    const status = shopifyStatusPayload();
    return jsonOk({
      ok: true,
      mode: "next_dual_run",
      message: status.connected
        ? "Shopify is Connected."
        : "Waiting credentials.",
      status,
    });
  }

  if (path === "integrations/shopify/disconnect" && m === "POST") {
    return jsonOk({
      ok: true,
      mode: "next_dual_run",
      message: "Shopify status unchanged.",
      status: shopifyStatusPayload(),
    });
  }

  if (path === "integrations/shopify/sync" && m === "POST") {
    const syncType =
      body && typeof body === "object" && body.sync_type
        ? String(body.sync_type)
        : "products";
    if (syncType === "orders") {
      const status = shopifyStatusPayload();
      return jsonOk({
        ok: true,
        run: {
          status: status.connected ? "completed" : "completed",
          mode: status.connected ? status.mode : "local_sim",
          sync_type: "orders",
          records_upserted: 0,
          records_failed: 0,
          summary: {
            note: status.connected
              ? "Orders sync reserved — use products sync for catalog publish."
              : status.summary,
          },
        },
        status,
      });
    }
    const result = await syncShopifyCatalogInbound();
    return jsonOk({
      ok: result.ok,
      run: result.run,
      status: result.status_payload,
      mode: result.mode,
      source: "next_dual_run",
    });
  }

  if (path === "integrations/channels/status" && m === "GET") {
    // UI expects { channels: { facebook: { status, status_label, ... }, ... }, webchat_widget }.
    // Prior stub returned { data: [...] } and omitted Meta/Shopify → false "Waiting credentials".
    const meta = await getMetaStatus();
    return jsonOk(buildSalesChannelsStatus({ meta }));
  }

  if (path === "integrations/channels/webchat-token" && m === "POST") {
    const meta = await getMetaStatus();
    const publicToken = `wc_${Date.now().toString(36)}`;
    return jsonOk(
      buildSalesChannelsStatus({
        meta,
        webchat_widget: {
          id: `webchat-widget-${publicToken}`,
          name: "Website widget",
          public_token: publicToken,
          rate_limit_per_minute: 30,
          embed_path: "/widget/chat.js",
        },
      }),
    );
  }

  // Public website widget → Support AI auto-reply (returned as suggested_reply).
  if (path === "webchat/messages" && m === "POST") {
    const token =
      body && typeof body === "object" && body.token
        ? String(body.token).trim()
        : "";
    if (!token) {
      return jsonErr("Widget token is required.", 401);
    }
    const inboundBody =
      body && typeof body === "object" && body.body
        ? String(body.body).trim()
        : "";
    if (!inboundBody) {
      return jsonErr("Message body is required.", 422);
    }

    const [normalized] = normalizeWebchatInbound({
      ...(body && typeof body === "object" ? body : {}),
      token,
      body: inboundBody,
    });
    const handled = await handleInboundSupportChannel({
      channel: "webchat",
      body: normalized.body,
      external_user_id: normalized.external_user_id,
      external_conversation_id: normalized.external_conversation_id,
      provider_message_id: normalized.provider_message_id,
      contact_name: normalized.contact_name,
      metadata: normalized.metadata,
      auto_reply: true,
    });

    return jsonOk({
      ok: true,
      conversation_id: handled.conversation?.id || null,
      suggested_reply:
        handled.reply?.reply ||
        "Thanks — a Triada specialist can continue from here.",
      replied: handled.replied,
      agent_key: "ai_support",
      mode: handled.reply?.send?.mode || handled.reply?.mode || "local_sim",
      send_ok: handled.reply?.send?.ok ?? null,
    });
  }

  if (
    (path === "integrations/channels/connect" ||
      path === "integrations/channels/disconnect" ||
      path === "integrations/channels/simulate-inbound") &&
    m === "POST"
  ) {
    const meta = await getMetaStatus();
    if (path === "integrations/channels/simulate-inbound") {
      const channel =
        body && typeof body === "object" && body.channel
          ? String(body.channel).toLowerCase()
          : "webchat";
      const inboundBody =
        body && typeof body === "object" && body.body
          ? String(body.body)
          : "Hello — interested in Triada Designs jewellery.";
      if (SUPPORT_PAGE_MESSAGING_CHANNELS.includes(channel)) {
        const from =
          body && typeof body === "object" && body.from
            ? String(body.from)
            : `sim-${channel}-user`;
        const handled = await handleInboundPageMessaging({
          channel,
          body: inboundBody,
          external_user_id: from,
          external_conversation_id: `sim-${channel}:${from}`,
          provider_message_id: `sim-${channel}-${Date.now().toString(36)}`,
          page_or_account_id:
            body && typeof body === "object" && body.page_or_account_id
              ? String(body.page_or_account_id)
              : `sim-${channel}-page`,
          auto_reply: body?.auto_reply !== false,
          dry_run: body?.dry_run === true,
        });
        return jsonOk({
          ok: true,
          mode: "next_dual_run",
          agent_key: "ai_support",
          channel,
          ai: { intent: "jewellery_inquiry", agent: "ai_support" },
          conversation: handled.conversation,
          replied: handled.replied,
          reply: handled.reply || null,
          messages: [
            {
              conversation: handled.conversation,
              body: inboundBody,
            },
          ],
          channels: buildSalesChannelsStatus({ meta }).channels,
        });
      }
      if (SUPPORT_TEXT_CHANNELS.includes(channel)) {
        const from =
          body && typeof body === "object" && body.from
            ? String(body.from)
            : channel === "email"
              ? "customer@example.com"
              : `sim-${channel}-user`;
        const handled = await handleInboundSupportChannel({
          channel,
          body: inboundBody,
          subject:
            body && typeof body === "object" && body.subject
              ? String(body.subject)
              : undefined,
          external_user_id: from,
          external_conversation_id: `sim-${channel}:${from}`,
          provider_message_id: `sim-${channel}-${Date.now().toString(36)}`,
          contact_name:
            body && typeof body === "object" && body.contact_name
              ? String(body.contact_name)
              : undefined,
          metadata:
            channel === "email"
              ? { email: from, contact_name: from }
              : channel === "telegram"
                ? { chat_id: from }
                : {},
          auto_reply: body?.auto_reply !== false,
          dry_run: body?.dry_run === true,
        });
        return jsonOk({
          ok: true,
          mode: "next_dual_run",
          agent_key: "ai_support",
          channel,
          ai: {
            intent: "jewellery_inquiry",
            agent: "ai_support",
            suggested_reply: handled.reply?.reply || null,
          },
          conversation: handled.conversation,
          replied: handled.replied,
          reply: handled.reply || null,
          messages: [
            {
              conversation: handled.conversation,
              body: inboundBody,
            },
          ],
          channels: buildSalesChannelsStatus({ meta }).channels,
        });
      }
      if (SOCIAL_DM_CHANNELS.includes(channel)) {
        const handled = await handleInboundSocialDm({
          channel,
          body: inboundBody,
          subject:
            body && typeof body === "object" && body.subject
              ? String(body.subject)
              : undefined,
          auto_reply: body?.auto_reply !== false,
          dry_run: body?.dry_run === true,
        });
        return jsonOk({
          ok: true,
          mode: "next_dual_run",
          agent_key: "social_media_manager",
          ai: { intent: "social_dm", agent: "social_media_manager" },
          conversation: handled.conversation,
          replied: handled.replied,
          reply: handled.reply || null,
          messages: [
            {
              conversation: handled.conversation,
              body: inboundBody,
            },
          ],
          channels: buildSalesChannelsStatus({ meta }).channels,
        });
      }
      if (channel === "whatsapp") {
        const from =
          body && typeof body === "object" && body.from
            ? String(body.from).replace(/\D+/g, "")
            : "15551234567";
        const handled = await handleInboundWhatsApp({
          body: inboundBody,
          external_user_id: from,
          external_conversation_id: `sim-wa:${from}`,
          provider_message_id: `sim-wa-${Date.now().toString(36)}`,
          contact_name:
            body && typeof body === "object" && body.contact_name
              ? String(body.contact_name)
              : "Simulator",
          auto_reply: body?.auto_reply !== false,
          dry_run: body?.dry_run === true,
        });
        return jsonOk({
          ok: true,
          mode: "next_dual_run",
          agent_key: "ai_support",
          channel: "whatsapp",
          ai: { intent: "jewellery_inquiry", agent: "ai_support" },
          conversation: handled.conversation,
          replied: handled.replied,
          reply: handled.reply || null,
          messages: [
            {
              conversation: handled.conversation,
              body: inboundBody,
            },
          ],
          channels: buildSalesChannelsStatus({ meta }).channels,
        });
      }
      return jsonOk({
        ok: true,
        mode: "next_dual_run",
        ai: { intent: "jewellery_inquiry" },
        messages: [
          {
            conversation: { id: `sim-${channel}-${Date.now()}` },
            body: inboundBody,
          },
        ],
        channels: buildSalesChannelsStatus({ meta }).channels,
      });
    }
    return jsonOk({
      ok: true,
      mode: "next_dual_run",
      ...buildSalesChannelsStatus({ meta }),
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

  if (path === "integrations/whatsapp/campaign-draft" && m === "POST") {
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    const draft = await draftWhatsAppCampaignWithBestsellers(input);
    return jsonOk(draft);
  }

  if (path === "integrations/whatsapp/campaign-send" && m === "POST") {
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    const sendMode = String(input.send_mode || input.mode || "template")
      .trim()
      .toLowerCase();
    const templateName = String(input.template_name || "").trim();
    const wantsSession = sendMode === "session" || sendMode === "media";
    if (!wantsSession && !templateName) {
      return jsonErr("template_name is required (or send_mode=session).", 422);
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

    const promo = await resolveCampaignPromoPayload(input);
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

    const mediaFields = {
      ...extractWhatsAppMediaInput({ ...input, ...promo.media }),
      media_id: promo.media.media_id || undefined,
      media_url: promo.media.media_url || undefined,
      media_link: promo.media.media_link || undefined,
      media_base64: promo.media.media_base64 || undefined,
      media_type: promo.media.media_type || undefined,
    };

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

      if (wantsSession) {
        const send = await sendWhatsAppMediaMessage({
          to,
          caption: promo.body,
          ...mediaFields,
          media_type: mediaFields.media_type || "image",
        });
        // Session text-only fallback when no media: still deliver promo body as caption on image path fails — use media with caption when media present
        results.push({
          contact_id: contact.id,
          name: contact.name,
          to,
          phone_e164: contact.phone_e164,
          ok: send.ok,
          mode: send.mode,
          provider_message_id: send.provider_message_id,
          media_id: send.media_id || null,
          media_type: send.media_type || mediaFields.media_type || null,
          send_mode: "session",
          promo_url: promo.promo_url,
          error: send.error,
        });
        continue;
      }

      const components = buildPromoComponentsForContact(promo, contact, input);
      const send = await sendWhatsAppTemplateMessage({
        to,
        template_name: templateName,
        language: input.language ? String(input.language) : "en",
        components,
        ...mediaFields,
      });
      results.push({
        contact_id: contact.id,
        name: contact.name,
        to,
        phone_e164: contact.phone_e164,
        ok: send.ok,
        mode: send.mode,
        provider_message_id: send.provider_message_id,
        media_id: send.media_id || null,
        media_type: send.media_type || mediaFields.media_type || null,
        send_mode: "template",
        promo_url: promo.promo_url,
        error: send.error,
      });
    }

    return jsonOk({
      ok: results.every((r) => r.ok),
      mode: listed.mode,
      template_name: templateName || null,
      send_mode: wantsSession ? "session" : "template",
      body: promo.body,
      promo_url: promo.promo_url,
      product_urls: promo.product_urls,
      products: promo.products,
      urls_injected: promo.urls_injected,
      media_attached: Boolean(
        mediaFields.media_id ||
          mediaFields.media_url ||
          mediaFields.media_link ||
          mediaFields.media_base64,
      ),
      media_type: mediaFields.media_type || null,
      attempted: results.length,
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
      source: "next_dual_run",
    });
  }

  if (path === "conversations" && m === "GET") {
    const url = new URL(request.url);
    const channelFilter = url.searchParams.get("channel") || "";
    const data = await listConversations({
      channel: channelFilter ? String(channelFilter) : "",
    });
    const unanswered = await listUnansweredSocialDms();
    const contactMap = await buildContactMapForConversations(data);
    const shaped = data.map((row) =>
      shapeConversationForInbox(
        row,
        row.contact_id ? contactMap.get(String(row.contact_id)) || null : null,
      ),
    );
    const storage = await conversationsStorageMode();
    return jsonOk({
      data: shaped,
      unanswered_social_dms: unanswered.length,
      social_dm_channels: SOCIAL_DM_CHANNELS,
      storage,
      source: "next_dual_run",
    });
  }

  if (path === "conversations/unanswered-social-dms" && m === "GET") {
    const data = await listUnansweredSocialDms();
    return jsonOk({
      data,
      channels: SOCIAL_DM_CHANNELS,
      agent_key: "social_media_manager",
      source: "next_dual_run",
    });
  }

  if (path.match(/^conversations\/[^/]+$/) && m === "GET") {
    const c = await getConversation(segments[1]);
    if (!c) return jsonErr("Conversation not found.", 404);
    const contactMap = await buildContactMapForConversations([c]);
    const shaped = shapeConversationForInbox(
      c,
      c.contact_id ? contactMap.get(String(c.contact_id)) || null : null,
    );
    // Laravel-compatible: conversation fields at root (inbox detail page).
    return jsonOk({
      ...shaped,
      source: "next_dual_run",
    });
  }

  if (path.match(/^conversations\/[^/]+\/(takeover|resume-ai|messages)$/) && m === "POST") {
    const action = segments[2];
    const id = segments[1];
    if (action === "takeover" || action === "resume-ai") {
      const patched = await patchConversation(id, {
        automation_mode: action === "takeover" ? "human" : "ai",
      });
      if (!patched) return jsonErr("Conversation not found.", 404);
      const contactMap = await buildContactMapForConversations([patched]);
      const shaped = shapeConversationForInbox(
        patched,
        patched.contact_id
          ? contactMap.get(String(patched.contact_id)) || null
          : null,
      );
      return jsonOk({
        ok: true,
        id,
        automation_mode: patched.automation_mode,
        ...shaped,
      });
    }
    // messages — human/outbound note
    const text =
      body && typeof body === "object" && body.body
        ? String(body.body)
        : "";
    if (!text) return jsonErr("Message body required.", 422);
    const saved = await appendOutboundReply(id, {
      body: text,
      agent_key: "human",
    });
    if (!saved) return jsonErr("Conversation not found.", 404);
    const contactMap = await buildContactMapForConversations([saved]);
    const shaped = shapeConversationForInbox(
      saved,
      saved.contact_id
        ? contactMap.get(String(saved.contact_id)) || null
        : null,
    );
    return jsonOk({
      ok: true,
      ...shaped,
      messages: shaped.messages || [],
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
      message: "Zoho sync queued. Waiting credentials.",
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
        action_types: [
          "send_message",
          "create_task",
          "sync_zoho",
          "notify_telegram",
          "send_whatsapp_template",
          "send_whatsapp_media",
          "whatsapp_window_follow_up",
          ...JEWELLERY_ACTION_TYPES,
        ],
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
        action_types: [
          "send_message",
          "create_task",
          "sync_zoho",
          "notify_telegram",
          "send_whatsapp_template",
          "send_whatsapp_media",
          "whatsapp_window_follow_up",
          ...JEWELLERY_ACTION_TYPES,
        ],
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
    const wf = runtimeState.workflows.find((w) => w.id === segments[1]);
    if (!wf) return jsonErr("Automation not found.", 404);
    const dryRun = segments[2] === "dry-run";
    const input =
      body && typeof body === "object"
        ? /** @type {Record<string, unknown>} */ (body)
        : {};
    const context = {
      ...(input.context && typeof input.context === "object"
        ? /** @type {Record<string, unknown>} */ (input.context)
        : {}),
      to: input.to || input.wa_id || input.external_user_id,
      external_user_id: input.external_user_id || input.wa_id || input.to,
      marketing_opt_out: input.marketing_opt_out === true,
    };
    const steps = [];
    const definition =
      wf.definition && typeof wf.definition === "object" ? wf.definition : {};
    const nodes =
      definition.nodes && typeof definition.nodes === "object"
        ? definition.nodes
        : {};

    for (const [nodeKey, rawNode] of Object.entries(nodes)) {
      const node = rawNode && typeof rawNode === "object" ? rawNode : {};
      if (String(node.type || "") !== "action") continue;
      const config =
        node.config && typeof node.config === "object" ? node.config : {};
      const actionType = String(config.action_type || "");
      const isWaSend =
        actionType === "send_whatsapp_template" ||
        actionType === "send_whatsapp_media" ||
        actionType === "whatsapp_window_follow_up";
      const isJewellery = JEWELLERY_ACTION_TYPES.includes(actionType);
      if (!isWaSend && !isJewellery) {
        continue;
      }

      if (isJewellery) {
        const result = await executeJewelleryWorkflowAction(
          actionType,
          config,
          context,
          { dryRun },
        );
        steps.push({
          node: nodeKey,
          action_type: actionType,
          ...result,
        });
        continue;
      }

      const to = String(
        config.to ||
          context.to ||
          context.external_user_id ||
          context.wa_id ||
          "",
      ).trim();
      const media = extractWhatsAppMediaInput({ ...context, ...config });

      if (dryRun) {
        steps.push({
          node: nodeKey,
          action_type: actionType,
          dry_run: true,
          would_send_to: to || null,
          template_name: config.template_name || null,
          media_attached: Boolean(
            media.media_id || media.media_url || media.media_link || media.media_base64,
          ),
          ok: true,
        });
        continue;
      }

      if (!to) {
        steps.push({
          node: nodeKey,
          action_type: actionType,
          ok: false,
          error: "recipient_required",
        });
        continue;
      }

      if (
        context.marketing_opt_out === true &&
        String(config.purpose || "marketing") === "marketing"
      ) {
        steps.push({
          node: nodeKey,
          action_type: actionType,
          ok: true,
          skipped: true,
          reason: "marketing_opt_out",
        });
        continue;
      }

      if (actionType === "send_whatsapp_media") {
        const sent = await sendWhatsAppMediaMessage({
          to,
          ...media,
          caption: media.caption ? String(media.caption) : undefined,
        });
        steps.push({
          node: nodeKey,
          action_type: actionType,
          ok: sent.ok,
          mode: sent.mode,
          provider_message_id: sent.provider_message_id,
          media_id: sent.media_id,
          media_type: sent.media_type,
          error: sent.error,
        });
        continue;
      }

      const templateName = String(
        config.template_name ||
          context.template_name ||
          "jewellery_follow_up",
      );
      const sent = await sendWhatsAppTemplateMessage({
        to,
        template_name: templateName,
        language: config.language ? String(config.language) : "en",
        components: Array.isArray(config.components) ? config.components : [],
        ...media,
      });
      steps.push({
        node: nodeKey,
        action_type: actionType,
        ok: sent.ok,
        mode: sent.mode,
        template_name: templateName,
        provider_message_id: sent.provider_message_id,
        media_id: sent.media_id || null,
        media_type: sent.media_type || null,
        error: sent.error,
      });
    }

    const failed = steps.some((s) => s.ok === false);
    return jsonOk({
      ok: !failed,
      run: {
        id: `run-${Date.now()}`,
        workflow_id: segments[1],
        status: failed ? "failed" : "completed",
        mode: dryRun ? "dry_run" : "live",
        steps,
        media_path: true,
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
        language: input.language || "en_US",
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

  if (
    (path === "agents/social-media-manager/sweep-dms" ||
      path === "agents/social_media_manager/sweep-dms") &&
    m === "POST"
  ) {
    const channels = Array.isArray(body?.channels)
      ? body.channels.map((c) => String(c).toLowerCase())
      : undefined;
    const result = await sweepUnansweredSocialDms({
      dry_run: body?.dry_run === true,
      channels,
      limit: body?.limit != null ? Number(body.limit) : undefined,
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
      "social-media-manager",
      "social_media_manager",
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
      const lineItems = Array.isArray(body?.line_items)
        ? body.line_items
        : parseLineItemsPlainText(String(body?.line_items_text || ""));
      return jsonOk(
        wrapInvoiceDocument({
          documentType: channel === "receipt" ? "receipt" : "invoice",
          number: body?.number,
          customerName: body?.customer_name,
          customerEmail: body?.customer_email,
          total: body?.total,
          currency: body?.currency,
          status: body?.status,
          issuedAt: body?.issued_at,
          lineItems,
          orderId: body?.order_id,
          notes: body?.notes,
          greeting: body?.greeting,
          preparedFor: body?.prepared_for,
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
    const quoteSettings = await getQuoteInspirationSettings();
    return jsonOk({
      data: listScheduled(),
      pending_approval: listPendingApproval(),
      pending_review: listPendingReview(),
      flow: "generate → human approve → admin sets / overrides date → cron publish (or cancel)",
      admin_controls: {
        schedule: true,
        reschedule: true,
        cancel: true,
        override_ai_proposal: true,
        note: "Only admins set go-live. AI may propose a slot; cron never invents dates.",
      },
      quote_inspiration: {
        enabled: quoteSettings.enabled,
        weekdays: quoteSettings.weekdays,
        weekday_labels: quoteSettings.weekdays.map(
          (d) => WEEKDAY_LABELS[d] || String(d),
        ),
        next_send_at: nextWeekdaySendAt(quoteSettings),
        send_hour_utc: quoteSettings.send_hour_utc,
        campaign_key: quoteSettings.campaign_key,
        path: "/content/inspiration",
        cron: "/api/cron/quote-inspiration",
      },
      cron: {
        path: "/api/cron/content-publish",
        note: "Publishes only what you scheduled. Cancel anytime before go-live.",
      },
    });
  }

  if (path === "campaigns" && m === "GET") {
    const items = getContentItems();
    const byObjective = {};
    for (const item of items) {
      const key = item.objective || "general";
      if (!byObjective[key]) byObjective[key] = [];
      byObjective[key].push(item);
    }
    const quoteSettings = await getQuoteInspirationSettings();
    const recipients = await listWhatsAppCampaignRecipients().catch(() => ({
      data: [],
      mode: "local_sim",
    }));
    return jsonOk({
      data: Object.entries(byObjective).map(([objective, group]) => ({
        objective,
        items: group,
        count: group.length,
      })),
      quote_inspiration: {
        enabled: quoteSettings.enabled,
        weekdays: quoteSettings.weekdays,
        weekday_labels: quoteSettings.weekdays.map(
          (d) => WEEKDAY_LABELS[d] || String(d),
        ),
        next_send_at: nextWeekdaySendAt(quoteSettings),
        campaign_key: quoteSettings.campaign_key,
        recipient_limit: quoteSettings.recipient_limit,
        contact_ids: quoteSettings.contact_ids,
        recipients_available: recipients.data?.length || 0,
        path: "/content/inspiration",
      },
    });
  }

  if (path === "analytics" && m === "GET") {
    const [anthropic, meta] = await Promise.all([
      getAnthropicStatus(),
      getMetaStatus(),
    ]);
    const metrics = await collectLiveDashboardMetrics({
      anthropicHasCredentials: anthropic.has_credentials,
      anthropicModel: anthropic.model,
      metaFacebookReady: meta.facebook_ready,
      metaMessengerReady: meta.messenger_ready,
      metaInstagramReady: meta.instagram_ready,
      metaWhatsAppReady: meta.whatsapp_ready,
    });
    return jsonOk(buildAnalyticsPayload(metrics));
  }

  // ---- team invites / roles / members ----
  if (path === "team" && m === "GET") {
    const [members, invites, roles] = await Promise.all([
      listMembers(),
      listInvites({ status: "pending" }),
      listRoles(),
    ]);
    return jsonOk({
      data: members.data,
      invites: invites.data,
      roles: roles.data,
      permission_areas: PERMISSION_AREAS,
      source: members.source,
    });
  }

  if (path === "team/roles" && m === "GET") {
    const roles = await listRoles();
    return jsonOk({
      data: roles.data,
      permission_areas: PERMISSION_AREAS,
      source: roles.source,
    });
  }

  if (path === "team/roles" && m === "POST") {
    try {
      const created = await createRole(body && typeof body === "object" ? body : {});
      return jsonOk(created, 201);
    } catch (err) {
      return jsonErr(err instanceof Error ? err.message : "Unable to create role.", 422);
    }
  }

  if (path.match(/^team\/roles\/[^/]+$/) && (m === "PATCH" || m === "PUT")) {
    try {
      const updated = await updateRole(
        segments[2],
        body && typeof body === "object" ? body : {},
      );
      return jsonOk(updated);
    } catch (err) {
      return jsonErr(err instanceof Error ? err.message : "Unable to update role.", 422);
    }
  }

  if (path === "team/invites" && m === "GET") {
    const statusParam = (() => {
      try {
        return new URL(request.url).searchParams.get("status") || "pending";
      } catch {
        return "pending";
      }
    })();
    const listed = await listInvites({
      status: statusParam === "all" ? "" : statusParam,
    });
    return jsonOk({ data: listed.data, source: listed.source });
  }

  if (path === "team/invites" && m === "POST") {
    const email =
      body && typeof body === "object" && typeof body.email === "string"
        ? body.email
        : "";
    const name =
      body && typeof body === "object" && typeof body.name === "string"
        ? body.name
        : "";
    const roleId =
      body && typeof body === "object" && typeof body.role_id === "string"
        ? body.role_id
        : body && typeof body === "object" && typeof body.role === "string"
          ? body.role
          : "role-viewer";

    const auth = await requireAuth(request);
    const inviterEmail = auth.ok ? auth.user?.email || "" : "";
    const inviterName =
      auth.ok && auth.user?.user_metadata?.name
        ? String(auth.user.user_metadata.name)
        : inviterEmail || "Triada Admin";

    let created;
    try {
      created = await createInvite({
        email,
        name,
        role_id: roleId,
        invited_by: auth.ok ? auth.user.id : null,
        invited_by_email: inviterEmail,
      });
    } catch (err) {
      return jsonErr(err instanceof Error ? err.message : "Unable to create invite.", 422);
    }

    const acceptUrl = `${inviteAppBaseUrl(request)}/invite/${created.token}`;
    const mail = await sendInviteEmail({
      toEmail: created.data.email,
      inviteeName: created.data.name,
      inviterName,
      roleName: created.role?.name || created.data.role_slug,
      acceptUrl,
      expiresAt: created.data.expires_at,
    });

    if (!mail.ok) {
      return jsonOk(
        {
          data: created.data,
          accept_url: acceptUrl,
          email: {
            sent: false,
            mode: mail.mode,
            error: mail.error || mail.message,
          },
          message:
            mail.message ||
            "Invite created but email could not be sent. Share the accept link manually.",
          source: created.source,
        },
        201,
      );
    }

    return jsonOk(
      {
        data: created.data,
        accept_url:
          mail.mode === "local_fallback" ? acceptUrl : undefined,
        email: {
          sent: true,
          mode: mail.mode,
          id: mail.id || null,
        },
        message:
          mail.mode === "local_fallback"
            ? "Invite created. Resend is not keyed — use the accept link locally."
            : "Invitation email sent via Resend.",
        source: created.source,
      },
      201,
    );
  }

  if (path.match(/^team\/invites\/[^/]+$/) && m === "DELETE") {
    try {
      const revoked = await revokeInvite(segments[2]);
      return jsonOk(revoked);
    } catch (err) {
      return jsonErr(err instanceof Error ? err.message : "Unable to revoke invite.", 404);
    }
  }

  if (path.match(/^team\/members\/[^/]+$/) && (m === "PATCH" || m === "PUT")) {
    try {
      const updated = await updateMember(
        segments[2],
        body && typeof body === "object" ? body : {},
      );
      return jsonOk(updated);
    } catch (err) {
      return jsonErr(err instanceof Error ? err.message : "Unable to update member.", 422);
    }
  }

  if (path === "team/permission-areas" && m === "GET") {
    return jsonOk({ data: PERMISSION_AREAS });
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

  // ---- jewellery ops (Next-native runners; no Laravel) ----
  if (path === "jewellery-ops/overview" && m === "GET") {
    return jsonOk(await buildJewelleryOpsOverview());
  }

  if (path === "jewellery-ops/policies" && m === "GET") {
    return jsonOk({ data: jewelleryPolicies(), ok: true });
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
      detected_language: result.detected_language,
      detected_language_name: result.detected_language_name,
      language_rtl: result.language_rtl,
      handoff: false,
      policies: jewelleryPolicies(),
    });
  }

  if (path === "jewellery-ops/gift-finder" && m === "POST") {
    const input = body && typeof body === "object" ? body : {};
    const result = await suggestGifts(input);
    return jsonOk(result);
  }

  if (path === "jewellery-ops/gift-sessions" && m === "GET") {
    return jsonOk({ data: [], ok: true, message: "Use gift-finder to create sessions." });
  }

  if (path === "jewellery-ops/orders" && m === "GET") {
    const listed = await listCommerceOrders();
    return jsonOk({
      data: listed.data,
      storage: listed.storage,
    });
  }

  if (path === "jewellery-ops/orders" && m === "POST") {
    const input = body && typeof body === "object" ? body : {};
    const result = await upsertCommerceOrder(input);
    return jsonOk(result, 201);
  }

  if (path === "jewellery-ops/orders/where-is-my-order" && m === "POST") {
    const input = body && typeof body === "object" ? body : {};
    return jsonOk(await whereIsMyOrder(input));
  }

  if (path === "jewellery-ops/custom-pieces" && m === "GET") {
    return jsonOk(await listCustomPieces());
  }

  if (path === "jewellery-ops/custom-pieces" && m === "POST") {
    const input = body && typeof body === "object" ? body : {};
    return jsonOk(await collectCustomPiece(input), 201);
  }

  if (path.match(/^jewellery-ops\/custom-pieces\/[^/]+\/approve-quote$/) && m === "POST") {
    const input = body && typeof body === "object" ? body : {};
    const result = await approveCustomQuote(segments[2], input);
    if (!result.ok) return jsonErr(result.error || "Approve failed", 400);
    return jsonOk(result);
  }

  if (path === "jewellery-ops/abandonment" && m === "GET") {
    return jsonOk(await listAbandonmentEvents());
  }

  if (path === "jewellery-ops/abandonment" && m === "POST") {
    const input = body && typeof body === "object" ? body : {};
    return jsonOk(await trackAbandonment(input), 201);
  }

  if (path === "jewellery-ops/abandonment/process" && m === "POST") {
    return jsonOk(await processDueAbandonment());
  }

  if (path === "jewellery-ops/after-sale" && m === "GET") {
    return jsonOk(await listAfterSaleJobs());
  }

  if (path === "jewellery-ops/after-sale/process" && m === "POST") {
    return jsonOk(await processDueAfterSale());
  }

  if (path === "jewellery-ops/waitlist" && m === "GET") {
    return jsonOk(await listWaitlist());
  }

  if (path === "jewellery-ops/waitlist" && m === "POST") {
    const input = body && typeof body === "object" ? body : {};
    return jsonOk(await joinWaitlist(input), 201);
  }

  if (path === "jewellery-ops/waitlist/notify" && m === "POST") {
    const input = body && typeof body === "object" ? body : {};
    return jsonOk(await notifyWaitlistRestock(input));
  }

  if (path === "jewellery-ops/vip-drop" && m === "POST") {
    const input = body && typeof body === "object" ? body : {};
    return jsonOk(await announceVipDrop(input));
  }

  if (path === "jewellery-ops/telegram-alerts" && m === "GET") {
    return jsonOk(await listTelegramAlerts());
  }

  if (path === "jewellery-ops/telegram-alerts" && m === "POST") {
    const input = body && typeof body === "object" ? body : {};
    return jsonOk(await sendTelegramAlert(input), 201);
  }

  if (path === "jewellery-ops/content/cross-post" && m === "POST") {
    return jsonOk({
      ok: true,
      mode: "queued_for_approval",
      note: "Cross-post requires human approve in Content Studio.",
    });
  }

  if (path === "jewellery-ops/content/weekly-summary" && m === "POST") {
    return jsonOk({
      ok: true,
      summary: { window: "7d", mode: "next_native" },
    });
  }

  if (path === "jewellery-ops/invoices" && m === "GET") {
    const listed = await listInvoiceDocs();
    return jsonOk({
      data: listed.data.map(presentInvoiceDoc),
      storage: listed.storage,
    });
  }

  if (path === "jewellery-ops/invoices" && m === "POST") {
    const input = body && typeof body === "object" ? body : {};
    const lineItems = Array.isArray(input.line_items)
      ? input.line_items
      : parseLineItemsPlainText(String(input.line_items_text || ""));
    const saved = await upsertInvoiceDoc({
      ...input,
      line_items: lineItems,
      number: input.number || input.invoice_number,
    });
    const presented = presentInvoiceDoc(saved.doc);
    return jsonOk(
      {
        ok: true,
        invoice: presented,
        document: presented.document,
        branded: true,
        storage: saved.storage,
      },
      201,
    );
  }

  if (path === "jewellery-ops/invoices/preview" && m === "POST") {
    const input = body && typeof body === "object" ? body : {};
    const lineItems = Array.isArray(input.line_items)
      ? input.line_items
      : parseLineItemsPlainText(String(input.line_items_text || ""));
    const shaped = shapeInvoiceDoc({
      ...input,
      line_items: lineItems,
      number: input.number || input.invoice_number,
    });
    return jsonOk({
      ok: true,
      invoice: presentInvoiceDoc(shaped),
      branded: true,
      persisted: false,
    });
  }

  if (path.match(/^jewellery-ops\/invoices\/[^/]+$/) && m === "GET") {
    const id = segments[2];
    const found = await getInvoiceDoc(id);
    if (!found.doc) return jsonErr("Invoice not found", 404);
    return jsonOk({
      invoice: presentInvoiceDoc(found.doc),
      storage: found.storage,
    });
  }

  if (path.match(/^jewellery-ops\/invoices\/[^/]+$/) && (m === "PUT" || m === "PATCH")) {
    const id = segments[2];
    const input = body && typeof body === "object" ? body : {};
    const existing = await getInvoiceDoc(id);
    if (!existing.doc) return jsonErr("Invoice not found", 404);
    const lineItems = Array.isArray(input.line_items)
      ? input.line_items
      : input.line_items_text != null
        ? parseLineItemsPlainText(String(input.line_items_text || ""))
        : existing.doc.line_items;
    const saved = await upsertInvoiceDoc({
      ...existing.doc,
      ...input,
      id,
      line_items: lineItems,
      number: input.number || input.invoice_number || existing.doc.number,
      created_at: existing.doc.created_at,
    });
    const presented = presentInvoiceDoc(saved.doc);
    return jsonOk({
      ok: true,
      invoice: presented,
      document: presented.document,
      branded: true,
      storage: saved.storage,
    });
  }

  if (path.match(/^jewellery-ops\/invoices\/[^/]+$/) && m === "DELETE") {
    const id = segments[2];
    const result = await deleteInvoiceDoc(id);
    if (!result.ok) return jsonErr(result.message || "Delete failed", 400);
    return jsonOk(result);
  }

  if (path === "jewellery-ops/manufacturer" && m === "GET") {
    return jsonOk(await getManufacturerOverview());
  }

  if (path === "jewellery-ops/manufacturer/contacts" && m === "GET") {
    const listed = await listManufacturerContacts();
    return jsonOk({ data: listed.data, storage: listed.storage });
  }

  if (path === "jewellery-ops/manufacturer/contacts" && m === "POST") {
    const input = body && typeof body === "object" ? body : {};
    const saved = await upsertManufacturerContact(input);
    return jsonOk(saved, 201);
  }

  if (
    path.match(/^jewellery-ops\/manufacturer\/contacts\/[^/]+$/) &&
    (m === "PUT" || m === "PATCH")
  ) {
    const id = segments[3];
    const input = body && typeof body === "object" ? body : {};
    const saved = await upsertManufacturerContact({ ...input, id });
    return jsonOk(saved);
  }

  if (
    path.match(/^jewellery-ops\/manufacturer\/orders\/[^/]+\/ack$/) &&
    m === "POST"
  ) {
    const id = segments[3];
    const input = body && typeof body === "object" ? body : {};
    const auth = await requireAuth(request);
    const result = await acknowledgeManufacturerOrder(id, {
      acked_by:
        (typeof input.acked_by === "string" && input.acked_by) ||
        (auth.ok ? auth.user?.email : null) ||
        "admin",
      note: input.note,
    });
    if (!result.ok) return jsonErr(result.error || "Ack failed", 404);
    return jsonOk(result);
  }

  if (
    path.match(/^jewellery-ops\/manufacturer\/orders\/[^/]+\/status$/) &&
    (m === "POST" || m === "PATCH")
  ) {
    const id = segments[3];
    const input = body && typeof body === "object" ? body : {};
    const result = await updateManufacturerOrderStatus(id, {
      status: String(input.status || ""),
      note: input.note,
    });
    if (!result.ok) {
      return jsonErr(
        result.error === "invalid_status"
          ? `Invalid status. Allowed: ${(result.allowed || MANUFACTURER_STATUSES).join(", ")}`
          : result.error || "Status update failed",
        result.error === "invalid_status" ? 400 : 404,
      );
    }
    return jsonOk(result);
  }

  if (
    path.match(/^jewellery-ops\/manufacturer\/orders\/[^/]+\/resend$/) &&
    m === "POST"
  ) {
    const id = segments[3];
    const result = await resendManufacturerOrder(id);
    if (!result.ok) return jsonErr(result.error || "Resend failed", 404);
    return jsonOk(result);
  }

  if (path === "jewellery-ops/manufacturer/jobs" && m === "POST") {
    const input = body && typeof body === "object" ? body : {};
    return jsonOk(await pushManufacturerOrder(input), 201);
  }

  if (path === "jewellery-ops/ugc" && m === "GET") {
    return jsonOk(await listUgcItems());
  }

  if (path === "jewellery-ops/ugc/repost-queue" && m === "GET") {
    return jsonOk(await listUgcRepostQueue());
  }

  if (path === "jewellery-ops/ugc/tags" && m === "POST") {
    const input = body && typeof body === "object" ? body : {};
    return jsonOk(await recordUgcTag(input), 201);
  }

  if (path.match(/^jewellery-ops\/ugc\/[^/]+\/request-permission$/) && m === "POST") {
    const input = body && typeof body === "object" ? body : {};
    const result = await requestUgcPermission(segments[2], input);
    if (!result.ok) return jsonErr(result.error || "UGC not found", 404);
    return jsonOk(result);
  }

  if (path === "jewellery-ops/outreach/prospects" && m === "GET") {
    return jsonOk(await listOutreachProspects());
  }

  if (path === "jewellery-ops/outreach/prospects" && m === "POST") {
    const input = body && typeof body === "object" ? body : {};
    const result = await upsertOutreachProspect(input);
    if (!result.ok) return jsonErr(result.message || result.error || "Outreach failed", 400);
    return jsonOk(result, 201);
  }

  if (path.match(/^jewellery-ops\/outreach\/prospects\/[^/]+\/draft$/) && m === "POST") {
    const input = body && typeof body === "object" ? body : {};
    const result = await draftOutreachMessage(segments[3], input);
    if (!result.ok) return jsonErr(result.error || "Draft failed", 400);
    return jsonOk(result, 201);
  }

  if (path === "jewellery-ops/outreach/messages" && m === "GET") {
    return jsonOk(await listOutreachMessages());
  }

  if (path.match(/^jewellery-ops\/outreach\/messages\/[^/]+\/approve$/) && m === "POST") {
    const input = body && typeof body === "object" ? { approved: true, ...(body || {}) } : { approved: true };
    const result = await approveOutreachMessage(segments[3], input);
    if (!result.ok) return jsonErr(result.error || "Approve failed", 400);
    return jsonOk(result);
  }

  if (path === "jewellery-ops/popups" && m === "GET") {
    const data = await listPopupMarkets();
    return jsonOk({ data, source: "next_dual_run" });
  }

  if (path === "jewellery-ops/popups" && m === "POST") {
    const input = body && typeof body === "object" ? body : {};
    if (!input.name || !String(input.name).trim()) {
      return jsonErr("Market name is required.", 422);
    }
    const market = await upsertPopupMarket(input);
    return jsonOk({ ok: true, market, source: "next_dual_run" }, 201);
  }

  if (path === "jewellery-ops/popups/scan-alerts" && m === "POST") {
    const result = await scanPopupAlerts();
    return jsonOk({ ...result, source: "next_dual_run" });
  }

  if (path.match(/^jewellery-ops\/popups\/[^/]+\/draft-application$/) && m === "POST") {
    try {
      const application = await draftPopupApplication(segments[2]);
      return jsonOk({ ok: true, application, source: "next_dual_run" }, 201);
    } catch (err) {
      return jsonErr(err.message || "Draft failed", 404);
    }
  }

  if (path === "jewellery-ops/popup-applications" && m === "GET") {
    const data = await listPopupApplications();
    return jsonOk({ data, source: "next_dual_run" });
  }

  if (
    path.match(/^jewellery-ops\/popup-applications\/[^/]+\/approve$/) &&
    m === "POST"
  ) {
    try {
      const application = await approvePopupApplication(segments[2]);
      return jsonOk({
        ok: true,
        application,
        application_id: segments[2],
        status: application.status,
        source: "next_dual_run",
      });
    } catch (err) {
      return jsonErr(err.message || "Approve failed", 404);
    }
  }

  // Fallback: never rewrite to dead Laravel — return empty-but-valid JSON
  if (m === "GET") {
    return jsonOk({
      data: [],
      ok: true,
      source: "next_dual_run",
      path: `/api/v1/${path}`,
      message: "No data.",
    });
  }

  return jsonOk({
    ok: true,
    source: "next_dual_run",
    path: `/api/v1/${path}`,
    message: "Accepted.",
  });
}
