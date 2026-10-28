"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { AiInsightsPanel } from "@/components/dashboard/AiInsightsPanel";
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
        <div className="space-y-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-64" />
        </div>
      ) : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && data ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(metrics).map(([key, value]) => (
              <div key={key} className="surface-card p-4 fade-rise">
                <p className="text-xs uppercase tracking-wide text-muted">
                  {key.replaceAll("_", " ")}
                </p>
                <p className="mt-2 font-display text-3xl tabular-nums text-ink">{value}</p>
              </div>
            ))}
          </div>

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
