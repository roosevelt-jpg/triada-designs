/**
 * Outbound manufacturer job placement (email / WhatsApp).
 * Never labels successful durable placement as local_sim.
 * Modes: email | whatsapp | awaiting_credentials | recorded
 */

import { sendResendEmail } from "@/lib/email/resend";
import { wrapEmailMessage } from "@/lib/brand/wrap-email";
import { sendWhatsAppTextMessage } from "@/lib/integrations/whatsapp-cloud-text";
import {
  hasResendEnv,
  hasWhatsAppMessagingEnv,
  integrationRuntimeMode,
} from "@/lib/integrations/env-presence";
import { BRAND } from "@/lib/brand/identity";
import { toWhatsAppRecipient } from "@/lib/crm/phone-e164";

/**
 * @param {object} contact
 * @param {{
 *   external_ref: string,
 *   order_number: string,
 *   piece: string,
 *   sku?: string | null,
 *   size?: string | null,
 *   metal?: string | null,
 *   engraving?: string | null,
 *   grams?: number | null,
 *   sell_price?: number | null,
 *   currency?: string,
 * }} job
 */
export function buildManufacturerJobMessage(contact, job) {
  const lines = [
    `New manufacture job ${job.external_ref}`,
    `Order: ${job.order_number}`,
    `Piece: ${job.piece}`,
    job.sku ? `SKU: ${job.sku}` : null,
    job.size ? `Size: ${job.size}` : null,
    job.metal ? `Metal: ${job.metal}` : null,
    job.engraving ? `Engraving: ${job.engraving}` : null,
    job.grams != null ? `Grams: ${job.grams}` : null,
    job.sell_price != null
      ? `Sell: ${job.sell_price} ${job.currency || "AED"}`
      : null,
    "",
    `Please confirm receipt / ETA to ${BRAND.name} ops.`,
  ].filter((line) => line != null);
  return lines.join("\n");
}

/**
 * @param {object | null} contact
 * @param {Parameters<typeof buildManufacturerJobMessage>[1]} job
 */
export async function sendManufacturerJob(contact, job) {
  const forceLocal =
    (process.env.INTEGRATION_MODE || "").trim().toLowerCase() === "local";
  const body = buildManufacturerJobMessage(contact || { name: "Workshop" }, job);
  const preferred = String(contact?.preferred_channel || "email").toLowerCase();
  const email = contact?.email ? String(contact.email).trim().toLowerCase() : "";
  const phone =
    toWhatsAppRecipient(contact?.phone_e164 || contact?.phone || "") || "";

  const emailReady = hasResendEnv();
  const waReady = hasWhatsAppMessagingEnv();
  const emailLive =
    !forceLocal && emailReady && integrationRuntimeMode(emailReady) === "live";
  const waLive =
    !forceLocal && waReady && integrationRuntimeMode(waReady) === "live";

  // Prefer contact channel; fall back to whichever is reachable.
  /** @type {Array<"email"|"whatsapp">} */
  const order =
    preferred === "whatsapp" ? ["whatsapp", "email"] : ["email", "whatsapp"];

  for (const channel of order) {
    if (channel === "email" && email) {
      if (!emailLive) {
        continue;
      }
      const wrapped = wrapEmailMessage({
        subject: `${BRAND.name} manufacture job ${job.external_ref}`,
        bodyText: body,
        greetingKind: "default",
        customerName: contact?.name || "team",
      });
      const sent = await sendResendEmail({
        to: email,
        subject: wrapped.subject || `${BRAND.name} manufacture job ${job.external_ref}`,
        html: wrapped.html,
        text: wrapped.text || body,
      });
      if (sent.ok && sent.mode !== "local_fallback" && sent.mode !== "error") {
        return {
          ok: true,
          delivery_mode: "email",
          channel: "email",
          provider_message_id: sent.id || null,
          recipient: email,
          error: null,
        };
      }
      // Fall through to next channel / awaiting_credentials
    }

    if (channel === "whatsapp" && phone) {
      if (!waLive) {
        continue;
      }
      const sent = await sendWhatsAppTextMessage({ to: phone, body });
      if (sent.ok && sent.mode !== "local_sim") {
        return {
          ok: true,
          delivery_mode: "whatsapp",
          channel: "whatsapp",
          provider_message_id: sent.provider_message_id || null,
          recipient: phone,
          error: null,
        };
      }
    }
  }

  // Durable record still created by caller; no fake local_sim success.
  const hasAnyRecipient = Boolean(email || phone);
  return {
    ok: hasAnyRecipient,
    delivery_mode: hasAnyRecipient ? "awaiting_credentials" : "recorded",
    channel: preferred === "whatsapp" && phone ? "whatsapp" : email ? "email" : "none",
    provider_message_id: null,
    recipient: email || phone || null,
    error: hasAnyRecipient ? "awaiting_credentials" : "no_manufacturer_contact",
    body_preview: body.slice(0, 400),
  };
}
