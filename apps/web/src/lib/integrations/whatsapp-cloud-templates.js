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

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH_BASE = (
  process.env.META_GRAPH_BASE || "https://graph.facebook.com"
).replace(/\/$/, "");
const LOCAL_DIR = path.join(process.cwd(), ".triada-local");
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
 * Seeded jewellery catalog for local_sim (mirrors Laravel MetaGraphClient).
 * @returns {Array<Record<string, unknown>>}
 */
export function localJewelleryWhatsAppTemplates() {
  return [
    {
      id: "sim-wa-jewellery-follow-up",
      name: "jewellery_follow_up",
      status: "APPROVED",
      category: "MARKETING",
      language: "en",
      body: "Hi {{1}}, following up on your Triada Designs jewellery inquiry. Reply YES to continue, or visit triada-designs.com.",
      variables: ["name"],
      components: [
        {
          type: "BODY",
          text: "Hi {{1}}, following up on your Triada Designs jewellery inquiry. Reply YES to continue, or visit triada-designs.com.",
        },
      ],
      source: "seeded",
      metadata: { vertical: "jewellery" },
    },
    {
      id: "sim-wa-order-update",
      name: "jewellery_order_update",
      status: "APPROVED",
      category: "UTILITY",
      language: "en",
      body: "Your Triada Designs order {{1}} update: {{2}}. Reply STOP to opt out of marketing messages.",
      variables: ["order_number", "status"],
      components: [
        {
          type: "BODY",
          text: "Your Triada Designs order {{1}} update: {{2}}. Reply STOP to opt out of marketing messages.",
        },
      ],
      source: "seeded",
      metadata: { vertical: "jewellery" },
    },
    {
      id: "sim-wa-consultation",
      name: "jewellery_consultation_invite",
      status: "PENDING",
      category: "MARKETING",
      language: "en",
      body: "Triada Designs can arrange a personal jewellery consultation. Reply BOOK to request a time — a specialist will confirm.",
      components: [
        {
          type: "BODY",
          text: "Triada Designs can arrange a personal jewellery consultation. Reply BOOK to request a time — a specialist will confirm.",
        },
      ],
      source: "seeded",
      metadata: { vertical: "jewellery" },
    },
    {
      id: "sim-wa-new-piece",
      name: "new_piece_preview",
      status: "APPROVED",
      category: "MARKETING",
      language: "en",
      body: "{{1}}, a new Triada Designs piece is ready to view. Open the link we share in-session, or reply INTERESTED.",
      variables: ["name"],
      components: [
        {
          type: "BODY",
          text: "{{1}}, a new Triada Designs piece is ready to view. Open the link we share in-session, or reply INTERESTED.",
        },
      ],
      source: "seeded",
      metadata: { vertical: "jewellery" },
    },
  ];
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

  const id = `wa-${Date.now().toString(36)}`;
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
