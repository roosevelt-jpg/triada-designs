"use client";

import { cn } from "@/lib/cn";
import {
  DEFAULT_CURRENCY,
  PREFERRED_CURRENCIES,
  normalizePreferredCurrency,
} from "@/lib/locale/preferred-currency";

/**
 * Preferred-currency dropdown (no free-text).
 * @param {{
 *   label?: string,
 *   hint?: string,
 *   error?: string,
 *   name?: string,
 *   id?: string,
 *   value?: string,
 *   disabled?: boolean,
 *   required?: boolean,
 *   className?: string,
 *   onChange?: (event: { target: { value: string, name?: string, id?: string } }) => void,
 * }} props
 */
export function CurrencySelect({
  label = "Currency",
  hint,
  error,
  name = "currency",
  id,
  value,
  disabled,
  required,
  className,
  onChange,
}) {
  const selectId = id || name;
  const current = normalizePreferredCurrency(value, DEFAULT_CURRENCY, {
    allowUnknown: true,
  });
  const known = PREFERRED_CURRENCIES.some((c) => c.code === current);
  const options = known
    ? PREFERRED_CURRENCIES
    : [{ code: current, label: `${current} — saved` }, ...PREFERRED_CURRENCIES];

  return (
    <label className="block space-y-1.5">
      {label ? (
        <span className="block text-[13px] font-medium text-ink">{label}</span>
      ) : null}
      <select
        id={selectId}
        name={name}
        value={current}
        disabled={disabled}
        required={required}
        onChange={(e) => {
          if (!onChange) return;
          onChange({
            target: { value: e.target.value, name, id: selectId },
            currentTarget: { value: e.target.value, name, id: selectId },
          });
        }}
        className={cn(
          "ops-field h-11 w-full px-3 text-ink focus:border-brown focus:outline-none",
          error && "ops-field-error",
          className,
        )}
      >
        {options.map((c) => (
          <option key={c.code} value={c.code}>
            {c.label}
          </option>
        ))}
      </select>
      {error ? <span className="block text-sm text-danger">{error}</span> : null}
      {!error && hint ? (
        <span className="block text-sm text-muted">{hint}</span>
      ) : null}
    </label>
  );
}
