/**
 * Shared Support inbound draft: greeting fast-path or lean single-LLM draft.
 * No QC/Compliance on the webhook→send critical path (latency_mode "fast").
 */

import { runTeamCollaboration } from "./team-orchestrator";
import {
  draftFastSupportReply,
  isSimpleSupportGreeting,
} from "./support-fast-path";

/**
 * @param {{
 *   message: string,
 *   customerName?: string | null,
 *   channel: string,
 *   conversation?: Record<string, unknown>,
 *   dry_run?: boolean,
 *   context?: Record<string, unknown>,
 * }} input
 */
export async function draftInboundSupportReply(input) {
  const message = String(input.message || "").trim();
  const customerName = input.customerName || undefined;
  const channel = String(input.channel || "webchat").toLowerCase();
  const conversation = input.conversation || {};
  const dryRun = input.dry_run === true;

  if (isSimpleSupportGreeting(message)) {
    return draftFastSupportReply({
      message,
      customerName,
    });
  }

  return runTeamCollaboration({
    agent_key: "ai_support",
    purpose: "draft_reply",
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
      latency_mode: "fast",
      ...(input.context && typeof input.context === "object" ? input.context : {}),
    },
    // Reviews deferred off the critical path.
    collaborators: [],
  });
}
