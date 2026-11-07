"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Pick catalogue pieces for a collection — titles only, no raw id plumbing.
 * @param {{
 *   productIds: string[],
 *   catalog: Array<Record<string, unknown>>,
 *   catalogLoading?: boolean,
 *   onChange: (ids: string[]) => void,
 * }} props
 */
export function CollectionProductsField({
  productIds,
  catalog,
  catalogLoading = false,
  onChange,
}) {
  const [q, setQ] = useState("");
  const selected = Array.isArray(productIds) ? productIds.map(String) : [];
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const byId = useMemo(() => {
    /** @type {Map<string, Record<string, unknown>>} */
    const map = new Map();
    for (const row of catalog || []) {
      if (row?.id != null) map.set(String(row.id), row);
    }
    return map;
  }, [catalog]);

  const candidates = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (catalog || [])
      .filter((row) => row?.id != null && !selectedSet.has(String(row.id)))
      .filter((row) => {
        if (!needle) return true;
        const title = String(row.title || "").toLowerCase();
        const sku = String(row.sku || "").toLowerCase();
        return title.includes(needle) || sku.includes(needle);
      })
      .slice(0, 12);
  }, [catalog, q, selectedSet]);

  function add(id) {
    const next = String(id);
    if (!next || selectedSet.has(next)) return;
    onChange([...selected, next]);
  }

  function remove(id) {
    onChange(selected.filter((x) => x !== String(id)));
  }

  return (
    <div className="md:col-span-2 space-y-3">
      <span className="block text-[13px] font-medium text-ink">Pieces in this collection</span>
      <p className="text-sm text-muted">
        Search and add products by name. Saves sync to Shopify when Connected.
      </p>

      {selected.length ? (
        <ul className="space-y-2">
          {selected.map((id) => {
            const row = byId.get(id);
            return (
              <li
                key={id}
                className="flex flex-wrap items-center justify-between gap-2 border border-line px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {row?.title ? String(row.title) : "Product"}
                  </p>
                  {row?.sku ? (
                    <p className="text-xs text-muted">SKU {String(row.sku)}</p>
                  ) : null}
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={() => remove(id)}>
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title="No pieces yet"
          description="Search the catalogue below and add jewellery pieces to this collection."
        />
      )}

      <Input
        label="Search catalogue"
        name="collection_product_search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Name or SKU"
      />

      {catalogLoading ? <Skeleton className="h-24" /> : null}

      {!catalogLoading && candidates.length ? (
        <ul className="space-y-2">
          {candidates.map((row) => (
            <li
              key={String(row.id)}
              className="flex flex-wrap items-center justify-between gap-2 border border-line/70 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">{String(row.title || "Product")}</p>
                {row.sku ? (
                  <p className="text-xs text-muted">SKU {String(row.sku)}</p>
                ) : null}
              </div>
              <div className="ops-actions">
                {row.published_status === "published" || row.published_status === "active" ? (
                  <Badge tone="success">Live</Badge>
                ) : null}
                <Button type="button" size="sm" variant="secondary" onClick={() => add(row.id)}>
                  Add
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {!catalogLoading && !candidates.length && q.trim() ? (
        <p className="text-sm text-muted">No matching products.</p>
      ) : null}
    </div>
  );
}
