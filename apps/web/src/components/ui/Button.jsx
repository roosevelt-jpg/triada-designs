import { cn } from "@/lib/cn";

/**
 * @param {{
 *   variant?: "primary"|"secondary"|"ghost"|"danger",
 *   size?: "sm"|"md"|"lg",
 *   className?: string,
 *   children: import("react").ReactNode,
 * } & React.ButtonHTMLAttributes<HTMLButtonElement>} props
 */
export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}) {
  const variants = {
    primary:
      "bg-brown text-white hover:bg-brown-dark disabled:bg-sand disabled:text-muted",
    secondary:
      "bg-white text-ink border border-line hover:bg-stone disabled:opacity-60",
    ghost: "bg-transparent text-ink hover:bg-sand/70 disabled:opacity-60",
    danger: "bg-danger text-white hover:opacity-90 disabled:opacity-60",
  };

  const sizes = {
    sm: "h-9 px-3 text-sm",
    md: "h-11 px-4 text-sm",
    lg: "h-12 px-5 text-base",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-150",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
