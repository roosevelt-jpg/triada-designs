/**
 * Social Media Manager — replies Instagram / Messenger / Facebook / LinkedIn DMs
 * so no inbound message is left unanswered.
 */

import { setSharedKv } from "./shared-memory";
import {
  finalizeHumanHandoff,
  maybeHumanHandoffReply,
} from "./human-handoff";
import { draftInboundSupportReply } from "./support-draft";
import {
  SOCIAL_DM_CHANNELS,
  SUPPORT_PAGE_MESSAGING_CHANNELS,
  SUPPORT_TEXT_CHANNELS,
  appendOutboundReply,
  ingestInboundDm,
  listUnansweredSocialDms,
} from "@/lib/crm/conversations-store";
import { sendSupportChannelText } from "@/lib/integrations/support-channel-send";
import { sendPageMessagingText } from "@/lib/integrations/meta-page-text";

export { SOCIAL_DM_CHANNELS };

/**
 * Draft + send (or dry-run) a reply for one unanswered DM.
 * @param {{
 *   conversation: Record<string, unknown>,
 *   dry_run?: boolean,
 * }} input
 */
export async function replyUnansweredDm(input) {
  const conversation = input.conversation || {};
  const dryRun = input.dry_run === true;
  const channel = String(conversation.channel || "instagram").toLowerCase();
  const inbound = String(
    conversation.last_inbound_body ||
      conversation.subject ||
      "Hello — following up on your message.",
  ).trim();

  if (conversation.automation_mode === "human") {
    return {
      ok: true,
      skipped: true,
      reason: "human_takeover",
      conversation_id: conversation.id,
      channel,
    };
  }

  const handoff = await maybeHumanHandoffReply(inbound);
  if (handoff) {
    const replyText = String(handoff.text || "").trim();
    /** @type {Record<string, unknown> | null} */
    let send = null;
    /** @type {Record<string, unknown> | null} */
    let saved = null;
    if (!dryRun) {
      if (SUPPORT_TEXT_CHANNELS.includes(channel)) {
        const meta =
          conversation.metadata && typeof conversation.metadata === "object"
            ? /** @type {Record<string, unknown>} */ (conversation.metadata)
            : {};
        send = await sendSupportChannelText({
          channel,
          body: replyText,
          external_user_id: String(conversation.external_user_id || "").trim(),
          subject: conversation.subject
            ? `Re: ${String(conversation.subject)}`
            : undefined,
          metadata: meta,
        });
      } else if (SUPPORT_PAGE_MESSAGING_CHANNELS.includes(channel)) {
        send = await sendPageMessagingText({
          channel,
          recipient_id: String(conversation.external_user_id || "").trim(),
          body: replyText,
          page_or_account_id: String(conversation.page_or_account_id || "").trim(),
        });
      }
      saved = await appendOutboundReply(String(conversation.id), {
        body: replyText,
        agent_key: "social_media_manager",
        provider_message_id: send?.provider_message_id
          ? String(send.provider_message_id)
          : null,
        send_mode: send?.mode || null,
        send_ok: send ? Boolean(send.ok) : true,
        send_error: send?.error || null,
      });
      await finalizeHumanHandoff({
        conversation_id: String(conversation.id),
        channel,
        inbound,
        reply: replyText,
        agent_key: "social_media_manager",
        whatsapp_number: handoff.whatsapp_number,
        call_number: handoff.call_number,
      });
    }
    return {
      ok: Boolean(send ? send.ok : true),
      skipped: false,
      human_handoff: true,
      conversation_id: conversation.id,
      channel,
      reply: replyText,
      mode: send?.mode || "live",
      fast_path: false,
      latency_ms: null,
      dry_run: dryRun,
      send,
      conversation: saved,
      reviews: [],
      error: send && !send.ok ? send.error : null,
    };
  }

  const customerName =
    typeof conversation.metadata?.contact_name === "string"
      ? conversation.metadata.contact_name
      : undefined;

  // Shared Support draft: English first-contact language ask, then lock / re-detect.
  const collab = await draftInboundSupportReply({
    message: inbound,
    customerName,
    channel,
    conversation,
    dry_run: dryRun,
    agent_key: "social_media_manager",
    context: {
      social_dm: true,
      page_or_account_id: conversation.page_or_account_id,
    },
  });

  const replyText = String(collab.draft || collab.text || "").trim();
  if (!replyText) {
    return {
      ok: false,
      error: "empty_reply",
      conversation_id: conversation.id,
      channel,
      collab,
    };
  }

  /** @type {Record<string, unknown> | null} */
  let send = null;
  /** @type {Record<string, unknown> | null} */
  let saved = null;
  if (!dryRun) {
    // Prefer real channel send so sweep is not inbox-only (LinkedIn + Meta backlog).
    if (SUPPORT_TEXT_CHANNELS.includes(channel)) {
      const meta =
        conversation.metadata && typeof conversation.metadata === "object"
          ? /** @type {Record<string, unknown>} */ (conversation.metadata)
          : {};
      send = await sendSupportChannelText({
        channel,
        body: replyText,
        external_user_id: String(conversation.external_user_id || "").trim(),
        subject: conversation.subject
          ? `Re: ${String(conversation.subject)}`
          : undefined,
        metadata: meta,
      });
    } else if (SUPPORT_PAGE_MESSAGING_CHANNELS.includes(channel)) {
      send = await sendPageMessagingText({
        channel,
        recipient_id: String(conversation.external_user_id || "").trim(),
        body: replyText,
        page_or_account_id: String(conversation.page_or_account_id || "").trim(),
      });
    }
    saved = await appendOutboundReply(String(conversation.id), {
      body: replyText,
      agent_key: "social_media_manager",
      provider_message_id: send?.provider_message_id
        ? String(send.provider_message_id)
        : null,
      send_mode: send?.mode || null,
      send_ok: send ? Boolean(send.ok) : true,
      send_error: send?.error || null,
    });
  }

  void setSharedKv({
    key: "collab.active_thread",
    value: {
      channel,
      conversation_id: conversation.id,
      agent_key: "social_media_manager",
      last_reply_preview: replyText.slice(0, 240),
      fast_path: Boolean(collab.fast_path),
      updated_at: new Date().toISOString(),
    },
    written_by: "social_media_manager",
    tags: [channel, "social_dm", "auto_reply"],
  }).catch(() => null);

  return {
    ok: Boolean(send ? send.ok : true),
    skipped: false,
    conversation_id: conversation.id,
    channel,
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
 * Sweep all unanswered social DMs and reply.
 * @param {{
 *   dry_run?: boolean,
 *   channels?: string[],
 *   limit?: number,
 * }} [opts]
 */
export async function sweepUnansweredSocialDms(opts = {}) {
  const dryRun = opts.dry_run === true;
  const limit = Math.max(1, Math.min(50, Number(opts.limit || 20)));
  const unanswered = await listUnansweredSocialDms({
    channels: opts.channels || SOCIAL_DM_CHANNELS,
  });
  const targets = unanswered.slice(0, limit);

  /** @type {Array<Record<string, unknown>>} */
  const results = [];
  for (const conversation of targets) {
    try {
      const result = await replyUnansweredDm({ conversation, dry_run: dryRun });
      results.push(result);
    } catch (error) {
      results.push({
        ok: false,
        conversation_id: conversation.id,
        channel: conversation.channel,
        error: String(error?.message || error),
      });
    }
  }

  const replied = results.filter((r) => r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.ok).length;

  void setSharedKv({
    key: "collab.social_media_manager.last_sweep",
    value: {
      at: new Date().toISOString(),
      scanned: unanswered.length,
      targeted: targets.length,
      replied,
      skipped,
      failed,
      dry_run: dryRun,
    },
    written_by: "social_media_manager",
    tags: ["social_dm", "sweep"],
  }).catch(() => null);

  return {
    ok: failed === 0,
    agent_key: "social_media_manager",
    channels: opts.channels || SOCIAL_DM_CHANNELS,
    scanned: unanswered.length,
    targeted: targets.length,
    replied,
    skipped,
    failed,
    dry_run: dryRun,
    results,
    message:
      unanswered.length === 0
        ? "No unanswered social DMs."
        : `Social Media Manager processed ${replied} DM${replied === 1 ? "" : "s"} (${skipped} skipped, ${failed} failed).`,
  };
}

/**
 * Ingest an inbound social DM and optionally reply immediately.
 * @param {{
 *   channel: string,
 *   body: string,
 *   subject?: string,
 *   contact_id?: string,
 *   conversation_id?: string,
 *   auto_reply?: boolean,
 *   dry_run?: boolean,
 * }} input
 */
export async function handleInboundSocialDm(input) {
  const channel = String(input.channel || "instagram").toLowerCase();
  const conversation = await ingestInboundDm({
    channel,
    body: input.body,
    subject: input.subject,
    contact_id: input.contact_id,
    conversation_id: input.conversation_id,
  });

  const isSocial = SOCIAL_DM_CHANNELS.includes(channel);
  if (!isSocial) {
    return {
      ok: true,
      conversation,
      replied: false,
      note: "Not a Social Media Manager channel — stored for Support / inbox.",
    };
  }

  if (input.auto_reply === false) {
    return { ok: true, conversation, replied: false, queued: true };
  }

  const reply = await replyUnansweredDm({
    conversation,
    dry_run: input.dry_run === true,
  });

  return {
    ok: Boolean(reply.ok),
    conversation: reply.conversation || conversation,
    replied: Boolean(reply.ok && !reply.skipped),
    reply,
  };
}
