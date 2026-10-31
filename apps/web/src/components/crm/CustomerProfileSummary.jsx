"use client";

import { Badge } from "@/components/ui/Badge";

/**
 * Shared CRM customer identity block for Contacts drawer and Inbox aside.
 * Empty fields render as "—" / "No …" only when truly missing from CRM/inbound.
 *
 * @param {{
 *   contact: {
 *     name?: string | null,
 *     email?: string | null,
 *     phone?: string | null,
 *     phone_e164?: string | null,
 *     picture?: string | null,
 *     avatar_url?: string | null,
 *     preferred_language?: string | null,
 *     lifecycle_status?: string | null,
 *     whatsapp_ready?: boolean,
 *   } | null,
 *   detectedLanguage?: string | null,
 *   size?: "sm" | "md" | "lg",
 *   showBadges?: boolean,
 * }} props
 */
export function CustomerProfileSummary({
  contact,
  detectedLanguage = null,
  size = "md",
  showBadges = false,
}) {
  const name = String(contact?.name || "").trim() || "Unknown contact";
  const email = String(contact?.email || "").trim() || null;
  const phone =
    String(contact?.phone_e164 || contact?.phone || "").trim() || null;
  const picture =
    String(contact?.picture || contact?.avatar_url || "").trim() || null;
  const language =
    String(contact?.preferred_language || detectedLanguage || "").trim() ||
    null;
  const avatarPx = size === "lg" ? "h-16 w-16 text-xl" : size === "sm" ? "h-10 w-10 text-sm" : "h-14 w-14 text-lg";
  const initial = name.charAt(0).toUpperCase() || "?";

  return (
    <div className="flex items-start gap-3">
      {picture && /^https?:\/\//i.test(picture) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={picture}
          alt=""
          className={`${avatarPx} shrink-0 rounded-full object-cover ring-1 ring-line`}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div
          className={`flex ${avatarPx} shrink-0 items-center justify-center rounded-full bg-stone font-display text-ink ring-1 ring-line`}
          aria-hidden
        >
          {initial}
        </div>
      )}
      <div className="min-w-0 space-y-1">
        <p className="truncate font-medium text-ink">{name}</p>
        <p className="truncate text-sm text-muted">{email || "No email"}</p>
        <p className="truncate text-sm text-muted">{phone || "No phone"}</p>
        {language ? (
          <p className="text-sm text-muted">Language: {language}</p>
        ) : null}
        {showBadges ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {contact?.lifecycle_status ? (
              <Badge tone="neutral">{contact.lifecycle_status}</Badge>
            ) : null}
            {contact?.whatsapp_ready ? (
              <Badge tone="success">WhatsApp ready</Badge>
            ) : contact?.phone || contact?.phone_e164 ? (
              <Badge tone="warning">WhatsApp unavailable</Badge>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
