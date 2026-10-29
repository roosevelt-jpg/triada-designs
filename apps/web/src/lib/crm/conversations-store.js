/**
 * Mutable dual-run conversation / DM store for Unified inbox.
 * Supabase `crm_conversations` when keyed (durable across Vercel instances);
 * else local mock file under getLocalDataDir().
 *
 * AI Support owns Meta Page Messaging (Instagram / Messenger / Facebook) with Graph send,
 * WhatsApp Cloud session text, plus Telegram / webchat / email / TikTok / LinkedIn inbound.
 * Social Media Manager may still sweep Meta + LinkedIn backlog DMs.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { getLocalDataDir } from "@/lib/local-data-dir";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TABLE = "crm_conversations";
const WORKSPACE_ID = "triada-ops";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "conversations.json");

/** Meta Page Messaging channels answered live by AI Support (+ Graph Send API). */
export const SUPPORT_PAGE_MESSAGING_CHANNELS = [
  "instagram",
  "messenger",
  "facebook",
];

/**
 * Non-Meta messaging channels answered by AI Support (+ channel send adapter).
 * Webchat returns the reply to the widget; email/Telegram/LinkedIn/TikTok use providers.
 */
export const SUPPORT_TEXT_CHANNELS = [
  "telegram",
  "webchat",
  "email",
  "tiktok",
  "linkedin",
];

/** Channels Social Media Manager may still sweep (LinkedIn + Meta backlog). */
export const SOCIAL_DM_CHANNELS = [
  "instagram",
  "messenger",
  "facebook",
  "linkedin",
];

/**
 * @typedef {{
 *   id: string,
 *   workspace_id: string,
 *   channel: string,
 *   status: "open" | "closed",
 *   automation_mode: "ai" | "human",
 *   subject: string,
 *   contact_id?: string | null,
 *   assigned_agent_key?: string | null,
 *   external_user_id?: string | null,
 *   external_conversation_id?: string | null,
 *   page_or_account_id?: string | null,
 *   provider_message_ids?: string[],
 *   metadata?: Record<string, unknown>,
 *   last_inbound_at?: string | null,
 *   last_outbound_at?: string | null,
 *   last_inbound_body?: string | null,
 *   last_outbound_body?: string | null,
 *   unanswered?: boolean,
 *   created_at?: string,
 *   updated_at: string,
 *   messages?: Array<{ id: string, direction: "inbound"|"outbound", body: string, at: string, agent_key?: string|null, provider_message_id?: string|null }>,
 * }} ConversationRecord
 */

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {Record<string, unknown>} row
 * @returns {ConversationRecord}
 */
function shapeRecord(row = {}) {
  const messages = Array.isArray(row.messages) ? row.messages : [];
  const providerIds = Array.isArray(row.provider_message_ids)
    ? row.provider_message_ids.map(String)
    : [];
  return {
    id: String(row.id || ""),
    workspace_id: String(row.workspace_id || WORKSPACE_ID),
    channel: String(row.channel || ""),
    status: row.status === "closed" ? "closed" : "open",
    automation_mode: row.automation_mode === "human" ? "human" : "ai",
    subject: String(row.subject || ""),
    contact_id: row.contact_id ? String(row.contact_id) : null,
    assigned_agent_key: row.assigned_agent_key
      ? String(row.assigned_agent_key)
      : null,
    external_user_id: row.external_user_id
      ? String(row.external_user_id)
      : null,
    external_conversation_id: row.external_conversation_id
      ? String(row.external_conversation_id)
      : null,
    page_or_account_id: row.page_or_account_id
      ? String(row.page_or_account_id)
      : null,
    provider_message_ids: providerIds,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? /** @type {Record<string, unknown>} */ (row.metadata)
        : {},
    last_inbound_at: row.last_inbound_at ? String(row.last_inbound_at) : null,
    last_outbound_at: row.last_outbound_at
      ? String(row.last_outbound_at)
      : null,
    last_inbound_body:
      row.last_inbound_body != null ? String(row.last_inbound_body) : null,
    last_outbound_body:
      row.last_outbound_body != null ? String(row.last_outbound_body) : null,
    unanswered: Boolean(row.unanswered),
    created_at: String(row.created_at || row.updated_at || nowIso()),
    updated_at: String(row.updated_at || nowIso()),
    messages: messages.map((m) => ({
      id: String(m.id || ""),
      direction: m.direction === "outbound" ? "outbound" : "inbound",
      body: String(m.body || ""),
      at: String(m.at || m.created_at || nowIso()),
      agent_key: m.agent_key ? String(m.agent_key) : null,
      provider_message_id: m.provider_message_id
        ? String(m.provider_message_id)
        : null,
    })),
  };
}

/**
 * @param {ConversationRecord} row
 */
function toDbRow(row) {
  return {
    id: row.id,
    workspace_id: row.workspace_id || WORKSPACE_ID,
    channel: row.channel,
    status: row.status || "open",
    automation_mode: row.automation_mode || "ai",
    subject: row.subject || "",
    contact_id: row.contact_id || null,
    assigned_agent_key: row.assigned_agent_key || null,
    external_user_id: row.external_user_id || null,
    external_conversation_id: row.external_conversation_id || null,
    page_or_account_id: row.page_or_account_id || null,
    provider_message_ids: row.provider_message_ids || [],
    metadata: row.metadata || {},
    last_inbound_at: row.last_inbound_at || null,
    last_outbound_at: row.last_outbound_at || null,
    last_inbound_body: row.last_inbound_body || null,
    last_outbound_body: row.last_outbound_body || null,
    unanswered: Boolean(row.unanswered),
    messages: row.messages || [],
    created_at: row.created_at || row.updated_at || nowIso(),
    updated_at: row.updated_at || nowIso(),
  };
}

function seedConversations() {
  const at = nowIso();
  return [
    {
      id: "conv-ig-priest",
      workspace_id: WORKSPACE_ID,
      channel: "instagram",
      status: "open",
      automation_mode: "ai",
      subject: "Priest Ring size",
      contact_id: "contact-1",
      assigned_agent_key: "social_media_manager",
      last_inbound_at: at,
      last_inbound_body: "Hi — do you have the Priest Ring in size 54?",
      last_outbound_at: null,
      last_outbound_body: null,
      unanswered: true,
      created_at: at,
      updated_at: at,
      messages: [
        {
          id: "msg-ig-1",
          direction: "inbound",
          body: "Hi — do you have the Priest Ring in size 54?",
          at,
        },
      ],
    },
    {
      id: "conv-messenger-gift",
      workspace_id: WORKSPACE_ID,
      channel: "messenger",
      status: "open",
      automation_mode: "ai",
      subject: "Gift for anniversary",
      contact_id: "contact-3",
      assigned_agent_key: "social_media_manager",
      last_inbound_at: at,
      last_inbound_body: "Looking for an anniversary gift — something quiet and elegant.",
      last_outbound_at: null,
      unanswered: true,
      created_at: at,
      updated_at: at,
      messages: [
        {
          id: "msg-ms-1",
          direction: "inbound",
          body: "Looking for an anniversary gift — something quiet and elegant.",
          at,
        },
      ],
    },
    {
      id: "conv-fb-care",
      workspace_id: WORKSPACE_ID,
      channel: "facebook",
      status: "open",
      automation_mode: "ai",
      subject: "Gold plating care",
      contact_id: "contact-4",
      assigned_agent_key: "social_media_manager",
      last_inbound_at: at,
      last_inbound_body: "How should I care for gold-plated silver pieces?",
      last_outbound_at: null,
      unanswered: true,
      created_at: at,
      updated_at: at,
      messages: [
        {
          id: "msg-fb-1",
          direction: "inbound",
          body: "How should I care for gold-plated silver pieces?",
          at,
        },
      ],
    },
    {
      id: "conv-li-boutique",
      workspace_id: WORKSPACE_ID,
      channel: "linkedin",
      status: "open",
      automation_mode: "ai",
      subject: "Boutique wholesale intro",
      contact_id: "contact-5",
      assigned_agent_key: "social_media_manager",
      last_inbound_at: at,
      last_inbound_body: "We run a boutique in Dubai — interested in stocking Salt & Spirit.",
      last_outbound_at: null,
      unanswered: true,
      created_at: at,
      updated_at: at,
      messages: [
        {
          id: "msg-li-1",
          direction: "inbound",
          body: "We run a boutique in Dubai — interested in stocking Salt & Spirit.",
          at,
        },
      ],
    },
    {
      id: "conv-wa-engraving",
      workspace_id: WORKSPACE_ID,
      channel: "whatsapp",
      status: "open",
      automation_mode: "human",
      subject: "Custom engraving quote",
      contact_id: "contact-2",
      assigned_agent_key: "escalation_officer",
      last_inbound_at: at,
      last_inbound_body: "Can you quote a custom engraving?",
      last_outbound_at: null,
      unanswered: true,
      created_at: at,
      updated_at: at,
      messages: [],
    },
  ].map((row) => shapeRecord(row));
}

/** @returns {Promise<ConversationRecord[]>} */
async function readLocal() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.data) && parsed.data.length) {
      return parsed.data.map((row) => shapeRecord(row));
    }
  } catch {
    /* seed */
  }
  const seeded = seedConversations();
  await writeLocal(seeded);
  return seeded;
}

/** @param {ConversationRecord[]} rows */
async function writeLocal(rows) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(
    LOCAL_FILE,
    JSON.stringify({ data: rows, updated_at: nowIso() }, null, 2),
    "utf8",
  );
}

/**
 * @returns {Promise<{ mode: 'supabase' | 'local_mock', data: ConversationRecord[] }>}
 */
async function readAllDetailed() {
  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("workspace_id", WORKSPACE_ID)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (!error && Array.isArray(data)) {
        return {
          mode: "supabase",
          data: data.map((row) => shapeRecord(row)),
        };
      }
      // Table missing / PostgREST error → fall through to local
    }
  }
  return { mode: "local_mock", data: await readLocal() };
}

/** @returns {Promise<ConversationRecord[]>} */
async function readAll() {
  const { data } = await readAllDetailed();
  return data;
}

/**
 * Persist one conversation (Supabase upsert or local rewrite).
 * @param {ConversationRecord} row
 * @returns {Promise<{ mode: string, row: ConversationRecord }>}
 */
async function persistOne(row) {
  const shaped = shapeRecord({ ...row, updated_at: row.updated_at || nowIso() });

  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from(TABLE)
        .upsert(toDbRow(shaped), { onConflict: "id" })
        .select("*")
        .maybeSingle();
      if (!error && data) {
        return { mode: "supabase", row: shapeRecord(data) };
      }
      // Fall through if table missing
    }
  }

  const rows = await readLocal();
  const idx = rows.findIndex((c) => c.id === shaped.id);
  if (idx >= 0) {
    rows[idx] = shaped;
  } else {
    rows.unshift(shaped);
  }
  await writeLocal(rows.slice(0, 200));
  return { mode: "local_mock", row: shaped };
}

/**
 * @param {{ channel?: string }} [opts]
 * @returns {Promise<ConversationRecord[]>}
 */
export async function listConversations(opts = {}) {
  const { data } = await readAllDetailed();
  const channel = String(opts.channel || "")
    .trim()
    .toLowerCase();
  if (!channel) return data;
  return data.filter(
    (c) => String(c.channel || "").toLowerCase() === channel,
  );
}

/**
 * Storage mode for the active conversations backend.
 * @returns {Promise<'supabase' | 'local_mock'>}
 */
export async function conversationsStorageMode() {
  const { mode } = await readAllDetailed();
  return mode;
}

/**
 * @param {string} id
 */
export async function getConversation(id) {
  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("workspace_id", WORKSPACE_ID)
        .eq("id", String(id))
        .maybeSingle();
      if (!error) {
        return data ? shapeRecord(data) : null;
      }
      // Table missing / PostgREST error → fall through to local
    }
  }
  const rows = await readLocal();
  return rows.find((c) => c.id === String(id)) || null;
}

/**
 * Unanswered social DMs owned by Social Media Manager.
 * @param {{ channels?: string[] }} [opts]
 */
export async function listUnansweredSocialDms(opts = {}) {
  const channels = (opts.channels || SOCIAL_DM_CHANNELS).map((c) =>
    String(c).toLowerCase(),
  );
  const rows = await readAll();
  return rows.filter((c) => {
    if (c.status !== "open") return false;
    if (c.automation_mode !== "ai") return false;
    if (!channels.includes(String(c.channel || "").toLowerCase())) return false;
    if (c.last_outbound_at && c.last_inbound_at) {
      return (
        Boolean(c.unanswered) ||
        new Date(c.last_inbound_at).getTime() >
          new Date(c.last_outbound_at).getTime()
      );
    }
    return Boolean(c.unanswered) || Boolean(c.last_inbound_at);
  });
}

/**
 * @param {string} id
 * @param {Partial<ConversationRecord>} patch
 */
export async function patchConversation(id, patch) {
  const existing = await getConversation(id);
  if (!existing) return null;
  const next = shapeRecord({
    ...existing,
    ...patch,
    id: existing.id,
    updated_at: nowIso(),
  });
  const saved = await persistOne(next);
  return saved.row;
}

/**
 * Find an open conversation by Meta external ids.
 * @param {{
 *   channel: string,
 *   external_conversation_id?: string,
 *   external_user_id?: string,
 * }} input
 */
export async function findConversationByExternal(input) {
  const channel = String(input.channel || "").toLowerCase();
  const extConv = String(input.external_conversation_id || "").trim();
  const extUser = String(input.external_user_id || "").trim();

  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      if (extConv) {
        const { data, error } = await supabase
          .from(TABLE)
          .select("*")
          .eq("workspace_id", WORKSPACE_ID)
          .eq("channel", channel)
          .eq("external_conversation_id", extConv)
          .limit(1)
          .maybeSingle();
        if (!error && data) return shapeRecord(data);
      }
      if (extUser) {
        const { data, error } = await supabase
          .from(TABLE)
          .select("*")
          .eq("workspace_id", WORKSPACE_ID)
          .eq("channel", channel)
          .eq("external_user_id", extUser)
          .eq("status", "open")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!error && data) return shapeRecord(data);
      }
      if (!extConv && !extUser) return null;
      // If supabase queries ran cleanly with no row, still check local
      // only when supabase path failed (table missing). Clean miss → null below.
      const probe = await supabase
        .from(TABLE)
        .select("id")
        .eq("workspace_id", WORKSPACE_ID)
        .limit(1);
      if (!probe.error) {
        return null;
      }
    }
  }

  const rows = await readLocal();
  if (extConv) {
    const byConv = rows.find(
      (c) =>
        String(c.channel || "").toLowerCase() === channel &&
        String(c.external_conversation_id || "") === extConv,
    );
    if (byConv) return byConv;
  }
  if (extUser) {
    return (
      rows.find(
        (c) =>
          String(c.channel || "").toLowerCase() === channel &&
          String(c.external_user_id || "") === extUser &&
          c.status === "open",
      ) || null
    );
  }
  return null;
}

/**
 * Append an outbound AI reply and clear unanswered.
 * @param {string} id
 * @param {{
 *   body: string,
 *   agent_key?: string,
 *   provider_message_id?: string | null,
 *   send_mode?: string | null,
 *   send_ok?: boolean,
 *   send_error?: string | null,
 * }} input
 */
export async function appendOutboundReply(id, input) {
  const existing = await getConversation(id);
  if (!existing) return null;
  const at = nowIso();
  const body = String(input.body || "").trim();
  const messages = Array.isArray(existing.messages) ? [...existing.messages] : [];
  messages.push({
    id: `msg-out-${Date.now().toString(36)}`,
    direction: "outbound",
    body,
    at,
    agent_key: input.agent_key || "social_media_manager",
    provider_message_id: input.provider_message_id || null,
  });
  const providerIds = Array.isArray(existing.provider_message_ids)
    ? [...existing.provider_message_ids]
    : [];
  if (input.provider_message_id) {
    providerIds.push(String(input.provider_message_id));
  }
  const next = shapeRecord({
    ...existing,
    messages,
    provider_message_ids: providerIds.slice(-100),
    last_outbound_at: at,
    last_outbound_body: body,
    unanswered: false,
    assigned_agent_key:
      input.agent_key || existing.assigned_agent_key || "social_media_manager",
    metadata: {
      ...(existing.metadata || {}),
      last_send_mode: input.send_mode || null,
      last_send_ok: input.send_ok !== false,
      last_send_error: input.send_error || null,
    },
    updated_at: at,
  });
  const saved = await persistOne(next);
  return saved.row;
}

/**
 * Record a new inbound DM (Meta / LinkedIn / simulators).
 * @param {{
 *   channel: string,
 *   body: string,
 *   subject?: string,
 *   contact_id?: string,
 *   conversation_id?: string,
 *   external_user_id?: string,
 *   external_conversation_id?: string,
 *   provider_message_id?: string,
 *   contact_name?: string | null,
 *   page_or_account_id?: string,
 *   agent_key?: string,
 *   metadata?: Record<string, unknown>,
 * }} input
 */
export async function ingestInboundDm(input) {
  const channel = String(input.channel || "instagram").toLowerCase();
  const body = String(input.body || "").trim() || "(empty message)";
  const at = nowIso();
  const externalConversationId = String(
    input.external_conversation_id || "",
  ).trim();
  const externalUserId = String(input.external_user_id || "").trim();

  let existing = null;
  if (input.conversation_id) {
    existing = await getConversation(String(input.conversation_id));
  }
  if (!existing && (externalConversationId || externalUserId)) {
    existing = await findConversationByExternal({
      channel,
      external_conversation_id: externalConversationId,
      external_user_id: externalUserId,
    });
  }

  const id =
    (existing?.id || "") ||
    String(input.conversation_id || "").trim() ||
    (externalConversationId
      ? `conv-${channel}-${externalConversationId.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 48)}`
      : `conv-${channel}-${Date.now().toString(36)}`);

  const overrideAgent =
    typeof input.agent_key === "string" && input.agent_key.trim()
      ? String(input.agent_key).trim()
      : null;
  const agentKey = overrideAgent
    ? overrideAgent
    : SUPPORT_PAGE_MESSAGING_CHANNELS.includes(channel) ||
        SUPPORT_TEXT_CHANNELS.includes(channel)
      ? "ai_support"
      : SOCIAL_DM_CHANNELS.includes(channel)
        ? "social_media_manager"
        : "ai_support";
  const providerMessageId = input.provider_message_id
    ? String(input.provider_message_id)
    : null;

  const contactName =
    typeof input.contact_name === "string" && input.contact_name.trim()
      ? input.contact_name.trim()
      : null;

  if (existing) {
    const providerIds = Array.isArray(existing.provider_message_ids)
      ? [...existing.provider_message_ids]
      : [];
    if (providerMessageId && providerIds.includes(providerMessageId)) {
      return existing;
    }
    if (providerMessageId) providerIds.push(providerMessageId);

    const messages = Array.isArray(existing.messages)
      ? [...existing.messages]
      : [];
    messages.push({
      id: `msg-in-${Date.now().toString(36)}`,
      direction: "inbound",
      body,
      at,
      provider_message_id: providerMessageId,
    });

    const next = shapeRecord({
      ...existing,
      messages,
      provider_message_ids: providerIds.slice(-100),
      contact_id: input.contact_id || existing.contact_id || null,
      external_user_id: externalUserId || existing.external_user_id || null,
      external_conversation_id:
        externalConversationId || existing.external_conversation_id || null,
      page_or_account_id:
        input.page_or_account_id || existing.page_or_account_id || null,
      metadata: {
        ...(existing.metadata || {}),
        ...(input.metadata || {}),
        ...(contactName ? { contact_name: contactName } : {}),
      },
      last_inbound_at: at,
      last_inbound_body: body,
      unanswered: true,
      status: "open",
      automation_mode: existing.automation_mode || "ai",
      assigned_agent_key: agentKey,
      updated_at: at,
    });
    const saved = await persistOne(next);
    return saved.row;
  }

  /** @type {ConversationRecord} */
  const row = shapeRecord({
    id,
    workspace_id: WORKSPACE_ID,
    channel,
    status: "open",
    automation_mode: "ai",
    subject: String(input.subject || body).slice(0, 80),
    contact_id: input.contact_id || null,
    assigned_agent_key: agentKey,
    external_user_id: externalUserId || null,
    external_conversation_id: externalConversationId || null,
    page_or_account_id: input.page_or_account_id || null,
    provider_message_ids: providerMessageId ? [providerMessageId] : [],
    metadata: {
      ...(input.metadata || {}),
      ...(contactName ? { contact_name: contactName } : {}),
    },
    last_inbound_at: at,
    last_inbound_body: body,
    last_outbound_at: null,
    last_outbound_body: null,
    unanswered: true,
    created_at: at,
    updated_at: at,
    messages: [
      {
        id: `msg-in-${Date.now().toString(36)}`,
        direction: "inbound",
        body,
        at,
        provider_message_id: providerMessageId,
      },
    ],
  });
  const saved = await persistOne(row);
  return saved.row;
}
