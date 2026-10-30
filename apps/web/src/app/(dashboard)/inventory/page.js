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

export default function InventoryPage() {
  const [items, setItems] = useState([]);
  const [shopify, setShopify] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [drafts, setDrafts] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/v1/inventory");
      const rows = response.data || [];
      setItems(rows);
      setShopify(response.shopify || null);
      const next = {};
      for (const row of rows) {
        next[row.id] =
          row.inventory_quantity == null ? "" : String(row.inventory_quantity);
      }
      setDrafts(next);
    } catch (err) {
      setError(err.message || "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveQty(row) {
    const raw = drafts[row.id];
    if (raw === "" || raw == null) {
      setError("Enter an inventory quantity.");
      return;
    }
    const qty = Math.floor(Number(raw));
    if (!Number.isFinite(qty) || qty < 0) {
      setError("Quantity must be a non-negative number.");
      return;
    }
    setBusy(row.id);
    setError("");
    setNotice("");
    try {
      const result = await apiFetch("/v1/inventory", {
        method: "PUT",
        body: { product_id: row.id, inventory_quantity: qty },
      });
      const sync = result.shopify_inventory;
      setNotice(
        result.shopify_auto_synced
          ? `Inventory for “${row.title}” set to ${qty} on Shopify.`
          : `Saved qty ${qty}${sync?.message ? ` · ${sync.message}` : ""}.`,
      );
      await load();
    } catch (err) {
      setError(err.message || "Inventory update failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <DashboardShell
      title="Inventory"
      description="Set stock quantities per product. When Shopify is Connected, saves push inventory_levels/set."
      actions={
        <div className="ops-actions">
          {shopify ? (
            <Badge tone={syncTone(shopify.status)}>
              Shopify · {shopify.label || syncLabel(shopify.status)}
            </Badge>
          ) : null}
          <Link href="/products">
            <Button size="sm" variant="secondary">
              Products
            </Button>
          </Link>
          <Link href="/integrations/shopify">
            <Button size="sm" variant="secondary">
              Shopify sync
            </Button>
          </Link>
        </div>
      }
    >
      {notice ? <p className="mb-4 text-sm text-brown-dark">{notice}</p> : null}
      {loading ? <Skeleton className="h-64" /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="No products to stock"
          description="Add products first, then set inventory quantities here."
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="surface-card overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-line bg-stone/40 text-[13px] text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Shopify</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const invSync = row.shopify_inventory_sync || {};
                const channel = row.channel_sync || {};
                const status = invSync.status || channel.status;
                return (
                  <tr key={row.id} className="border-b border-line/70">
                    <td className="px-4 py-3 font-medium text-ink">{row.title}</td>
                    <td className="px-4 py-3 text-muted">{row.sku || "—"}</td>
                    <td className="px-4 py-3">
                      <Input
                        name={`qty-${row.id}`}
                        type="number"
                        min="0"
                        step="1"
                        value={drafts[row.id] ?? ""}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={syncTone(status)}>{syncLabel(status)}</Badge>
                      {row.shopify_product_id ? (
                        <p className="mt-1 text-xs text-muted">#{row.shopify_product_id}</p>
                      ) : (
                        <p className="mt-1 text-xs text-muted">Sync product first</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        disabled={busy === row.id}
                        onClick={() => saveQty(row)}
                      >
                        {busy === row.id ? "Saving…" : "Save & sync"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </DashboardShell>
  );
}
