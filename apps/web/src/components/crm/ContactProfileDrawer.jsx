"use client";

import Link from "next/link";
import { useEffect } from "react";
import { CustomerProfileSummary } from "@/components/crm/CustomerProfileSummary";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDateTime } from "@/lib/formatters";

function channelLabel(channel) {
  const key = String(channel || "").toLowerCase();
  if (key === "whatsapp") return "WhatsApp";
  if (key === "instagram") return "Instagram";
  if (key === "messenger" || key === "facebook") return "Messenger";
  if (key === "telegram") return "Telegram";
  if (key === "linkedin") return "LinkedIn";
  if (key === "tiktok") return "TikTok";
  if (key === "email") return "Email";
  if (key === "webchat") return "Webchat";
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : "Channel";
}

function FieldRow({ label, value, empty = "—" }) {
  const display =
    value != null && String(value).trim() !== "" ? String(value) : empty;
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 border-b border-line/60 py-2.5 text-sm last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="break-words text-ink">{display}</dd>
    </div>
  );
}

function syncTone(status) {
  if (status === "synced" || status === "connected") return "success";
  if (status === "error") return "danger";
  if (status === "awaiting_credentials" || status === "pending_publish")
    return "warning";
  return "neutral";
}

/**
 * Full-contact slide-over: CRM fields + photo + channel trails.
 * Keeps grey-shell surfaces (white card on ivory page).
 *
 * @param {{
 *   open: boolean,
 *   contact: object | null,
 *   loading?: boolean,
 *   error?: string,
 *   onClose: () => void,
 *   onEdit?: (contact: object) => void,
 * }} props
 */
export function ContactProfileDrawer({
  open,
  contact,
  loading = false,
  error = "",
  onClose,
  onEdit,
}) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const meta =
    contact?.metadata && typeof contact.metadata === "object"
      ? contact.metadata
      : {};
  const shopifySync =
    meta.shopify_customer_sync && typeof meta.shopify_customer_sync === "object"
      ? meta.shopify_customer_sync
      : {};
  const trails = Array.isArray(contact?.conversations)
    ? contact.conversations
    : [];
  const picture = contact?.avatar_url || contact?.picture || meta.avatar_url || null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40"
        aria-label="Close contact profile"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-profile-title"
        className="relative flex h-full w-full max-w-md flex-col border-l border-line bg-white shadow-[var(--shadow-popover)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line bg-[var(--surface-header)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted">
              Contact profile
            </p>
            <h2
              id="contact-profile-title"
              className="font-display text-2xl text-ink"
            >
              {contact?.name || (loading ? "Loading…" : "Contact")}
            </h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading ? <Skeleton className="mb-4 h-24" /> : null}
          {error ? (
            <p className="mb-4 rounded-md border border-danger/30 bg-white px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          {!loading && contact ? (
            <div className="space-y-6">
              <CustomerProfileSummary
                contact={{
                  ...contact,
                  picture,
                  phone: contact.phone_e164 || contact.phone,
                }}
                size="lg"
                showBadges
              />

              <section>
                <h3 className="mb-1 text-sm font-medium text-ink">CRM fields</h3>
                <dl>
                  <FieldRow label="Name" value={contact.name} />
                  <FieldRow label="Email" value={contact.email} empty="No email" />
                  <FieldRow
                    label="Phone"
                    value={contact.phone_e164 || contact.phone}
                    empty="No phone"
                  />
                  <FieldRow
                    label="Photo"
                    value={
                      picture && /^https?:\/\//i.test(String(picture))
                        ? "Captured"
                        : null
                    }
                    empty="No photo"
                  />
                  <FieldRow
                    label="Language"
                    value={contact.preferred_language}
                  />
                  <FieldRow
                    label="Lifecycle"
                    value={contact.lifecycle_status}
                  />
                  <FieldRow label="Source" value={contact.source} />
                  <FieldRow
                    label="Marketing"
                    value={
                      contact.marketing_opt_out ? "Opted out" : "Eligible"
                    }
                  />
                  <FieldRow
                    label="Updated"
                    value={
                      contact.updated_at
                        ? formatDateTime(contact.updated_at)
                        : null
                    }
                  />
                </dl>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-medium text-ink">Shopify</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={syncTone(shopifySync.status)}>
                    {shopifySync.status || "not synced"}
                  </Badge>
                  {meta.shopify_customer_id ? (
                    <span className="text-sm text-muted">
                      #{String(meta.shopify_customer_id)}
                    </span>
                  ) : (
                    <span className="text-sm text-muted">No Shopify id</span>
                  )}
                </div>
                {shopifySync.message ? (
                  <p className="mt-2 text-sm text-muted">{shopifySync.message}</p>
                ) : null}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-medium text-ink">
                  Channel trails
                </h3>
                {trails.length === 0 ? (
                  <p className="text-sm text-muted">
                    No inbox conversations linked yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {trails.map((trail) => (
                      <li
                        key={trail.id}
                        className="rounded-md border border-line bg-[var(--surface-page)] px-3 py-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Badge tone="neutral">
                            {channelLabel(trail.channel)}
                          </Badge>
                          <Link
                            href={`/inbox/${encodeURIComponent(trail.id)}`}
                            className="text-sm font-medium text-brown hover:underline"
                          >
                            Open inbox
                          </Link>
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-sm text-ink">
                          {trail.last_inbound_body ||
                            trail.last_outbound_body ||
                            trail.subject ||
                            "No messages yet"}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {trail.last_message_at
                            ? formatDateTime(trail.last_message_at)
                            : "—"}
                          {trail.status ? ` · ${trail.status}` : ""}
                          {trail.automation_mode
                            ? ` · ${trail.automation_mode}`
                            : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : null}
        </div>

        {contact && onEdit ? (
          <footer className="flex items-center justify-end gap-2 border-t border-line bg-[var(--surface-header)] px-5 py-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onEdit(contact)}
            >
              Edit contact
            </Button>
            <Button type="button" size="sm" onClick={onClose}>
              Done
            </Button>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
