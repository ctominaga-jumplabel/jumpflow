"use client";

import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

/** Standard input/select sizing + focus ring used across project forms. */
export function fieldClass() {
  return cn(
    "h-10 rounded-md border border-border bg-surface px-3 text-sm",
    focusRingInput,
  );
}

export function DateField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-medium">
      {label}
      <input
        type="date"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass()}
      />
    </label>
  );
}

export function NumberField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value?: number;
  disabled?: boolean;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-medium">
      {label}
      <input
        type="number"
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value === "" ? undefined : Number(event.target.value))
        }
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
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: Record<T, string>;
  hint?: string;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-medium">
      {label}
      <select
        value={value}
        disabled={disabled}
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

export function CheckboxField({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-medium">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
