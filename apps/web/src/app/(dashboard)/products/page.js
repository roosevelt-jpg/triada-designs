"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { BundleComponentsField } from "@/components/ui/BundleComponentsField";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { CurrencySelect } from "@/components/ui/CurrencySelect";
import { Input } from "@/components/ui/Input";
import { ListSearch } from "@/components/ui/ListSearch";
import { ProductPhotosField } from "@/components/ui/ProductPhotosField";
import { ProductVariantsField } from "@/components/ui/ProductVariantsField";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api-client";
import {
  extractProductBundle,
  mergeBundleIntoMetadata,
  suggestBundleTitle,
  sumBundleComponentPrices,
} from "@/lib/commerce/product-bundles";
import {
  extractProductSpecs,
  isSalePrice,
  productPhotoUrls,
} from "@/lib/commerce/product-specs";
import {
  normalizeJewelleryColors,
} from "@/lib/commerce/jewellery-colors";
import {
  extractProductStockVariants,
  mergeStockVariantsIntoMetadata,
  optionListsFromVariants,
  sumVariantInventory,
} from "@/lib/commerce/product-variants";
import { formatCurrency } from "@/lib/formatters";
import { DEFAULT_CURRENCY } from "@/lib/locale/preferred-currency";

const EMPTY_FORM = {
  mode: /** @type {"single" | "bundle"} */ ("single"),
  title: "",
  sku: "",
  description: "",
  price: "",
  compare_at_price: "",
  currency: DEFAULT_CURRENCY,
  product_url: "https://triada-designs.com/",
  photo_urls: /** @type {string[]} */ ([]),
  category: "Jewellery",
  collection: "",
  metal: "",
  weight_grams: "",
  stone: "",
  size: "",
  barcode: "",
  inventory_quantity: "",
  size_options: "",
  /** @type {Array<{ name: string, hex: string }>} */
  color_options: [],
  /** @type {Array<{ size: string, color: string, color_hex?: string | null, sku: string | null, inventory_quantity: number | null }>} */
  stock_variants: [],
  availability_status: "in_stock_snapshot",
  approved_claims: "",
  publish: true,
  /** @type {Array<{ product_id: string, title: string, price: number | null, currency: string | null, qty: number }>} */
  components: [],
  metal_price_silver: "",
  metal_price_gold: "",
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

/** @param {{ photos: string[], title: string }} props */
function ProductCardGallery({ photos, title }) {
  const [index, setIndex] = useState(0);
  const safeIndex = photos.length ? Math.min(index, photos.length - 1) : 0;
  const photo = photos[safeIndex] || null;

  return (
    <div className="relative aspect-[4/3] w-full bg-[color-mix(in_srgb,var(--line)_55%,transparent)]">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- Shopify CDN + local/relative + data URLs
        <img
          src={photo}
          alt={title || ""}
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
      {photos.length > 1 ? (
        <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1.5">
          {photos.map((_, i) => (
            <button
              key={`dot-${i}`}
              type="button"
              aria-label={`Photo ${i + 1}`}
              className={`h-1.5 w-1.5 rounded-full transition ${
                i === safeIndex ? "bg-white" : "bg-white/45"
              }`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** @param {{ price: unknown, compareAt: unknown, currency: string }} props */
function SalePriceBadge({ price, compareAt, currency }) {
  const onSale = isSalePrice(price, compareAt);
  if (!onSale) {
    return (
      <Badge tone="brand">
        {formatCurrency(price, currency || "USD")}
      </Badge>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-baseline gap-2">
      <span className="text-sm font-medium text-danger line-through">
        {formatCurrency(compareAt, currency || "USD")}
      </span>
      <span className="text-sm font-semibold text-success">
        {formatCurrency(price, currency || "USD")}
      </span>
    </span>
  );
}

export default function ProductsPage() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [channelStatus, setChannelStatus] = useState({
    shopify: null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = q ? `?q=${encodeURIComponent(q)}` : "";
      const response = await apiFetch(`/v1/products${query}`);
      setItems(response.data || []);
      setChannelStatus({
        shopify: response.shopify || null,
      });
    } catch (err) {
      setError(err.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [q]);

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
    const bundle = extractProductBundle(item);
    const metalVariants = bundle?.metal_variants || [];
    const silver =
      metalVariants.find((v) => /silver/i.test(v.metal))?.price ?? null;
    const gold =
      metalVariants.find((v) => /gold/i.test(v.metal))?.price ?? null;
    const stockVariants = extractProductStockVariants(item);
    const lists = optionListsFromVariants(stockVariants);
    const meta =
      item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
    const colorSwatches = normalizeJewelleryColors(
      meta.color_swatches ||
        meta.specs?.color_swatches ||
        stockVariants.map((v) => ({
          name: v.color,
          hex: v.color_hex || "#C4A882",
        })),
    );
    setEditingId(item.id);
    setForm({
      mode: bundle?.is_bundle ? "bundle" : "single",
      title: item.title || "",
      sku: item.sku || "",
      description: item.description || "",
      price: item.price != null ? String(item.price) : "",
      compare_at_price: metaNumber(item, "compare_at_price"),
      currency: item.currency || DEFAULT_CURRENCY,
      product_url: item.product_url || "https://triada-designs.com/",
      photo_urls: productPhotoUrls(item),
      category: metaString(item, "category") || "Jewellery",
      collection: metaString(item, "collection"),
      metal: metaString(item, "metal"),
      weight_grams: metaNumber(item, "weight_grams"),
      stone: metaString(item, "stone"),
      size: metaString(item, "size"),
      barcode: metaString(item, "barcode"),
      inventory_quantity: metaNumber(item, "inventory_quantity"),
      size_options: lists.sizes.join(", "),
      color_options: colorSwatches.length
        ? colorSwatches
        : normalizeJewelleryColors(lists.colors),
      stock_variants: stockVariants,
      availability_status: item.availability_status || "in_stock_snapshot",
      approved_claims: Array.isArray(item.approved_claims)
        ? item.approved_claims.join(", ")
        : "",
      publish: item.published_status === "published",
      components: bundle?.components || [],
      metal_price_silver: silver != null ? String(silver) : "",
      metal_price_gold: gold != null ? String(gold) : "",
    });
    setShowForm(true);
    setNotice("");
  }

  /** Bundle with no sell price yet — save as local draft; do not sync blank price. */
  function isBundleUnpriced(state = form) {
    if (state.mode !== "bundle") return false;
    if (String(state.price ?? "").trim() !== "") return false;
    if (String(state.metal_price_silver ?? "").trim() !== "") return false;
    if (String(state.metal_price_gold ?? "").trim() !== "") return false;
    return true;
  }

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  const componentsSum = useMemo(
    () => sumBundleComponentPrices(form.components),
    [form.components],
  );

  function setBundleMode(nextMode) {
    setForm((prev) => {
      const mode = nextMode === "bundle" ? "bundle" : "single";
      if (mode === "bundle") {
        const suggested =
          !prev.title.trim() && prev.components.length
            ? suggestBundleTitle(prev.components)
            : prev.title;
        const compare =
          prev.compare_at_price === "" && componentsSum != null
            ? String(componentsSum)
            : prev.compare_at_price;
        return {
          ...prev,
          mode,
          title: suggested,
          compare_at_price: compare,
          category: prev.category === "Jewellery" ? "Bundles" : prev.category,
          collection: prev.collection || "Bundles",
          publish:
            prev.price === "" &&
            prev.metal_price_silver === "" &&
            prev.metal_price_gold === ""
              ? false
              : prev.publish,
        };
      }
      return { ...prev, mode, components: [] };
    });
  }

  function onComponentsChange(next) {
    setForm((prev) => {
      const sum = sumBundleComponentPrices(next);
      const autoTitle =
        !prev.title.trim() ||
        prev.title.trim() === suggestBundleTitle(prev.components);
      return {
        ...prev,
        components: next,
        title: autoTitle ? suggestBundleTitle(next) || prev.title : prev.title,
        compare_at_price:
          sum != null &&
          (prev.compare_at_price === "" ||
            prev.compare_at_price === String(componentsSum ?? ""))
            ? String(sum)
            : prev.compare_at_price,
      };
    });
  }

  async function submitForm(event) {
    event.preventDefault();
    setBusy("save");
    setError("");
    setNotice("");

    const isBundle = form.mode === "bundle";
    const metalVariants = [];
    if (isBundle && form.metal_price_silver !== "") {
      metalVariants.push({
        metal: "Silver",
        price: Number(form.metal_price_silver),
      });
    }
    if (isBundle && form.metal_price_gold !== "") {
      metalVariants.push({
        metal: "Gold",
        price: Number(form.metal_price_gold),
      });
    }
    const priceTba = isBundleUnpriced(form);

    if (isBundle && !form.components.length) {
      setBusy("");
      setError("Add at least one catalog piece to this set.");
      return;
    }

    const priorMeta = editingId
      ? items.find((row) => row.id === editingId)?.metadata || {}
      : {};
    const priorSpecs =
      priorMeta.specs && typeof priorMeta.specs === "object"
        ? { ...priorMeta.specs }
        : {};

    const photo_urls = Array.isArray(form.photo_urls)
      ? form.photo_urls.filter((u) => String(u || "").trim())
      : [];
    const photo_url = photo_urls[0] || null;

    const suggestedCompare =
      form.compare_at_price === "" && componentsSum != null
        ? componentsSum
        : form.compare_at_price === ""
          ? null
          : Number(form.compare_at_price);

    const metalPrices = metalVariants
      .map((v) => v.price)
      .filter((n) => n != null && Number.isFinite(n));
    const primaryMetalPrice =
      metalPrices.length === 1
        ? metalPrices[0]
        : metalPrices.length > 1
          ? Math.min(...metalPrices)
          : null;
    const resolvedPrice = priceTba
      ? null
      : form.price !== ""
        ? Number(form.price)
        : primaryMetalPrice;

    const resolvedMetal =
      form.metal.trim() ||
      (metalVariants.length === 1 ? metalVariants[0].metal : null) ||
      null;

    const variantTotal = !isBundle
      ? sumVariantInventory(form.stock_variants)
      : null;
    const specs = {
      ...priorSpecs,
      category: form.category.trim() || (isBundle ? "Bundles" : "Jewellery"),
      collection: form.collection.trim() || null,
      metal: resolvedMetal,
      weight_grams:
        form.weight_grams === "" ? null : Number(form.weight_grams),
      stone: form.stone.trim() || null,
      size: form.size.trim() || null,
      barcode: form.barcode.trim() || null,
      inventory_quantity:
        variantTotal != null
          ? variantTotal
          : form.inventory_quantity === ""
            ? null
            : Number(form.inventory_quantity),
      compare_at_price: suggestedCompare,
      photo_url,
      photo_urls,
    };

    let metadata = {
      ...priorMeta,
      ...specs,
      specs,
      photo_url,
      photo_urls,
    };
    metadata = mergeBundleIntoMetadata(
      metadata,
      isBundle
        ? {
            is_bundle: true,
            components: form.components,
            metal_variants: metalVariants,
            price_tba: priceTba,
          }
        : { is_bundle: false },
    );
    if (!isBundle) {
      const colorNames = normalizeJewelleryColors(form.color_options).map(
        (c) => c.name,
      );
      const variantsWithHex = (form.stock_variants || []).map((row) => {
        const match = normalizeJewelleryColors(form.color_options).find(
          (c) => c.name.toLowerCase() === String(row.color || "").toLowerCase(),
        );
        return {
          ...row,
          color_hex: match?.hex || row.color_hex || null,
        };
      });
      metadata = mergeStockVariantsIntoMetadata(metadata, {
        sizes: form.size_options,
        colors: colorNames,
        variants: variantsWithHex,
      });
    }

    const payload = {
      title: form.title.trim(),
      sku: form.sku.trim() || null,
      description: form.description.trim(),
      price: resolvedPrice,
      currency: form.currency || DEFAULT_CURRENCY,
      product_url: form.product_url.trim() || "https://triada-designs.com/",
      availability_status: form.availability_status,
      approved_claims: form.approved_claims,
      published_status: form.publish && !priceTba ? "published" : "draft",
      publish: Boolean(form.publish) && !priceTba,
      channels: ["all"],
      metadata,
    };

    try {
      const path = editingId ? `/v1/products/${editingId}` : "/v1/products";
      const result = await apiFetch(path, {
        method: editingId ? "PUT" : "POST",
        body: payload,
      });
      const assignedSku =
        !editingId && result.product?.sku && !form.sku.trim()
          ? `SKU ${result.product.sku}`
          : null;
      const shopifyNote = result.shopify_auto_synced
        ? "Shopify synced"
        : result.channels?.shopify?.status === "awaiting_credentials"
          ? "Shopify waiting credentials"
          : priceTba
            ? "Draft held until priced"
            : null;
      setNotice(
        [
          editingId ? "Updated" : "Created",
          assignedSku,
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

  return (
    <DashboardShell
      title="Products"
      description="Curate the Triada jewellery catalog. Connected Shopify stores receive price and specification updates on every save."
      actions={
        <div className="flex w-full max-w-3xl flex-col gap-2 sm:flex-row sm:items-end">
          <div className="w-full max-w-xs">
            <ListSearch
              name="q"
              value={q}
              onChange={setQ}
              placeholder="Title, SKU, description"
            />
          </div>
          <Button size="sm" onClick={openCreate}>
            Add product
          </Button>
        </div>
      }
    >
      <div className="mb-6 ops-actions">
        <Badge tone={shopifyConnected ? "success" : "warning"}>
          Shopify · {shopifyLabel}
        </Badge>
      </div>

      {shopifyConnected ? (
        <p className="mb-4 text-sm text-muted">
          Shopify syncs on every create and edit — photos, prices, compare-at,
          SKU, and specs stay aligned with the store.
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="font-display text-2xl text-ink">
              {editingId
                ? form.mode === "bundle"
                  ? "Edit set"
                  : "Edit product"
                : form.mode === "bundle"
                  ? "New set"
                  : "New product"}
            </h2>
            <div
              className="inline-flex w-full overflow-hidden border border-line sm:w-auto"
              role="group"
              aria-label="Product mode"
            >
              <button
                type="button"
                className={`flex-1 px-3.5 py-2 text-[13px] font-medium transition sm:flex-none ${
                  form.mode === "single"
                    ? "bg-black text-gold"
                    : "bg-white text-ink hover:bg-stone"
                }`}
                onClick={() => setBundleMode("single")}
              >
                Single piece
              </button>
              <button
                type="button"
                className={`flex-1 px-3.5 py-2 text-[13px] font-medium transition sm:flex-none ${
                  form.mode === "bundle"
                    ? "bg-black text-gold"
                    : "bg-white text-ink hover:bg-stone"
                }`}
                onClick={() => setBundleMode("bundle")}
              >
                Bundle
              </button>
            </div>
          </div>

          {form.mode === "bundle" ? (
            <BundleComponentsField
              components={form.components}
              catalog={items}
              catalogLoading={loading}
              excludeId={editingId}
              currency={form.currency}
              onChange={onComponentsChange}
            />
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Title"
              name="title"
              required
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder={
                form.mode === "bundle"
                  ? "Priest Ring Men + Ephod necklace"
                  : "The Priest Ring"
              }
            />
            <Input
              label="SKU"
              name="sku"
              value={form.sku}
              onChange={(e) => updateField("sku", e.target.value)}
              placeholder="Auto on create if blank"
              hint={
                editingId
                  ? "Leave as-is to keep the assigned SKU."
                  : "Leave blank to auto-assign TD-{TITLE}-{code}."
              }
            />
            <Input
              label={form.mode === "bundle" ? "Bundle price" : "Price"}
              name="price"
              type="number"
              step="0.01"
              min="0"
              value={form.price}
              onChange={(e) => updateField("price", e.target.value)}
              hint={
                form.mode === "bundle"
                  ? "Sell price for the set — usually below the parts total. Leave blank to save as draft."
                  : undefined
              }
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
              hint={
                form.mode === "bundle"
                  ? componentsSum != null
                    ? `Suggested from parts: ${formatCurrency(componentsSum, form.currency)}. Higher than price shows as a sale.`
                    : "Usually the combined list price of the pieces."
                  : "When higher than price: red strikethrough + green sale price on cards and Shopify."
              }
            />
            {form.mode === "bundle" ? (
              <>
                <Input
                  label="Silver price"
                  name="metal_price_silver"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.metal_price_silver}
                  onChange={(e) =>
                    updateField("metal_price_silver", e.target.value)
                  }
                  placeholder="589"
                  hint="Optional. With gold, syncs as Metal variants on one Shopify product."
                />
                <Input
                  label="Gold price"
                  name="metal_price_gold"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.metal_price_gold}
                  onChange={(e) =>
                    updateField("metal_price_gold", e.target.value)
                  }
                  placeholder="3699"
                  hint="Optional. Leave both blank to use Bundle price only."
                />
              </>
            ) : null}
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
              placeholder={form.mode === "bundle" ? "Bundles" : "Rings"}
            />
            <Input
              label="Collection"
              name="collection"
              value={form.collection}
              onChange={(e) => updateField("collection", e.target.value)}
              placeholder={form.mode === "bundle" ? "Bundles" : "Salt & Spirit"}
            />
            {form.mode === "bundle" || form.stock_variants.length === 0 ? (
              <Input
                label="Inventory qty"
                name="inventory_quantity"
                type="number"
                step="1"
                min="0"
                value={form.inventory_quantity}
                onChange={(e) => updateField("inventory_quantity", e.target.value)}
                placeholder="On-hand units"
                hint={
                  form.mode === "single"
                    ? "Use Sizes and Colors below when stock differs by size or color."
                    : undefined
                }
              />
            ) : null}
            <Input
              label="Metal"
              name="metal"
              value={form.metal}
              onChange={(e) => updateField("metal", e.target.value)}
              placeholder="18K gold"
              hint={
                form.mode === "bundle"
                  ? "Optional label when not using silver/gold variant prices."
                  : undefined
              }
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
            {form.mode === "bundle" ? (
              <Input
                label="Size"
                name="size"
                value={form.size}
                onChange={(e) => updateField("size", e.target.value)}
                placeholder="EU 54 / US 7"
              />
            ) : null}
            {form.mode === "single" ? (
              <ProductVariantsField
                sizesText={form.size_options}
                colors={form.color_options}
                variants={form.stock_variants}
                onSizesChange={(text) => updateField("size_options", text)}
                onColorsChange={(next) => updateField("color_options", next)}
                onVariantsChange={(rows) => updateField("stock_variants", rows)}
              />
            ) : null}
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
              <ProductPhotosField
                label="Product photos"
                values={form.photo_urls}
                folder="products"
                onChange={(urls) => updateField("photo_urls", urls)}
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
              placeholder={
                form.mode === "bundle"
                  ? "Sold as a set — list included pieces and finish notes…"
                  : "Materials, make time, collection notes…"
              }
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.publish && !isBundleUnpriced()}
              disabled={isBundleUnpriced()}
              onChange={(e) => updateField("publish", e.target.checked)}
              className="h-4 w-4 accent-black"
            />
            Publish live (active on Shopify
            {shopifyConnected
              ? isBundleUnpriced()
                ? "; add a price before syncing)"
                : "; drafts still sync to Shopify as draft)"
              : ")"}
          </label>
          <div className="ops-actions">
            <Button type="submit" disabled={busy === "save"}>
              {busy === "save"
                ? "Saving…"
                : editingId
                  ? shopifyConnected && !isBundleUnpriced()
                    ? "Save & sync Shopify"
                    : form.publish && !isBundleUnpriced()
                      ? "Save & publish"
                      : "Save draft"
                  : shopifyConnected && !isBundleUnpriced()
                    ? "Create & sync Shopify"
                    : form.publish && !isBundleUnpriced()
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
          title={q.trim() ? "No matching products" : "No products yet"}
          description={
            q.trim()
              ? `Nothing matches “${q.trim()}”. Try another title, SKU, or description.`
              : "Add a catalog piece. When Shopify is Connected, saves sync automatically."
          }
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const shopify = item.channel_sync?.shopify;
            const metal = metaString(item, "metal");
            const weight = metaString(item, "weight_grams");
            const photos = productPhotoUrls(item);
            const compareAt = extractProductSpecs(item).compare_at_price;
            const bundle = extractProductBundle(item);
            const pieceCount = bundle?.components?.length || 0;
            const displayPrice =
              item.price != null
                ? item.price
                : bundle?.metal_variants?.find((v) => v.price != null)?.price ??
                  null;
            return (
              <article key={item.id} className="surface-card flex flex-col overflow-hidden p-0">
                <ProductCardGallery
                  key={`${item.id}:${photos.length}:${photos[0] || ""}`}
                  photos={photos}
                  title={item.title || ""}
                />
                <div className="flex flex-1 flex-col p-5">
                <div className="flex flex-wrap items-start gap-2">
                  <h3 className="font-display text-2xl text-ink">{item.title}</h3>
                  {bundle?.is_bundle ? (
                    <Badge tone="brand">
                      {pieceCount ? `Set · ${pieceCount}` : "Set"}
                    </Badge>
                  ) : null}
                </div>
                {item.sku ? (
                  <p className="mt-1 text-xs uppercase tracking-wide text-muted">{item.sku}</p>
                ) : null}
                <p className="mt-2 flex-1 text-sm text-muted">{item.description}</p>
                {bundle?.components?.length ? (
                  <p className="mt-2 text-xs text-muted">
                    Includes{" "}
                    {bundle.components.map((c) => c.title).join(" + ")}
                  </p>
                ) : null}
                {(metal || weight) && (
                  <p className="mt-2 text-xs text-muted">
                    {[metal, weight ? `${weight} g` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                <div className="mt-4 ops-actions items-center">
                  {displayPrice != null ? (
                    <SalePriceBadge
                      price={displayPrice}
                      compareAt={compareAt}
                      currency={item.currency || "USD"}
                    />
                  ) : null}
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
                </div>
                {shopify?.message &&
                (shopify?.status === "awaiting_credentials" ||
                  shopify?.status === "error" ||
                  shopify?.status === "synced") ? (
                  <p className="mt-2 text-xs text-muted">{shopify.message}</p>
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
