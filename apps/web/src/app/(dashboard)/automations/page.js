"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";

function statusTone(status) {
  if (status === "active") return "success";
  if (status === "disabled") return "danger";
  return "warning";
}

function statusLabel(status) {
  if (status === "active") return "Live";
  if (status === "disabled") return "Offline";
  return "Draft";
}

export default function AutomationsPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/v1/automations");
      setItems(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load automations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleStatus(workflow) {
    setBusyId(workflow.id);
    setError("");
    try {
      const path =
        workflow.status === "active"
          ? `/v1/automations/${workflow.id}/deactivate`
          : `/v1/automations/${workflow.id}/activate`;
      await apiFetch(path, { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message || "Failed to update status");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <DashboardShell
      title="Workflows"
      description="Drag-and-drop jewellery sales workflows. Open the builder to edit, dry-run, and publish to live. Emergency pauses are enforced at runtime."
    >
      {loading ? <Skeleton className="h-64" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="No workflows yet"
          description="Create a workflow to get started."
        />
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((workflow) => (
            <article
              key={workflow.id}
              className="surface-card flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between md:p-5"
            >
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="ops-section-title">{workflow.name}</h3>
                  <Badge tone={statusTone(workflow.status)}>
                    {statusLabel(workflow.status)}
                  </Badge>
                </div>
                <p className="text-sm text-muted">
                  {workflow.description || "No description"}
                </p>
                <p className="text-xs text-muted">
                  Trigger · {workflow.trigger_type?.replaceAll("_", " ")} · v
                  {workflow.version} · {workflow.run_count ?? 0} live runs ·{" "}
                  {workflow.node_summary?.length ?? 0} nodes
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busyId === workflow.id}
                  onClick={() => toggleStatus(workflow)}
                >
                  {busyId === workflow.id
                    ? "Updating…"
                    : workflow.status === "active"
                      ? "Take offline"
                      : "Publish to live"}
                </Button>
                <Link
                  href={`/automations/${workflow.id}`}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-line bg-white px-3 text-sm font-medium text-ink transition-colors duration-150 hover:bg-stone"
                >
                  Open builder
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
}
