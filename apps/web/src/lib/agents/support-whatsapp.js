/**
 * AI Support — WhatsApp inbound auto-reply.
 * Meta webhook → inbox conversation → Support draft → Cloud API text send.
 *
 * Latency: simple greetings use a deterministic fast path (no Anthropic);
 * other inbound drafts use latency_mode "fast" (one LLM, reviews deferred).
 */

import { runTeamCollaboration } from "./team-orchestrator";
import { setSharedKv } from "./shared-memory";
import {
  draftFastSupportReply,
  isSimpleSupportGreeting,
} from "./support-fast-path";
import {
  appendOutboundReply,
  findConversationByExternal,
  ingestInboundDm,
} from "@/lib/crm/conversations-store";
import { sendWhatsAppTextMessage } from "@/lib/integrations/whatsapp-cloud-text";
import { rememberInboundWhatsAppPeer } from "@/lib/crm/meta-contact-sync";

/**
 * Draft + send a Support reply for one WhatsApp conversation.
 * @param {{
 *   conversation: Record<string, unknown>,
 *   dry_run?: boolean,
 * }} input
 */
export async function replyWhatsAppSupport(input) {
  const conversation = input.conversation || {};
  const dryRun = input.dry_run === true;
  const inbound = String(
    conversation.last_inbound_body ||
      conversation.subject ||
      "Hello — thanks for writing Triada Designs.",
  ).trim();

  if (conversation.automation_mode === "human") {
    return {
      ok: true,
      skipped: true,
      reason: "human_takeover",
      conversation_id: conversation.id,
      channel: "whatsapp",
    };
  }

  const customerName =
    typeof conversation.metadata?.contact_name === "string"
      ? conversation.metadata.contact_name
      : undefined;

  /** @type {Record<string, unknown>} */
  let collab;
  if (isSimpleSupportGreeting(inbound)) {
    collab = draftFastSupportReply({
      message: inbound,
      customerName,
    });
  } else {
    collab = await runTeamCollaboration({
      agent_key: "ai_support",
      purpose: "draft_reply",
      message: inbound,
      dry_run: dryRun,
      latency_mode: "fast",
      max_tokens: 400,
      context: {
        channel: "whatsapp",
        conversation_id: conversation.id,
        subject: conversation.subject,
        contact_id: conversation.contact_id,
        customer_message: inbound,
        external_user_id: conversation.external_user_id,
        customer_name: customerName,
        latency_mode: "fast",
      },
      // Reviews deferred off the webhook→Graph critical path.
      collaborators: [],
    });
  }

  const replyText = String(collab.draft || collab.text || "").trim();
  if (!replyText) {
    return {
      ok: false,
      error: "empty_reply",
      conversation_id: conversation.id,
      channel: "whatsapp",
      collab,
    };
  }

  /** @type {Record<string, unknown> | null} */
  let send = null;
  /** @type {Record<string, unknown> | null} */
  let saved = null;

  if (!dryRun) {
    const to = String(
      conversation.external_user_id ||
        conversation.metadata?.wa_id ||
        "",
    ).trim();
    send = await sendWhatsAppTextMessage({ to, body: replyText });
    saved = await appendOutboundReply(String(conversation.id), {
      body: replyText,
      agent_key: "ai_support",
      provider_message_id: send?.provider_message_id
        ? String(send.provider_message_id)
        : null,
      send_mode: send?.mode || null,
      send_ok: Boolean(send?.ok),
      send_error: send?.error || null,
    });
  }

  void setSharedKv({
    key: "collab.active_thread",
    value: {
      channel: "whatsapp",
      conversation_id: conversation.id,
      agent_key: "ai_support",
      last_reply_preview: replyText.slice(0, 240),
      fast_path: Boolean(collab.fast_path),
      updated_at: new Date().toISOString(),
    },
    written_by: "ai_support",
    tags: ["whatsapp", "support", "auto_reply"],
  }).catch(() => null);

  return {
    ok: Boolean(send ? send.ok : true),
    skipped: false,
    conversation_id: conversation.id,
    channel: "whatsapp",
    reply: replyText,
    mode: collab.mode || send?.mode || "live",
    fast_path: Boolean(collab.fast_path),
    latency_ms: collab.latency_ms ?? null,
    dry_run: dryRun,
    send,
    conversation: saved,
    reviews: collab.reviews || [],
    error: send && !send.ok ? send.error : null,
  };
}

/**
 * Ingest an inbound WhatsApp message and auto-reply via Support.
 * @param {{
 *   body: string,
 *   external_user_id: string,
 *   external_conversation_id?: string,
 *   provider_message_id?: string,
 *   contact_name?: string | null,
 *   page_or_account_id?: string,
 *   message_type?: string,
 *   metadata?: Record<string, unknown>,
 *   auto_reply?: boolean,
 *   dry_run?: boolean,
 * }} input
 */
export async function handleInboundWhatsApp(input) {
  const externalUserId = String(input.external_user_id || "").trim();
  const externalConversationId =
    String(input.external_conversation_id || "").trim() ||
    (externalUserId ? `wa:${externalUserId}` : "");

  const existing = externalConversationId
    ? await findConversationByExternal({
        channel: "whatsapp",
        external_conversation_id: externalConversationId,
        external_user_id: externalUserId,
      })
    : null;

  if (
    input.provider_message_id &&
    existing &&
    Array.isArray(existing.provider_message_ids) &&
    existing.provider_message_ids.includes(String(input.provider_message_id))
  ) {
    return {
      ok: true,
      deduplicated: true,
      conversation: existing,
      replied: false,
    };
  }

  const conversation = await ingestInboundDm({
    channel: "whatsapp",
    body: input.body,
    subject: input.body || "WhatsApp message",
    conversation_id: existing?.id || undefined,
    external_user_id: externalUserId,
    external_conversation_id: externalConversationId,
    provider_message_id: input.provider_message_id,
    contact_name: input.contact_name || null,
    page_or_account_id: input.page_or_account_id,
    metadata: {
      ...(input.metadata || {}),
      contact_name: input.contact_name || null,
      wa_id: externalUserId,
    },
  });

  if (input.auto_reply === false) {
    if (externalUserId) {
      void rememberInboundWhatsAppPeer({
        phone: externalUserId.startsWith("+")
          ? externalUserId
          : `+${externalUserId}`,
        name: input.contact_name || null,
        wa_id: externalUserId.replace(/^\+/, ""),
      }).catch(() => null);
    }
    return { ok: true, conversation, replied: false, queued: true };
  }

  if (conversation.automation_mode === "human") {
    return {
      ok: true,
      conversation,
      replied: false,
      skipped: true,
      reason: "human_takeover",
    };
  }

  // Draft + Graph send first; CRM peer remember runs after (non-blocking).
  const reply = await replyWhatsAppSupport({
    conversation,
    dry_run: input.dry_run === true,
  });

  if (externalUserId) {
    void rememberInboundWhatsAppPeer({
      phone: externalUserId.startsWith("+")
        ? externalUserId
        : `+${externalUserId}`,
      name: input.contact_name || null,
      wa_id: externalUserId.replace(/^\+/, ""),
    }).catch(() => null);
  }

  return {
    ok: Boolean(reply.ok),
    conversation: reply.conversation || conversation,
    replied: Boolean(reply.ok && !reply.skipped),
    reply,
    deduplicated: false,
  };
}
