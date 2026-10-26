"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lookup, setLookup] = useState("");
  const [lookupResult, setLookupResult] = useState(null);
  const [createStatus, setCreateStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [o, i] = await Promise.all([
        apiFetch("/v1/jewellery-ops/orders"),
        apiFetch("/v1/jewellery-ops/invoices"),
      ]);
      setOrders(o.data || []);
      setInvoices(i.data || []);
    } catch (err) {
      setError(err.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createSample(event) {
    event.preventDefault();
    setCreateStatus("");
    try {
      const result = await apiFetch("/v1/jewellery-ops/orders", {
        method: "POST",
        body: {
          lifecycle_status: "confirmed",
          total: 890,
          currency: "AED",
          whatsapp_opt_in: true,
          customer_email: "client@example.com",
          line_items: [
            {
              sku: "TD-RING-AURA-01",
              title: "Aura Signet Ring",
              size: "54",
              metal: "silver_gold_plate",
              price: 890,
              grams: 8,
            },
          ],
          paid: true,
        },
      });
      setCreateStatus(`Order ${result.order?.order_number} · invoice ${result.invoice?.invoice?.invoice_number || "queued"}`);
      load();
    } catch (err) {
      setCreateStatus(err.message);
    }
  }

  async function whereIs(event) {
    event.preventDefault();
    try {
      const result = await apiFetch("/v1/jewellery-ops/orders/where-is-my-order", {
        method: "POST",
        body: { query: lookup },
      });
      setLookupResult(result);
    } catch (err) {
      setLookupResult({ ok: false, reply: err.message });
    }
  }

  return (
    <DashboardShell
      title="Orders & invoices"
      description="WhatsApp order lifecycle (opt-in business only), where-is-my-order, automatic invoice + UAE e-invoicing path for B2B."
    >
      {loading ? <Skeleton className="h-32" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="ops-section-title">Create paid order (local)</h2>
              <p className="mt-1 text-sm text-muted">Triggers invoice PDF, manufacturer push, and WhatsApp lifecycle copy when opted in.</p>
              <Button className="mt-3" size="sm" onClick={createSample}>
                Seed order + invoice
              </Button>
              {createStatus ? <p className="mt-2 text-sm text-muted">{createStatus}</p> : null}
            </Card>
            <Card>
              <h2 className="ops-section-title">Where is my order?</h2>
              <form className="mt-3 space-y-3" onSubmit={whereIs}>
                <Input label="Order # / email / phone" value={lookup} onChange={(e) => setLookup(e.target.value)} />
                <Button type="submit" size="sm">
                  Look up
                </Button>
              </form>
              {lookupResult ? <p className="mt-3 text-sm text-ink">{lookupResult.reply}</p> : null}
            </Card>
          </div>

          <section className="surface-card overflow-hidden">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="ops-section-title">Orders</h2>
            </div>
            <div className="divide-y divide-line">
              {orders.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No orders yet.</p> : null}
              {orders.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <div>
                    <p className="font-medium text-ink">{o.order_number}</p>
                    <p className="text-sm text-muted">
                      {o.total} {o.currency} · profit {o.profit ?? "—"}
                    </p>
                  </div>
                  <Badge>{o.lifecycle_status}</Badge>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-card overflow-hidden">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="ops-section-title">Invoices</h2>
            </div>
            <div className="divide-y divide-line">
              {invoices.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No invoices yet.</p> : null}
              {invoices.map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <div>
                    <p className="font-medium text-ink">{inv.invoice_number}</p>
                    <p className="text-sm text-muted">
                      {inv.type} · {inv.amount} {inv.currency} · PDF {inv.pdf_mode}
                      {inv.einvoice_provider ? ` · ${inv.einvoice_provider}:${inv.einvoice_status}` : ""}
                    </p>
                  </div>
                  <Badge>{inv.status}</Badge>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
