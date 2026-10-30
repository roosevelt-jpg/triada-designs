/**
 * Smoke: Meta Messenger + Instagram Graph conversation history → Unified Inbox.
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-meta-inbox-history-backfill.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import { backfillMetaConversationHistory } from "@/lib/meta/conversation-history-backfill.js";
import {
  findConversationByExternal,
  listConversations,
  upsertHistoricalDmThread,
} from "@/lib/crm/conversations-store.js";

const dry = await backfillMetaConversationHistory({
  platforms: ["messenger", "instagram"],
  dry_run: true,
});
if (dry.mode !== "local_sim" || dry.conversations_seen < 2) {
  throw new Error(`dry_run unexpected: ${JSON.stringify(dry)}`);
}
console.log("ok dry_run", dry.conversations_seen, "preview threads");

const first = await backfillMetaConversationHistory({
  platforms: ["messenger", "instagram"],
});
if (!first.ok || first.mode !== "local_sim") {
  throw new Error(`first backfill failed: ${JSON.stringify(first)}`);
}
if (first.threads_created + first.threads_updated < 2) {
  throw new Error(`expected >=2 threads, got ${JSON.stringify(first)}`);
}
if (first.messages_added < 2) {
  throw new Error(`expected messages, got ${JSON.stringify(first)}`);
}
console.log(
  "ok first backfill",
  first.threads_created,
  "created",
  first.messages_added,
  "messages",
);

const second = await backfillMetaConversationHistory({
  platforms: ["messenger", "instagram"],
});
if (second.messages_added !== 0) {
  throw new Error(`idempotent expected 0 added, got ${JSON.stringify(second)}`);
}
console.log("ok idempotent", second.skipped, "skipped");

const msgr = await findConversationByExternal({
  channel: "messenger",
  external_user_id: "MSGR_LOCAL_HIST_1",
});
const ig = await findConversationByExternal({
  channel: "instagram",
  external_user_id: "IG_LOCAL_HIST_1",
});
if (!msgr || msgr.unanswered !== false) {
  throw new Error(`messenger thread missing or unanswered: ${JSON.stringify(msgr)}`);
}
if (!ig || ig.channel !== "instagram") {
  throw new Error(`instagram thread missing: ${JSON.stringify(ig)}`);
}
if (!Array.isArray(msgr.messages) || msgr.messages.length < 2) {
  throw new Error("messenger history messages missing");
}
const directions = msgr.messages.map((m) => m.direction).join(",");
if (!directions.includes("inbound") || !directions.includes("outbound")) {
  throw new Error(`expected mixed directions, got ${directions}`);
}

const listed = await listConversations({});
const hasMsgr = listed.some((c) => c.external_user_id === "MSGR_LOCAL_HIST_1");
const hasIg = listed.some((c) => c.external_user_id === "IG_LOCAL_HIST_1");
if (!hasMsgr || !hasIg) {
  throw new Error("listConversations missing backfilled Meta threads");
}

const merge = await upsertHistoricalDmThread({
  channel: "messenger",
  external_user_id: "MSGR_LOCAL_HIST_1",
  external_conversation_id: "t_local_sim_messenger_1",
  messages: [
    {
      direction: "inbound",
      body: "Any update on sizing?",
      at: new Date().toISOString(),
      provider_message_id: `mid.local.msgr.merge.${Date.now()}`,
    },
  ],
});
if (!merge.row || merge.added !== 1) {
  throw new Error(`merge add failed: ${JSON.stringify(merge)}`);
}
console.log("ok merge add", merge.added);

console.log("SMOKE_PASS meta inbox history backfill");
