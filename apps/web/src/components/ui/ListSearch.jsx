"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

export { matchesListQuery } from "@/lib/list-search";

/**
 * Compact list filter for long scroll pages (Inbox, Contacts, Products, Leads).
 *
 * @param {{
 *   value: string,
 *   onChange: (next: string) => void,
 *   placeholder?: string,
 *   label?: string,
 *   hideLabel?: boolean,
 *   className?: string,
 *   inputClassName?: string,
 *   id?: string,
 *   name?: string,
 * }} props
 */
export function ListSearch({
  value,
  onChange,
  placeholder = "Search…",
  label = "Search",
  hideLabel = false,
  className,
  inputClassName,
  id,
  name = "q",
}) {
  const inputId = id || name;
  const hasValue = Boolean(String(value || "").trim());

  return (
    <label className={cn("block space-y-1.5", className)}>
      {hideLabel ? (
        <span className="sr-only">{label}</span>
      ) : (
        <span className="block text-[13px] font-medium text-ink">{label}</span>
      )}
      <span className="relative block">
        <Search
          size={15}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          id={inputId}
          name={name}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className={cn(
            "ops-field h-11 w-full pl-9 pr-9",
            inputClassName,
          )}
        />
        {hasValue ? (
          <button
            type="button"
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted transition hover:bg-stone hover:text-ink"
            onClick={() => onChange("")}
          >
            <X size={14} aria-hidden />
          </button>
        ) : null}
      </span>
    </label>
  );
}
