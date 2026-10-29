"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";

export default function ManufacturerPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await apiFetch("/v1/jewellery-ops/manufacturer"));
    } catch (err) {
      setError(err.message || "Failed to load manufacturer");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <DashboardShell
      title="Manufacturer"
      description="Orders flow to the manufacturer with piece, size, metal, engraving. Metal $/g, making charge, cost/price/profit, low-stock alerts."
      actions={
        <Button size="sm" variant="secondary" onClick={load}>
          Refresh
        </Button>
      }
    >
      {loading ? <Skeleton className="h-40" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && data ? (
        <div className="space-y-5">
          {(data.low_stock || []).length ? (
            <div className="surface-card px-4 py-3 text-sm text-ink">
              Low stock alerts: {(data.low_stock || []).map((r) => r.display_name).join(", ")}
            </div>
          ) : null}

          <section className="surface-card overflow-hidden">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="ops-section-title">Materials</h2>
            </div>
            <div className="divide-y divide-line">
              {(data.materials || []).map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium text-ink">{m.display_name}</p>
                    <p className="text-muted">
                      Metal {m.metal_price_per_gram}/{m.unit} · making {m.making_charge_per_gram}/{m.unit} · stock{" "}
                      {m.stock_grams ?? "—"}
                    </p>
                  </div>
                  <Badge>{m.material_key}</Badge>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-card overflow-hidden">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="ops-section-title">Manufacturer orders</h2>
            </div>
            <div className="divide-y divide-line">
              {(data.orders || []).length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted">No manufacturer orders yet — create a paid order first.</p>
              ) : null}
              {(data.orders || []).map((o) => (
                <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium text-ink">
                      {o.piece} · {o.size || "—"} · {o.metal || "—"}
                    </p>
                    <p className="text-muted">
                      Cost {o.cost} · sell {o.sell_price} · profit {o.profit} · engraving {o.engraving || "—"}
                    </p>
                  </div>
                  <Badge>{o.status}</Badge>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
