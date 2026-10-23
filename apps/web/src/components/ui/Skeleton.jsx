import { cn } from "@/lib/cn";

/** @param {{ className?: string }} props */
export function Skeleton({ className }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-[color-mix(in_srgb,var(--color-brand-sand)_55%,white)]",
        className
      )}
    />
  );
}
