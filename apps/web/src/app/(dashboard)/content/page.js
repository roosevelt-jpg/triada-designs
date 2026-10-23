"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";

export default function ContentPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/v1/content");
      setItems(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load content");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(id) {
    setBusyId(id);
    try {
      await apiFetch(`/v1/content/${id}/approve`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <DashboardShell
      title="Content studio"
      description="Drafts require human approval before any public publication."
    >
      {loading ? <Skeleton className="h-64" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="No content items" description="Generate or create a draft to begin review." />
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <article key={item.id} className="surface-card p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-2xl">{item.title}</h3>
                <Badge tone={item.status === "approved" ? "success" : "warning"}>
                  {item.status}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted">{item.body}</p>
              <p className="mt-3 text-xs uppercase tracking-wide text-muted">
                {item.channel} · version {item.approval_version ?? 0}
              </p>
              {item.status === "in_review" ? (
                <Button
                  className="mt-4"
                  disabled={busyId === item.id}
                  onClick={() => approve(item.id)}
                >
                  {busyId === item.id ? "Approving…" : "Approve (human)"}
                </Button>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
}
