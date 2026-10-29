/**
 * Mutable dual-run conversation / DM store for Unified inbox.
 * AI Support owns Meta Page Messaging (Instagram / Messenger / Facebook) with Graph send,
 * plus Telegram / webchat / email / TikTok / LinkedIn inbound auto-reply.
 * Social Media Manager may still sweep Meta + LinkedIn backlog DMs.
 */

import { getLocalDataDir } from "@/lib/local-data-dir";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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
 *   updated_at: string,
 *   messages?: Array<{ id: string, direction: "inbound"|"outbound", body: string, at: string, agent_key?: string|null, provider_message_id?: string|null }>,
 * }} ConversationRecord
 */

function nowIso() {
  return new Date().toISOString();
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
      updated_at: at,
      messages: [],
    },
  ];
}

/**
 * @returns {Promise<ConversationRecord[]>}
 */
async function readAll() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.data) && parsed.data.length) {
      return parsed.data;
    }
  } catch {
    /* seed */
  }
  const seeded = seedConversations();
  await writeAll(seeded);
  return seeded;
}

/**
 * @param {ConversationRecord[]} rows
 */
async function writeAll(rows) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(
    LOCAL_FILE,
    JSON.stringify({ data: rows, updated_at: nowIso() }, null, 2),
    "utf8",
  );
}

/**
 * @returns {Promise<ConversationRecord[]>}
 */
export async function listConversations() {
  return readAll();
}

/**
 * @param {string} id
 */
export async function getConversation(id) {
  const rows = await readAll();
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
      // Unanswered when inbound is newer than outbound, or flagged.
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
  const rows = await readAll();
  const idx = rows.findIndex((c) => c.id === String(id));
  if (idx < 0) return null;
  rows[idx] = {
    ...rows[idx],
    ...patch,
    updated_at: nowIso(),
  };
  await writeAll(rows);
  return rows[idx];
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
  const rows = await readAll();
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
  const rows = await readAll();
  const idx = rows.findIndex((c) => c.id === String(id));
  if (idx < 0) return null;
  const at = nowIso();
  const body = String(input.body || "").trim();
  const messages = Array.isArray(rows[idx].messages) ? [...rows[idx].messages] : [];
  messages.push({
    id: `msg-out-${Date.now().toString(36)}`,
    direction: "outbound",
    body,
    at,
    agent_key: input.agent_key || "social_media_manager",
    provider_message_id: input.provider_message_id || null,
  });
  const providerIds = Array.isArray(rows[idx].provider_message_ids)
    ? [...rows[idx].provider_message_ids]
    : [];
  if (input.provider_message_id) {
    providerIds.push(String(input.provider_message_id));
  }
  rows[idx] = {
    ...rows[idx],
    messages,
    provider_message_ids: providerIds.slice(-100),
    last_outbound_at: at,
    last_outbound_body: body,
    unanswered: false,
    assigned_agent_key: input.agent_key || rows[idx].assigned_agent_key || "social_media_manager",
    metadata: {
      ...(rows[idx].metadata || {}),
      last_send_mode: input.send_mode || null,
      last_send_ok: input.send_ok !== false,
      last_send_error: input.send_error || null,
    },
    updated_at: at,
  };
  await writeAll(rows);
  return rows[idx];
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
  const rows = await readAll();
  const externalConversationId = String(
    input.external_conversation_id || "",
  ).trim();
  const externalUserId = String(input.external_user_id || "").trim();

  let existingIdx = -1;
  if (input.conversation_id) {
    existingIdx = rows.findIndex((c) => c.id === String(input.conversation_id));
  }
  if (existingIdx < 0 && externalConversationId) {
    existingIdx = rows.findIndex(
      (c) =>
        String(c.channel || "").toLowerCase() === channel &&
        String(c.external_conversation_id || "") === externalConversationId,
    );
  }
  if (existingIdx < 0 && externalUserId) {
    existingIdx = rows.findIndex(
      (c) =>
        String(c.channel || "").toLowerCase() === channel &&
        String(c.external_user_id || "") === externalUserId &&
        c.status === "open",
    );
  }

  const id =
    (existingIdx >= 0 ? rows[existingIdx].id : "") ||
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

  if (existingIdx >= 0) {
    const providerIds = Array.isArray(rows[existingIdx].provider_message_ids)
      ? [...rows[existingIdx].provider_message_ids]
      : [];
    if (providerMessageId && providerIds.includes(providerMessageId)) {
      return rows[existingIdx];
    }
    if (providerMessageId) providerIds.push(providerMessageId);

    const messages = Array.isArray(rows[existingIdx].messages)
      ? [...rows[existingIdx].messages]
      : [];
    messages.push({
      id: `msg-in-${Date.now().toString(36)}`,
      direction: "inbound",
      body,
      at,
      provider_message_id: providerMessageId,
    });
    rows[existingIdx] = {
      ...rows[existingIdx],
      messages,
      provider_message_ids: providerIds.slice(-100),
      external_user_id:
        externalUserId || rows[existingIdx].external_user_id || null,
      external_conversation_id:
        externalConversationId ||
        rows[existingIdx].external_conversation_id ||
        null,
      page_or_account_id:
        input.page_or_account_id ||
        rows[existingIdx].page_or_account_id ||
        null,
      metadata: {
        ...(rows[existingIdx].metadata || {}),
        ...(input.metadata || {}),
      },
      last_inbound_at: at,
      last_inbound_body: body,
      unanswered: true,
      status: "open",
      automation_mode: rows[existingIdx].automation_mode || "ai",
      assigned_agent_key: agentKey,
      updated_at: at,
    };
    await writeAll(rows);
    return rows[existingIdx];
  }

  /** @type {ConversationRecord} */
  const row = {
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
    metadata: { ...(input.metadata || {}) },
    last_inbound_at: at,
    last_inbound_body: body,
    last_outbound_at: null,
    last_outbound_body: null,
    unanswered: true,
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
  };
  rows.unshift(row);
  await writeAll(rows.slice(0, 200));
  return row;
}
