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
      <div className="px-4 pb-3 pt-4">
        <p className="text-[12px] font-medium uppercase tracking-[0.07em] text-muted">
          {label}
        </p>
        <div className="ops-divider-solid my-3" role="presentation" />
        <p className="font-sans text-[1.75rem] font-semibold leading-none tabular-nums tracking-tight text-ink">
          {value}
        </p>
        {hint ? <p className="mt-2 text-sm text-muted">{hint}</p> : null}
      </div>
    </Card>
  );
}
