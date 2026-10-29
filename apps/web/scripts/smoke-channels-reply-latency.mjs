/**
 * Smoke: ALL Support channels use greeting fast_path (no Anthropic) for “Hi”.
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-channels-reply-latency.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import { isSimpleSupportGreeting } from "@/lib/agents/support-fast-path.js";
import { handleInboundSupportChannel } from "@/lib/agents/support-channel.js";
import { handleInboundPageMessaging } from "@/lib/agents/support-page-messaging.js";
import { handleInboundWhatsApp } from "@/lib/agents/support-whatsapp.js";
import { normalizeEmailInbound } from "@/lib/channels/normalize-inbound.js";

if (!isSimpleSupportGreeting("Hi")) {
  throw new Error("expected Hi to be a simple greeting");
}
if (!isSimpleSupportGreeting("Hello\n\nHi")) {
  throw new Error("expected email-shaped Subject\\n\\nHi to be a greeting");
}
if (isSimpleSupportGreeting("Ring sizes\n\nHi — what sizes do you carry?")) {
  throw new Error("price/size question must not use greeting fast path");
}

const emailNorm = normalizeEmailInbound({
  from: "guest@example.com",
  subject: "Hello",
  body: "Hi",
  message_id: `email-latency-${Date.now()}`,
});
if (!isSimpleSupportGreeting(emailNorm[0].body)) {
  throw new Error(
    `email normalize body should still fast-path: ${JSON.stringify(emailNorm[0].body)}`,
  );
}
console.log("ok greeting detectors");

/** @type {Array<{ channel: string, run: () => Promise<Record<string, unknown>> }>} */
const cases = [
  {
    channel: "whatsapp",
    run: () =>
      handleInboundWhatsApp({
        body: "Hi",
        external_user_id: "15550001111",
        external_conversation_id: `wa:lat:${Date.now()}`,
        provider_message_id: `wamid.lat.${Date.now()}`,
        contact_name: "Latency",
        auto_reply: true,
      }),
  },
  {
    channel: "instagram",
    run: () =>
      handleInboundPageMessaging({
        channel: "instagram",
        body: "Hi",
        external_user_id: "IG_LAT",
        external_conversation_id: `ig:lat:${Date.now()}`,
        provider_message_id: `mid.ig.lat.${Date.now()}`,
        page_or_account_id: "IG_ACC",
        auto_reply: true,
      }),
  },
  {
    channel: "messenger",
    run: () =>
      handleInboundPageMessaging({
        channel: "messenger",
        body: "Hi",
        external_user_id: "MSGR_LAT",
        external_conversation_id: `msgr:lat:${Date.now()}`,
        provider_message_id: `mid.msgr.lat.${Date.now()}`,
        page_or_account_id: "PAGE_LAT",
        auto_reply: true,
      }),
  },
  {
    channel: "facebook",
    run: () =>
      handleInboundPageMessaging({
        channel: "facebook",
        body: "Hi",
        external_user_id: "FB_LAT",
        external_conversation_id: `fb:lat:${Date.now()}`,
        provider_message_id: `mid.fb.lat.${Date.now()}`,
        page_or_account_id: "PAGE_FB",
        auto_reply: true,
      }),
  },
  {
    channel: "telegram",
    run: () =>
      handleInboundSupportChannel({
        channel: "telegram",
        body: "Hi",
        external_user_id: "555100",
        external_conversation_id: `telegram:lat:${Date.now()}`,
        provider_message_id: `tg-lat-${Date.now()}`,
        contact_name: "TG Latency",
        metadata: { chat_id: "555100" },
        auto_reply: true,
      }),
  },
  {
    channel: "webchat",
    run: () =>
      handleInboundSupportChannel({
        channel: "webchat",
        body: "Hi",
        external_user_id: "v_lat",
        external_conversation_id: `webchat:lat:${Date.now()}`,
        provider_message_id: `wc-lat-${Date.now()}`,
        contact_name: "Web Latency",
        auto_reply: true,
      }),
  },
  {
    channel: "email",
    run: () =>
      handleInboundSupportChannel({
        channel: "email",
        body: emailNorm[0].body,
        subject: "Hello",
        external_user_id: "guest@example.com",
        external_conversation_id: `email:lat:${Date.now()}`,
        provider_message_id: `email-lat-${Date.now()}`,
        contact_name: "guest@example.com",
        metadata: { email: "guest@example.com" },
        auto_reply: true,
      }),
  },
  {
    channel: "linkedin",
    run: () =>
      handleInboundSupportChannel({
        channel: "linkedin",
        body: "Hi",
        external_user_id: "li_lat",
        external_conversation_id: `linkedin:lat:${Date.now()}`,
        provider_message_id: `li-lat-${Date.now()}`,
        contact_name: "LI Latency",
        auto_reply: true,
      }),
  },
  {
    channel: "tiktok",
    run: () =>
      handleInboundSupportChannel({
        channel: "tiktok",
        body: "Hi",
        external_user_id: "tt_lat",
        external_conversation_id: `tiktok:lat:${Date.now()}`,
        provider_message_id: `tt-lat-${Date.now()}`,
        auto_reply: true,
      }),
  },
];

for (const { channel, run } of cases) {
  const started = Date.now();
  const handled = await run();
  const elapsed = Date.now() - started;
  if (!handled.replied && !handled.reply?.skipped) {
    throw new Error(`${channel} Support failed: ${JSON.stringify(handled)}`);
  }
  if (!handled.reply?.fast_path) {
    throw new Error(
      `${channel} expected fast_path on Hi: ${JSON.stringify(handled.reply)}`,
    );
  }
  if (elapsed > 5_000) {
    throw new Error(`${channel} Hi reply too slow locally: ${elapsed}ms`);
  }
  console.log(`ok ${channel} Hi`, {
    elapsed_ms: elapsed,
    mode: handled.reply?.mode,
    fast_path: handled.reply?.fast_path,
    draft_latency_ms: handled.reply?.latency_ms,
  });
}

console.log("SMOKE_PASS all-channels reply latency");
