/**
 * Upsert CRM contact from any inbound DM and link conversation.contact_id.
 * Captures name / email / phone for later messaging & email; stores avatar when known.
 * Non-blocking — callers fire-and-forget off the reply hot path.
 */

import { upsertContacts } from "@/lib/crm/contacts-store";
import { extractContactFieldsFromInbound } from "@/lib/crm/extract-contact-fields";
import { patchConversation } from "@/lib/crm/conversations-store";
import { rememberInboundWhatsAppPeer } from "@/lib/crm/meta-contact-sync";
import { fetchMetaUserProfile } from "@/lib/integrations/meta-user-profile";
import { SUPPORT_PAGE_MESSAGING_CHANNELS } from "@/lib/crm/conversations-store";

/**
 * @param {{
 *   conversationId?: string | null,
 *   channel: string,
 *   body?: string | null,
 *   externalUserId?: string | null,
 *   contactName?: string | null,
 *   metadata?: Record<string, unknown> | null,
 * }} input
 * @returns {Promise<{ contactId: string | null, email: string | null, phone: string | null }>}
 */
export async function linkInboundContact(input) {
  const channel = String(input.channel || "").toLowerCase();
  const externalUserId = String(input.externalUserId || "").trim();
  const conversationId = input.conversationId
    ? String(input.conversationId)
    : null;

  let fields = extractContactFieldsFromInbound({
    channel,
    body: input.body,
    metadata: input.metadata,
    external_user_id: externalUserId,
    contact_name: input.contactName,
  });

  // Best-effort Graph profile pic / name for IG / Messenger / Facebook PSIDs.
  if (
    SUPPORT_PAGE_MESSAGING_CHANNELS.includes(channel) &&
    externalUserId &&
    (!fields.avatar_url || !fields.name)
  ) {
    try {
      const profile = await fetchMetaUserProfile(externalUserId);
      if (profile.ok) {
        fields = {
          ...fields,
          name: fields.name || profile.name,
          avatar_url: fields.avatar_url || profile.avatar_url,
        };
      }
    } catch {
      /* non-blocking */
    }
  }

  // Always create/update a CRM row when we have any identity signal.
  const hasIdentity = Boolean(
    fields.email ||
      fields.phone ||
      fields.name ||
      externalUserId ||
      fields.avatar_url,
  );
  if (!hasIdentity) {
    return { contactId: null, email: null, phone: null };
  }

  const source = `${channel || "channel"}_inbound`;
  const metadata = {
    ...(input.metadata && typeof input.metadata === "object"
      ? input.metadata
      : {}),
    channel,
    external_user_id: externalUserId || null,
    ...(fields.avatar_url ? { avatar_url: fields.avatar_url } : {}),
  };

  // Stable id for channel peers that only have an external PSID / chat id
  // (no email/phone yet) so repeat DMs update the same CRM row.
  const stableId =
    !fields.email && !fields.phone && externalUserId
      ? `contact-${channel || "ch"}-${externalUserId
          .replace(/[^a-zA-Z0-9_-]+/g, "-")
          .slice(0, 64)}`
      : undefined;

  /** @type {string | null} */
  let contactId = null;
  try {
    const result = await upsertContacts([
      {
        ...(stableId ? { id: stableId } : {}),
        name: fields.name,
        email: fields.email,
        phone: fields.phone,
        source,
        metadata,
      },
    ]);
    contactId = result.upserted?.[0]?.id || null;
    if (contactId && conversationId) {
      await patchConversation(conversationId, {
        contact_id: contactId,
        metadata: {
          ...(input.metadata && typeof input.metadata === "object"
            ? input.metadata
            : {}),
          contact_name: fields.name || undefined,
          email: fields.email || undefined,
          phone: fields.phone || undefined,
          avatar_url: fields.avatar_url || undefined,
        },
      });
    }
  } catch {
    /* non-blocking */
  }

  if (channel === "whatsapp" && fields.phone) {
    try {
      await rememberInboundWhatsAppPeer({
        phone: fields.phone,
        name: fields.name || null,
        wa_id: externalUserId.replace(/^\+/, "") || null,
      });
    } catch {
      /* non-blocking */
    }
  }

  return {
    contactId,
    email: fields.email,
    phone: fields.phone,
  };
}
