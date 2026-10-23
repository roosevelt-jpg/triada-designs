"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { StatCard } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";

export default function OverviewPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/v1/dashboard");
      setData(response);
    } catch (err) {
      setError(err.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <DashboardShell
      title="Overview"
      description="Operational metrics derived from persisted workspace data."
    >
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : null}

      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error && data ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Open conversations" value={data.metrics.open_conversations} />
            <StatCard label="Unanswered" value={data.metrics.unanswered_conversations} />
            <StatCard label="Qualified leads" value={data.metrics.qualified_leads} />
            <StatCard
              label="Content awaiting approval"
              value={data.metrics.content_awaiting_approval}
            />
            <StatCard label="AI-mode conversations" value={data.metrics.ai_handled_conversations} />
            <StatCard label="Human escalations" value={data.metrics.human_escalations} />
            <StatCard label="Open tasks" value={data.metrics.open_tasks} />
            <StatCard label="Contacts" value={data.metrics.contacts} />
          </div>

          <section className="surface-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl">Channel health</h2>
              <Badge tone="brand">Persisted integrations</Badge>
            </div>
            <div className="divide-y divide-line">
              {data.channel_health.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium capitalize">{item.display_name}</p>
                    <p className="text-sm text-muted">
                      Last check: {formatDateTime(item.last_health_check_at)}
                    </p>
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
