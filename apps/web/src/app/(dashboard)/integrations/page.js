"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import {
  aiStatusSummary,
  connectionLabel,
} from "@/lib/integrations/brand-labels";

function toneForStatus(status, hasCredentials) {
  if (hasCredentials || status === "live" || status === "connected" || status === "healthy") {
    return "success";
  }
  if (status === "awaiting_credentials") return "warning";
  if (status === "error") return "danger";
  return "neutral";
}

function StatusPill({ status, hasCredentials, label }) {
  return (
    <Badge tone={toneForStatus(status, hasCredentials)}>
      {label ||
        connectionLabel(status, {
          live: status === "live",
          hasCredentials,
        })}
    </Badge>
  );
}

function ProviderRow({ title, summary, status, hasCredentials, statusLabel, href, hrefLabel }) {
  return (
    <div className="flex flex-col gap-3 border-t border-line px-5 py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-ink">{title}</p>
        {summary ? <p className="mt-1 text-sm text-muted">{summary}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={status} hasCredentials={hasCredentials} label={statusLabel} />
        {href ? (
          <Link href={href}>
            <Button size="sm" variant="secondary">
              {hrefLabel || "Open"}
            </Button>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const [health, setHealth] = useState(null);
  const [integrations, setIntegrations] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [draftTitle, setDraftTitle] = useState("Quiet materials, considered care");
  const [draftStatus, setDraftStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, healthData] = await Promise.all([
        apiFetch("/v1/integrations"),
        apiFetch("/v1/integrations/health"),
      ]);
      setIntegrations(list.data || []);
      setHealth(healthData);
    } catch (err) {
      setError(err.message || "Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createDraft(event) {
    event.preventDefault();
    setDraftStatus("");
    try {
      const result = await apiFetch("/v1/integrations/wordpress/drafts", {
        method: "POST",
        body: {
          title: draftTitle,
          excerpt: "Draft prepared from Triada Content Studio for WordPress.",
          content: "<p>Editorial draft awaiting human review before publish.</p>",
        },
      });
      setDraftStatus(`Draft created: ${result.id}`);
    } catch (err) {
      setDraftStatus(err.message);
    }
  }

  const llmLabel =
    health?.llm?.status_label ||
    connectionLabel(health?.llm?.status, {
      live: health?.llm?.status === "live",
      hasCredentials: health?.llm?.has_credentials,
    });
  const anthropicLabel =
    health?.anthropic?.status_label ||
    connectionLabel(health?.anthropic?.status, {
      hasCredentials: health?.anthropic?.has_credentials,
    });

  const metaChannels = ["facebook", "instagram", "whatsapp"];

  return (
    <DashboardShell
      title="Integrations"
      description="Channel and provider status. Connected or Waiting credentials."
      actions={
        <div className="ops-actions">
          <Link href="/integrations/meta">
            <Button size="sm">Meta hub</Button>
          </Link>
          <Link href="/integrations/shopify">
            <Button size="sm" variant="secondary">
              Shopify
            </Button>
          </Link>
          <Link href="/integrations/channels">
            <Button size="sm" variant="secondary">
              Sales channels
            </Button>
          </Link>
          <Link href="/templates">
            <Button size="sm" variant="secondary">
              Templates
            </Button>
          </Link>
        </div>
      }
    >
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={health?.mode === "live" ? "success" : "brand"}>
              {health?.mode_label || (health?.mode === "live" ? "Live" : "Local")}
            </Badge>
            <Button size="sm" variant="secondary" onClick={load}>
              Re-check status
            </Button>
          </div>

          <section className="surface-card overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="ops-section-title">AI providers</h2>
                <p className="mt-1 text-sm text-muted">
                  Connection status for AI providers.
                </p>
              </div>
              <StatusPill
                status={health?.llm?.status}
                hasCredentials={health?.llm?.has_credentials}
                label={llmLabel}
              />
            </div>
            <div className="space-y-1 px-5 py-3 text-sm text-muted">
              <p>{health?.llm?.summary || aiStatusSummary(health?.llm)}</p>
            </div>
            <ProviderRow
              title="Claude"
              summary={
                health?.anthropic?.summary ||
                (health?.anthropic?.has_credentials
                  ? "Claude is connected."
                  : "Waiting credentials.")
              }
              status={health?.anthropic?.status}
              hasCredentials={health?.anthropic?.has_credentials}
              statusLabel={anthropicLabel}
            />
            <ProviderRow
              title="Gemini"
              summary={health?.gemini?.summary || "Gemini."}
              status={health?.gemini?.status}
              hasCredentials={health?.gemini?.has_credentials}
              statusLabel={
                health?.gemini?.status_label ||
                connectionLabel(health?.gemini?.status, {
                  hasCredentials: health?.gemini?.has_credentials,
                })
              }
            />
          </section>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                key: "resend",
                title: "Email",
                row: health?.resend,
                fallback: "Transactional email delivery.",
              },
              {
                key: "supabase",
                title: "Supabase",
                row: health?.supabase,
                fallback: "Auth and data for the ops dashboard.",
              },
              {
                key: "google_places",
                title: "Google Places",
                row: health?.google_places,
                fallback: "Popup location search and map pin.",
                href: "/popups",
                hrefLabel: "Open pop-ups",
              },
            ].map((card) => (
              <section key={card.key} className="surface-card px-5 py-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="ops-section-title">{card.title}</h2>
                  <StatusPill
                    status={card.row?.status}
                    hasCredentials={card.row?.has_credentials}
                    label={
                      card.row?.status_label ||
                      connectionLabel(card.row?.status, {
                        hasCredentials: card.row?.has_credentials,
                      })
                    }
                  />
                </div>
                <p className="mt-2 text-sm text-muted">{card.row?.summary || card.fallback}</p>
                {card.href ? (
                  <div className="mt-3">
                    <Link href={card.href}>
                      <Button size="sm" variant="secondary">
                        {card.hrefLabel || "Open"}
                      </Button>
                    </Link>
                  </div>
                ) : null}
              </section>
            ))}
          </div>

          {health?.meta ? (
            <section className="surface-card overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <h2 className="ops-section-title">Meta messaging</h2>
                  <p className="mt-1 text-sm text-muted">
                    Facebook Messenger, Instagram, and WhatsApp.
                  </p>
                </div>
                <div className="ops-actions">
                  <StatusPill
                    status={health.meta.status}
                    hasCredentials={health.meta.connected}
                    label={
                      health.meta.status_label ||
                      connectionLabel(health.meta.status, {
                        hasCredentials: health.meta.connected,
                      })
                    }
                  />
                  <Link href="/integrations/meta">
                    <Button size="sm" variant="secondary">
                      Open Meta hub
                    </Button>
                  </Link>
                </div>
              </div>
              <div className="grid gap-0 md:grid-cols-3 md:divide-x md:divide-line">
                {metaChannels.map((key) => {
                  const ch = health.meta.channels?.[key];
                  const connected = ch?.status === "connected";
                  return (
                    <div key={key} className="border-t border-line px-5 py-4 md:border-t-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium capitalize text-ink">
                          {key === "facebook" ? "Messenger" : key}
                        </p>
                        <StatusPill
                          status={ch?.health?.status || ch?.status}
                          hasCredentials={connected}
                          label={
                            ch?.status_label ||
                            ch?.health?.status_label ||
                            connectionLabel(ch?.status || ch?.health?.status, {
                              hasCredentials: connected,
                            })
                          }
                        />
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-muted">
                        {connected ? "Ready." : "Waiting credentials."}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="ops-section-title">WordPress</h2>
                  <p className="mt-1 text-sm text-muted">
                    CMS drafts and product publishing.
                  </p>
                </div>
                <StatusPill
                  status={health?.wordpress?.status}
                  label={
                    health?.wordpress?.status_label ||
                    connectionLabel(health?.wordpress?.status)
                  }
                />
              </div>
              <p className="mt-3 text-sm text-muted">{health?.wordpress?.message}</p>
              <ul className="mt-4 space-y-2">
                {(health?.wordpress_posts || []).map((post) => (
                  <li
                    key={post.id}
                    className="rounded-md border border-line px-3 py-2.5 text-sm transition-colors duration-150 hover:bg-stone/40"
                  >
                    <p className="font-medium text-ink">{post.title}</p>
                    <p className="text-muted">{post.excerpt}</p>
                  </li>
                ))}
              </ul>
              <form className="mt-5 space-y-3" onSubmit={createDraft}>
                <Input
                  label="Create WordPress draft"
                  name="title"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                />
                <Button type="submit" size="sm">
                  Create draft
                </Button>
                {draftStatus ? <p className="text-sm text-muted">{draftStatus}</p> : null}
              </form>
            </Card>

            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="ops-section-title">Zoho CRM + Books</h2>
                  <p className="mt-1 text-sm text-muted">
                    Contacts, leads, and invoice PDF.
                  </p>
                </div>
                <StatusPill
                  status={health?.zoho?.status}
                  hasCredentials={health?.zoho?.credentials?.has_credentials}
                  label={
                    health?.zoho?.status_label ||
                    connectionLabel(health?.zoho?.status, {
                      hasCredentials: health?.zoho?.credentials?.has_credentials,
                    })
                  }
                />
              </div>
              <p className="mt-3 text-sm text-muted">
                {health?.zoho?.has_credentials || health?.zoho?.credentials?.has_credentials
                  ? health?.zoho?.message || "Zoho CRM is connected."
                  : "Waiting credentials."}
              </p>
              <p className="mt-1 text-xs text-muted">
                Books:{" "}
                {health?.zoho_books?.status_label ||
                  health?.zoho?.books?.status_label ||
                  connectionLabel(health?.zoho_books?.status || health?.zoho?.books?.status) ||
                  "—"}
              </p>
              <ul className="mt-4 space-y-2">
                {(health?.zoho_leads || []).map((lead) => (
                  <li
                    key={lead.id}
                    className="rounded-md border border-line px-3 py-2.5 text-sm transition-colors duration-150 hover:bg-stone/40"
                  >
                    <p className="font-medium text-ink">{lead.name}</p>
                    <p className="text-muted">
                      {lead.email || "—"} · {lead.stage || "—"}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <section className="surface-card overflow-hidden">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="ops-section-title">Registered integrations</h2>
              <p className="mt-1 text-sm text-muted">
                Presence-only status for each channel and provider.
              </p>
            </div>
            <div className="divide-y divide-line">
              {integrations
                .filter((item) => item.provider !== "messenger")
                .map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-2 px-5 py-3.5 transition-colors duration-150 hover:bg-stone/40 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-ink">{item.display_name}</p>
                    </div>
                    <StatusPill
                      status={item.status}
                      label={item.status_label || connectionLabel(item.status)}
                    />
                  </div>
                ))}
            </div>
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
