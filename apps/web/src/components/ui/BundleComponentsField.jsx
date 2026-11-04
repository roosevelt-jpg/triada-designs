"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  filterBundleComponentCandidates,
  sumBundleComponentPrices,
} from "@/lib/commerce/product-bundles";
import { formatCurrency } from "@/lib/formatters";
import { DEFAULT_CURRENCY } from "@/lib/locale/preferred-currency";

/**
 * Pick existing catalog pieces as jewellery-set components.
 * @param {{
 *   components: Array<{
 *     product_id: string,
 *     title: string,
 *     price: number | null,
 *     currency: string | null,
 *     qty: number,
 *   }>,
 *   catalog: Array<Record<string, unknown>>,
 *   catalogLoading?: boolean,
 *   excludeId?: string | null,
 *   currency?: string,
 *   onChange: (next: Array<{
 *     product_id: string,
 *     title: string,
 *     price: number | null,
 *     currency: string | null,
 *     qty: number,
 *   }>) => void,
 * }} props
 */
export function BundleComponentsField({
  components,
  catalog,
  catalogLoading = false,
  excludeId = null,
  currency = DEFAULT_CURRENCY,
  onChange,
}) {
  const [q, setQ] = useState("");
  const selected = Array.isArray(components) ? components : [];
  const selectedIds = useMemo(
    () => new Set(selected.map((c) => c.product_id)),
    [selected],
  );

  const candidates = useMemo(() => {
    return filterBundleComponentCandidates(catalog, { excludeId, q }).filter(
      (row) => !selectedIds.has(String(row.id)),
    );
  }, [catalog, excludeId, q, selectedIds]);

  const sum = sumBundleComponentPrices(selected);

  function addProduct(item) {
    const id = String(item.id || "");
    if (!id || selectedIds.has(id)) return;
    const price =
      item.price != null && Number.isFinite(Number(item.price))
        ? Number(item.price)
        : null;
    onChange([
      ...selected,
      {
        product_id: id,
        title: String(item.title || id),
        price,
        currency: item.currency ? String(item.currency) : currency,
        qty: 1,
      },
    ]);
  }

  function removeProduct(productId) {
    onChange(selected.filter((c) => c.product_id !== productId));
  }

  function setQty(productId, qtyRaw) {
    const n = Number(qtyRaw);
    const qty = Number.isFinite(n) && n > 0 ? Math.min(99, Math.round(n)) : 1;
    onChange(
      selected.map((c) =>
        c.product_id === productId ? { ...c, qty } : c,
      ),
    );
  }

  return (
    <div className="space-y-4 md:col-span-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[13px] font-medium text-ink">Set pieces</p>
          <p className="mt-0.5 text-sm text-muted">
            Choose catalog pieces included in this set. Suggested compare-at
            follows their combined prices.
          </p>
        </div>
        {sum != null ? (
          <Badge tone="brand">
            Parts total · {formatCurrency(sum, currency)}
          </Badge>
        ) : null}
      </div>

      {selected.length ? (
        <ul className="divide-y divide-line border border-line">
          {selected.map((row) => (
            <li
              key={row.product_id}
              className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {row.title}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {row.price != null
                    ? formatCurrency(row.price, row.currency || currency)
                    : "No list price"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-muted">
                  Qty
                  <input
                    type="number"
                    min="1"
                    max="99"
                    step="1"
                    value={row.qty}
                    onChange={(e) => setQty(row.product_id, e.target.value)}
                    className="ops-field h-9 w-16 px-2 text-ink"
                    aria-label={`Quantity for ${row.title}`}
                  />
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeProduct(row.product_id)}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No pieces yet"
          description="Add rings, necklaces, or earrings from the catalog below to build this set."
        />
      )}

      <div className="space-y-3 border border-line bg-[color-mix(in_srgb,var(--line)_28%,transparent)] p-3 sm:p-4">
        <Input
          label="Find a piece"
          name="bundle_component_q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Title or SKU"
        />

        {catalogLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading pieces">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : null}

        {!catalogLoading && candidates.length === 0 ? (
          <EmptyState
            title={q.trim() ? "No matching pieces" : "No catalog pieces"}
            description={
              q.trim()
                ? `Nothing matches “${q.trim()}”. Try another title or SKU.`
                : "Add standalone jewellery products first, then include them here."
            }
          />
        ) : null}

        {!catalogLoading && candidates.length > 0 ? (
          <ul className="max-h-56 space-y-2 overflow-y-auto sm:max-h-72">
            {candidates.slice(0, 40).map((item) => {
              const price =
                item.price != null && Number.isFinite(Number(item.price))
                  ? Number(item.price)
                  : null;
              return (
                <li
                  key={String(item.id)}
                  className="flex flex-col gap-2 bg-[var(--surface-card)] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {String(item.title || "")}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {[
                        item.sku ? String(item.sku) : null,
                        price != null
                          ? formatCurrency(
                              price,
                              item.currency
                                ? String(item.currency)
                                : currency,
                            )
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={() => addProduct(item)}
                  >
                    Add
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
