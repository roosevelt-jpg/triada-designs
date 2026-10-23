"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";

export default function TeamPage() {
  const [members, setMembers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/v1/team");
      setMembers(data.data || []);
    } catch (err) {
      setError(err.message || "Failed to load team");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <DashboardShell title="Team" description="Workspace memberships and roles for Triada ops staff.">
      {loading ? <Skeleton className="h-28" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && members.length === 0 ? (
        <EmptyState title="No members" description="Invite staff after auth invite flows are enabled." />
      ) : null}
      {!loading && members.length > 0 ? (
        <div className="surface-card divide-y divide-line overflow-hidden">
          {members.map((member) => (
            <div key={member.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{member.user?.name}</p>
                <p className="text-sm text-muted">{member.user?.email}</p>
                <p className="text-xs text-muted">
                  Last login: {formatDateTime(member.user?.last_login_at) || "—"}
                </p>
              </div>
              <div className="flex gap-2">
                <Badge tone="brand">{member.role?.name || "Role"}</Badge>
                <Badge tone="neutral">{member.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
}
