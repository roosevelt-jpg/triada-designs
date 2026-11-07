"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  JEWELLERY_COLOR_SWATCHES,
  normalizeHex,
  normalizeJewelleryColors,
  shapeJewelleryColor,
} from "@/lib/commerce/jewellery-colors";

/**
 * Metal / stone colour swatches + custom hex for product stock variants.
 * @param {{
 *   colors: Array<{ name: string, hex: string }>,
 *   onChange: (next: Array<{ name: string, hex: string }>) => void,
 * }} props
 */
export function JewelleryColorPicker({ colors, onChange }) {
  const selected = normalizeJewelleryColors(colors);
  const selectedKeys = new Set(selected.map((c) => c.name.toLowerCase()));
  const [customName, setCustomName] = useState("");
  const [customHex, setCustomHex] = useState("#C4A882");

  function togglePreset(swatch) {
    const key = swatch.name.toLowerCase();
    if (selectedKeys.has(key)) {
      onChange(selected.filter((c) => c.name.toLowerCase() !== key));
      return;
    }
    onChange([...selected, { name: swatch.name, hex: swatch.hex }]);
  }

  function removeColor(name) {
    onChange(selected.filter((c) => c.name.toLowerCase() !== name.toLowerCase()));
  }

  function addCustom() {
    const hex = normalizeHex(customHex) || "#C4A882";
    const name = customName.trim() || `Custom ${hex}`;
    const shaped = shapeJewelleryColor({ name, hex });
    if (!shaped) return;
    if (selectedKeys.has(shaped.name.toLowerCase())) {
      onChange(
        selected.map((c) =>
          c.name.toLowerCase() === shaped.name.toLowerCase() ? shaped : c,
        ),
      );
    } else {
      onChange([...selected, shaped]);
    }
    setCustomName("");
  }

  return (
    <div className="space-y-3">
      <div>
        <span className="block text-[13px] font-medium text-ink">Colors</span>
        <p className="mt-1 text-sm text-muted">
          Pick metal or stone colours. Each colour gets its own stock row and syncs to Shopify.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {JEWELLERY_COLOR_SWATCHES.map((swatch) => {
          const active = selectedKeys.has(swatch.name.toLowerCase());
          return (
            <button
              key={swatch.name}
              type="button"
              title={swatch.name}
              aria-pressed={active}
              onClick={() => togglePreset(swatch)}
              className={`flex items-center gap-2 border px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                active
                  ? "border-ink bg-stone/50 text-ink"
                  : "border-line bg-transparent text-muted hover:border-brown hover:text-ink"
              }`}
            >
              <span
                className="inline-block h-5 w-5 shrink-0 border border-line"
                style={{ backgroundColor: swatch.hex }}
                aria-hidden
              />
              <span>{swatch.name}</span>
            </button>
          );
        })}
      </div>

      {selected.length ? (
        <ul className="flex flex-wrap gap-2">
          {selected.map((c) => (
            <li
              key={c.name}
              className="flex items-center gap-2 border border-line px-2 py-1 text-[13px] text-ink"
            >
              <span
                className="inline-block h-4 w-4 border border-line"
                style={{ backgroundColor: c.hex }}
                aria-hidden
              />
              <span>{c.name}</span>
              <button
                type="button"
                className="text-muted hover:text-ink"
                onClick={() => removeColor(c.name)}
                aria-label={`Remove ${c.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Input
          label="Custom colour name"
          name="custom_color_name"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="Champagne gold"
        />
        <label className="block space-y-1.5">
          <span className="block text-[13px] font-medium text-ink">Hex</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={normalizeHex(customHex) || "#C4A882"}
              onChange={(e) => setCustomHex(e.target.value.toUpperCase())}
              className="h-10 w-12 cursor-pointer border border-line bg-transparent p-0.5"
              aria-label="Pick hex colour"
            />
            <input
              type="text"
              value={customHex}
              onChange={(e) => setCustomHex(e.target.value)}
              className="ops-field h-10 w-[7.5rem] px-2 font-mono text-[13px]"
              placeholder="#C4A882"
              spellCheck={false}
            />
          </div>
        </label>
        <Button type="button" size="sm" variant="secondary" onClick={addCustom}>
          Add colour
        </Button>
      </div>
    </div>
  );
}
