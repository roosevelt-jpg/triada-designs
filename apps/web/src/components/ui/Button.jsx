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
      "bg-black text-gold hover:bg-ink disabled:bg-stone disabled:text-muted",
    secondary:
      "bg-white text-ink border border-line-strong hover:bg-stone disabled:opacity-60",
    ghost: "bg-transparent text-ink hover:bg-sand/60 disabled:opacity-60",
    danger: "bg-danger text-white hover:opacity-90 disabled:opacity-60",
  };

  const sizes = {
    sm: "h-9 min-h-9 px-3.5 text-[13px]",
    md: "h-10 min-h-10 px-4 text-sm",
    lg: "h-11 min-h-11 px-5 text-[15px]",
  };

  return (
    <button
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium transition-colors duration-150",
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
