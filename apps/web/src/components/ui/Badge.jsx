import { cn } from "@/lib/cn";

/** @param {{ tone?: "neutral"|"success"|"warning"|"danger"|"info"|"brand", className?: string, children: import("react").ReactNode }} props */
export function Badge({ tone = "neutral", className, children }) {
  const tones = {
    neutral: "bg-stone text-muted",
    success: "bg-[color-mix(in_srgb,var(--color-success)_12%,white)] text-success",
    warning: "bg-[color-mix(in_srgb,var(--color-warning)_14%,white)] text-warning",
    danger: "bg-[color-mix(in_srgb,var(--color-danger)_12%,white)] text-danger",
    info: "bg-[color-mix(in_srgb,var(--color-info)_12%,white)] text-info",
    brand: "bg-sand text-brown-dark",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
