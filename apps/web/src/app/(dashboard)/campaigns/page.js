"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";

export default function CampaignsPage() {
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/v1/campaigns");
      setGroups(data.data || []);
    } catch (err) {
      setError(err.message || "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <DashboardShell
      title="Campaigns"
      description="Content grouped by objective. Publishing still requires human approval."
    >
      {loading ? <Skeleton className="h-28" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && groups.length === 0 ? (
        <EmptyState title="No campaign content" description="Create content items to organize by objective." />
      ) : null}
      {!loading && groups.length > 0 ? (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.objective} className="surface-card p-5">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-2xl capitalize">{group.objective}</h2>
                <Badge tone="neutral">{group.count}</Badge>
              </div>
              <ul className="mt-3 space-y-2">
                {(group.items || []).map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-sm">
                    <span>{item.title}</span>
                    <span className="flex gap-2">
                      <Badge tone="brand">{item.channel || "—"}</Badge>
                      <Badge tone="neutral">{item.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
}
