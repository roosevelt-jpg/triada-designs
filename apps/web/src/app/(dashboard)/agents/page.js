"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";

export default function AgentsPage() {
  const [agents, setAgents] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/v1/agents");
      setAgents(data.data || []);
    } catch (err) {
      setError(err.message || "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function togglePause(agent) {
    setBusy(agent.id);
    try {
      const updated = await apiFetch(`/v1/agents/${agent.id}`, {
        method: "PATCH",
        body: { paused: agent.status !== "paused" },
      });
      setAgents((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <DashboardShell
      title="AI agents"
      description="Configured agent roles for support, sales, and Meta messaging. Pause without deleting configuration."
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && agents.length === 0 ? (
        <EmptyState title="No agents configured" description="Seed or create agent configs to appear here." />
      ) : null}
      {!loading && agents.length > 0 ? (
        <div className="space-y-3">
          {agents.map((agent) => (
            <div key={agent.id} className="surface-card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-2xl">{agent.name}</h2>
                  <Badge tone={agent.status === "active" ? "success" : "warning"}>{agent.status}</Badge>
                  <Badge tone="neutral">{agent.role}</Badge>
                </div>
                <p className="mt-1 max-w-2xl text-sm text-muted">{agent.description}</p>
                <p className="mt-2 text-xs text-muted">
                  Channels: {(agent.config?.channels || []).join(", ") || "—"}
                </p>
              </div>
              <Button
                variant="secondary"
                disabled={busy === agent.id}
                onClick={() => togglePause(agent)}
              >
                {agent.status === "paused" ? "Resume" : "Pause"}
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
}
