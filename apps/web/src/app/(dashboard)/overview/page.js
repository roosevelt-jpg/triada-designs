"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { AiInsightsPanel } from "@/components/dashboard/AiInsightsPanel";
import { MetricCell, StatCard } from "@/components/ui/Card";
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
      description={
        today
          ? `Atelier workspace · ${today}`
          : "Atelier workspace — conversations, leads, and content that need you"
      }
      actions={
        <>
          <Link href="/inbox">
            <Button size="sm">Open inbox</Button>
          </Link>
          <Link href="/analytics">
            <Button size="sm" variant="secondary">
              Analytics
            </Button>
          </Link>
        </>
      }
    >
      {loading ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-20" />
          <Skeleton className="h-72" />
        </div>
      ) : null}

      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error && data ? (
        <div className="space-y-9">
          <section aria-labelledby="overview-primary-metrics">
            <div className="mb-3">
              <h2 id="overview-primary-metrics" className="ops-section-kicker">
                Needs attention
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Open conversations"
                value={Number(data.metrics?.open_conversations) || 0}
              />
              <StatCard
                label="Unanswered"
                value={Number(data.metrics?.unanswered_conversations) || 0}
              />
              <StatCard
                label="Qualified leads"
                value={Number(data.metrics?.qualified_leads) || 0}
              />
              <StatCard
                label="Awaiting approval"
                value={Number(data.metrics?.content_awaiting_approval) || 0}
              />
            </div>
          </section>

          <section aria-labelledby="overview-secondary-metrics">
            <div className="mb-3">
              <h2 id="overview-secondary-metrics" className="ops-section-kicker">
                Workspace
              </h2>
            </div>
            <div className="ops-metric-strip">
              <MetricCell
                label="Handled by AI"
                value={Number(data.metrics?.ai_handled_conversations) || 0}
              />
              <MetricCell
                label="Escalations"
                value={Number(data.metrics?.human_escalations) || 0}
              />
              <MetricCell
                label="Open tasks"
                value={Number(data.metrics?.open_tasks) || 0}
              />
              <MetricCell
                label="Contacts"
                value={Number(data.metrics?.contacts) || 0}
              />
            </div>
          </section>

          <div className="ops-reveal-late">
            <AiInsightsPanel insights={insights} />
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
