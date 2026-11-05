/**
 * Public waitlist / product-interest submission → CRM contact + lead,
 * E.164 phones, WhatsApp broadcast audience tagging.
 */

import { extractEmail } from "@/lib/crm/extract-contact-fields";
import { normalizePhoneToE164 } from "@/lib/crm/phone-e164";
import { upsertContacts } from "@/lib/crm/contacts-store";
import { upsertLead } from "@/lib/crm/leads-store";
import { joinWaitlist } from "@/lib/jewellery-ops/waitlist";
import {
  getActiveWaitlistFormBySlug,
  incrementWaitlistFormSubmissions,
  presentPublicWaitlistForm,
} from "@/lib/waitlist/forms-store";

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function cleanText(value) {
  const text = String(value || "").trim();
  return text || null;
}

/**
 * Prefer WhatsApp number when present; else primary phone.
 * @param {string | null} phone
 * @param {string | null} whatsapp
 */
function resolvePhones(phone, whatsapp) {
  const phoneNorm = phone ? normalizePhoneToE164(phone) : null;
  const waNorm = whatsapp ? normalizePhoneToE164(whatsapp) : null;

  const primary =
    (phoneNorm && phoneNorm.ok && phoneNorm.phone_e164) ||
    (waNorm && waNorm.ok && waNorm.phone_e164) ||
    phone ||
    whatsapp ||
    null;

  const whatsapp_e164 =
    (waNorm && waNorm.ok && waNorm.phone_e164) ||
    (phoneNorm && phoneNorm.ok && phoneNorm.phone_e164) ||
    null;

  return {
    phone_raw: phone,
    whatsapp_raw: whatsapp,
    phone_e164: phoneNorm && phoneNorm.ok ? phoneNorm.phone_e164 : null,
    whatsapp_e164,
    primary_e164: primary && String(primary).startsWith("+") ? primary : whatsapp_e164,
    phone_ok: Boolean(phoneNorm && phoneNorm.ok),
    whatsapp_ok: Boolean(waNorm && waNorm.ok),
  };
}

/**
 * @param {string} slug
 * @param {Record<string, unknown>} input
 */
export async function submitWaitlistInterest(slug, input = {}) {
  const form = await getActiveWaitlistFormBySlug(slug);
  if (!form) {
    return {
      ok: false,
      status: 404,
      message: "This form is unavailable.",
    };
  }

  const name = cleanText(input.name) || cleanText(input.contact_name);
  const email =
    extractEmail(input.email) ||
    extractEmail(input.contact_email) ||
    null;
  const phone = cleanText(input.phone) || cleanText(input.contact_phone);
  const whatsapp =
    cleanText(input.whatsapp) ||
    cleanText(input.whatsapp_number) ||
    cleanText(input.wa) ||
    null;
  const address =
    cleanText(input.address) ||
    cleanText(input.address_line) ||
    null;

  const productTarget =
    cleanText(input.product) ||
    cleanText(input.product_target) ||
    cleanText(input.waitlist_target) ||
    form.product_label ||
    form.title;

  // Free-text: what the submitter wants from the collection.
  const collectionWantsRaw =
    cleanText(input.collection_wants) ||
    cleanText(input.wants) ||
    cleanText(input.what_they_want) ||
    cleanText(input.looking_for) ||
    null;
  const collection_wants = collectionWantsRaw
    ? collectionWantsRaw.slice(0, 2000)
    : null;

  if (!name) {
    return { ok: false, status: 422, message: "Name is required." };
  }
  if (!email) {
    return { ok: false, status: 422, message: "A valid email is required." };
  }
  if (!phone && !whatsapp) {
    return {
      ok: false,
      status: 422,
      message: "Phone or WhatsApp number is required.",
    };
  }

  const phones = resolvePhones(phone, whatsapp);
  const audienceTag = `waitlist:${form.slug}`;
  const now = new Date().toISOString();

  const contactResult = await upsertContacts([
    {
      name,
      email,
      phone: phones.primary_e164 || phones.phone_raw || phones.whatsapp_raw,
      phone_e164: phones.primary_e164,
      source: "waitlist",
      lifecycle_status: "lead",
      marketing_opt_out: false,
      metadata: {
        address: address || null,
        whatsapp: phones.whatsapp_raw || null,
        whatsapp_e164: phones.whatsapp_e164,
        phone_raw: phones.phone_raw,
        waitlist_slug: form.slug,
        waitlist_form_id: form.id,
        waitlist_product: productTarget,
        product_link: form.product_link,
        collection_wants,
        broadcast_audiences: [audienceTag, "waitlist", "whatsapp_broadcast"],
        whatsapp_opt_in: true,
        waitlist_submitted_at: now,
      },
    },
  ]);

  const contact = contactResult.upserted?.[0] || null;

  const leadTitle = `${form.title} · ${name}`;
  const leadResult = await upsertLead({
    title: leadTitle,
    stage: "new_lead",
    contact_name: name,
    contact_email: email,
    contact_phone: phones.primary_e164 || phones.phone_raw || phones.whatsapp_raw,
    contact_id: contact?.id || null,
    source_channel: "waitlist",
    metadata: {
      waitlist_slug: form.slug,
      waitlist_form_id: form.id,
      waitlist_product: productTarget,
      product_link: form.product_link,
      address: address || null,
      whatsapp: phones.whatsapp_raw || null,
      whatsapp_e164: phones.whatsapp_e164,
      collection_wants,
      broadcast_audiences: [audienceTag, "waitlist", "whatsapp_broadcast"],
      whatsapp_opt_in: true,
    },
  });

  // Keep jewellery-ops waitlist queue in sync for restock / VIP notify paths.
  let opsEntry = null;
  try {
    const joined = await joinWaitlist({
      contact_id: contact?.id || null,
      product_id: form.product_link || form.slug,
      sku: productTarget,
      channel: "waitlist_form",
      notify_via: phones.whatsapp_e164 ? "whatsapp" : "email",
      whatsapp_opt_in: Boolean(phones.whatsapp_e164 || phones.phone_ok),
      phone: phones.whatsapp_e164 || phones.phone_e164 || phones.phone_raw,
      email,
      vip: false,
      collection_wants,
      notes: collection_wants,
    });
    opsEntry = joined.entry || null;
  } catch {
    opsEntry = null;
  }

  try {
    await incrementWaitlistFormSubmissions(form.id);
  } catch {
    /* non-blocking */
  }

  return {
    ok: true,
    status: 201,
    form: presentPublicWaitlistForm(form),
    success_message: form.success_message,
    contact_id: contact?.id || null,
    lead_id: leadResult.lead?.id || null,
    phone_e164: contact?.phone_e164 || phones.primary_e164 || null,
    whatsapp_e164: phones.whatsapp_e164,
    whatsapp_ready: Boolean(contact?.whatsapp_ready),
    collection_wants,
    broadcast_audiences: [audienceTag, "waitlist", "whatsapp_broadcast"],
    jewellery_ops_waitlist_id: opsEntry?.id || null,
    mode: contactResult.mode || leadResult.mode || "local",
  };
}
