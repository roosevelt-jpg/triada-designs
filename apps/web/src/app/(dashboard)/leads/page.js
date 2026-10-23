"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { formatCurrency, formatStage } from "@/lib/formatters";

export default function LeadsPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/v1/leads");
      setItems(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function syncZoho(leadId) {
    setSyncing(leadId);
    try {
      await apiFetch(`/v1/leads/${leadId}/sync-zoho`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(null);
    }
  }

  return (
    <DashboardShell
      title="Leads"
      description="Default pipeline stages with Zoho CRM upsert path (local seed until credentials are set)."
    >
      {loading ? <Skeleton className="h-64" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="No leads yet" description="Qualified conversations create leads here." />
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((lead) => (
            <article key={lead.id} className="surface-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-2xl">
                    {lead.contact?.name || "Unnamed lead"}
                  </h3>
                  <p className="text-sm text-muted">{lead.contact?.email || "—"}</p>
                </div>
                <Badge tone="brand">{formatStage(lead.stage)}</Badge>
              </div>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Score</dt>
                  <dd className="tabular-nums font-medium">{lead.score}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Estimated value</dt>
                  <dd className="tabular-nums">
                    {formatCurrency(lead.estimated_value, lead.currency || "USD")}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Channel</dt>
                  <dd className="capitalize">{lead.source_channel || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Zoho ID</dt>
                  <dd className="truncate text-muted">{lead.external_crm_id || "Not synced"}</dd>
                </div>
              </dl>
              <Button
                className="mt-4 w-full"
                variant="secondary"
                disabled={syncing === lead.id}
                onClick={() => syncZoho(lead.id)}
              >
                {syncing === lead.id ? "Syncing…" : "Sync to Zoho"}
              </Button>
            </article>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
}
