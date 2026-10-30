/**
 * Pull email / phone candidates from free-text DM bodies and channel metadata.
 * Used to enrich CRM contacts on inbound across every messaging channel.
 */

import { normalizePhoneToE164 } from "./phone-e164.js";

const EMAIL_RE =
  /[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/gi;
/** International / local phone-ish sequences (normalized via E.164 helper). */
const PHONE_RE =
  /(?:\+|00)?[\d][\d\s().-]{6,18}\d/g;

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function extractEmail(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(EMAIL_RE);
  if (!match || !match[0]) return null;
  return match[0].toLowerCase();
}

/**
 * @param {unknown} value
 * @returns {string | null} E.164 phone when valid
 */
export function extractPhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const matches = raw.match(PHONE_RE) || [];
  for (const candidate of matches) {
    const normalized = normalizePhoneToE164(candidate);
    if (normalized.ok && normalized.phone_e164) {
      return normalized.phone_e164;
    }
  }
  // Digits-only WA-style ids (no +) — try with leading +.
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 8 && digits.length <= 15) {
    const normalized = normalizePhoneToE164(`+${digits}`);
    if (normalized.ok && normalized.phone_e164) {
      return normalized.phone_e164;
    }
  }
  return null;
}

/**
 * Merge structured metadata + free-text body into contact field candidates.
 * @param {{
 *   body?: string | null,
 *   metadata?: Record<string, unknown> | null,
 *   channel?: string | null,
 *   external_user_id?: string | null,
 *   contact_name?: string | null,
 * }} input
 * @returns {{
 *   name: string | null,
 *   email: string | null,
 *   phone: string | null,
 *   avatar_url: string | null,
 * }}
 */
export function extractContactFieldsFromInbound(input = {}) {
  const meta =
    input.metadata && typeof input.metadata === "object"
      ? /** @type {Record<string, unknown>} */ (input.metadata)
      : {};
  const channel = String(input.channel || "").toLowerCase();
  const body = String(input.body || "");
  const externalUserId = String(input.external_user_id || "").trim();

  const name =
    String(
      input.contact_name ||
        meta.contact_name ||
        meta.name ||
        meta.first_name ||
        "",
    ).trim() || null;

  let email =
    extractEmail(meta.email) ||
    extractEmail(meta.from) ||
    extractEmail(body) ||
    null;

  if (!email && channel === "email" && externalUserId.includes("@")) {
    email = extractEmail(externalUserId);
  }

  let phone =
    extractPhone(meta.phone) ||
    extractPhone(meta.phone_e164) ||
    extractPhone(meta.wa_id) ||
    extractPhone(body) ||
    null;

  if (!phone && channel === "whatsapp" && externalUserId) {
    phone = extractPhone(externalUserId.startsWith("+") ? externalUserId : `+${externalUserId}`);
  }

  const avatarRaw =
    meta.avatar_url ||
    meta.profile_pic ||
    meta.picture ||
    meta.photo_url ||
    meta.profile_picture_url ||
    null;
  const avatar_url =
    typeof avatarRaw === "string" && /^https?:\/\//i.test(avatarRaw.trim())
      ? avatarRaw.trim()
      : null;

  return { name, email, phone, avatar_url };
}
