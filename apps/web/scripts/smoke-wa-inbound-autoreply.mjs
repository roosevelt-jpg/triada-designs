/**
 * Smoke: Meta WhatsApp webhook payload → Support auto-reply (local_sim).
 * From apps/web:
 *   node --import ./scripts/alias-hooks-register.mjs ./scripts/smoke-wa-inbound-autoreply.mjs
 */

process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || "local";

import { normalizeMetaInboundMessages } from "@/lib/meta/normalize-inbound.js";
import { handleInboundWhatsApp } from "@/lib/agents/support-whatsapp.js";
import { ingestMetaWebhook } from "@/lib/meta/webhook-ingest.js";

const samplePayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_SMOKE",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "18084940604",
              phone_number_id: "PHONE_SMOKE",
            },
            contacts: [{ profile: { name: "Smoke Tester" }, wa_id: "15559876543" }],
            messages: [
              {
                from: "15559876543",
                id: `wamid.smoke.${Date.now()}`,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: "Hi" },
              },
            ],
          },
        },
      ],
    },
  ],
};

const normalized = normalizeMetaInboundMessages(samplePayload);
if (normalized.length !== 1 || normalized[0].channel !== "whatsapp") {
  throw new Error(`normalize failed: ${JSON.stringify(normalized)}`);
}
console.log("ok normalize", normalized[0].body, normalized[0].external_user_id);

const handled = await handleInboundWhatsApp({
  body: "Hi",
  external_user_id: "15559876543",
  external_conversation_id: "PHONE_SMOKE:15559876543",
  provider_message_id: `wamid.unit.${Date.now()}`,
  contact_name: "Smoke Tester",
  auto_reply: true,
  dry_run: false,
});

if (!handled.replied && !handled.reply?.skipped) {
  throw new Error(`handleInboundWhatsApp failed: ${JSON.stringify(handled)}`);
}
console.log("ok support reply", {
  replied: handled.replied,
  mode: handled.reply?.mode || handled.reply?.send?.mode,
  preview: String(handled.reply?.reply || "").slice(0, 120),
});

const ingested = await ingestMetaWebhook({
  payload: samplePayload,
  rawBody: JSON.stringify(samplePayload),
  headers: {},
});

if (!ingested.ok || !(ingested.replied >= 1 || ingested.messages?.length >= 1)) {
  throw new Error(`ingestMetaWebhook failed: ${JSON.stringify(ingested)}`);
}
console.log("ok webhook ingest", {
  storage: ingested.storage,
  replied: ingested.replied,
  automations: ingested.automations?.length,
});

console.log("SMOKE_PASS whatsapp inbound auto-reply");
