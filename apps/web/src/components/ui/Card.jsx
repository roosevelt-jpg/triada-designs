import { cn } from "@/lib/cn";

/** @param {{ className?: string, children: import("react").ReactNode }} props */
export function Card({ className, children }) {
  return <div className={cn("surface-card p-5", className)}>{children}</div>;
}

/**
 * @param {{
 *   label: string,
 *   value: string|number,
 *   hint?: string,
 *   className?: string,
 * }} props
 */
export function StatCard({ label, value, hint, className }) {
  return (
    <Card className={cn("!p-0", className)}>
      <div className="ops-stat px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
          {label}
        </p>
        <p className="mt-3 font-display text-[2rem] font-medium leading-none tabular-nums tracking-[-0.03em] text-ink">
          {value}
        </p>
        {hint ? <p className="mt-2 text-sm text-muted">{hint}</p> : null}
      </div>
    </Card>
  );
}

/**
 * Compact metric cell for secondary strips (not a floating card).
 * @param {{ label: string, value: string|number, className?: string }} props
 */
export function MetricCell({ label, value, className }) {
  return (
    <div className={cn("ops-metric-strip-item", className)}>
      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted">
        {label}
      </p>
      <p className="mt-1.5 font-sans text-xl font-semibold tabular-nums tracking-tight text-ink">
        {value}
      </p>
    </div>
  );
}
