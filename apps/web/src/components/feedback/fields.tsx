"use client";

import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

/** Standard select sizing + focus ring for feedback forms. */
function controlClass() {
  return cn(
    "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm",
    focusRingInput,
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
        className={controlClass()}
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

export function OptionSelect({
  label,
  value,
  options,
  placeholder,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ id: string; name: string }>;
  placeholder: string;
  hint?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-medium">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={controlClass()}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      {hint ? <span className="text-xs font-normal text-soft">{hint}</span> : null}
    </label>
  );
}

export function TextArea({
  label,
  value,
  placeholder,
  rows = 5,
  required,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-medium">
      {label}
      <textarea
        value={value}
        placeholder={placeholder}
        rows={rows}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm leading-6",
          focusRingInput,
        )}
      />
    </label>
  );
}
