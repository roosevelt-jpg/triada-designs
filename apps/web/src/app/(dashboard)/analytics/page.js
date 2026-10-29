"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { AiInsightsPanel } from "@/components/dashboard/AiInsightsPanel";
import { MetricCell } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch("/v1/analytics"));
    } catch (err) {
      setError(err.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const metrics = data?.metrics || {};
  const metricEntries = Object.entries(metrics);

  return (
    <DashboardShell
      title="Analytics"
      description="Operational metrics for the workspace."
      actions={
        <Link href="/overview">
          <Button size="sm" variant="secondary">
            Back to overview
          </Button>
        </Link>
      }
    >
      {loading ? (
        <div className="space-y-5">
          <Skeleton className="h-24" />
          <Skeleton className="h-72" />
        </div>
      ) : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && data ? (
        <div className="space-y-8">
          {metricEntries.length ? (
            <section aria-labelledby="analytics-metrics-heading">
              <h2 id="analytics-metrics-heading" className="ops-section-kicker mb-3">
                Metrics
              </h2>
              <div className="ops-metric-strip">
                {metricEntries.map(([key, value]) => (
                  <MetricCell
                    key={key}
                    label={key.replaceAll("_", " ")}
                    value={value}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <AiInsightsPanel insights={data.ai_insights} />

          {(data.notes || []).map((note) => (
            <p key={note} className="text-xs text-muted">
              {note}
            </p>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
}
