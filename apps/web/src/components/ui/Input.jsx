import { cn } from "@/lib/cn";

/** @param {{ label?: string, hint?: string, error?: string, className?: string } & React.InputHTMLAttributes<HTMLInputElement>} props */
export function Input({ label, hint, error, className, id, ...props }) {
  const inputId = id || props.name;

  return (
    <label className="block space-y-1.5">
      {label ? (
        <span className="block text-[13px] font-medium text-ink">{label}</span>
      ) : null}
      <input
        id={inputId}
        className={cn(
          "h-11 w-full rounded-sm border border-line bg-white px-3 text-sm text-ink placeholder:text-muted/80",
          "transition-colors duration-150 focus:border-brown focus:outline-none",
          error && "border-danger",
          className
        )}
        {...props}
      />
      {error ? <span className="block text-sm text-danger">{error}</span> : null}
      {!error && hint ? (
        <span className="block text-sm text-muted">{hint}</span>
      ) : null}
    </label>
  );
}
