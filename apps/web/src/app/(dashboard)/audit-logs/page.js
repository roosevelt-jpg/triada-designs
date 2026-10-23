"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/v1/audit-logs");
      setLogs(data.data || []);
    } catch (err) {
      setError(err.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <DashboardShell
      title="Audit logs"
      description="Recent workspace actions including takeovers, Meta connect, and settings changes."
    >
      {loading ? <Skeleton className="h-32" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && logs.length === 0 ? (
        <EmptyState title="No audit events yet" description="Actions will appear as the team operates the workspace." />
      ) : null}
      {!loading && logs.length > 0 ? (
        <div className="surface-card divide-y divide-line overflow-hidden">
          {logs.map((log) => (
            <div key={log.id} className="px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand">{log.action}</Badge>
                <span className="text-sm text-muted">{formatDateTime(log.created_at)}</span>
              </div>
              <p className="mt-1 text-sm">
                {log.actor_type}:{log.actor_id || "—"} → {log.target_type || "—"} {log.target_id || ""}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
}
