/**
 * WhatsApp Cloud API message templates (Meta Graph).
 * Uses META_WA_* / WHATSAPP_* env or Integrations-stored credentials (Supabase app_metadata).
 * Falls back to a local jewellery catalog when template credentials are absent.
 * Never logs or returns raw access tokens.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { integrationRuntimeMode } from "@/lib/integrations/env-presence";
import { resolveWhatsAppCloudCredentials } from "@/lib/integrations/meta-credentials";
import { getLocalDataDir } from "@/lib/local-data-dir";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH_BASE = (
  process.env.META_GRAPH_BASE || "https://graph.facebook.com"
).replace(/\/$/, "");
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "whatsapp-templates.json");

/** @type {Map<string, Record<string, unknown>>} */
const memoryStore = new Map();

function graphUrl(resourcePath) {
  return `${GRAPH_BASE}/${GRAPH_VERSION}/${String(resourcePath).replace(/^\//, "")}`;
}

function slugify(name) {
  const s = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || `wa-${Date.now().toString(36)}`;
}

function templateApiName(name) {
  const n = String(name || "jewellery_update")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return n || "jewellery_update";
}

function mapMetaStatus(status) {
  switch (String(status || "").toUpperCase()) {
    case "APPROVED":
      return "approved";
    case "REJECTED":
      return "rejected";
    case "PENDING":
    case "IN_APPEAL":
    case "PENDING_DELETION":
      return "pending_approval";
    case "DISABLED":
    case "PAUSED":
      return "draft";
    default:
      return "draft";
  }
}

/** @param {Record<string, unknown>} row */
function extractBody(row) {
  if (row.body) return String(row.body);
  const components = Array.isArray(row.components) ? row.components : [];
  for (const component of components) {
    if (String(component?.type || "").toUpperCase() === "BODY") {
      return String(component.text || "");
    }
  }
  return "";
}

/**
 * Build one seed row (Meta Graph–shaped).
 * @param {{
 *   id: string,
 *   name: string,
 *   category: string,
 *   body: string,
 *   variables?: string[],
 *   campaign_type: string,
 *   status?: string,
 * }} def
 */
function seedRow(def) {
  const logoUrl =
    "https://triada-designs.com/wp-content/uploads/2025/07/TM_Schriftzug_vulcano.svg";
  return {
    id: def.id,
    name: def.name,
    status: def.status || "APPROVED",
    category: def.category,
    language: "en",
    body: def.body,
    variables: def.variables || [],
    components: [
      {
        type: "HEADER",
        format: "IMAGE",
        example: { header_handle: [logoUrl] },
      },
      { type: "BODY", text: def.body },
      {
        type: "FOOTER",
        text: "Triada Designs · Timisoara · triada-designs.com",
      },
    ],
    branded: true,
    logo_url: logoUrl,
    source: "seeded",
    metadata: {
      vertical: "jewellery",
      campaign_type: def.campaign_type,
      from_automation_doc: true,
      brand_header: true,
      brand_footer: true,
      warm_greeting: true,
    },
  };
}

/**
 * Full Triada automation WhatsApp template catalog (Roosevelt doc).
 * Covers abandonment, after-sale, VIP, waitlist, order updates, UGC, consult.
 * @returns {Array<Record<string, unknown>>}
 */
export function triadaAutomationWhatsAppTemplateCatalog() {
  return [
    seedRow({
      id: "sim-wa-jewellery-follow-up",
      name: "jewellery_follow_up",
      category: "MARKETING",
      campaign_type: "inquiry_follow_up",
      body: "Warm greetings from Triada Designs, {{1}}. Following up on your jewellery inquiry. Reply YES to continue, or visit triada-designs.com. — Triada Designs · Strada Horia Creanga 22-24, Timisoara 300254, Romania · info@triada-designs.com",
      variables: ["name"],
    }),
    seedRow({
      id: "sim-wa-order-update",
      name: "jewellery_order_update",
      category: "UTILITY",
      campaign_type: "order_update",
      body: "Warm greetings from Triada Designs. Your order {{1}} update: {{2}}. Reply STOP to opt out of marketing messages. — Triada Designs · info@triada-designs.com · triada-designs.com",
      variables: ["order_number", "status"],
    }),
    seedRow({
      id: "sim-wa-order-confirmed",
      name: "jewellery_order_confirmed",
      category: "UTILITY",
      campaign_type: "order_confirmed",
      body: "Warm greetings from Triada Designs. Your order {{1}} is confirmed. We handcraft each piece — about 7 days. Reply here with questions. — Triada Designs · Timisoara, Romania · info@triada-designs.com",
      variables: ["order_number"],
    }),
    seedRow({
      id: "sim-wa-order-in-production",
      name: "jewellery_order_in_production",
      category: "UTILITY",
      campaign_type: "order_in_production",
      body: "Warm greetings from Triada Designs. Your order {{1}} is in production. We will message you when it ships. — Triada Designs · info@triada-designs.com",
      variables: ["order_number"],
    }),
    seedRow({
      id: "sim-wa-order-shipped",
      name: "jewellery_order_shipped",
      category: "UTILITY",
      campaign_type: "order_shipped",
      body: "Warm greetings from Triada Designs. Your order {{1}} has shipped. Tracking: {{2}}. Reply here if you need help. — Triada Designs · info@triada-designs.com · triada-designs.com",
      variables: ["order_number", "tracking"],
    }),
    seedRow({
      id: "sim-wa-order-delivered",
      name: "jewellery_order_delivered",
      category: "UTILITY",
      campaign_type: "order_delivered",
      body: "Warm greetings, and thank you for choosing Triada Designs. Your order {{1}} was delivered. Enjoy your piece — reply CARE for care tips. — Triada Designs · info@triada-designs.com",
      variables: ["order_number"],
    }),
    seedRow({
      id: "sim-wa-consultation",
      name: "jewellery_consultation_invite",
      category: "MARKETING",
      campaign_type: "consultation",
      status: "PENDING",
      body: "Warm greetings from Triada Designs. We can arrange a personal jewellery consultation. Reply BOOK to request a time — a specialist will confirm. — Triada Designs · info@triada-designs.com",
    }),
    seedRow({
      id: "sim-wa-new-piece",
      name: "new_piece_preview",
      category: "MARKETING",
      campaign_type: "new_drop",
      body: "Warm greetings from Triada Designs, {{1}}. A new piece is ready to view. Open the link we share in-session, or reply INTERESTED. — Triada Designs · triada-designs.com",
      variables: ["name"],
    }),
    seedRow({
      id: "sim-wa-cart-abandonment",
      name: "cart_abandonment_remind",
      category: "MARKETING",
      campaign_type: "abandonment_cart",
      body: "Warm greetings from Triada Designs, {{1}}. Your cart still has {{2}}. Reply YES and we will help you finish — or STOP to opt out. — Triada Designs · info@triada-designs.com",
      variables: ["name", "piece"],
    }),
    seedRow({
      id: "sim-wa-sizing-abandonment",
      name: "sizing_abandonment_remind",
      category: "MARKETING",
      campaign_type: "abandonment_sizing",
      body: "Warm greetings from Triada Designs, {{1}}. Still deciding on size? Reply SIZE for our guide, or ask a specialist here. — Triada Designs · info@triada-designs.com",
      variables: ["name"],
    }),
    seedRow({
      id: "sim-wa-waitlist",
      name: "waitlist_back_in_stock",
      category: "MARKETING",
      campaign_type: "waitlist",
      body: "Warm greetings from Triada Designs, {{1}}. Your waitlisted piece ({{2}}) is available again. Reply CLAIM to continue — limited stock. — Triada Designs · info@triada-designs.com",
      variables: ["name", "piece"],
    }),
    seedRow({
      id: "sim-wa-vip-drop",
      name: "vip_drop_first_access",
      category: "MARKETING",
      campaign_type: "vip_drop",
      body: "Warm greetings from Triada Designs, {{1}}. VIP first access: a new drop is live for you. Reply VIP or open the private link we share in-session. — Triada Designs · triada-designs.com",
      variables: ["name"],
    }),
    seedRow({
      id: "sim-wa-after-sale-care",
      name: "after_sale_care_tips",
      category: "UTILITY",
      campaign_type: "after_sale_care",
      body: "Warm greetings, and thank you for choosing Triada Designs. Care tips: store dry, wipe gently after wear, avoid harsh chemicals. Reply HELP for more. — Triada Designs · info@triada-designs.com",
    }),
    seedRow({
      id: "sim-wa-after-sale-review",
      name: "after_sale_review_request",
      category: "MARKETING",
      campaign_type: "after_sale_review",
      body: "Warm greetings from Triada Designs, {{1}}. How is your piece? A short review helps others choose — reply REVIEW or visit the link we share. — Triada Designs · info@triada-designs.com",
      variables: ["name"],
    }),
    seedRow({
      id: "sim-wa-complete-set",
      name: "after_sale_complete_the_set",
      category: "MARKETING",
      campaign_type: "after_sale_complete_set",
      body: "Warm greetings from Triada Designs, {{1}}. Complete the set — pieces that pair with yours are ready. Reply SET for suggestions, or STOP to opt out. — Triada Designs · triada-designs.com",
      variables: ["name"],
    }),
    seedRow({
      id: "sim-wa-ugc-invite",
      name: "ugc_tag_invite",
      category: "MARKETING",
      campaign_type: "ugc_invite",
      body: "Warm greetings from Triada Designs, {{1}}. Love your piece? Share a photo or reel and tag us for a thank-you reward. Reply TAG for details. — Triada Designs · info@triada-designs.com",
      variables: ["name"],
    }),
  ];
}

/**
 * Seeded jewellery catalog for local_sim (automation doc + classic jewellery seeds).
 * @returns {Array<Record<string, unknown>>}
 */
export function localJewelleryWhatsAppTemplates() {
  return triadaAutomationWhatsAppTemplateCatalog();
}

async function readDiskStore() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.templates)) {
      return parsed.templates;
    }
  } catch {
    // missing / unreadable — start empty
  }
  return [];
}

/** @param {Array<Record<string, unknown>>} templates */
async function writeDiskStore(templates) {
  try {
    await mkdir(LOCAL_DIR, { recursive: true });
    await writeFile(
      LOCAL_FILE,
      JSON.stringify({ templates, updated_at: new Date().toISOString() }, null, 2),
      "utf8",
    );
  } catch {
    // serverless FS may be read-only — memory store still works for the request
  }
}

async function hydrateMemoryFromDisk() {
  if (memoryStore.size > 0) return;
  const rows = await readDiskStore();
  for (const row of rows) {
    if (row?.id) memoryStore.set(String(row.id), row);
  }
}

/** @param {Record<string, unknown>} template */
async function upsertLocalTemplate(template) {
  await hydrateMemoryFromDisk();
  memoryStore.set(String(template.id), template);
  await writeDiskStore([...memoryStore.values()]);
  return template;
}

/**
 * @returns {Promise<{
 *   mode: 'live' | 'local_sim',
 *   status: string,
 *   configured: boolean,
 *   phone_number_id_present: boolean,
 *   business_account_id_present: boolean,
 *   token_source: string,
 *   message: string,
 * }>}
 */
export async function whatsappTemplateStatus() {
  const creds = await resolveWhatsAppCloudCredentials();
  const modeHint = integrationRuntimeMode(creds.templateReady);
  const forceLocal = (process.env.INTEGRATION_MODE || "").trim().toLowerCase() === "local";
  const live = !forceLocal && creds.templateReady && modeHint === "live";

  return {
    mode: live ? "live" : "local_sim",
    status: live
      ? "live"
      : creds.templateReady
        ? "local"
        : "awaiting_credentials",
    configured: creds.templateReady,
    phone_number_id_present: Boolean(creds.phoneNumberId),
    business_account_id_present: Boolean(creds.businessAccountId),
    token_source: creds.tokenSource,
    message: live
      ? "Live WhatsApp Cloud API template path enabled (Meta Graph message_templates)."
      : "WhatsApp Cloud templates use the local jewellery catalog until META_WA_ACCESS_TOKEN (or Integrations-stored WA token) and META_WA_BUSINESS_ACCOUNT_ID are available with live mode.",
  };
}

/**
 * @returns {Promise<boolean>}
 */
async function usesLiveGraph() {
  const status = await whatsappTemplateStatus();
  return status.mode === "live";
}

/**
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function listRemoteWhatsAppTemplates() {
  if (!(await usesLiveGraph())) {
    return localJewelleryWhatsAppTemplates();
  }

  const creds = await resolveWhatsAppCloudCredentials();
  const url = new URL(graphUrl(`${creds.businessAccountId}/message_templates`));
  url.searchParams.set("fields", "id,name,status,category,language,components");
  url.searchParams.set("limit", "100");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const detail =
      errBody?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Failed to list WhatsApp templates from Meta: ${detail}`);
  }

  const payload = await response.json();
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map((row) => ({
    ...row,
    body: extractBody(row),
    source: "live",
  }));
}

/**
 * Submit a template to Meta Graph (or local sim catalog).
 * @param {Record<string, unknown>} payload
 */
export async function submitWhatsAppMessageTemplate(payload) {
  if (!(await usesLiveGraph())) {
    return {
      ok: true,
      mode: "local_sim",
      external_template_id: `sim-wa-tpl-${Date.now().toString(36)}`,
      raw: {
        ...payload,
        status: "APPROVED",
        simulated: true,
        note: "Local sim catalog — not submitted to Meta Cloud API.",
      },
    };
  }

  const creds = await resolveWhatsAppCloudCredentials();
  const response = await fetch(
    graphUrl(`${creds.businessAccountId}/message_templates`),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      mode: "live",
      external_template_id: null,
      error_code: "template_submit_failed",
      error_message:
        raw?.error?.message || `HTTP ${response.status}`,
      raw,
    };
  }

  return {
    ok: true,
    mode: "live",
    external_template_id: raw?.id ? String(raw.id) : null,
    raw,
  };
}

/**
 * Map a remote/sim row into dashboard channel_template shape.
 * @param {Record<string, unknown>} row
 * @param {string} mode
 */
function toLocalTemplate(row, mode) {
  const name = String(row.name || "untitled");
  const id =
    String(row.local_id || row.id || `wa-${slugify(name)}`) ||
    `wa-${Date.now().toString(36)}`;
  const status = mapMetaStatus(String(row.status || "PENDING"));
  return {
    id,
    platform: "whatsapp",
    name,
    slug: slugify(name),
    category: String(row.category || "marketing").toLowerCase(),
    language:
      typeof row.language === "object" && row.language
        ? String(row.language.code || "en")
        : String(row.language || "en"),
    status,
    body: extractBody(row),
    variables: Array.isArray(row.variables) ? row.variables : [],
    external_template_id: row.id ? String(row.id) : null,
    publish_mode: mode,
    metadata: {
      ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}),
      synced_from: mode,
      meta_status: row.status || null,
      vertical: "jewellery",
      components: row.components || undefined,
    },
    approved_at:
      status === "approved" || status === "published"
        ? new Date().toISOString()
        : null,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Sync remote (or local seed) templates into the dashboard store.
 */
export async function syncWhatsAppTemplates() {
  const status = await whatsappTemplateStatus();
  const mode = status.mode;
  const remote = await listRemoteWhatsAppTemplates();
  const synced = [];

  await hydrateMemoryFromDisk();
  for (const row of remote) {
    const local = toLocalTemplate(row, mode);
    await upsertLocalTemplate(local);
    synced.push(local);
  }

  return {
    ok: true,
    mode,
    synced: synced.length,
    templates: synced,
  };
}

/**
 * List templates for the Meta hub / API (status + remote + local data).
 */
export async function listWhatsAppTemplatesPayload() {
  const status = await whatsappTemplateStatus();
  let remote = [];
  try {
    remote = await listRemoteWhatsAppTemplates();
  } catch (err) {
    return {
      status: {
        ...status,
        status: "error",
        message: err instanceof Error ? err.message : "Failed to list remote templates",
      },
      remote: [],
      data: [...memoryStore.values()],
      error: err instanceof Error ? err.message : "list_failed",
    };
  }

  await hydrateMemoryFromDisk();
  let data = [...memoryStore.values()].filter((t) => t.platform === "whatsapp");
  if (data.length === 0) {
    data = remote.map((row) => toLocalTemplate(row, status.mode));
    for (const t of data) memoryStore.set(String(t.id), t);
  } else if (status.mode === "live") {
    // Refresh approval status from Meta by external id / name
    const byName = new Map(
      remote.map((r) => [String(r.name || "").toLowerCase(), r]),
    );
    data = data.map((local) => {
      const hit =
        byName.get(String(local.name || "").toLowerCase()) ||
        remote.find(
          (r) =>
            local.external_template_id &&
            String(r.id) === String(local.external_template_id),
        );
      if (!hit) return local;
      const refreshed = toLocalTemplate(
        { ...hit, local_id: local.id },
        status.mode,
      );
      memoryStore.set(String(refreshed.id), refreshed);
      return refreshed;
    });
    await writeDiskStore([...memoryStore.values()]);
  }

  return {
    status,
    remote,
    data,
  };
}

/**
 * Create locally and submit to Meta for approval (or local_sim auto-approve).
 * @param {Record<string, unknown>} input
 */
export async function createAndSubmitWhatsAppTemplate(input = {}) {
  const name = String(input.name || "jewellery_update");
  const body = String(input.body || "");
  const language = String(input.language || "en");
  const category = String(input.category || "MARKETING").toUpperCase();
  const components = Array.isArray(input.components)
    ? input.components
    : [{ type: "BODY", text: body }];

  const id = `wa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  /** @type {Record<string, unknown>} */
  let template = {
    id,
    platform: "whatsapp",
    name,
    slug: slugify(input.slug || name),
    category: category.toLowerCase(),
    language,
    status: "pending_approval",
    body,
    variables: Array.isArray(input.variables) ? input.variables : [],
    external_template_id: null,
    publish_mode: null,
    metadata: {
      vertical: "jewellery",
      components,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const submit = await submitWhatsAppMessageTemplate({
    name: templateApiName(name),
    language,
    category,
    components,
  });

  if (!submit.ok) {
    template = {
      ...template,
      status: "draft",
      last_publish_error: submit.error_message || "submit_failed",
      metadata: { ...template.metadata, submit_result: { ok: false, mode: submit.mode } },
    };
    await upsertLocalTemplate(template);
    return {
      ok: false,
      mode: submit.mode || "local_sim",
      template,
      external: {
        ok: false,
        mode: submit.mode,
        error_code: submit.error_code,
        error_message: submit.error_message,
        // strip raw Graph body that may contain sensitive debug
        raw: { error: submit.raw?.error || undefined },
      },
      error: submit.error_message || "Template submit failed",
    };
  }

  template = {
    ...template,
    status: submit.mode === "live" ? "pending_approval" : "approved",
    external_template_id: submit.external_template_id,
    publish_mode: submit.mode,
    approved_at: submit.mode === "local_sim" ? new Date().toISOString() : null,
    last_publish_error: null,
    metadata: {
      ...template.metadata,
      submit_result: {
        ok: true,
        mode: submit.mode,
        external_template_id: submit.external_template_id,
        meta_status: submit.raw?.status || (submit.mode === "live" ? "PENDING" : "APPROVED"),
      },
    },
  };
  await upsertLocalTemplate(template);

  return {
    ok: true,
    mode: submit.mode,
    template,
    external: {
      ok: true,
      mode: submit.mode,
      external_template_id: submit.external_template_id,
    },
    error: null,
  };
}

/**
 * Update a local template and re-submit to Meta (creates a new Graph template version/name as needed).
 * @param {string} templateId
 * @param {Record<string, unknown>} input
 */
export async function updateAndSubmitWhatsAppTemplate(templateId, input = {}) {
  await hydrateMemoryFromDisk();
  const existing = memoryStore.get(String(templateId));
  if (!existing) {
    // Allow update by external id or name from a fresh remote list
    const listed = await listWhatsAppTemplatesPayload();
    const hit = (listed.data || []).find(
      (t) =>
        String(t.id) === String(templateId) ||
        String(t.external_template_id) === String(templateId),
    );
    if (!hit) {
      return {
        ok: false,
        mode: "local_sim",
        template: null,
        external: null,
        error: "Template not found",
      };
    }
    memoryStore.set(String(hit.id), hit);
  }

  const current = memoryStore.get(String(templateId)) || existing;
  const name = String(input.name || current.name || "jewellery_update");
  const body = String(input.body ?? current.body ?? "");
  const language = String(input.language || current.language || "en");
  const category = String(
    input.category || current.category || "MARKETING",
  ).toUpperCase();
  const components = Array.isArray(input.components)
    ? input.components
    : [{ type: "BODY", text: body }];

  let template = {
    ...current,
    name,
    body,
    language,
    category: category.toLowerCase(),
    status: "pending_approval",
    variables: Array.isArray(input.variables)
      ? input.variables
      : current.variables || [],
    metadata: {
      ...(current.metadata && typeof current.metadata === "object"
        ? current.metadata
        : {}),
      components,
      updated_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  };

  const submit = await submitWhatsAppMessageTemplate({
    name: templateApiName(name),
    language,
    category,
    components,
  });

  if (!submit.ok) {
    template = {
      ...template,
      status: "draft",
      last_publish_error: submit.error_message || "submit_failed",
    };
    await upsertLocalTemplate(template);
    return {
      ok: false,
      mode: submit.mode || "local_sim",
      template,
      external: {
        ok: false,
        mode: submit.mode,
        error_code: submit.error_code,
        error_message: submit.error_message,
        raw: { error: submit.raw?.error || undefined },
      },
      error: submit.error_message || "Template update submit failed",
    };
  }

  template = {
    ...template,
    status: submit.mode === "live" ? "pending_approval" : "approved",
    external_template_id:
      submit.external_template_id || current.external_template_id || null,
    publish_mode: submit.mode,
    approved_at: submit.mode === "local_sim" ? new Date().toISOString() : null,
    last_publish_error: null,
    metadata: {
      ...template.metadata,
      submit_result: {
        ok: true,
        mode: submit.mode,
        external_template_id: submit.external_template_id,
      },
    },
  };
  await upsertLocalTemplate(template);

  return {
    ok: true,
    mode: submit.mode,
    template,
    external: {
      ok: true,
      mode: submit.mode,
      external_template_id: submit.external_template_id,
    },
    error: null,
  };
}

/**
 * Seed automation-doc WhatsApp templates into the editable dashboard store.
 * Optionally submit each to Meta for approval (live Graph or local_sim auto-approve).
 * Skips names that already exist unless `force` is true.
 * @param {{
 *   submit?: boolean,
 *   force?: boolean,
 *   campaign_types?: string[],
 * }} [opts]
 */
export async function seedWhatsAppAutomationTemplates(opts = {}) {
  const submit = opts.submit !== false;
  const force = opts.force === true;
  const filterTypes = Array.isArray(opts.campaign_types)
    ? new Set(opts.campaign_types.map(String))
    : null;

  const catalog = triadaAutomationWhatsAppTemplateCatalog().filter((row) => {
    if (!filterTypes) return true;
    const ct = row.metadata?.campaign_type
      ? String(row.metadata.campaign_type)
      : "";
    return filterTypes.has(ct) || filterTypes.has(String(row.name));
  });

  const status = await whatsappTemplateStatus();
  await hydrateMemoryFromDisk();

  const existingByName = new Map(
    [...memoryStore.values()]
      .filter((t) => t.platform === "whatsapp" || !t.platform)
      .map((t) => [String(t.name || "").toLowerCase(), t]),
  );

  const seeded = [];
  const skipped = [];
  const submitted = [];
  const failed = [];

  for (const row of catalog) {
    const nameKey = String(row.name || "").toLowerCase();
    const existing = existingByName.get(nameKey);
    if (existing && !force) {
      skipped.push({
        name: row.name,
        id: existing.id,
        status: existing.status,
        reason: "already_present",
      });
      continue;
    }

    const local = toLocalTemplate(
      {
        ...row,
        local_id: existing?.id || row.id,
        status: submit ? "PENDING" : "DISABLED",
      },
      status.mode,
    );
    // Editable draft in dashboard before / unless Meta submit.
    let template = {
      ...local,
      status: submit ? "pending_approval" : "draft",
      publish_mode: null,
      metadata: {
        ...local.metadata,
        campaign_type: row.metadata?.campaign_type,
        from_automation_doc: true,
        editable: true,
      },
    };

    if (!submit) {
      await upsertLocalTemplate(template);
      existingByName.set(nameKey, template);
      seeded.push(template);
      continue;
    }

    const payload = {
      name: String(row.name),
      body: String(row.body || ""),
      language: String(row.language || "en"),
      category: String(row.category || "MARKETING"),
      variables: Array.isArray(row.variables) ? row.variables : [],
      components: Array.isArray(row.components) ? row.components : undefined,
    };

    const result = existing
      ? await updateAndSubmitWhatsAppTemplate(String(existing.id), payload)
      : await createAndSubmitWhatsAppTemplate(payload);

    // Keep campaign metadata on the stored row.
    if (result.template) {
      template = {
        ...result.template,
        metadata: {
          ...(result.template.metadata && typeof result.template.metadata === "object"
            ? result.template.metadata
            : {}),
          campaign_type: row.metadata?.campaign_type,
          from_automation_doc: true,
          editable: true,
          seed_submit: {
            ok: result.ok,
            mode: result.mode,
          },
        },
      };
      await upsertLocalTemplate(template);
      existingByName.set(nameKey, template);
      seeded.push(template);
      if (result.ok) {
        submitted.push({
          name: template.name,
          id: template.id,
          status: template.status,
          mode: result.mode,
          external_template_id: template.external_template_id,
        });
      } else {
        failed.push({
          name: row.name,
          error: result.error || "submit_failed",
          mode: result.mode,
        });
      }
    } else {
      failed.push({
        name: row.name,
        error: result.error || "submit_failed",
        mode: result.mode,
      });
    }
  }

  return {
    ok: failed.length === 0,
    mode: status.mode,
    catalog_size: catalog.length,
    seeded: seeded.length,
    skipped: skipped.length,
    submitted: submitted.length,
    failed: failed.length,
    templates: seeded,
    skipped_detail: skipped,
    submitted_detail: submitted,
    failed_detail: failed,
    message: submit
      ? `Seeded ${seeded.length} automation templates; submitted ${submitted.length} to Meta (${status.mode}).`
      : `Seeded ${seeded.length} automation templates as editable drafts (not submitted).`,
  };
}

/**
 * Send a template message via Cloud API (or local sim).
 * @param {{ to: string, template_name: string, language?: string, components?: unknown[] }} input
 */
export async function sendWhatsAppTemplateMessage(input) {
  const creds = await resolveWhatsAppCloudCredentials();
  const forceLocal =
    (process.env.INTEGRATION_MODE || "").trim().toLowerCase() === "local";
  const live =
    !forceLocal &&
    creds.sendReady &&
    integrationRuntimeMode(creds.sendReady) === "live";

  if (!live) {
    return {
      ok: true,
      mode: "local",
      provider_message_id: `local-wa-${Date.now().toString(36)}`,
      error: null,
      raw: {
        to: input.to,
        simulated: true,
        template: input.template_name,
      },
    };
  }

  const template = {
    name: input.template_name,
    language: { code: input.language || "en" },
  };
  if (Array.isArray(input.components) && input.components.length) {
    template.components = input.components;
  }

  const response = await fetch(
    graphUrl(`${creds.phoneNumberId}/messages`),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.to,
        type: "template",
        template,
      }),
      cache: "no-store",
    },
  );

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      mode: "live",
      provider_message_id: null,
      error: raw?.error?.message || `HTTP ${response.status}`,
      raw: { error: raw?.error || undefined },
    };
  }

  const messages = Array.isArray(raw?.messages) ? raw.messages : [];
  return {
    ok: true,
    mode: "live",
    provider_message_id: messages[0]?.id ? String(messages[0].id) : null,
    error: null,
    raw: { messages },
  };
}
