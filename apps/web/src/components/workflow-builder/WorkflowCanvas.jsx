"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import {
  NODE_H,
  NODE_W,
  canvasSize,
  collectEdges,
  layoutNodes,
  nodeTypeIcon,
  normalizeDefinition,
} from "@/lib/workflow-definition";
import { cn } from "@/lib/cn";

/**
 * Lightweight absolute-position canvas. No heavy graph libs.
 * @param {{
 *   definition: { entry: string, nodes: Record<string, object> },
 *   selectedKey: string|null,
 *   onSelect: (key: string|null) => void,
 *   connectMode: { from: string, kind: "next"|"next_true"|"next_false" }|null,
 *   onConnectTarget: (toKey: string) => void,
 * }} props
 */
export function WorkflowCanvas({
  definition,
  selectedKey,
  onSelect,
  connectMode,
  onConnectTarget,
}) {
  const { entry, nodes } = normalizeDefinition(definition);
  const positions = useMemo(() => layoutNodes(definition), [definition]);
  const edges = useMemo(() => collectEdges(definition), [definition]);
  const size = useMemo(() => canvasSize(positions), [positions]);
  const wrapRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        onSelect(null);
      }
      if ((e.key === "+" || e.key === "=") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setZoom((z) => Math.min(1.6, Number((z + 0.1).toFixed(2))));
      }
      if (e.key === "-" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setZoom((z) => Math.max(0.55, Number((z - 0.1).toFixed(2))));
      }
      if (e.key === "0" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSelect]);

  function fitView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function onPointerDownBackground(e) {
    if (e.target !== e.currentTarget && !e.target.dataset?.canvasBg) return;
    if (e.button !== 0) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({
      x: dragRef.current.panX + dx,
      y: dragRef.current.panY + dy,
    });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  const nodeKeys = Object.keys(nodes);

  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
          Canvas
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className="h-8 rounded-sm border border-line bg-white px-2.5 text-xs text-ink transition-colors duration-150 hover:bg-stone"
            onClick={() => setZoom((z) => Math.max(0.55, Number((z - 0.1).toFixed(2))))}
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="min-w-[3rem] text-center text-xs tabular-nums text-muted">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="h-8 rounded-sm border border-line bg-white px-2.5 text-xs text-ink transition-colors duration-150 hover:bg-stone"
            onClick={() => setZoom((z) => Math.min(1.6, Number((z + 0.1).toFixed(2))))}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="h-8 rounded-sm border border-line bg-white px-2.5 text-xs text-ink transition-colors duration-150 hover:bg-stone"
            onClick={fitView}
          >
            Fit
          </button>
        </div>
      </div>

      <div
        ref={wrapRef}
        className="workflow-canvas relative flex-1 overflow-auto"
        role="application"
        aria-label="Workflow canvas"
        onPointerDown={onPointerDownBackground}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={(e) => {
          if (e.target === e.currentTarget || e.target.dataset?.canvasBg) {
            onSelect(null);
          }
        }}
      >
        <div
          data-canvas-bg="true"
          className="absolute inset-0"
          style={{
            backgroundColor: "var(--color-stone)",
            backgroundImage:
              "radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--color-border) 80%, transparent) 1px, transparent 0)",
            backgroundSize: "20px 20px",
          }}
        />
        <div
          className="relative origin-top-left"
          style={{
            width: size.width,
            height: size.height,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: "transform 160ms ease",
          }}
        >
          <svg
            className="pointer-events-none absolute inset-0"
            width={size.width}
            height={size.height}
            aria-hidden
          >
            {edges.map((edge) => {
              const from = positions[edge.from];
              const to = positions[edge.to];
              if (!from || !to) return null;
              const x1 = from.x + NODE_W / 2;
              const y1 = from.y + NODE_H;
              const x2 = to.x + NODE_W / 2;
              const y2 = to.y;
              const midY = (y1 + y2) / 2;
              const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
              const stroke =
                edge.kind === "next_true"
                  ? "var(--color-success)"
                  : edge.kind === "next_false"
                    ? "var(--color-danger)"
                    : "var(--color-brand-champagne)";
              return (
                <g key={`${edge.from}-${edge.kind}-${edge.to}`}>
                  <path
                    d={path}
                    fill="none"
                    stroke={stroke}
                    strokeWidth="1.5"
                    strokeOpacity="0.9"
                  />
                  {edge.kind !== "next" ? (
                    <text
                      x={(x1 + x2) / 2}
                      y={midY - 4}
                      textAnchor="middle"
                      fill="var(--color-muted)"
                      fontSize="10"
                      fontFamily="var(--font-sans)"
                    >
                      {edge.kind === "next_true" ? "true" : "false"}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>

          {nodeKeys.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <p className="max-w-sm text-center text-sm text-muted">
                No steps yet. Add a trigger from the panel to start this workflow.
              </p>
            </div>
          ) : null}

          {nodeKeys.map((key) => {
            const node = nodes[key];
            const pos = positions[key] || { x: 40, y: 40 };
            const selected = selectedKey === key;
            const isEntry = entry === key;
            return (
              <button
                key={key}
                type="button"
                className={cn(
                  "absolute flex flex-col items-start gap-1 rounded-md border bg-white px-3 py-2.5 text-left shadow-card transition-[border-color,box-shadow] duration-150",
                  selected
                    ? "border-brown ring-2 ring-brown/25"
                    : "border-line hover:border-champagne",
                  connectMode ? "cursor-crosshair" : "cursor-pointer"
                )}
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: NODE_W,
                  minHeight: NODE_H,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (connectMode) {
                    onConnectTarget(key);
                    return;
                  }
                  onSelect(key);
                }}
                aria-pressed={selected}
                aria-label={`${node.type}: ${node.label || key}`}
              >
                <div className="flex w-full items-center gap-2">
                  <span
                    className="inline-flex h-6 w-6 items-center justify-center rounded-sm border border-line bg-stone text-[11px] text-brown-dark"
                    aria-hidden
                  >
                    {nodeTypeIcon(node.type)}
                  </span>
                  <span className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                    {String(node.type || "node").replaceAll("_", " ")}
                  </span>
                  {isEntry ? (
                    <span className="ml-auto rounded-sm bg-sand px-1.5 py-0.5 text-[10px] font-medium text-brown-dark">
                      Entry
                    </span>
                  ) : null}
                </div>
                <span className="w-full truncate text-sm font-medium text-ink">
                  {node.label || key}
                </span>
                <span className="w-full truncate text-[11px] text-muted">{key}</span>
              </button>
            );
          })}
        </div>
      </div>

      {connectMode ? (
        <div className="border-t border-line bg-sand/50 px-3 py-2 text-xs text-brown-dark">
          Click a target node to connect{" "}
          <strong className="font-medium">{connectMode.kind.replaceAll("_", " ")}</strong> from{" "}
          <strong className="font-medium">{connectMode.from}</strong>. Press Esc to cancel.
        </div>
      ) : null}
    </div>
  );
}
