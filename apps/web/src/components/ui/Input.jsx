"use client";

import { cn } from "@/lib/cn";
import { DatePicker } from "@/components/ui/DatePicker";

/** @param {{ label?: string, hint?: string, error?: string, className?: string } & React.InputHTMLAttributes<HTMLInputElement>} props */
export function Input({ label, hint, error, className, id, type = "text", onChange, value, ...props }) {
  // Route native date controls through the shared international calendar picker.
  if (type === "date" || type === "datetime-local") {
    return (
      <DatePicker
        mode={type === "datetime-local" ? "datetime" : "date"}
        label={label}
        hint={hint}
        error={error}
        className={className}
        id={id}
        name={props.name}
        disabled={props.disabled}
        required={props.required}
        min={typeof props.min === "string" ? props.min : undefined}
        max={typeof props.max === "string" ? props.max : undefined}
        value={value == null ? "" : String(value)}
        onChange={(next) => {
          if (!onChange) return;
          onChange({
            target: { value: next, name: props.name, id },
            currentTarget: { value: next, name: props.name, id },
          });
        }}
      />
    );
  }

  const inputId = id || props.name;

  return (
    <label className="block space-y-1.5">
      {label ? (
        <span className="block text-[13px] font-medium text-ink">{label}</span>
      ) : null}
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={onChange}
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
