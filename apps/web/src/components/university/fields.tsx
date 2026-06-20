"use client";

import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

/** Standard input sizing + focus ring for Universidade forms. */
export function fieldClass() {
  return cn(
    "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm",
    focusRingInput,
  );
}

export function TextField({
  label,
  type = "text",
  value,
  placeholder,
  required,
  disabled,
  step,
  onChange,
}: {
  label: string;
  type?: "text" | "number" | "url";
  value: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  step?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-medium">
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        step={step}
        onChange={(event) => onChange(event.target.value)}
        className={cn(fieldClass(), "disabled:opacity-50")}
      />
    </label>
  );
}

export function TextAreaField({
  label,
  value,
  placeholder,
  disabled,
  rows = 3,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-medium">
      {label}
      <textarea
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm disabled:opacity-50",
          focusRingInput,
        )}
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  options,
  emptyLabel,
  hint,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  emptyLabel?: string;
  hint?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-medium">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn(fieldClass(), "disabled:opacity-50")}
      >
        {emptyLabel !== undefined ? (
          <option value="">{emptyLabel}</option>
        ) : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <span className="text-xs font-normal text-soft">{hint}</span> : null}
    </label>
  );
}

/** Progress bar shared across the Universidade panels (no animation in flows). */
export function ProgressBar({
  percent,
  label,
}: {
  percent: number;
  label?: string;
}) {
  return (
    <div className="space-y-1">
      {label ? (
        <div className="flex items-center justify-between text-xs text-soft">
          <span>{label}</span>
          <span className="font-semibold text-medium">{percent}%</span>
        </div>
      ) : null}
      <div
        className="h-2 w-full overflow-hidden rounded-full border border-ink/15 bg-surface-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-success"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
