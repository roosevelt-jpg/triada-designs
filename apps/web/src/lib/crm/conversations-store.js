/**
 * Mutable dual-run conversation / DM store for Unified inbox.
 * Social Media Manager sweeps unanswered DMs on IG / Messenger / FB / LinkedIn.
 */

import { getLocalDataDir } from "@/lib/local-data-dir";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const WORKSPACE_ID = "triada-ops";
const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "conversations.json");

/** Channels owned by Social Media Manager DMs. */
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
 *   last_inbound_at?: string | null,
 *   last_outbound_at?: string | null,
 *   last_inbound_body?: string | null,
 *   last_outbound_body?: string | null,
 *   unanswered?: boolean,
 *   updated_at: string,
 *   messages?: Array<{ id: string, direction: "inbound"|"outbound", body: string, at: string, agent_key?: string|null }>,
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
 * Append an outbound AI reply and clear unanswered.
 * @param {string} id
 * @param {{ body: string, agent_key?: string }} input
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
  });
  rows[idx] = {
    ...rows[idx],
    messages,
    last_outbound_at: at,
    last_outbound_body: body,
    unanswered: false,
    assigned_agent_key: input.agent_key || rows[idx].assigned_agent_key || "social_media_manager",
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
 * }} input
 */
export async function ingestInboundDm(input) {
  const channel = String(input.channel || "instagram").toLowerCase();
  const body = String(input.body || "").trim() || "(empty message)";
  const at = nowIso();
  const rows = await readAll();
  const id =
    String(input.conversation_id || "").trim() ||
    `conv-${channel}-${Date.now().toString(36)}`;
  const existingIdx = rows.findIndex((c) => c.id === id);
  const isSocial = SOCIAL_DM_CHANNELS.includes(channel);
  const agentKey = isSocial ? "social_media_manager" : "ai_support";

  if (existingIdx >= 0) {
    const messages = Array.isArray(rows[existingIdx].messages)
      ? [...rows[existingIdx].messages]
      : [];
    messages.push({
      id: `msg-in-${Date.now().toString(36)}`,
      direction: "inbound",
      body,
      at,
    });
    rows[existingIdx] = {
      ...rows[existingIdx],
      messages,
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
      },
    ],
  };
  rows.unshift(row);
  await writeAll(rows.slice(0, 200));
  return row;
}
