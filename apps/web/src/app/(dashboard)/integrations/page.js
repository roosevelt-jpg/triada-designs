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
      setDraftStatus(`Draft created (${result.source || "wordpress"}): ${result.id}`);
    } catch (err) {
      setDraftStatus(err.message);
    }
  }

  return (
    <DashboardShell
      title="Integrations"
      description="WordPress, Zoho, Meta, Shopify, and messaging channels. Local seed mode runs without credentials; never shown as healthy without tokens."
      actions={
        <div className="flex flex-wrap gap-2">
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
              Channels
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
            <Badge tone="brand">Mode: {health?.mode || "local"}</Badge>
            <Button size="sm" variant="secondary" onClick={load}>
              Re-check health
            </Button>
          </div>

          {health?.meta ? (
            <section className="surface-card overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <h2 className="ops-section-title">Meta messaging</h2>
                  <p className="mt-1 text-sm text-muted">
                    Facebook, Instagram, and WhatsApp managed from Triada after one-time Meta
                    Developer setup.
                  </p>
                </div>
                <Link href="/integrations/meta">
                  <Button size="sm" variant="secondary">
                    Open Meta hub
                  </Button>
                </Link>
              </div>
              <div className="grid gap-0 md:grid-cols-3 md:divide-x md:divide-line">
                {["facebook", "instagram", "whatsapp"].map((key) => {
                  const ch = health.meta.channels?.[key];
                  return (
                    <div key={key} className="border-t border-line px-5 py-4 md:border-t-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium capitalize text-ink">{key}</p>
                        <Badge
                          tone={
                            ch?.health?.status === "healthy"
                              ? "success"
                              : ch?.health?.status === "error"
                                ? "danger"
                                : "neutral"
                          }
                        >
                          {ch?.status || ch?.health?.status || "—"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-muted">
                        {ch?.health?.message}
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
                    CMS knowledge source and draft publishing path via REST API.
                  </p>
                </div>
                <Badge
                  tone={
                    health?.wordpress?.status === "healthy"
                      ? "success"
                      : health?.wordpress?.status === "seeded" ||
                          health?.wordpress?.status === "local"
                        ? "neutral"
                        : "danger"
                  }
                >
                  {health?.wordpress?.status}
                </Badge>
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
                  <h2 className="ops-section-title">Zoho CRM</h2>
                  <p className="mt-1 text-sm text-muted">
                    Contact and lead upsert with OAuth refresh-token support.
                  </p>
                </div>
                <Badge
                  tone={
                    health?.zoho?.status === "healthy"
                      ? "success"
                      : health?.zoho?.status === "seeded" || health?.zoho?.status === "local"
                        ? "neutral"
                        : "danger"
                  }
                >
                  {health?.zoho?.status}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-muted">{health?.zoho?.message}</p>
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
            </div>
            <div className="divide-y divide-line">
              {integrations.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 px-5 py-3.5 transition-colors duration-150 hover:bg-stone/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-ink">{item.display_name}</p>
                    <p className="text-sm capitalize text-muted">{item.provider}</p>
                  </div>
                  <Badge
                    tone={
                      item.status === "connected"
                        ? "success"
                        : item.status === "seeded" || item.status === "local"
                          ? "neutral"
                          : item.status === "error"
                            ? "danger"
                            : "neutral"
                    }
                  >
                    {item.status}
                  </Badge>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
