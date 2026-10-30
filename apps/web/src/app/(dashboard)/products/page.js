"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { CurrencySelect } from "@/components/ui/CurrencySelect";
import { Input } from "@/components/ui/Input";
import { MediaUploadField } from "@/components/ui/MediaUploadField";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import { productPhotoUrl } from "@/lib/commerce/product-specs";
import { formatCurrency } from "@/lib/formatters";
import { DEFAULT_CURRENCY } from "@/lib/locale/preferred-currency";

const EMPTY_FORM = {
  title: "",
  sku: "",
  description: "",
  price: "",
  compare_at_price: "",
  currency: DEFAULT_CURRENCY,
  product_url: "https://triada-designs.com/",
  photo_url: "",
  category: "Jewellery",
  collection: "",
  metal: "",
  weight_grams: "",
  stone: "",
  size: "",
  barcode: "",
  inventory_quantity: "",
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

function metaString(item, key) {
  const meta = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const specs = meta.specs && typeof meta.specs === "object" ? meta.specs : {};
  const raw = specs[key] ?? meta[key];
  return raw != null && String(raw).trim() ? String(raw) : "";
}

function metaNumber(item, key) {
  const s = metaString(item, key);
  return s;
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
      compare_at_price: metaNumber(item, "compare_at_price"),
      currency: item.currency || DEFAULT_CURRENCY,
      product_url: item.product_url || "https://triada-designs.com/",
      photo_url: productPhotoUrl(item) || "",
      category: metaString(item, "category") || "Jewellery",
      collection: metaString(item, "collection"),
      metal: metaString(item, "metal"),
      weight_grams: metaNumber(item, "weight_grams"),
      stone: metaString(item, "stone"),
      size: metaString(item, "size"),
      barcode: metaString(item, "barcode"),
      inventory_quantity: metaNumber(item, "inventory_quantity"),
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

    const priorMeta = editingId
      ? items.find((row) => row.id === editingId)?.metadata || {}
      : {};
    const priorSpecs =
      priorMeta.specs && typeof priorMeta.specs === "object"
        ? { ...priorMeta.specs }
        : {};

    const specs = {
      ...priorSpecs,
      category: form.category.trim() || "Jewellery",
      collection: form.collection.trim() || null,
      metal: form.metal.trim() || null,
      weight_grams:
        form.weight_grams === "" ? null : Number(form.weight_grams),
      stone: form.stone.trim() || null,
      size: form.size.trim() || null,
      barcode: form.barcode.trim() || null,
      inventory_quantity:
        form.inventory_quantity === "" ? null : Number(form.inventory_quantity),
      compare_at_price:
        form.compare_at_price === "" ? null : Number(form.compare_at_price),
      photo_url: form.photo_url.trim() || null,
    };

    const payload = {
      title: form.title.trim(),
      sku: form.sku.trim() || null,
      description: form.description.trim(),
      price: form.price === "" ? null : Number(form.price),
      currency: form.currency || DEFAULT_CURRENCY,
      product_url: form.product_url.trim() || "https://triada-designs.com/",
      availability_status: form.availability_status,
      approved_claims: form.approved_claims,
      published_status: form.publish ? "published" : "draft",
      publish: Boolean(form.publish),
      channels: ["all"],
      metadata: {
        ...priorMeta,
        ...specs,
        specs,
        photo_url: specs.photo_url,
      },
    };

    try {
      const path = editingId ? `/v1/products/${editingId}` : "/v1/products";
      const result = await apiFetch(path, {
        method: editingId ? "PUT" : "POST",
        body: payload,
      });
      const shopifyNote = result.shopify_auto_synced
        ? "Shopify synced"
        : result.channels?.shopify?.status === "awaiting_credentials"
          ? "Shopify waiting credentials"
          : null;
      setNotice(
        [
          editingId ? "Updated" : "Created",
          shopifyNote,
          result.summary || null,
        ]
          .filter(Boolean)
          .join(" · "),
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

  async function deleteOne(item) {
    if (!window.confirm(`Delete “${item.title}”?`)) return;
    setBusy(`del-${item.id}`);
    setError("");
    setNotice("");
    try {
      await apiFetch(`/v1/products/${item.id}`, { method: "DELETE" });
      setNotice("Product deleted.");
      await load();
    } catch (err) {
      setError(err.message || "Delete failed");
    } finally {
      setBusy("");
    }
  }

  const shopifyConnected = Boolean(channelStatus.shopify?.connected);
  const shopifyLabel =
    channelStatus.shopify?.status_label ||
    (shopifyConnected ? "Connected" : "Waiting credentials");
  const wordpressLabel =
    channelStatus.wordpress?.status_label ||
    (channelStatus.wordpress?.connected ? "Connected" : "Waiting credentials");

  return (
    <DashboardShell
      title="Products"
      description="Curate the Triada jewellery catalog. Connected Shopify stores receive price and specification updates on every save."
      actions={
        <Button size="sm" onClick={openCreate}>
          Add product
        </Button>
      }
    >
      <div className="mb-6 ops-actions">
        <Badge tone={shopifyConnected ? "success" : "warning"}>
          Shopify · {shopifyLabel}
        </Badge>
        <Badge tone={channelStatus.wordpress?.connected ? "success" : "warning"}>
          WordPress · {wordpressLabel}
        </Badge>
      </div>

      {shopifyConnected ? (
        <p className="mb-4 text-sm text-muted">
          Shopify syncs on every create and edit — prices, currency, SKU, and
          specs stay aligned with the store.
        </p>
      ) : null}

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
            <CurrencySelect
              name="currency"
              value={form.currency}
              onChange={(e) => updateField("currency", e.target.value)}
            />
            <Input
              label="Compare-at price"
              name="compare_at_price"
              type="number"
              step="0.01"
              min="0"
              value={form.compare_at_price}
              onChange={(e) => updateField("compare_at_price", e.target.value)}
              hint="Optional strikethrough price on Shopify."
            />
            <Input
              label="Barcode"
              name="barcode"
              value={form.barcode}
              onChange={(e) => updateField("barcode", e.target.value)}
            />
            <Input
              label="Category"
              name="category"
              value={form.category}
              onChange={(e) => updateField("category", e.target.value)}
              placeholder="Rings"
            />
            <Input
              label="Collection"
              name="collection"
              value={form.collection}
              onChange={(e) => updateField("collection", e.target.value)}
              placeholder="Salt & Spirit"
            />
            <Input
              label="Inventory qty"
              name="inventory_quantity"
              type="number"
              step="1"
              min="0"
              value={form.inventory_quantity}
              onChange={(e) => updateField("inventory_quantity", e.target.value)}
              placeholder="On-hand units"
            />
            <Input
              label="Metal"
              name="metal"
              value={form.metal}
              onChange={(e) => updateField("metal", e.target.value)}
              placeholder="18K gold"
            />
            <Input
              label="Weight (grams)"
              name="weight_grams"
              type="number"
              step="0.01"
              min="0"
              value={form.weight_grams}
              onChange={(e) => updateField("weight_grams", e.target.value)}
            />
            <Input
              label="Stone"
              name="stone"
              value={form.stone}
              onChange={(e) => updateField("stone", e.target.value)}
              placeholder="Diamond, emerald…"
            />
            <Input
              label="Size"
              name="size"
              value={form.size}
              onChange={(e) => updateField("size", e.target.value)}
              placeholder="EU 54 / US 7"
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
            <div className="md:col-span-2">
              <MediaUploadField
                label="Product photo"
                value={form.photo_url}
                mediaType="image"
                purpose="whatsapp"
                folder="products"
                onUploaded={(payload) =>
                  updateField("photo_url", payload.media_url || payload.url)
                }
                onClear={() => updateField("photo_url", "")}
              />
            </div>
          </div>
          <label className="block space-y-1.5">
            <span className="block text-[13px] font-medium text-ink">Description</span>
            <textarea
              name="description"
              rows={4}
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              className="ops-field px-3 py-2 text-ink focus:border-brown focus:outline-none"
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
            Publish live (active on Shopify
            {channelStatus.wordpress?.connected ? " + WordPress" : ""}
            {shopifyConnected
              ? "; drafts still sync to Shopify as draft)"
              : ")"}
          </label>
          <div className="ops-actions">
            <Button type="submit" disabled={busy === "save"}>
              {busy === "save"
                ? "Saving…"
                : editingId
                  ? shopifyConnected
                    ? "Save & sync Shopify"
                    : form.publish
                      ? "Save & publish"
                      : "Save draft"
                  : shopifyConnected
                    ? "Create & sync Shopify"
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
          title="No products yet"
          description="Add a catalog piece. When Shopify is Connected, saves sync automatically."
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const shopify = item.channel_sync?.shopify;
            const wordpress = item.channel_sync?.wordpress;
            const metal = metaString(item, "metal");
            const weight = metaString(item, "weight_grams");
            const photo = productPhotoUrl(item);
            return (
              <article key={item.id} className="surface-card flex flex-col overflow-hidden p-0">
                <div className="relative aspect-[4/3] w-full bg-[color-mix(in_srgb,var(--line)_55%,transparent)]">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Shopify CDN + local/relative + data URLs
                    <img
                      src={photo}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(event) => {
                        event.currentTarget.style.visibility = "hidden";
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs uppercase tracking-[0.14em] text-muted">
                      No photo
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5">
                <h3 className="font-display text-2xl text-ink">{item.title}</h3>
                {item.sku ? (
                  <p className="mt-1 text-xs uppercase tracking-wide text-muted">{item.sku}</p>
                ) : null}
                <p className="mt-2 flex-1 text-sm text-muted">{item.description}</p>
                {(metal || weight) && (
                  <p className="mt-2 text-xs text-muted">
                    {[metal, weight ? `${weight} g` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                <div className="mt-4 ops-actions">
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
                <div className="mt-3 ops-actions">
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
                  wordpress?.status === "error" ||
                  shopify?.status === "synced") ? (
                  <p className="mt-2 text-xs text-muted">
                    {[shopify?.message, wordpress?.message]
                      .filter(Boolean)
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .join(" · ")}
                  </p>
                ) : null}
                <div className="mt-4 ops-actions">
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
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy === `del-${item.id}`}
                    onClick={() => deleteOne(item)}
                  >
                    Delete
                  </Button>
                </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </DashboardShell>
  );
}
