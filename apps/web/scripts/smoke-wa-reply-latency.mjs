/**
 * Smoke: WhatsApp “Hi” uses fast_path (no Anthropic) and finishes quickly.
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-wa-reply-latency.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import {
  draftFastSupportReply,
  isSimpleSupportGreeting,
} from "@/lib/agents/support-fast-path.js";
import { handleInboundWhatsApp } from "@/lib/agents/support-whatsapp.js";
import { ingestMetaWebhook } from "@/lib/meta/webhook-ingest.js";

if (!isSimpleSupportGreeting("Hi")) {
  throw new Error("expected Hi to be a simple greeting");
}
if (isSimpleSupportGreeting("How much is the necklace?")) {
  throw new Error("price question must not use greeting fast path");
}

const fast = draftFastSupportReply({ message: "Hi", customerName: "Smoke" });
if (!fast.fast_path || !String(fast.text || "").includes("Triada")) {
  throw new Error(`fast reply missing brand: ${JSON.stringify(fast)}`);
}
console.log("ok fast_path draft", { latency_ms: fast.latency_ms, preview: fast.text.slice(0, 80) });

const started = Date.now();
const handled = await handleInboundWhatsApp({
  body: "Hi",
  external_user_id: "15551234567",
  external_conversation_id: `latency:${Date.now()}`,
  provider_message_id: `wamid.latency.${Date.now()}`,
  contact_name: "Latency Tester",
  auto_reply: true,
  dry_run: false,
});
const elapsed = Date.now() - started;

if (!handled.replied) {
  throw new Error(`expected replied: ${JSON.stringify(handled)}`);
}
if (!handled.reply?.fast_path) {
  throw new Error(`expected fast_path on Hi reply: ${JSON.stringify(handled.reply)}`);
}
if (elapsed > 5_000) {
  throw new Error(`Hi reply too slow locally: ${elapsed}ms`);
}
console.log("ok support Hi", {
  elapsed_ms: elapsed,
  mode: handled.reply?.mode,
  fast_path: handled.reply?.fast_path,
});

const payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_LATENCY",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "18084940604",
              phone_number_id: "PHONE_LATENCY",
            },
            contacts: [{ profile: { name: "Latency" }, wa_id: "15557654321" }],
            messages: [
              {
                from: "15557654321",
                id: `wamid.latency.ingest.${Date.now()}`,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: "Hello" },
              },
            ],
          },
        },
      ],
    },
  ],
};

const ingestStarted = Date.now();
const ingested = await ingestMetaWebhook({
  payload,
  rawBody: JSON.stringify(payload),
  headers: {},
});
const ingestElapsed = Date.now() - ingestStarted;

if (!ingested.ok || !(ingested.replied >= 1)) {
  throw new Error(`ingest failed: ${JSON.stringify(ingested)}`);
}
if (ingestElapsed > 5_000) {
  throw new Error(`webhook ingest too slow locally: ${ingestElapsed}ms`);
}
const automation = ingested.automations?.[0];
if (!automation?.fast_path) {
  throw new Error(`expected automation fast_path: ${JSON.stringify(automation)}`);
}
console.log("ok webhook ingest", {
  elapsed_ms: ingestElapsed,
  latency_ms: ingested.latency_ms,
  fast_path: automation.fast_path,
});

console.log("SMOKE_PASS whatsapp reply latency");
