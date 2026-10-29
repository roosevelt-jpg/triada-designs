/**
 * Shared Support inbound draft: first-contact English language ask,
 * greeting fast-path, or lean single-LLM draft.
 * No QC/Compliance on the webhook→send critical path (latency_mode "fast").
 */

import { runTeamCollaboration } from "./team-orchestrator";
import {
  draftFastSupportReply,
  isSimpleSupportGreeting,
} from "./support-fast-path";
import {
  draftFirstContactLanguageAsk,
  draftLanguageLockedAck,
  getLockedPreferredLanguage,
  isLanguageChoiceOnly,
  isLanguagePreferencePending,
  needsFirstContactLanguageAsk,
  persistLanguagePreferenceState,
  resolveLanguagePreferenceFromReply,
  resolveReplyLanguage,
} from "./language-preference";
import { getContact } from "@/lib/crm/contacts-store";
import { formatChatMessageBody } from "@/lib/crm/format-chat-message";

/**
 * Apply inbox prose formatting to draft / text fields on a reply result.
 * @param {Record<string, unknown> | null | undefined} result
 */
function formatDraftResult(result) {
  if (!result || typeof result !== "object") return result;
  /** @type {Record<string, unknown>} */
  const next = { ...result };
  if (typeof next.draft === "string") {
    next.draft = formatChatMessageBody(next.draft);
  }
  if (typeof next.text === "string") {
    next.text = formatChatMessageBody(next.text);
  }
  if (next.output && typeof next.output === "object") {
    const output = /** @type {Record<string, unknown>} */ ({ ...next.output });
    if (typeof output.text === "string") {
      output.text = formatChatMessageBody(output.text);
    }
    if (typeof output.draft === "string") {
      output.draft = formatChatMessageBody(output.draft);
    }
    next.output = output;
  }
  return next;
}

/**
 * @param {{
 *   message: string,
 *   customerName?: string | null,
 *   channel: string,
 *   conversation?: Record<string, unknown>,
 *   dry_run?: boolean,
 *   agent_key?: string,
 *   context?: Record<string, unknown>,
 * }} input
 */
export async function draftInboundSupportReply(input) {
  const result = await draftInboundSupportReplyUnformatted(input);
  return formatDraftResult(result);
}

/**
 * @param {{
 *   message: string,
 *   customerName?: string | null,
 *   channel: string,
 *   conversation?: Record<string, unknown>,
 *   dry_run?: boolean,
 *   agent_key?: string,
 *   context?: Record<string, unknown>,
 * }} input
 */
async function draftInboundSupportReplyUnformatted(input) {
  const message = String(input.message || "").trim();
  const customerName = input.customerName || undefined;
  const channel = String(input.channel || "webchat").toLowerCase();
  /** @type {Record<string, unknown>} */
  let conversation = input.conversation || {};
  const dryRun = input.dry_run === true;
  const agentKey = String(input.agent_key || "ai_support").trim() || "ai_support";

  /** @type {Record<string, unknown> | null} */
  let contact = null;
  if (conversation.contact_id) {
    try {
      contact = await getContact(String(conversation.contact_id));
    } catch {
      contact = null;
    }
  }

  // Seed locked preference from a returning contact onto this conversation.
  const contactLocked = getLockedPreferredLanguage(null, contact);
  const metaNow =
    conversation.metadata && typeof conversation.metadata === "object"
      ? /** @type {Record<string, unknown>} */ (conversation.metadata)
      : {};
  if (
    contactLocked &&
    metaNow.language_preference_locked !== true &&
    conversation.id &&
    !dryRun
  ) {
    await persistLanguagePreferenceState({
      conversation,
      patch: {
        language_preference_asked: true,
        language_preference_locked: true,
        preferred_language: contactLocked,
      },
    }).catch(() => null);
    conversation = {
      ...conversation,
      metadata: {
        ...metaNow,
        language_preference_asked: true,
        language_preference_locked: true,
        preferred_language: contactLocked,
      },
    };
  }

  // 1) First contact → always English greeting + language preference ask.
  if (needsFirstContactLanguageAsk(conversation, { contact })) {
    const ask = draftFirstContactLanguageAsk({ customerName });
    if (!dryRun && conversation.id && ask.conversation_patch) {
      await persistLanguagePreferenceState({
        conversation,
        patch: ask.conversation_patch,
      }).catch(() => null);
    }
    return ask;
  }

  // 2) Preference pending → lock from choice / detected language.
  if (isLanguagePreferencePending(conversation)) {
    const resolved = resolveLanguagePreferenceFromReply(message, {
      hint: getLockedPreferredLanguage(conversation, contact) || "en",
    });
    const lockPatch = {
      language_preference_asked: true,
      language_preference_locked: true,
      preferred_language: resolved.code,
    };
    if (!dryRun && conversation.id) {
      await persistLanguagePreferenceState({
        conversation,
        patch: lockPatch,
      }).catch(() => null);
    }

    if (isLanguageChoiceOnly(message) || isSimpleSupportGreeting(message)) {
      const ack = draftLanguageLockedAck({
        language: resolved.code,
        customerName,
      });
      return {
        ...ack,
        conversation_patch: lockPatch,
      };
    }

    // Substantive question after ask → answer in locked/detected language.
    return runTeamCollaboration({
      agent_key: agentKey,
      purpose: agentKey === "social_media_manager" ? "draft_dm_reply" : "draft_reply",
      message,
      dry_run: dryRun,
      latency_mode: "fast",
      max_tokens: 400,
      context: {
        channel,
        conversation_id: conversation.id,
        subject: conversation.subject,
        contact_id: conversation.contact_id,
        customer_message: message,
        external_user_id: conversation.external_user_id,
        customer_name: customerName,
        preferred_language: resolved.code,
        detected_language: resolved.code,
        language_preference_locked: true,
        latency_mode: "fast",
        ...(input.context && typeof input.context === "object" ? input.context : {}),
      },
      collaborators: [],
    }).then((collab) => ({
      ...collab,
      detected_language: resolved.code,
      detected_language_name: resolved.name,
      language_rtl: Boolean(resolved.rtl),
      language_preference_phase: "locked",
      conversation_patch: lockPatch,
    }));
  }

  // 3) Ongoing thread — lock as hint, re-detect if they switch.
  const replyLang = resolveReplyLanguage({
    message,
    conversation,
    contact,
  });

  // Persist switch so subsequent turns follow the new preference.
  if (
    replyLang.switched &&
    replyLang.code &&
    conversation.id &&
    !dryRun
  ) {
    await persistLanguagePreferenceState({
      conversation,
      patch: {
        language_preference_asked: true,
        language_preference_locked: true,
        preferred_language: replyLang.code,
      },
    }).catch(() => null);
  }

  if (isSimpleSupportGreeting(message)) {
    return draftFastSupportReply({
      message,
      customerName,
      languageHint: replyLang.preferred_language || replyLang.code,
      languageOverride: replyLang.code,
    });
  }

  return runTeamCollaboration({
    agent_key: agentKey,
    purpose: agentKey === "social_media_manager" ? "draft_dm_reply" : "draft_reply",
    message,
    dry_run: dryRun,
    latency_mode: "fast",
    max_tokens: 400,
    context: {
      channel,
      conversation_id: conversation.id,
      subject: conversation.subject,
      contact_id: conversation.contact_id,
      customer_message: message,
      external_user_id: conversation.external_user_id,
      customer_name: customerName,
      preferred_language: replyLang.preferred_language || replyLang.code,
      detected_language: replyLang.code,
      language_preference_locked: Boolean(
        conversation?.metadata?.language_preference_locked,
      ),
      latency_mode: "fast",
      ...(input.context && typeof input.context === "object" ? input.context : {}),
    },
    // Reviews deferred off the critical path.
    collaborators: [],
  });
}
