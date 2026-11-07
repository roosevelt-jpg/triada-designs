"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { JewelleryColorPicker } from "@/components/ui/JewelleryColorPicker";
import {
  jewelleryColorNames,
  normalizeJewelleryColors,
} from "@/lib/commerce/jewellery-colors";
import {
  expandVariantMatrix,
  normalizeOptionValues,
  normalizeStockVariants,
  optionListsFromVariants,
} from "@/lib/commerce/product-variants";

/**
 * Size + jeweller colour stock editor — no Shopify option JSON visible.
 * @param {{
 *   sizesText: string,
 *   colors: Array<{ name: string, hex: string }>,
 *   variants: Array<{
 *     size: string,
 *     color: string,
 *     color_hex?: string | null,
 *     sku: string | null,
 *     inventory_quantity: number | null,
 *   }>,
 *   onSizesChange: (text: string) => void,
 *   onColorsChange: (colors: Array<{ name: string, hex: string }>) => void,
 *   onVariantsChange: (rows: Array<{
 *     size: string,
 *     color: string,
 *     color_hex?: string | null,
 *     sku: string | null,
 *     inventory_quantity: number | null,
 *   }>) => void,
 * }} props
 */
export function ProductVariantsField({
  sizesText,
  colors,
  variants,
  onSizesChange,
  onColorsChange,
  onVariantsChange,
}) {
  const rows = normalizeStockVariants(variants);
  const colorList = normalizeJewelleryColors(colors);

  function rebuild(nextSizesText, nextColors, existing = rows) {
    const names = jewelleryColorNames(nextColors);
    const withHex = expandVariantMatrix({
      sizes: nextSizesText,
      colors: names,
      existing,
    }).map((row) => {
      const match = nextColors.find(
        (c) => c.name.toLowerCase() === String(row.color || "").toLowerCase(),
      );
      return {
        ...row,
        color_hex: match?.hex || row.color_hex || null,
      };
    });
    onVariantsChange(withHex);
  }

  function updateRow(index, patch) {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onVariantsChange(next);
  }

  function applyLists() {
    rebuild(sizesText, colorList, rows);
  }

  function handleColorsChange(nextColors) {
    onColorsChange(nextColors);
    rebuild(sizesText, nextColors, rows);
  }

  const lists = optionListsFromVariants(rows);
  const showSize = Boolean(sizesText.trim() || lists.sizes.length);
  const showColor = Boolean(colorList.length || lists.colors.length);

  return (
    <div className="md:col-span-2 space-y-4">
      <Input
        label="Sizes"
        name="size_options"
        value={sizesText}
        onChange={(e) => {
          onSizesChange(e.target.value);
        }}
        onBlur={applyLists}
        placeholder="EU 54, EU 56, US 7"
        hint="Separate with commas. Each size can have its own stock."
      />

      <JewelleryColorPicker colors={colorList} onChange={handleColorsChange} />

      {rows.length ? (
        <div className="overflow-x-auto rounded-sm border border-line">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-line bg-stone/40 text-[13px] text-muted">
              <tr>
                {showSize ? <th className="px-3 py-2 font-medium">Size</th> : null}
                {showColor ? <th className="px-3 py-2 font-medium">Color</th> : null}
                <th className="px-3 py-2 font-medium">Stock</th>
                <th className="px-3 py-2 font-medium">SKU</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const hex =
                  row.color_hex ||
                  colorList.find(
                    (c) => c.name.toLowerCase() === String(row.color || "").toLowerCase(),
                  )?.hex;
                return (
                  <tr key={`${row.size}-${row.color}-${index}`} className="border-b border-line/70">
                    {showSize ? (
                      <td className="px-3 py-2 text-ink">{row.size || "—"}</td>
                    ) : null}
                    {showColor ? (
                      <td className="px-3 py-2 text-ink">
                        <span className="inline-flex items-center gap-2">
                          {hex ? (
                            <span
                              className="inline-block h-4 w-4 border border-line"
                              style={{ backgroundColor: hex }}
                              aria-hidden
                            />
                          ) : null}
                          {row.color || "—"}
                        </span>
                      </td>
                    ) : null}
                    <td className="px-3 py-2">
                      <Input
                        name={`variant-qty-${index}`}
                        type="number"
                        min="0"
                        step="1"
                        value={
                          row.inventory_quantity == null
                            ? ""
                            : String(row.inventory_quantity)
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          updateRow(index, {
                            inventory_quantity:
                              raw === ""
                                ? null
                                : Math.max(0, Math.floor(Number(raw)) || 0),
                          });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        name={`variant-sku-${index}`}
                        value={row.sku || ""}
                        onChange={(e) =>
                          updateRow(index, {
                            sku: e.target.value.trim() || null,
                          })
                        }
                        placeholder="Optional"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Add sizes and/or colours, then set stock for each combination. Saves sync to Shopify
          when Connected.
        </p>
      )}

      {normalizeOptionValues(sizesText).length || colorList.length ? (
        <Button type="button" size="sm" variant="secondary" onClick={applyLists}>
          Refresh stock rows
        </Button>
      ) : null}
    </div>
  );
}
