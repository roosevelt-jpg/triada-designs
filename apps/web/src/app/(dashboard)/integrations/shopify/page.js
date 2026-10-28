"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { connectionLabel } from "@/lib/integrations/brand-labels";

function tone(status) {
  if (status === "healthy" || status === "connected") return "success";
  if (status === "error") return "danger";
  if (status === "awaiting_credentials") return "warning";
  return "neutral";
}

export default function ShopifyIntegrationsPage() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/v1/integrations/shopify/status");
      setStatus(data);
    } catch (err) {
      setError(err.message || "Failed to load Shopify status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function syncNow(syncType) {
    setBusy(`sync-${syncType}`);
    setNotice("");
    try {
      const result = await apiFetch("/v1/integrations/shopify/sync", {
        method: "POST",
        body: { sync_type: syncType },
      });
      setStatus(result.status);
      setNotice(
        `Sync ${result.run?.status || "done"} (${result.run?.mode || "local"}): ${result.run?.records_upserted ?? 0} records.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const connected = Boolean(
    status?.connected || status?.status === "connected" || status?.has_access_token
  );
  const statusLabel =
    status?.status_label ||
    connectionLabel(status?.status, { hasCredentials: connected });

  return (
    <DashboardShell
      title="Shopify"
      description="Store sync status from host Admin API credentials on Vercel. Never shown as Connected without live tokens."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={load}>
            Re-check status
          </Button>
          <Link href="/integrations">
            <Button size="sm" variant="secondary">
              All integrations
            </Button>
          </Link>
        </div>
      }
    >
      {loading ? <Skeleton className="h-40" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}

      {!loading && status ? (
        <div className="space-y-6">
          <section className="surface-card overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="ops-section-title">Connection</h2>
                <p className="mt-1 text-sm text-muted">
                  {status.shop_domain || status.store || "jwtjzw-nu.myshopify.com"}
                </p>
              </div>
              <Badge tone={tone(status.status)}>
                {statusLabel}
              </Badge>
            </div>
            <div className="space-y-3 px-5 py-4">
              <p className="text-sm text-muted">
                {connected
                  ? status.summary || status.honesty || status.health?.message || "Shopify Admin API is connected."
                  : "Waiting credentials on Vercel."}
              </p>
              <p className="text-xs text-muted">
                Products in workspace: {status.product_count ?? 0}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="secondary" disabled={!!busy} onClick={() => syncNow("products")}>
                  {busy === "sync-products" ? "Syncing…" : "Sync products"}
                </Button>
                <Button variant="secondary" disabled={!!busy} onClick={() => syncNow("orders")}>
                  {busy === "sync-orders" ? "Syncing…" : "Sync orders"}
                </Button>
              </div>
            </div>
          </section>

          <Card className="p-5">
            <h2 className="ops-section-title">Recent sync runs</h2>
            <div className="mt-3 divide-y divide-line">
              {(status.recent_sync_runs || []).length === 0 ? (
                <p className="text-sm text-muted">
                  No sync runs yet. Use Sync products to exercise the local simulator.
                </p>
              ) : (
                status.recent_sync_runs.map((run) => (
                  <div
                    key={run.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                  >
                    <span>
                      {run.sync_type} · {run.mode} · upserted {run.records_upserted}
                    </span>
                    <Badge tone={run.status === "completed" ? "success" : "warning"}>
                      {run.status}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      ) : null}
    </DashboardShell>
  );
}
