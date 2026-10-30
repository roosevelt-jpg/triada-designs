"use client";

import { useEffect, useRef } from "react";

/**
 * Soft floating Triada logo watermarks behind the login chrome.
 * JS-driven drift only — decorative, pointer-events none, reduced-motion safe.
 */

/* Quieter watermarks — fewer, softer, less glass-sphere theatre */
const BUBBLES = [
  { src: "/brand/triada-symbol.svg", x: 8, y: 16, size: 120, opacity: 0.16, speed: 26, ampX: 12, ampY: 10, phase: 0.2 },
  { src: "/brand/triada-logo-primary.svg", x: 86, y: 12, size: 160, opacity: 0.12, speed: 32, ampX: 10, ampY: 14, phase: 1.1 },
  { src: "/brand/triada-symbol.svg", x: 92, y: 68, size: 96, opacity: 0.14, speed: 22, ampX: 14, ampY: 8, phase: 2.4 },
  { src: "/brand/triada-logo-primary.svg", x: 14, y: 84, size: 140, opacity: 0.11, speed: 36, ampX: 8, ampY: 12, phase: 0.7 },
  { src: "/brand/triada-symbol.svg", x: 52, y: 92, size: 80, opacity: 0.13, speed: 24, ampX: 10, ampY: 8, phase: 1.8 },
];

export function LogoBubbles({ className = "" }) {
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
        const b = BUBBLES[i];
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
        const b = BUBBLES[i];
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
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {BUBBLES.map((b, i) => (
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
