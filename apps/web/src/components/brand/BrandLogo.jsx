import { cn } from "@/lib/cn";

/**
 * @param {{ variant?: "primary"|"light"|"dark"|"symbol", className?: string, priority?: boolean }} props
 */
export function BrandLogo({ variant = "primary", className }) {
  const src =
    variant === "light"
      ? "/brand/triada-logo-light.svg"
      : variant === "dark"
        ? "/brand/triada-logo-dark.svg"
        : variant === "symbol"
          ? "/brand/triada-symbol.svg"
          : "/brand/triada-logo-primary.svg";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="Triada Designs" className={cn("h-auto w-auto", className)} />
  );
}
