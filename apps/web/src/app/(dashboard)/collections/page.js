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
  handle: "",
  body_html: "",
  published: true,
  product_ids: "",
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

export default function CollectionsPage() {
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
      const response = await apiFetch("/v1/collections");
      setItems(response.data || []);
      setShopify(response.shopify || null);
    } catch (err) {
      setError(err.message || "Failed to load collections");
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
      handle: item.handle || "",
      body_html: item.body_html || "",
      published: item.published !== false,
      product_ids: Array.isArray(item.product_ids) ? item.product_ids.join(", ") : "",
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
      title: form.title.trim(),
      handle: form.handle.trim() || undefined,
      body_html: form.body_html.trim(),
      published: Boolean(form.published),
      product_ids: form.product_ids
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
    try {
      const path = editingId ? `/v1/collections/${editingId}` : "/v1/collections";
      const result = await apiFetch(path, {
        method: editingId ? "PUT" : "POST",
        body: payload,
      });
      setNotice(
        result.shopify_auto_synced
          ? editingId
            ? "Collection updated · Shopify synced."
            : "Collection created · Shopify synced."
          : editingId
            ? "Collection updated."
            : "Collection created.",
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
      await apiFetch(`/v1/collections/${item.id}`, { method: "DELETE" });
      setNotice("Collection deleted.");
      await load();
    } catch (err) {
      setError(err.message || "Delete failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <DashboardShell
      title="Collections"
      description="Product collections for the storefront. Saves sync to Shopify when Connected."
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
            Add collection
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
            {editingId ? "Edit collection" : "New collection"}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Title"
              name="title"
              required
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="Gold essentials"
            />
            <Input
              label="Handle"
              name="handle"
              value={form.handle}
              onChange={(e) => updateField("handle", e.target.value)}
              hint="Optional storefront URL handle."
            />
            <Input
              label="Product IDs"
              name="product_ids"
              value={form.product_ids}
              onChange={(e) => updateField("product_ids", e.target.value)}
              hint="Comma-separated product ids to include."
            />
            <label className="flex items-center gap-2 pt-7 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => updateField("published", e.target.checked)}
              />
              Published on Shopify
            </label>
          </div>
          <label className="block space-y-1.5">
            <span className="block text-[13px] font-medium text-ink">Description</span>
            <textarea
              name="body_html"
              rows={3}
              value={form.body_html}
              onChange={(e) => updateField("body_html", e.target.value)}
              className="ops-field px-3 py-2 text-ink focus:border-brown focus:outline-none"
              placeholder="Collection story for the storefront…"
            />
          </label>
          <div className="ops-actions">
            <Button type="submit" disabled={busy === "save"}>
              {busy === "save" ? "Saving…" : editingId ? "Save changes" : "Create collection"}
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
          title="No collections yet"
          description="Add a collection here or set Collection on a product."
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
                {item.handle ? (
                  <p className="mt-1 text-xs text-muted">/{item.handle}</p>
                ) : null}
                {item.body_html ? (
                  <p className="mt-2 flex-1 text-sm text-muted line-clamp-3">{item.body_html}</p>
                ) : null}
                <p className="mt-3 text-xs text-muted">
                  {(item.product_ids || []).length} linked products
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
