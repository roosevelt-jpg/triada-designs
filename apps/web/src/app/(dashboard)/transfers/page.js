"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";

const EMPTY_FORM = {
  title: "",
  note: "",
  kind: "transfer",
  status: "draft",
  from_location: "",
  to_location: "",
  supplier: "",
  line_sku: "",
  line_title: "",
  line_qty: "1",
  line_inventory_item_id: "",
};

function syncTone(status) {
  if (status === "synced" || status === "connected") return "success";
  if (status === "error") return "danger";
  if (status === "awaiting_credentials" || status === "pending_publish") return "warning";
  return "neutral";
}

function syncLabel(status) {
  if (status === "synced") return "Synced";
  if (status === "awaiting_credentials") return "Waiting credentials";
  if (status === "pending_publish") return "Pending";
  if (status === "error") return "Error";
  return status || "—";
}

export default function TransfersPage() {
  const [items, setItems] = useState([]);
  const [shopify, setShopify] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/v1/transfers");
      setItems(response.data || []);
      setShopify(response.shopify || null);
    } catch (err) {
      setError(err.message || "Failed to load transfers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setNotice("");
  }

  function openEdit(item) {
    const line = Array.isArray(item.line_items) ? item.line_items[0] : null;
    setEditingId(item.id);
    setForm({
      title: item.title || "",
      note: item.note || "",
      kind: item.kind || "transfer",
      status: item.status || "draft",
      from_location: item.from_location || "",
      to_location: item.to_location || "",
      supplier: item.supplier || "",
      line_sku: line?.sku || "",
      line_title: line?.title || "",
      line_qty: line?.quantity != null ? String(line.quantity) : "1",
      line_inventory_item_id: line?.inventory_item_id || "",
    });
    setShowForm(true);
  }

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function submitForm(event) {
    event.preventDefault();
    setBusy("save");
    setError("");
    setNotice("");
    const lineItems = [];
    if (form.line_sku || form.line_title || form.line_inventory_item_id) {
      lineItems.push({
        sku: form.line_sku.trim() || null,
        title: form.line_title.trim() || form.title.trim(),
        quantity: Math.max(1, Number(form.line_qty) || 1),
        inventory_item_id: form.line_inventory_item_id.trim() || null,
      });
    }
    const payload = {
      title: form.title.trim(),
      note: form.note.trim(),
      kind: form.kind,
      status: form.status,
      from_location: form.from_location.trim() || null,
      to_location: form.to_location.trim() || null,
      supplier: form.supplier.trim() || null,
      line_items: lineItems,
    };
    try {
      const path = editingId ? `/v1/transfers/${editingId}` : "/v1/transfers";
      const result = await apiFetch(path, {
        method: editingId ? "PUT" : "POST",
        body: payload,
      });
      setNotice(
        result.shopify_auto_synced ? "Transfer synced to Shopify." : "Transfer saved.",
      );
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setBusy("");
    }
  }

  async function removeItem(item) {
    if (!item?.id) return;
    if (typeof window !== "undefined" && !window.confirm(`Delete “${item.title}”?`)) {
      return;
    }
    setBusy(`delete-${item.id}`);
    try {
      await apiFetch(`/v1/transfers/${item.id}`, { method: "DELETE" });
      setNotice("Transfer deleted.");
      await load();
    } catch (err) {
      setError(err.message || "Delete failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <DashboardShell
      title="Transfers / POs"
      description="Inventory transfers and purchase orders. Shopify syncs when Connected."
      actions={
        <div className="ops-actions">
          {shopify ? (
            <Badge tone={syncTone(shopify.status)}>
              Shopify · {shopify.label || syncLabel(shopify.status)}
            </Badge>
          ) : null}
          <Link href="/manufacturer">
            <Button size="sm" variant="secondary">
              Manufacturer
            </Button>
          </Link>
          <Link href="/integrations/shopify">
            <Button size="sm" variant="secondary">
              Shopify sync
            </Button>
          </Link>
          <Button size="sm" onClick={openCreate}>
            Add transfer
          </Button>
        </div>
      }
    >
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}
      {loading ? <Skeleton className="h-64" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {showForm ? (
        <form onSubmit={submitForm} className="mb-8 space-y-4 border-b border-line pb-8">
          <h2 className="font-display text-2xl text-ink">
            {editingId ? "Edit transfer" : "New transfer / PO"}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Title"
              name="title"
              required
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="Dubai warehouse restock"
            />
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium text-ink">Kind</span>
              <select
                name="kind"
                value={form.kind}
                onChange={(e) => updateField("kind", e.target.value)}
                className="ops-field h-10 w-full px-3 text-ink focus:border-brown focus:outline-none"
              >
                <option value="transfer">Inventory transfer</option>
                <option value="purchase_order">Purchase order</option>
              </select>
            </label>
            <Input
              label="From location"
              name="from_location"
              value={form.from_location}
              onChange={(e) => updateField("from_location", e.target.value)}
            />
            <Input
              label="To location"
              name="to_location"
              value={form.to_location}
              onChange={(e) => updateField("to_location", e.target.value)}
            />
            <Input
              label="Supplier"
              name="supplier"
              value={form.supplier}
              onChange={(e) => updateField("supplier", e.target.value)}
            />
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium text-ink">Status</span>
              <select
                name="status"
                value={form.status}
                onChange={(e) => updateField("status", e.target.value)}
                className="ops-field h-10 w-full px-3 text-ink focus:border-brown focus:outline-none"
              >
                <option value="draft">Draft</option>
                <option value="open">Open</option>
                <option value="in_transit">In transit</option>
                <option value="received">Received</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            <Input
              label="Line SKU"
              name="line_sku"
              value={form.line_sku}
              onChange={(e) => updateField("line_sku", e.target.value)}
            />
            <Input
              label="Line title"
              name="line_title"
              value={form.line_title}
              onChange={(e) => updateField("line_title", e.target.value)}
            />
            <Input
              label="Line qty"
              name="line_qty"
              type="number"
              min="1"
              value={form.line_qty}
              onChange={(e) => updateField("line_qty", e.target.value)}
            />
            <Input
              label="Inventory item ID"
              name="line_inventory_item_id"
              value={form.line_inventory_item_id}
              onChange={(e) => updateField("line_inventory_item_id", e.target.value)}
            />
          </div>
          <label className="block space-y-1.5">
            <span className="block text-[13px] font-medium text-ink">Note</span>
            <textarea
              name="note"
              rows={3}
              value={form.note}
              onChange={(e) => updateField("note", e.target.value)}
              className="ops-field px-3 py-2 text-ink focus:border-brown focus:outline-none"
            />
          </label>
          <div className="ops-actions">
            <Button type="submit" disabled={busy === "save"}>
              {busy === "save" ? "Saving…" : editingId ? "Save changes" : "Create transfer"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="No transfers yet"
          description="Create a transfer or purchase order to get started."
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => {
            const sync = item.shopify_sync || {};
            return (
              <article key={item.id} className="surface-card flex flex-col p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-display text-2xl text-ink">{item.title}</h3>
                  <Badge tone={syncTone(sync.status)}>{syncLabel(sync.status)}</Badge>
                </div>
                <div className="mt-2 ops-actions">
                  <Badge tone="brand">{item.kind === "purchase_order" ? "PO" : "Transfer"}</Badge>
                  <Badge tone="neutral">{item.status}</Badge>
                </div>
                {item.supplier ? (
                  <p className="mt-2 text-sm text-muted">Supplier · {item.supplier}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted">
                  {(item.line_items || []).length} line(s)
                  {sync.external_id ? ` · Shopify #${sync.external_id}` : ""}
                </p>
                <div className="mt-4 ops-actions">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(item)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy === `delete-${item.id}`}
                    onClick={() => removeItem(item)}
                  >
                    {busy === `delete-${item.id}` ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </DashboardShell>
  );
}
