"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";

export default function KnowledgePage() {
  const [sources, setSources] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/v1/knowledge");
      setSources(data.data || []);
    } catch (err) {
      setError(err.message || "Failed to load knowledge");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <DashboardShell
      title="Knowledge"
      description="Approved FAQs and policies used for AI answers."
    >
      {loading ? <Skeleton className="h-32" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && sources.length === 0 ? (
        <EmptyState title="No knowledge sources" description="Add FAQs or approved policy text." />
      ) : null}
      {!loading && sources.length > 0 ? (
        <div className="divide-y divide-line surface-card overflow-hidden">
          {sources.map((source) => (
            <article key={source.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-medium">{source.title}</h2>
                <Badge tone="brand">{source.source_type}</Badge>
                <Badge tone="neutral">{source.status}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted">{source.body}</p>
              {(source.tags || []).length > 0 ? (
                <p className="mt-2 text-xs text-muted">Tags: {source.tags.join(", ")}</p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
}
