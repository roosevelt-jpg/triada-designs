"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  formatIntlDate,
  formatIntlDateTime,
  parseIntlDateValue,
  toIntlDateTimeValue,
  toIntlDateValue,
} from "@/lib/date-format";
import { nowDate } from "@/lib/system-time";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/**
 * International date / datetime field with a calendar picker that fills the field.
 * Display is always YYYY-MM-DD (or YYYY-MM-DD HH:mm). Free typing is disabled —
 * values come from the calendar (and time controls when mode=datetime).
 *
 * @param {{
 *   label?: string,
 *   hint?: string,
 *   error?: string,
 *   className?: string,
 *   mode?: "date"|"datetime",
 *   value?: string,
 *   onChange?: (value: string) => void,
 *   id?: string,
 *   name?: string,
 *   disabled?: boolean,
 *   required?: boolean,
 *   min?: string,
 *   max?: string,
 * }} props
 */
export function DatePicker({
  label,
  hint,
  error,
  className,
  mode = "date",
  value = "",
  onChange,
  id,
  name,
  disabled = false,
  required = false,
  min,
  max,
}) {
  const reactId = useId();
  const inputId = id || name || `date-${reactId}`;
  const panelId = `${inputId}-panel`;
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => parseIntlDateValue(value), [value]);
  const [cursor, setCursor] = useState(() => {
    const base = selected || nowDate();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) return;
    const base = selected || nowDate();
    setCursor(new Date(base.getFullYear(), base.getMonth(), 1));
  }, [open, selected]);

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const display =
    mode === "datetime" ? formatIntlDateTime(value) : formatIntlDate(value);
  const placeholder = mode === "datetime" ? "YYYY-MM-DD HH:mm" : "YYYY-MM-DD";

  const minDate = useMemo(() => parseIntlDateValue(min), [min]);
  const maxDate = useMemo(() => parseIntlDateValue(max), [max]);

  const days = useMemo(() => {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = new Date(start);
    gridStart.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [cursor]);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        month: "long",
        year: "numeric",
      }).format(cursor),
    [cursor]
  );

  function emitDate(date) {
    if (!onChange) return;
    if (mode === "datetime") {
      const hours = selected ? selected.getHours() : nowDate().getHours();
      const minutes = selected ? selected.getMinutes() : nowDate().getMinutes();
      const next = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        hours,
        minutes,
        0,
        0
      );
      onChange(toIntlDateTimeValue(next));
      return;
    }
    onChange(toIntlDateValue(date));
    setOpen(false);
  }

  function emitTime(hours, minutes) {
    if (!onChange) return;
    const base = selected || nowDate();
    const next = new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
      hours,
      minutes,
      0,
      0
    );
    onChange(toIntlDateTimeValue(next));
  }

  function isDisabledDay(day) {
    if (minDate) {
      const floor = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
      if (day < floor) return true;
    }
    if (maxDate) {
      const ceil = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());
      if (day > ceil) return true;
    }
    return false;
  }

  function sameDay(a, b) {
    return (
      a &&
      b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  const hour = selected ? selected.getHours() : 10;
  const minute = selected ? selected.getMinutes() : 0;

  return (
    <label className={cn("relative block space-y-1.5", className)} ref={rootRef}>
      {label ? (
        <span className="block text-[13px] font-medium text-ink">{label}</span>
      ) : null}

      <div className="relative">
        <input
          id={inputId}
          name={name}
          type="text"
          inputMode="none"
          autoComplete="off"
          readOnly
          required={required}
          disabled={disabled}
          value={display}
          placeholder={placeholder}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => {
            if (!disabled) setOpen((v) => !v);
          }}
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
          className={cn(
            "ops-field h-11 cursor-pointer py-0 pl-3 pr-10",
            disabled && "cursor-not-allowed opacity-60",
            error && "ops-field-error"
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Open calendar"
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-brown hover:text-brown-dark disabled:opacity-50"
          onClick={() => {
            if (!disabled) setOpen((v) => !v);
          }}
        >
          <CalendarIcon className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {open && !disabled ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={label || "Choose date"}
          className="absolute left-0 z-40 mt-1 w-[min(100%,18.5rem)] rounded-sm border border-line bg-white p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-ink hover:bg-sand/70"
              aria-label="Previous month"
              onClick={() =>
                setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-medium text-ink">{monthLabel}</p>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-ink hover:bg-sand/70"
              aria-label="Next month"
              onClick={() =>
                setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
              }
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="py-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {days.map((day) => {
              const inMonth = day.getMonth() === cursor.getMonth();
              const isSelected = sameDay(day, selected);
              const isToday = sameDay(day, nowDate());
              const dayDisabled = isDisabledDay(day);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={dayDisabled}
                  onClick={() => emitDate(day)}
                  className={cn(
                    "h-8 rounded-sm text-xs transition-colors",
                    inMonth ? "text-ink" : "text-muted/60",
                    isSelected && "bg-black text-gold",
                    !isSelected && isToday && "ring-1 ring-inset ring-brown/40",
                    !isSelected && !dayDisabled && "hover:bg-sand/80",
                    dayDisabled && "cursor-not-allowed opacity-35"
                  )}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          {mode === "datetime" ? (
            <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
              <label className="flex flex-1 items-center gap-1.5 text-xs text-muted">
                <span>Hour</span>
                <select
                  className="ops-field h-9 px-2"
                  value={hour}
                  onChange={(e) => emitTime(Number(e.target.value), minute)}
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {pad2(h)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-1 items-center gap-1.5 text-xs text-muted">
                <span>Min</span>
                <select
                  className="ops-field h-9 px-2"
                  value={minute}
                  onChange={(e) => emitTime(hour, Number(e.target.value))}
                >
                  {Array.from({ length: 60 }, (_, m) => (
                    <option key={m} value={m}>
                      {pad2(m)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="h-9 shrink-0 rounded-md bg-black px-3 text-sm font-medium text-gold"
                onClick={() => setOpen(false)}
              >
                Done
              </button>
            </div>
          ) : null}

        </div>
      ) : null}

      {error ? <span className="block text-sm text-danger">{error}</span> : null}
      {!error && hint ? <span className="block text-sm text-muted">{hint}</span> : null}
    </label>
  );
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
