"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
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
      description="WordPress and Zoho CRM are first-class. Local seed mode runs without credentials; switch INTEGRATION_MODE=live when ready. Disconnected providers stay disconnected."
    >
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="brand">Mode: {health?.mode || "local"}</Badge>
            <Button variant="secondary" onClick={load}>
              Re-check health
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl">WordPress</h2>
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
              <p className="mt-4 text-sm text-muted">{health?.wordpress?.message}</p>
              <ul className="mt-4 space-y-2">
                {(health?.wordpress_posts || []).map((post) => (
                  <li key={post.id} className="rounded-md border border-line px-3 py-2 text-sm">
                    <p className="font-medium">{post.title}</p>
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
                <Button type="submit">Create draft</Button>
                {draftStatus ? <p className="text-sm text-muted">{draftStatus}</p> : null}
              </form>
            </Card>

            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl">Zoho CRM</h2>
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
              <p className="mt-4 text-sm text-muted">{health?.zoho?.message}</p>
              <ul className="mt-4 space-y-2">
                {(health?.zoho_leads || []).map((lead) => (
                  <li key={lead.id} className="rounded-md border border-line px-3 py-2 text-sm">
                    <p className="font-medium">{lead.name}</p>
                    <p className="text-muted">
                      {lead.email || "—"} · {lead.stage || "—"}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <section className="surface-card p-5">
            <h2 className="font-display text-2xl">Registered integrations</h2>
            <div className="mt-4 divide-y divide-line">
              {integrations.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{item.display_name}</p>
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
