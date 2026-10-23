import { cn } from "@/lib/cn";

/** @param {{ className?: string, children: import("react").ReactNode }} props */
export function Card({ className, children }) {
  return <div className={cn("surface-card p-5", className)}>{children}</div>;
}

/** @param {{ label: string, value: string|number, hint?: string, className?: string }} props */
export function StatCard({ label, value, hint, className }) {
  return (
    <Card className={cn("fade-rise", className)}>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 font-sans text-3xl font-semibold tabular-nums tracking-tight text-ink">
        {value}
      </p>
      {hint ? <p className="mt-2 text-sm text-muted">{hint}</p> : null}
    </Card>
  );
}
