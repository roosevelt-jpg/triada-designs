import { cn } from "@/lib/cn";

/**
 * Official Triada Designs logos from triada-designs.com public brand assets.
 * Callers should pass an explicit height (e.g. h-8 / h-10) — avoid pairing with
 * conflicting h-auto when using clsx without tailwind-merge.
 * @param {{ variant?: "primary"|"light"|"dark"|"symbol"|"symbol-light"|"wordmark", className?: string }} props
 */
export function BrandLogo({ variant = "primary", className }) {
  const src =
    variant === "light"
      ? "/brand/triada-logo-light.svg"
      : variant === "dark"
        ? "/brand/triada-logo-dark.svg"
        : variant === "symbol"
          ? "/brand/triada-symbol.svg"
          : variant === "symbol-light"
            ? "/brand/triada-symbol-light.svg"
            : variant === "wordmark"
              ? "/brand/triada-wordmark.svg"
              : "/brand/triada-logo-primary.svg";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Triada Designs"
      className={cn("block w-auto shrink-0 object-contain object-left", className)}
      decoding="async"
    />
  );
}
