"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { StatCard } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
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

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <DashboardShell
      title="Overview"
      description={`Workspace pulse · ${today}. Metrics come from persisted Triada records only.`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/inbox">
            <Button size="sm" variant="secondary">
              Open inbox
            </Button>
          </Link>
          <Link href="/automations">
            <Button size="sm" variant="secondary">
              Workflows
            </Button>
          </Link>
        </div>
      }
    >
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : null}

      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error && data ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Open conversations" value={data.metrics.open_conversations} />
            <StatCard label="Unanswered" value={data.metrics.unanswered_conversations} />
            <StatCard label="Qualified leads" value={data.metrics.qualified_leads} />
            <StatCard
              label="Awaiting approval"
              value={data.metrics.content_awaiting_approval}
            />
            <StatCard
              label="AI-mode conversations"
              value={data.metrics.ai_handled_conversations}
            />
            <StatCard label="Human escalations" value={data.metrics.human_escalations} />
            <StatCard label="Open tasks" value={data.metrics.open_tasks} />
            <StatCard label="Contacts" value={data.metrics.contacts} />
          </div>

          <section className="surface-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <h2 className="ops-section-title">Channel health</h2>
              <Badge tone="brand">Persisted integrations</Badge>
            </div>
            <div className="divide-y divide-line">
              {data.channel_health.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 px-5 py-3.5 transition-colors duration-150 hover:bg-stone/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium capitalize text-ink">{item.display_name}</p>
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
