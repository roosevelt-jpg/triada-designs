"use client";

import { PALETTE_ITEMS } from "@/lib/workflow-definition";

/**
 * Draggable action palette for the visual workflow builder.
 * @param {{ onAdd: (item: object) => void }} props
 */
export function ActionPalette({ onAdd }) {
  return (
    <aside className="flex h-full min-h-[320px] w-full flex-col border-r border-line bg-ivory/80 lg:w-[200px]">
      <div className="border-b border-line px-3 py-2.5">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
          Actions
        </p>
        <p className="mt-1 text-xs text-muted">Drag onto canvas or click to add</p>
      </div>
      <ul className="flex-1 space-y-1.5 overflow-y-auto p-2">
        {PALETTE_ITEMS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  "application/x-triada-palette",
                  JSON.stringify(item)
                );
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => onAdd(item)}
              className="flex w-full items-center gap-2 rounded-md border border-line bg-white px-2.5 py-2 text-left text-sm transition-[border-color,background-color] duration-150 hover:border-champagne hover:bg-stone/50 active:cursor-grabbing"
            >
              <span
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-line bg-stone text-[11px] text-brown-dark"
                aria-hidden
              >
                {item.icon}
              </span>
              <span className="truncate font-medium text-ink">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
