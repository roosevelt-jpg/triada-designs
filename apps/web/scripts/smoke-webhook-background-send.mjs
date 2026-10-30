/**
 * Smoke: early-200 helpers + background_send + parallel map.
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-webhook-background-send.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";
// Avoid loading next/server `after` outside a request (smoke = detached).
process.env.TRIADA_FORCE_DETACHED_AFTER = "1";

import {
  flushAfterResponse,
  pendingAfterResponseCount,
  runAfterResponse,
} from "@/lib/runtime/after-response.js";
import { mapParallel } from "@/lib/runtime/parallel-map.js";
import { deliverOutbound } from "@/lib/runtime/background-outbound.js";
import { handleInboundSupportChannel } from "@/lib/agents/support-channel.js";
import { handleInboundWhatsApp } from "@/lib/agents/support-whatsapp.js";
import { handleInboundPageMessaging } from "@/lib/agents/support-page-messaging.js";

// --- parallel map preserves order ---
const mapped = await mapParallel(
  [1, 2, 3, 4, 5],
  async (n) => {
    await new Promise((r) => setTimeout(r, 5 - n));
    return n * 10;
  },
  { concurrency: 3 },
);
if (JSON.stringify(mapped) !== JSON.stringify([10, 20, 30, 40, 50])) {
  throw new Error(`mapParallel order broken: ${JSON.stringify(mapped)}`);
}
console.log("ok mapParallel", mapped);

// --- runAfterResponse does not block caller ---
let finished = false;
const started = Date.now();
const scheduled = runAfterResponse(async () => {
  await new Promise((r) => setTimeout(r, 40));
  finished = true;
});
const scheduleMs = Date.now() - started;
if (scheduleMs > 20) {
  throw new Error(`runAfterResponse blocked caller (${scheduleMs}ms)`);
}
if (finished) {
  throw new Error("background task finished before flush");
}
if (pendingAfterResponseCount() < 1) {
  throw new Error("expected pending after-response task");
}
await flushAfterResponse();
if (!finished) {
  throw new Error("background task did not run");
}
console.log("ok runAfterResponse", scheduled.mode);

// --- deliverOutbound background path ---
let sent = false;
const delivered = await deliverOutbound({
  background: true,
  send: async () => {
    await new Promise((r) => setTimeout(r, 20));
    sent = true;
    return { ok: true, mode: "local_sim", provider_message_id: "bg-1" };
  },
  afterSend: async () => null,
});
if (!delivered.send_pending || delivered.send?.mode !== "background") {
  throw new Error(`expected pending send: ${JSON.stringify(delivered)}`);
}
if (sent) {
  throw new Error("provider send ran before flush");
}
await flushAfterResponse();
if (!sent) {
  throw new Error("provider send never ran");
}
console.log("ok deliverOutbound background");

// --- channel handlers with background_send ---
const stamp = Date.now();
const wa = await handleInboundWhatsApp({
  body: "Hi",
  external_user_id: "15550001111",
  external_conversation_id: `wa-bg:${stamp}`,
  provider_message_id: `wamid.bg.${stamp}`,
  contact_name: "BG Tester",
  auto_reply: true,
  background_send: true,
});
if (!wa.replied || !wa.reply?.send_pending) {
  throw new Error(`WA background_send failed: ${JSON.stringify(wa)}`);
}
console.log("ok WA background_send", {
  fast_path: wa.reply?.fast_path,
  send_pending: wa.reply?.send_pending,
});

const ig = await handleInboundPageMessaging({
  channel: "instagram",
  body: "Hi",
  external_user_id: "IG_BG_USER",
  external_conversation_id: `ig-bg:${stamp}`,
  provider_message_id: `mid.ig.bg.${stamp}`,
  page_or_account_id: "IG_BG_PAGE",
  auto_reply: true,
  background_send: true,
});
if (!ig.replied || !ig.reply?.send_pending) {
  throw new Error(`IG background_send failed: ${JSON.stringify(ig)}`);
}
console.log("ok IG background_send", {
  fast_path: ig.reply?.fast_path,
  send_pending: ig.reply?.send_pending,
});

const tg = await handleInboundSupportChannel({
  channel: "telegram",
  body: "Hi",
  external_user_id: "777001",
  external_conversation_id: `telegram:bg:${stamp}`,
  provider_message_id: `tg-bg-${stamp}`,
  contact_name: "TG BG",
  metadata: { chat_id: "777001" },
  auto_reply: true,
  background_send: true,
});
if (!tg.replied || !tg.reply?.send_pending) {
  throw new Error(`TG background_send failed: ${JSON.stringify(tg)}`);
}
console.log("ok TG background_send", {
  fast_path: tg.reply?.fast_path,
  send_pending: tg.reply?.send_pending,
});

const li = await handleInboundSupportChannel({
  channel: "linkedin",
  body: "Hi",
  external_user_id: "li_bg_user",
  external_conversation_id: `linkedin:bg:${stamp}`,
  provider_message_id: `li-bg-${stamp}`,
  contact_name: "LI BG",
  metadata: { person_urn: "urn:li:person:li_bg_user" },
  auto_reply: true,
  background_send: true,
});
if (!li.replied || !li.reply?.send_pending) {
  throw new Error(`LinkedIn background_send failed: ${JSON.stringify(li)}`);
}
console.log("ok LinkedIn background_send", {
  fast_path: li.reply?.fast_path,
  send_pending: li.reply?.send_pending,
});

const tt = await handleInboundSupportChannel({
  channel: "tiktok",
  body: "Hi",
  external_user_id: "tt_bg_user",
  external_conversation_id: `tiktok:bg:${stamp}`,
  provider_message_id: `tt-bg-${stamp}`,
  contact_name: "TT BG",
  metadata: { open_id: "tt_bg_user" },
  auto_reply: true,
  background_send: true,
});
if (!tt.replied || !tt.reply?.send_pending) {
  throw new Error(`TikTok background_send failed: ${JSON.stringify(tt)}`);
}
console.log("ok TikTok background_send", {
  fast_path: tt.reply?.fast_path,
  send_pending: tt.reply?.send_pending,
});

const wc = await handleInboundSupportChannel({
  channel: "webchat",
  body: "Hi",
  external_user_id: `v_bg_${stamp}`,
  external_conversation_id: `webchat:bg:${stamp}`,
  provider_message_id: `wc-bg-${stamp}`,
  contact_name: "Web BG",
  auto_reply: true,
  background_send: true,
});
if (!wc.replied || !wc.reply?.reply || !wc.reply?.send_pending) {
  throw new Error(`webchat background_send failed: ${JSON.stringify(wc)}`);
}
console.log("ok webchat background_send", {
  preview: String(wc.reply.reply).slice(0, 80),
  send_pending: wc.reply.send_pending,
});

await flushAfterResponse();
console.log("SMOKE_PASS webhook background send");
