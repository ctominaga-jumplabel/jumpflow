"use client";

import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

/** Standard input/select sizing + focus ring for PDI forms. */
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
  onChange,
}: {
  label: string;
  type?: "text" | "date";
  value: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
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
        onChange={(event) => onChange(event.target.value)}
        className={cn(fieldClass(), "disabled:opacity-50")}
      />
    </label>
  );
}

export function EnumSelect<T extends string>({
  label,
  value,
  options,
  hint,
  disabled,
  includeEmpty,
  emptyLabel,
  onChange,
}: {
  label: string;
  value: T | "";
  options: Record<T, string>;
  hint?: string;
  disabled?: boolean;
  includeEmpty?: boolean;
  emptyLabel?: string;
  onChange: (value: T | "") => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-medium">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T | "")}
        className={cn(fieldClass(), "disabled:opacity-50")}
      >
        {includeEmpty ? (
          <option value="">{emptyLabel ?? "—"}</option>
        ) : null}
        {(Object.entries(options) as [T, string][]).map(([key, optionLabel]) => (
          <option key={key} value={key}>
            {optionLabel}
          </option>
        ))}
      </select>
      {hint ? <span className="text-xs font-normal text-soft">{hint}</span> : null}
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
