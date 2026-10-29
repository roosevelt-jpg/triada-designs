"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { CurrencySelect } from "@/components/ui/CurrencySelect";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { DEFAULT_CURRENCY } from "@/lib/locale/preferred-currency";

const emptyForm = {
  id: "",
  document_type: "invoice",
  number: "",
  order_id: "",
  customer_name: "",
  customer_email: "",
  currency: DEFAULT_CURRENCY,
  total: "",
  status: "issued",
  issued_at: "",
  greeting: "",
  prepared_for: "",
  line_items_text: "",
  notes: "",
};

function invoiceToForm(inv) {
  return {
    id: inv.id || "",
    document_type: inv.type || inv.document_type || "invoice",
    number: inv.invoice_number || inv.number || "",
    order_id: inv.order_id || "",
    customer_name: inv.customer_name || "",
    customer_email: inv.customer_email || "",
    currency: inv.currency || DEFAULT_CURRENCY,
    total: inv.total != null ? String(inv.total) : "",
    status: inv.status || "issued",
    issued_at: inv.issued_at ? String(inv.issued_at).slice(0, 16) : "",
    greeting: inv.greeting_override || "",
    prepared_for: inv.prepared_for || "",
    line_items_text:
      inv.line_items_text ||
      (Array.isArray(inv.line_items)
        ? inv.line_items
            .map((row) => `${row.title || "Item"} | ${row.sku || ""} | ${row.qty ?? 1} | ${row.price ?? 0}`)
            .join("\n")
        : ""),
    notes: inv.notes || "",
  };
}

function formPayload(form) {
  return {
    document_type: form.document_type,
    number: form.number,
    order_id: form.order_id || null,
    customer_name: form.customer_name,
    customer_email: form.customer_email,
    currency: form.currency || DEFAULT_CURRENCY,
    total: form.total === "" ? undefined : Number(form.total),
    status: form.status,
    issued_at: form.issued_at ? new Date(form.issued_at).toISOString() : undefined,
    greeting: form.greeting,
    prepared_for: form.prepared_for,
    line_items_text: form.line_items_text,
    notes: form.notes,
  };
}

export default function InvoiceEditorPage() {
  const [invoices, setInvoices] = useState([]);
  const [storage, setStorage] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewGreeting, setPreviewGreeting] = useState("");

  const load = useCallback(async (opts = {}) => {
    const selectFirst = Boolean(opts.selectFirst);
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/v1/jewellery-ops/invoices");
      const rows = data.data || [];
      setInvoices(rows);
      setStorage(data.storage || "");
      if (selectFirst && rows[0]) {
        const next = invoiceToForm(rows[0]);
        setForm(next);
        setPreviewHtml(rows[0].html || "");
        setPreviewGreeting(rows[0].greeting || "");
      }
    } catch (err) {
      setError(err.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load({ selectFirst: true });
  }, [load]);

  const editingLabel = useMemo(() => {
    if (!form.id) return "New invoice";
    return form.number || form.id;
  }, [form.id, form.number]);

  function selectInvoice(inv) {
    const next = invoiceToForm(inv);
    setForm(next);
    setPreviewHtml(inv.html || "");
    setPreviewGreeting(inv.greeting || "");
    setNotice("");
    setError("");
  }

  function startNew() {
    setForm({
      ...emptyForm,
      issued_at: new Date().toISOString().slice(0, 16),
      number: `INV-TD-${Date.now().toString(36).toUpperCase()}`,
      line_items_text: "Aura Signet Ring | TD-RING-AURA-01 | 1 | 890",
      total: "890",
      status: "issued",
    });
    setPreviewHtml("");
    setPreviewGreeting("");
    setNotice("Editing a new invoice — fill every content field in plain text, then Save.");
  }

  async function refreshPreview(e) {
    if (e) e.preventDefault();
    setBusy("preview");
    setError("");
    try {
      const result = await apiFetch("/v1/jewellery-ops/invoices/preview", {
        method: "POST",
        body: formPayload(form),
      });
      setPreviewHtml(result.invoice?.html || "");
      setPreviewGreeting(result.invoice?.greeting || "");
    } catch (err) {
      setError(err.message || "Preview failed");
    } finally {
      setBusy("");
    }
  }

  async function saveInvoice(e) {
    e.preventDefault();
    setBusy("save");
    setNotice("");
    setError("");
    try {
      const payload = formPayload(form);
      if (!payload.number) {
        setError("Invoice number is required.");
        setBusy("");
        return;
      }
      let result;
      if (form.id) {
        result = await apiFetch(`/v1/jewellery-ops/invoices/${form.id}`, {
          method: "PUT",
          body: payload,
        });
      } else {
        result = await apiFetch("/v1/jewellery-ops/invoices", {
          method: "POST",
          body: payload,
        });
      }
      const inv = result.invoice;
      setNotice(`Saved ${inv?.invoice_number || payload.number}. Logo header, warm greeting, and address footer stay branded.`);
      if (inv) {
        setForm(invoiceToForm(inv));
        setPreviewHtml(inv.html || "");
        setPreviewGreeting(inv.greeting || "");
      }
      await load({ selectFirst: false });
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setBusy("");
    }
  }

  async function removeInvoice(id) {
    if (!id) return;
    setBusy(id);
    setError("");
    try {
      await apiFetch(`/v1/jewellery-ops/invoices/${id}`, { method: "DELETE" });
      setNotice("Invoice removed.");
      if (form.id === id) {
        setForm(emptyForm);
        setPreviewHtml("");
        setPreviewGreeting("");
      }
      await load({ selectFirst: false });
    } catch (err) {
      setError(err.message || "Delete failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <DashboardShell
      title="Invoice editor"
      description="Edit every invoice content field in plain text. Logo header, address footer, and warm greetings stay aligned in the branded preview."
      actions={
        <div className="ops-actions">
          <Link href="/orders">
            <Button variant="secondary" size="sm">
              Back to orders
            </Button>
          </Link>
          <Button size="sm" variant="secondary" onClick={startNew} disabled={Boolean(busy)}>
            New invoice
          </Button>
        </div>
      }
    >
      {loading ? <Skeleton className="h-32" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}

      {!loading ? (
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <section className="surface-card space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="ops-section-title">Content fields</h2>
                  <p className="mt-1 text-sm text-muted">
                    Editing <span className="text-ink">{editingLabel}</span>
                    {storage ? ` · ${storage}` : ""}
                  </p>
                </div>
                <Badge>{form.document_type === "receipt" ? "Receipt" : "Invoice"}</Badge>
              </div>

              <form className="space-y-3" onSubmit={saveInvoice}>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-[13px] font-medium text-ink">Document type</span>
                  <select
                    className="ops-field h-11 px-3"
                    value={form.document_type}
                    onChange={(e) => setForm((f) => ({ ...f, document_type: e.target.value }))}
                  >
                    <option value="invoice">Invoice</option>
                    <option value="receipt">Receipt</option>
                  </select>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Number"
                    value={form.number}
                    onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                    required
                  />
                  <Input
                    label="Status"
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Issued at"
                    type="datetime-local"
                    value={form.issued_at}
                    onChange={(e) => setForm((f) => ({ ...f, issued_at: e.target.value }))}
                  />
                  <Input
                    label="Order id"
                    value={form.order_id}
                    onChange={(e) => setForm((f) => ({ ...f, order_id: e.target.value }))}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Customer name"
                    value={form.customer_name}
                    onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
                  />
                  <Input
                    label="Customer email"
                    type="email"
                    value={form.customer_email}
                    onChange={(e) => setForm((f) => ({ ...f, customer_email: e.target.value }))}
                  />
                </div>

                <label className="block space-y-1.5">
                  <span className="block text-[13px] font-medium text-ink">
                    Warm greeting (plain text)
                  </span>
                  <textarea
                    className="ops-field min-h-[72px] px-3 py-2"
                    value={form.greeting}
                    onChange={(e) => setForm((f) => ({ ...f, greeting: e.target.value }))}
                    placeholder="Leave blank to use Triada warm greeting"
                  />
                  <span className="block text-sm text-muted">
                    Blank keeps the branded warm greeting. Layout stays the same either way.
                  </span>
                </label>

                <label className="block space-y-1.5">
                  <span className="block text-[13px] font-medium text-ink">
                    Prepared-for line (plain text)
                  </span>
                  <textarea
                    className="ops-field min-h-[56px] px-3 py-2"
                    value={form.prepared_for}
                    onChange={(e) => setForm((f) => ({ ...f, prepared_for: e.target.value }))}
                    placeholder="Leave blank for “Prepared for {customer}”"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="block text-[13px] font-medium text-ink">
                    Line items (plain text)
                  </span>
                  <textarea
                    className="ops-field min-h-[120px] px-3 py-2 font-mono"
                    value={form.line_items_text}
                    onChange={(e) => setForm((f) => ({ ...f, line_items_text: e.target.value }))}
                    placeholder={"title | sku | qty | price\nAura Signet Ring | TD-RING-AURA-01 | 1 | 1450"}
                  />
                  <span className="block text-sm text-muted">
                    One item per line: title | sku | qty | price
                  </span>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <CurrencySelect
                    name="currency"
                    value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                  />
                  <Input
                    label="Total"
                    type="number"
                    step="0.01"
                    value={form.total}
                    onChange={(e) => setForm((f) => ({ ...f, total: e.target.value }))}
                    hint="Blank totals from line items"
                  />
                </div>

                <label className="block space-y-1.5">
                  <span className="block text-[13px] font-medium text-ink">Notes (plain text)</span>
                  <textarea
                    className="ops-field min-h-[88px] px-3 py-2"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </label>

                <div className="pt-1 ops-actions">
                  <Button type="submit" size="sm" disabled={Boolean(busy)}>
                    {busy === "save" ? "Saving…" : "Save invoice"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={refreshPreview}
                    disabled={Boolean(busy)}
                  >
                    {busy === "preview" ? "Previewing…" : "Refresh preview"}
                  </Button>
                </div>
              </form>
            </section>

            <section className="surface-card overflow-hidden">
              <div className="border-b border-line px-5 py-3.5">
                <h2 className="ops-section-title">Saved invoices</h2>
              </div>
              <div className="divide-y divide-line">
                {invoices.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted">No invoices yet — create one with the form above.</p>
                ) : null}
                {invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
                  >
                    <button
                      type="button"
                      className="text-left"
                      onClick={() => selectInvoice(inv)}
                    >
                      <p className="font-medium text-ink">{inv.invoice_number || inv.id}</p>
                      <p className="text-sm text-muted">
                        {inv.customer_name || "Client"} · {inv.total} {inv.currency}
                      </p>
                    </button>
                    <div className="flex items-center gap-2">
                      <Badge>{inv.status}</Badge>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy === inv.id}
                        onClick={() => removeInvoice(inv.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="surface-card overflow-hidden">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="ops-section-title">Branded preview</h2>
              <p className="mt-1 text-sm text-muted">
                Logo header + warm greeting + Timisoara address footer are fixed brand chrome.
              </p>
              {previewGreeting ? (
                <p className="mt-2 text-sm text-brown-dark">{previewGreeting}</p>
              ) : null}
            </div>
            {previewHtml ? (
              <iframe
                title="Invoice branded preview"
                srcDoc={previewHtml}
                className="h-[min(80vh,920px)] w-full bg-white"
              />
            ) : (
              <div className="px-5 py-10">
                <EmptyState
                  title="No preview yet"
                  description="Save or refresh preview to see the branded invoice sheet."
                />
              </div>
            )}
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
