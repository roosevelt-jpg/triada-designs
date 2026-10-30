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
  code: "",
  value_type: "percentage",
  value: "",
  status: "active",
  starts_at: "",
  ends_at: "",
  usage_limit: "",
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

export default function DiscountsPage() {
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
      const response = await apiFetch("/v1/discounts");
      setItems(response.data || []);
      setShopify(response.shopify || null);
    } catch (err) {
      setError(err.message || "Failed to load discounts");
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
    setEditingId(item.id);
    setForm({
      title: item.title || "",
      code: item.code || "",
      value_type: item.value_type || "percentage",
      value: item.value != null ? String(item.value) : "",
      status: item.status || "active",
      starts_at: item.starts_at ? String(item.starts_at).slice(0, 16) : "",
      ends_at: item.ends_at ? String(item.ends_at).slice(0, 16) : "",
      usage_limit: item.usage_limit != null ? String(item.usage_limit) : "",
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
    const payload = {
      title: form.title.trim() || form.code.trim(),
      code: form.code.trim(),
      value_type: form.value_type,
      value: Number(form.value) || 0,
      status: form.status,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      usage_limit: form.usage_limit === "" ? null : Number(form.usage_limit),
    };
    try {
      const path = editingId ? `/v1/discounts/${editingId}` : "/v1/discounts";
      const result = await apiFetch(path, {
        method: editingId ? "PUT" : "POST",
        body: payload,
      });
      const sync = result.shopify_discount || result.shopify_sync;
      setNotice(
        result.shopify_auto_synced
          ? `Discount ${result.code} synced to Shopify.`
          : `Saved ${result.code}${sync?.message ? ` · ${sync.message}` : ""}.`,
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
    if (typeof window !== "undefined" && !window.confirm(`Delete code ${item.code}?`)) {
      return;
    }
    setBusy(`delete-${item.id}`);
    try {
      await apiFetch(`/v1/discounts/${item.id}`, { method: "DELETE" });
      setNotice("Discount deleted.");
      await load();
    } catch (err) {
      setError(err.message || "Delete failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <DashboardShell
      title="Discounts"
      description="Price rules and discount codes. When Shopify is Connected, create/edit auto-upserts price_rules + codes."
      actions={
        <div className="ops-actions">
          {shopify ? (
            <Badge tone={syncTone(shopify.status)}>
              Shopify · {shopify.label || syncLabel(shopify.status)}
            </Badge>
          ) : null}
          <Link href="/integrations/shopify">
            <Button size="sm" variant="secondary">
              Shopify sync
            </Button>
          </Link>
          <Button size="sm" onClick={openCreate}>
            Add discount
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
            {editingId ? "Edit discount" : "New discount"}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Code"
              name="code"
              required
              value={form.code}
              onChange={(e) => updateField("code", e.target.value.toUpperCase())}
              placeholder="GOLD10"
            />
            <Input
              label="Title"
              name="title"
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="Gold essentials 10%"
            />
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium text-ink">Type</span>
              <select
                name="value_type"
                value={form.value_type}
                onChange={(e) => updateField("value_type", e.target.value)}
                className="ops-field h-10 w-full px-3 text-ink focus:border-brown focus:outline-none"
              >
                <option value="percentage">Percentage</option>
                <option value="fixed_amount">Fixed amount</option>
              </select>
            </label>
            <Input
              label="Value"
              name="value"
              type="number"
              step="0.01"
              min="0"
              required
              value={form.value}
              onChange={(e) => updateField("value", e.target.value)}
              hint={form.value_type === "percentage" ? "e.g. 10 for 10%" : "Amount off"}
            />
            <Input
              label="Starts at"
              name="starts_at"
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => updateField("starts_at", e.target.value)}
            />
            <Input
              label="Ends at"
              name="ends_at"
              type="datetime-local"
              value={form.ends_at}
              onChange={(e) => updateField("ends_at", e.target.value)}
            />
            <Input
              label="Usage limit"
              name="usage_limit"
              type="number"
              min="1"
              value={form.usage_limit}
              onChange={(e) => updateField("usage_limit", e.target.value)}
              hint="Leave blank for unlimited."
            />
            <label className="block space-y-1.5">
              <span className="block text-[13px] font-medium text-ink">Status</span>
              <select
                name="status"
                value={form.status}
                onChange={(e) => updateField("status", e.target.value)}
                className="ops-field h-10 w-full px-3 text-ink focus:border-brown focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>
          <div className="ops-actions">
            <Button type="submit" disabled={busy === "save"}>
              {busy === "save" ? "Saving…" : editingId ? "Save changes" : "Create discount"}
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
          title="No discounts yet"
          description="Create a code here — Shopify price rules sync automatically when Connected."
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => {
            const sync = item.shopify_sync || {};
            return (
              <article key={item.id} className="surface-card flex flex-col p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display text-2xl text-ink">{item.code}</h3>
                    <p className="text-sm text-muted">{item.title}</p>
                  </div>
                  <Badge tone={syncTone(sync.status)}>{syncLabel(sync.status)}</Badge>
                </div>
                <div className="mt-3 ops-actions">
                  <Badge tone="brand">
                    {item.value_type === "percentage"
                      ? `${item.value}% off`
                      : `${item.value} off`}
                  </Badge>
                  <Badge tone={item.status === "active" ? "success" : "neutral"}>
                    {item.status}
                  </Badge>
                </div>
                {sync.message ? (
                  <p className="mt-2 text-xs text-muted">{sync.message}</p>
                ) : null}
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
