"use client";

import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

/** Standard input/select sizing + focus ring for evaluation forms. */
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
  onChange,
}: {
  label: string;
  type?: "text" | "date";
  value: string;
  placeholder?: string;
  required?: boolean;
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
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass()}
      />
    </label>
  );
}

export function EnumSelect<T extends string>({
  label,
  value,
  options,
  hint,
  onChange,
}: {
  label: string;
  value: T;
  options: Record<T, string>;
  hint?: string;
  onChange: (value: T) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-medium">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className={fieldClass()}
      >
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
