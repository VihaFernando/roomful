import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "./cn";

/** Single-choice segmented control (radio group semantics). */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md border border-line-strong bg-sunk p-0.5">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={selected}
            disabled={disabled || o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-10 min-w-0 flex-1 rounded-[7px] px-2 text-sm font-semibold transition-colors",
              selected ? "bg-card text-ink shadow-card" : "text-ink-2 active:bg-card/60",
              (disabled || o.disabled) && !selected && "text-muted/60",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center justify-between gap-4 py-2 text-left"
    >
      <span>
        <span className="block text-[15px] font-semibold text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-muted">{description}</span>}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full border transition-colors",
          checked ? "border-ink bg-ink" : "border-line-strong bg-sunk",
          disabled && "opacity-50",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5.5 rounded-full bg-card shadow-card transition-[left] duration-150",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  disabled,
  format = (v) => String(v),
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  disabled?: boolean;
  format?: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button
        aria-label={`Decrease ${label}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        className="flex size-11 items-center justify-center rounded-md border border-line-strong bg-card active:bg-sunk disabled:text-muted/50"
      >
        <Minus className="size-4" />
      </button>
      <output className="w-12 text-center font-mono text-lg font-semibold tabular" aria-live="polite">
        {format(value)}
      </output>
      <button
        aria-label={`Increase ${label}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        className="flex size-11 items-center justify-center rounded-md border border-line-strong bg-card active:bg-sunk disabled:text-muted/50"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="py-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-semibold text-ink">{label}</span>
        {hint && <span className="text-sm text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
