"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { AiInsightsPanel } from "@/components/dashboard/AiInsightsPanel";
import { StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { formatDateLong } from "@/lib/formatters";
import { nowDate, syncSystemTime } from "@/lib/system-time";

export default function OverviewPage() {
  const [data, setData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await syncSystemTime().catch(() => {});
      setToday(formatDateLong(nowDate()));
      const [dashboard, analyticsPayload] = await Promise.all([
        apiFetch("/v1/dashboard"),
        apiFetch("/v1/analytics").catch(() => null),
      ]);
      setData(dashboard);
      setAnalytics(analyticsPayload);
    } catch (err) {
      setError(err.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const insights =
    data?.ai_insights || analytics?.ai_insights || null;

  return (
    <DashboardShell
      title="Overview"
      description={`Workspace pulse${today ? ` · ${today}` : ""}`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/inbox">
            <Button size="sm">Open inbox</Button>
          </Link>
          <Link href="/analytics">
            <Button size="sm" variant="secondary">
              Full analytics
            </Button>
          </Link>
        </div>
      }
    >
      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : null}

      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error && data ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              className="fade-rise"
              label="Open conversations"
              value={data.metrics.open_conversations}
            />
            <StatCard
              className="fade-rise"
              label="Unanswered"
              value={data.metrics.unanswered_conversations}
            />
            <StatCard
              className="fade-rise"
              label="Qualified leads"
              value={data.metrics.qualified_leads}
            />
            <StatCard
              className="fade-rise"
              label="Awaiting approval"
              value={data.metrics.content_awaiting_approval}
            />
            <StatCard label="AI-mode conversations" value={data.metrics.ai_handled_conversations} />
            <StatCard label="Human escalations" value={data.metrics.human_escalations} />
            <StatCard label="Open tasks" value={data.metrics.open_tasks} />
            <StatCard label="Contacts" value={data.metrics.contacts} />
          </div>

          <AiInsightsPanel insights={insights} />
        </div>
      ) : null}
    </DashboardShell>
  );
}
