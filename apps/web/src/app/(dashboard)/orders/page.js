"use client";

import Link from "next/link";
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
          customer_name: "Client",
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
      const mfr = result.manufacturer_order?.manufacturer_order || result.manufacturer_order;
      const mode = mfr?.delivery_mode || "recorded";
      setCreateStatus(
        `Order ${result.order?.order_number} · invoice ${
          result.invoice?.invoice?.invoice_number || result.invoice?.number || "queued"
        } · manufacturer ${mfr?.external_ref || "—"} (${mode}${
          mfr?.status ? ` · ${mfr.status}` : ""
        })`,
      );
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
      description="Paid orders create branded invoices and send manufacture jobs to your primary manufacturer contact. Confirm placement on Manufacturer."
      actions={
        <Link href="/orders/invoices">
          <Button size="sm">Edit invoices</Button>
        </Link>
      }
    >
      {loading ? <Skeleton className="h-32" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="ops-section-title">Create paid order</h2>
              <p className="mt-1 text-sm text-muted">
                Triggers invoice PDF, manufacturer send to the primary contact, and WhatsApp lifecycle when opted in.
              </p>
              <Button className="mt-3" size="sm" onClick={createSample}>
                Seed order + invoice
              </Button>
              {createStatus ? <p className="mt-2 text-sm text-muted">{createStatus}</p> : null}
              <p className="mt-2 text-sm text-muted">
                <Link href="/manufacturer" className="underline underline-offset-2">
                  Open manufacturer board
                </Link>{" "}
                to confirm placement.
              </p>
            </Card>
            <Card>
              <h2 className="ops-section-title">Where is my order?</h2>
              <form className="mt-3 space-y-3" onSubmit={whereIs}>
                <Input label="Order # / email / phone" value={lookup} onChange={(e) => setLookup(e.target.value)} />
                <Button type="submit" size="sm">
                  Look up
                </Button>
              </form>
              {lookupResult ? (
                <p className="mt-3 text-sm text-ink">{lookupResult.reply || lookupResult.message}</p>
              ) : null}
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
                      {o.manufacturer_order_id ? " · manufacturer job linked" : ""}
                    </p>
                  </div>
                  <Badge>{o.lifecycle_status || o.status}</Badge>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-card overflow-hidden">
            <div className="border-b border-line px-5 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="ops-section-title">Invoices</h2>
                  <p className="mt-1 text-sm text-muted">
                    Branded with Triada logo header and warm greeting. Address and contact are editable plain text in the invoice editor.
                  </p>
                </div>
                <Link href="/orders/invoices">
                  <Button size="sm" variant="secondary">
                    Open invoice editor
                  </Button>
                </Link>
              </div>
            </div>
            <div className="divide-y divide-line">
              {invoices.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No invoices yet.</p> : null}
              {invoices.map((inv) => (
                <div key={inv.id} className="space-y-2 px-5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink">
                        {inv.invoice_number || inv.id}
                      </p>
                      <p className="text-sm text-muted">
                        {inv.type || "invoice"} · {inv.amount ?? inv.total} {inv.currency} · PDF{" "}
                        {inv.pdf_mode || "html_print"}
                        {inv.einvoice_provider ? ` · ${inv.einvoice_provider}:${inv.einvoice_status}` : ""}
                        {inv.branded ? " · branded" : ""}
                      </p>
                      {inv.greeting ? (
                        <p className="mt-1 text-sm text-brown-dark">{inv.greeting}</p>
                      ) : null}
                    </div>
                    <Badge>{inv.status}</Badge>
                  </div>
                  {inv.html ? (
                    <details className="rounded-md border border-line bg-stone/30 p-2">
                      <summary className="cursor-pointer text-sm text-muted">Preview branded invoice</summary>
                      <iframe
                        title={`Invoice ${inv.invoice_number || inv.id}`}
                        srcDoc={inv.html}
                        className="mt-2 h-80 w-full rounded-sm border border-line bg-white"
                      />
                    </details>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
