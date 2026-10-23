"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { formatCurrency } from "@/lib/formatters";

export default function ServicesPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/v1/services");
      setItems(response.data || []);
    } catch (err) {
      setError(err.message || "Failed to load services");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <DashboardShell
      title="Services"
      description="Admin-managed service catalog with inquiry links and approved claims."
    >
      {loading ? <Skeleton className="h-64" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="No services" description="Add consultation or booking offerings here." />
      ) : null}
      {!loading && !error && items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <article key={item.id} className="surface-card p-5">
              <h3 className="font-display text-2xl">{item.name}</h3>
              <p className="mt-2 text-sm text-muted">{item.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge tone="brand">
                  {formatCurrency(item.price, item.currency || "USD")}
                </Badge>
                <Badge tone="neutral">{item.status}</Badge>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </DashboardShell>
  );
}
