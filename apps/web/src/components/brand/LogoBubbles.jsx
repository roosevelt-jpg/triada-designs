"use client";

import { useEffect, useRef } from "react";

/**
 * Soft floating Triada logo watermarks behind the login chrome.
 * JS-driven drift only — decorative, pointer-events none, reduced-motion safe.
 */

const BUBBLES = [
  { src: "/brand/triada-symbol.svg", x: 7, y: 14, size: 140, opacity: 0.28, speed: 22, ampX: 18, ampY: 14, phase: 0.2 },
  { src: "/brand/triada-logo-primary.svg", x: 82, y: 9, size: 190, opacity: 0.22, speed: 28, ampX: 14, ampY: 20, phase: 1.1 },
  { src: "/brand/triada-symbol.svg", x: 93, y: 64, size: 110, opacity: 0.26, speed: 18, ampX: 22, ampY: 12, phase: 2.4 },
  { src: "/brand/triada-logo-primary.svg", x: 12, y: 82, size: 168, opacity: 0.2, speed: 32, ampX: 12, ampY: 16, phase: 0.7 },
  { src: "/brand/triada-symbol.svg", x: 54, y: 94, size: 92, opacity: 0.24, speed: 20, ampX: 16, ampY: 10, phase: 1.8 },
  { src: "/brand/triada-symbol.svg", x: 70, y: 34, size: 74, opacity: 0.3, speed: 14, ampX: 10, ampY: 18, phase: 3.2 },
  { src: "/brand/triada-logo-primary.svg", x: 2, y: 48, size: 132, opacity: 0.18, speed: 26, ampX: 8, ampY: 22, phase: 2.0 },
  { src: "/brand/triada-symbol.svg", x: 96, y: 24, size: 78, opacity: 0.26, speed: 16, ampX: 14, ampY: 8, phase: 0.4 },
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
          {/* Soft 3D glass bubble shell — ivory / sand / champagne / brown */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(circle at 30% 26%, rgba(255,252,247,0.95) 0%, rgba(250,248,244,0.62) 26%, rgba(232,222,208,0.5) 52%, rgba(199,174,138,0.38) 76%, rgba(154,121,88,0.22) 100%)",
              boxShadow:
                "inset 0 2px 4px rgba(255,255,255,0.8), inset 0 -12px 26px rgba(112,86,63,0.14), 0 14px 36px rgba(41,38,34,0.09)",
              border: "1px solid rgba(154,121,88,0.22)",
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              inset: "9%",
              background:
                "radial-gradient(circle at 70% 74%, rgba(154,121,88,0.18), transparent 56%)",
            }}
          />
          {/* Specular highlight for depth */}
          <div
            className="absolute rounded-full"
            style={{
              left: "15%",
              top: "11%",
              width: "44%",
              height: "26%",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.85), rgba(255,255,255,0))",
              filter: "blur(1.5px)",
              opacity: 0.9,
            }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={b.src}
            alt=""
            draggable={false}
            className="absolute left-1/2 top-1/2 max-h-[50%] max-w-[50%] -translate-x-1/2 -translate-y-1/2 object-contain"
            style={{
              filter:
                "sepia(0.4) saturate(0.55) brightness(0.9) contrast(0.9)",
              opacity: 0.7,
            }}
            decoding="async"
          />
        </div>
      ))}
    </div>
  );
}
