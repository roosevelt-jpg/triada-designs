import { cn } from "@/lib/cn";

/** @param {{ tone?: "neutral"|"success"|"warning"|"danger"|"info"|"brand", className?: string, children: import("react").ReactNode }} props */
export function Badge({ tone = "neutral", className, children }) {
  const tones = {
    neutral: "bg-stone text-muted border border-line",
    success: "bg-[color-mix(in_srgb,var(--color-success)_10%,white)] text-success border border-[color-mix(in_srgb,var(--color-success)_22%,transparent)]",
    warning: "bg-[color-mix(in_srgb,var(--color-warning)_12%,white)] text-warning border border-[color-mix(in_srgb,var(--color-warning)_24%,transparent)]",
    danger: "bg-[color-mix(in_srgb,var(--color-danger)_10%,white)] text-danger border border-[color-mix(in_srgb,var(--color-danger)_22%,transparent)]",
    info: "bg-[color-mix(in_srgb,var(--color-info)_10%,white)] text-info border border-[color-mix(in_srgb,var(--color-info)_22%,transparent)]",
    brand: "bg-sand text-brown-dark border border-[color-mix(in_srgb,var(--color-brand-brown)_22%,transparent)]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
