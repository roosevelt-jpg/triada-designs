"use client";

import { useEffect, useMemo, useRef } from "react";
import { BRAND, brandLogoUrl } from "@/lib/brand/identity";

/**
 * Soft floating Triada logo watermarks (login / public waitlist chrome).
 * JS-driven drift only — decorative, pointer-events none, reduced-motion safe.
 */

/* Quieter watermarks — fewer, softer, less glass-sphere theatre */
const BUBBLE_LAYOUT = [
  { kind: "symbol", x: 8, y: 16, size: 120, opacity: 0.16, speed: 26, ampX: 12, ampY: 10, phase: 0.2 },
  { kind: "wordmark", x: 86, y: 12, size: 160, opacity: 0.12, speed: 32, ampX: 10, ampY: 14, phase: 1.1 },
  { kind: "symbol", x: 92, y: 68, size: 96, opacity: 0.14, speed: 22, ampX: 14, ampY: 8, phase: 2.4 },
  { kind: "wordmark", x: 14, y: 84, size: 140, opacity: 0.11, speed: 36, ampX: 8, ampY: 12, phase: 0.7 },
  { kind: "symbol", x: 52, y: 92, size: 80, opacity: 0.13, speed: 24, ampX: 10, ampY: 8, phase: 1.8 },
  { kind: "wordmark", x: 48, y: 38, size: 150, opacity: 0.1, speed: 30, ampX: 11, ampY: 9, phase: 3.1 },
  { kind: "symbol", x: 72, y: 48, size: 88, opacity: 0.12, speed: 28, ampX: 9, ampY: 11, phase: 0.4 },
];

/**
 * @param {{
 *   className?: string,
 *   preferLive?: boolean,
 *   density?: "default" | "rich",
 * }} props
 */
export function LogoBubbles({
  className = "",
  preferLive = false,
  density = "default",
}) {
  const bubbles = useMemo(() => {
    const liveWordmark = brandLogoUrl();
    const wordmark = preferLive
      ? liveWordmark || BRAND.logoUrlLive
      : "/brand/triada-logo-primary.svg";
    // Live site ships the wordmark SVG; reuse it for soft symbol watermarks too.
    const symbol = preferLive
      ? liveWordmark || BRAND.logoUrlLive
      : "/brand/triada-symbol.svg";
    const layout =
      density === "rich" ? BUBBLE_LAYOUT : BUBBLE_LAYOUT.slice(0, 5);
    return layout.map((b) => ({
      ...b,
      src: b.kind === "wordmark" ? wordmark : symbol,
    }));
  }, [preferLive, density]);

  const rootRef = useRef(null);
  const nodesRef = useRef([]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    nodesRef.current = Array.from(root.querySelectorAll("[data-bubble]"));

    if (reduce) {
      nodesRef.current.forEach((el, i) => {
        const b = bubbles[i];
        if (!el || !b) return;
        el.style.transform = "translate3d(0,0,0) scale(1)";
        el.style.opacity = String(b.opacity);
      });
      return undefined;
    }

    let raf = 0;
    const start = performance.now();

    const tick = (now) => {
      const t = (now - start) / 1000;
      nodesRef.current.forEach((el, i) => {
        const b = bubbles[i];
        if (!el || !b) return;
        const ox = Math.sin(t / b.speed + b.phase) * b.ampX;
        const oy = Math.cos(t / (b.speed * 0.85) + b.phase * 1.3) * b.ampY;
        const scale = 1 + Math.sin(t / (b.speed * 1.4) + b.phase) * 0.045;
        const rot = Math.sin(t / (b.speed * 1.6) + b.phase) * 5;
        el.style.transform = `translate3d(${ox}px, ${oy}px, 0) scale(${scale}) rotate(${rot}deg)`;
        const breathe =
          b.opacity *
          (0.9 +
            0.1 * (0.5 + 0.5 * Math.sin(t / (b.speed * 0.9) + b.phase)));
        el.style.opacity = String(breathe);
      });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bubbles]);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {bubbles.map((b, i) => (
        <div
          key={i}
          data-bubble
          className="absolute will-change-transform"
          style={{
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: b.size,
            height: b.size,
            marginLeft: -b.size / 2,
            marginTop: -b.size / 2,
            opacity: b.opacity,
          }}
        >
          {/* Soft watermark disc — restrained, not glass-sphere */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 35% 30%, rgba(255,252,247,0.55) 0%, rgba(232,222,208,0.28) 48%, rgba(199,174,138,0.16) 100%)",
              border: "1px solid rgba(143,115,84,0.14)",
            }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={b.src}
            alt=""
            draggable={false}
            className="absolute left-1/2 top-1/2 max-h-[48%] max-w-[48%] -translate-x-1/2 -translate-y-1/2 object-contain"
            style={{
              filter:
                "sepia(0.35) saturate(0.5) brightness(0.92) contrast(0.92)",
              opacity: 0.55,
            }}
            decoding="async"
          />
        </div>
      ))}
    </div>
  );
}
