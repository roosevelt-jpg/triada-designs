"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
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
  const byChannel = data?.conversations_by_channel || {};

  return (
    <DashboardShell
      title="Analytics"
      description="Operational metrics from persisted workspace data — not fabricated dashboards."
    >
      {loading ? <Skeleton className="h-40" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && data ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(metrics).map(([key, value]) => (
              <div key={key} className="surface-card p-4">
                <p className="text-xs uppercase tracking-wide text-muted">{key.replaceAll("_", " ")}</p>
                <p className="mt-2 font-display text-3xl">{value}</p>
              </div>
            ))}
          </div>
          <section className="surface-card p-5">
            <h2 className="font-display text-2xl">Conversations by channel</h2>
            <ul className="mt-3 space-y-2">
              {Object.keys(byChannel).length === 0 ? (
                <li className="text-sm text-muted">No conversations yet.</li>
              ) : (
                Object.entries(byChannel).map(([channel, total]) => (
                  <li key={channel} className="flex justify-between border-b border-line py-2 text-sm">
                    <span className="capitalize">{channel}</span>
                    <span>{total}</span>
                  </li>
                ))
              )}
            </ul>
            {(data.notes || []).map((note) => (
              <p key={note} className="mt-3 text-xs text-muted">
                {note}
              </p>
            ))}
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
