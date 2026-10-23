"use client";

import { useEffect, useState } from "react";
import {
  getSystemTimeState,
  nowDate,
  subscribeSystemTime,
  syncSystemTime,
} from "@/lib/system-time";

/**
 * Header clock driven by GET /api/v1/system/time (UTC + workspace TZ).
 * Seconds ticker respects prefers-reduced-motion (minute updates instead).
 */
export function WorkspaceClock() {
  const [label, setLabel] = useState("—");
  const [timezone, setTimezone] = useState(getSystemTimeState().timezone || "UTC");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let tickId = 0;

    function prefersReducedMotion() {
      if (typeof window === "undefined" || !window.matchMedia) return false;
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    function render() {
      const tz = getSystemTimeState().timezone || "UTC";
      setTimezone(tz);
      try {
        const formatted = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          second: prefersReducedMotion() ? undefined : "2-digit",
        }).format(nowDate());
        setLabel(formatted);
      } catch {
        setLabel(nowDate().toLocaleString());
      }
    }

    async function boot() {
      try {
        await syncSystemTime();
      } catch {
        // Keep browser clock with UTC fallback if API unavailable.
      }
      if (cancelled) return;
      setReady(true);
      render();
      const intervalMs = prefersReducedMotion() ? 60_000 : 1_000;
      tickId = window.setInterval(render, intervalMs);
    }

    const unsub = subscribeSystemTime(() => {
      if (!cancelled) render();
    });

    boot();

    const resyncId = window.setInterval(() => {
      syncSystemTime().catch(() => {});
    }, 5 * 60_000);

    return () => {
      cancelled = true;
      unsub();
      if (tickId) window.clearInterval(tickId);
      window.clearInterval(resyncId);
    };
  }, []);

  return (
    <div
      className="hidden text-right sm:block"
      title={ready ? `Workspace time (${timezone})` : "Syncing system time…"}
      aria-live="polite"
    >
      <p className="text-sm font-medium leading-tight tabular-nums text-ink">{label}</p>
      <p className="text-[11px] text-muted">{timezone}</p>
    </div>
  );
}
