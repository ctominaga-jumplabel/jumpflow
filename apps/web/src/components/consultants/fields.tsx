"use client";

import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

/** Estilo padrao de input/select do cadastro de consultor. */
export function consultantFieldClass() {
  return cn(
    "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm",
    focusRingInput,
  );
}

export function TextField({
  label,
  value,
  type = "text",
  placeholder,
  onChange,
}: {
  label: string;
  value?: string;
  type?: string;
  placeholder?: string;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-medium">
      {label}
      <input
        type={type}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(event.target.value === "" ? undefined : event.target.value)
        }
        className={consultantFieldClass()}
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  options,
  includeEmpty = true,
  onChange,
}: {
  label: string;
  value: string;
  options: Record<string, string>;
  includeEmpty?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-medium">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={consultantFieldClass()}
      >
        {includeEmpty ? <option value="">-</option> : null}
        {Object.entries(options).map(([key, optionLabel]) => (
          <option key={key} value={key}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
