"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { formatCurrency } from "@/lib/formatters";

const EMPTY_FORM = {
  title: "",
  sku: "",
  description: "",
  price: "",
  currency: "AED",
  product_url: "https://triada-designs.com/",
  availability_status: "in_stock_snapshot",
  approved_claims: "",
  publish: true,
};

function channelTone(status) {
  if (status === "synced" || status === "connected") return "success";
  if (status === "error") return "danger";
  if (status === "awaiting_credentials" || status === "pending_publish") return "warning";
  return "neutral";
}

function channelLabel(status) {
  if (status === "synced") return "Synced";
  if (status === "awaiting_credentials") return "Waiting credentials";
  if (status === "pending_publish") return "Pending publish";
  if (status === "error") return "Error";
  return status || "—";
}

export default function ProductsPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [channelStatus, setChannelStatus] = useState({
    shopify: null,
    wordpress: null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/v1/products");
      setItems(response.data || []);
      setChannelStatus({
        shopify: response.shopify || null,
        wordpress: response.wordpress || null,
      });
    } catch (err) {
      setError(err.message || "Failed to load products");
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
      sku: item.sku || "",
      description: item.description || "",
      price: item.price != null ? String(item.price) : "",
      currency: item.currency || "AED",
      product_url: item.product_url || "https://triada-designs.com/",
      availability_status: item.availability_status || "in_stock_snapshot",
      approved_claims: Array.isArray(item.approved_claims)
        ? item.approved_claims.join(", ")
        : "",
      publish: item.published_status === "published",
    });
    setShowForm(true);
    setNotice("");
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
      sku: form.sku.trim() || null,
      description: form.description.trim(),
      price: form.price === "" ? null : Number(form.price),
      currency: form.currency || "AED",
      product_url: form.product_url.trim() || "https://triada-designs.com/",
      availability_status: form.availability_status,
      approved_claims: form.approved_claims,
      published_status: form.publish ? "published" : "draft",
      publish: Boolean(form.publish),
      channels: ["all"],
    };

    try {
      const path = editingId ? `/v1/products/${editingId}` : "/v1/products";
      const result = await apiFetch(path, {
        method: editingId ? "PUT" : "POST",
        body: payload,
      });
      setNotice(
        result.summary
          ? `${editingId ? "Updated" : "Created"} · ${result.summary}`
          : editingId
            ? "Product updated."
            : "Product created.",
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

  async function publishOne(item) {
    setBusy(`publish-${item.id}`);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch(`/v1/products/${item.id}/publish`, {
        method: "POST",
        body: { channels: ["all"] },
      });
      setNotice(result.summary || "Publish finished.");
      await load();
    } catch (err) {
      setError(err.message || "Publish failed");
    } finally {
      setBusy("");
    }
  }

  const shopifyLabel =
    channelStatus.shopify?.status_label ||
    (channelStatus.shopify?.connected ? "Connected" : "Waiting credentials");
  const wordpressLabel =
    channelStatus.wordpress?.status_label ||
    (channelStatus.wordpress?.connected ? "Connected" : "Waiting credentials");

  return (
    <DashboardShell
      title="Products"
      description="Create and edit the Triada catalog. Publish to Shopify and WordPress when Connected."
      actions={
        <Button size="sm" onClick={openCreate}>
          Add product
        </Button>
      }
    >
      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone={channelStatus.shopify?.connected ? "success" : "warning"}>
          Shopify · {shopifyLabel}
        </Badge>
        <Badge tone={channelStatus.wordpress?.connected ? "success" : "warning"}>
          WordPress · {wordpressLabel}
        </Badge>
      </div>

      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}
      {loading ? <Skeleton className="h-64" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {showForm ? (
        <form
          onSubmit={submitForm}
          className="mb-8 space-y-4 border-b border-line pb-8"
        >
          <h2 className="font-display text-2xl text-ink">
            {editingId ? "Edit product" : "New product"}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Title"
              name="title"
              required
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="The Priest Ring"
            />
            <Input
              label="SKU"
              name="sku"
              value={form.sku}
              onChange={(e) => updateField("sku", e.target.value)}
              placeholder="TD-RING-PRIEST-01"
            />
            <Input
              label="Price"
              name="price"
              type="number"
              step="0.01"
              min="0"
              value={form.price}
              onChange={(e) => updateField("price", e.target.value)}
            />
            <Input
              label="Currency"
              name="currency"
              value={form.currency}
              onChange={(e) => updateField("currency", e.target.value)}
            />
            <Input
              label="Product URL"
              name="product_url"
              value={form.product_url}
              onChange={(e) => updateField("product_url", e.target.value)}
            />
            <Input
              label="Approved claims (comma-separated)"
              name="approved_claims"
              value={form.approved_claims}
              onChange={(e) => updateField("approved_claims", e.target.value)}
              hint="Only verified materials and timing — never invent claims."
            />
          </div>
          <label className="block space-y-1.5">
            <span className="block text-[13px] font-medium text-ink">Description</span>
            <textarea
              name="description"
              rows={4}
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              className="w-full rounded-sm border border-line bg-white px-3 py-2 text-sm text-ink focus:border-brown focus:outline-none"
              placeholder="Materials, make time, collection notes…"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.publish}
              onChange={(e) => updateField("publish", e.target.checked)}
              className="h-4 w-4 accent-black"
            />
            Publish &amp; sync to Shopify + WordPress when credentials are present
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy === "save"}>
              {busy === "save"
                ? "Saving…"
                : editingId
                  ? form.publish
                    ? "Save & publish"
                    : "Save draft"
                  : form.publish
                    ? "Create & publish"
                    : "Create draft"}
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
          title="No products"
          description="Add a catalog piece, or sync from Shopify when Connected."
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const shopify = item.channel_sync?.shopify;
            const wordpress = item.channel_sync?.wordpress;
            return (
              <article key={item.id} className="surface-card flex flex-col p-5">
                <h3 className="font-display text-2xl text-ink">{item.title}</h3>
                {item.sku ? (
                  <p className="mt-1 text-xs uppercase tracking-wide text-muted">{item.sku}</p>
                ) : null}
                <p className="mt-2 flex-1 text-sm text-muted">{item.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge tone="brand">
                    {formatCurrency(item.price, item.currency || "USD")}
                  </Badge>
                  <Badge tone="info">{item.availability_status}</Badge>
                  <Badge
                    tone={
                      item.published_status === "published" ? "success" : "neutral"
                    }
                  >
                    {item.published_status}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone={channelTone(shopify?.status)}>
                    Shopify · {channelLabel(shopify?.status)}
                  </Badge>
                  <Badge tone={channelTone(wordpress?.status)}>
                    WordPress · {channelLabel(wordpress?.status)}
                  </Badge>
                </div>
                {(shopify?.message || wordpress?.message) &&
                (shopify?.status === "awaiting_credentials" ||
                  wordpress?.status === "awaiting_credentials" ||
                  shopify?.status === "error" ||
                  wordpress?.status === "error") ? (
                  <p className="mt-2 text-xs text-muted">
                    {[shopify?.message, wordpress?.message]
                      .filter(Boolean)
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .join(" · ")}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(item)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy === `publish-${item.id}`}
                    onClick={() => publishOne(item)}
                  >
                    {busy === `publish-${item.id}` ? "Publishing…" : "Publish"}
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
