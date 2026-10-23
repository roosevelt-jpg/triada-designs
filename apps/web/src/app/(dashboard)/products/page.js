"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { formatCurrency } from "@/lib/formatters";

export default function ProductsPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/v1/products");
      setItems(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <DashboardShell
      title="Products"
      description="Local catalog synchronized with Shopify when authorized. Snapshots are labeled as such."
    >
      {loading ? <Skeleton className="h-64" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="No products" description="Sync Shopify or add approved catalog records." />
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <article key={item.id} className="surface-card p-5">
              <h3 className="font-display text-2xl">{item.title}</h3>
              <p className="mt-2 text-sm text-muted">{item.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge tone="brand">
                  {formatCurrency(item.price, item.currency || "USD")}
                </Badge>
                <Badge tone="info">{item.availability_status}</Badge>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
}
