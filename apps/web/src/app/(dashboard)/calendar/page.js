"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";

export default function CalendarPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/v1/calendar");
      setItems(data.data || []);
    } catch (err) {
      setError(err.message || "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <DashboardShell
      title="Content calendar"
      description="Scheduled content items awaiting human-approved publication. Automations never publish publicly."
    >
      {loading ? <Skeleton className="h-28" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="Nothing scheduled" description="Approve content and set a schedule to populate this view." />
      ) : null}
      {!loading && items.length > 0 ? (
        <div className="surface-card divide-y divide-line overflow-hidden">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-muted">{formatDateTime(item.scheduled_for)}</p>
              </div>
              <div className="flex gap-2">
                <Badge tone="brand">{item.channel || "channel"}</Badge>
                <Badge tone="neutral">{item.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
}
