"use client";

import { Coffee, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRingInput } from "@/lib/styles";
import { validateClockTimes } from "@/lib/timesheet/time-clock";
import { formatHours } from "@/lib/format";

/** Clock-in values shared by the entry form and the weekly-default form. */
export interface ClockFieldsValue {
  startTime: string;
  endTime: string;
  /** Empty string when there is no break. */
  breakStart: string;
  breakEnd: string;
  /** Whether a break (Pausa/Retorno) is part of the entry. */
  hasBreak: boolean;
}

export const emptyClock: ClockFieldsValue = {
  startTime: "09:00",
  endTime: "18:00",
  breakStart: "12:00",
  breakEnd: "13:00",
  hasBreak: true,
};

/** Build a clock value from persisted strings (nulls = no break). */
export function clockFromStored(stored: {
  startTime?: string | null;
  endTime?: string | null;
  breakStart?: string | null;
  breakEnd?: string | null;
}): ClockFieldsValue {
  const hasBreak = Boolean(stored.breakStart && stored.breakEnd);
  return {
    startTime: stored.startTime ?? "",
    endTime: stored.endTime ?? "",
    breakStart: hasBreak ? stored.breakStart! : "",
    breakEnd: hasBreak ? stored.breakEnd! : "",
    hasBreak,
  };
}

/** Compute worked hours for a clock value, or null when invalid. */
export function clockHours(value: ClockFieldsValue): number | null {
  const result = validateClockTimes({
    startTime: value.startTime,
    endTime: value.endTime,
    breakStart: value.hasBreak ? value.breakStart : null,
    breakEnd: value.hasBreak ? value.breakEnd : null,
  });
  return result.ok ? result.hours : null;
}

const inputClass = (invalid: boolean) =>
  cn(
    "w-full rounded-md border bg-surface px-3 py-2 text-sm text-strong placeholder:text-soft",
    focusRingInput,
    invalid ? "border-danger" : "border-border",
  );

const labelClass = "mb-1 block text-xs font-semibold text-medium";

/** Um campo de horário do relógio de ponto (rótulo + input type=time). */
function TimeField({
  id,
  label,
  value,
  invalid,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  invalid: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
        className={inputClass(invalid)}
      />
    </div>
  );
}

export interface ClockFieldsProps {
  value: ClockFieldsValue;
  onChange: (value: ClockFieldsValue) => void;
  /** Show the inline validation message (after a submit attempt). */
  showError?: boolean;
  /** Optional id prefix to keep labels unique when rendered more than once. */
  idPrefix?: string;
  /**
   * `"grid"` (default) lays the fields out two per row — 2x2 when there is a
   * break, still chronological reading left-to-right/top-to-bottom. Fits a
   * narrow modal. `"row"` puts all four in a SINGLE chronological row and needs
   * a wide container (the entry modal), so `type="time"` inputs stay readable.
   */
  layout?: "grid" | "row";
}

/**
 * Relógio de ponto inputs: Início / Pausa / Retorno / Saída with an optional
 * break (the "Remover pausa" button drops Pausa/Retorno). Worked hours are
 * derived and shown read-only — the server recomputes them on save.
 */
export function ClockFields({
  value,
  onChange,
  showError = false,
  idPrefix = "clock",
  layout = "grid",
}: ClockFieldsProps) {
  const hours = clockHours(value);
  const invalid = hours === null;
  const result = validateClockTimes({
    startTime: value.startTime,
    endTime: value.endTime,
    breakStart: value.hasBreak ? value.breakStart : null,
    breakEnd: value.hasBreak ? value.breakEnd : null,
  });

  const invalidNow = showError && invalid;

  return (
    <div className="space-y-3">
      {/* Ordem CRONOLÓGICA do dia: Início -> Pausa -> Retorno -> Saída. Sem
          pausa, sobram só Início -> Saída. */}
      <div
        className={cn(
          "grid grid-cols-2 gap-3",
          layout === "row" && value.hasBreak && "sm:grid-cols-4",
        )}
      >
        <TimeField
          id={`${idPrefix}-start`}
          label="Início"
          value={value.startTime}
          invalid={invalidNow}
          onChange={(startTime) => onChange({ ...value, startTime })}
        />
        {value.hasBreak ? (
          <>
            <TimeField
              id={`${idPrefix}-break-start`}
              label="Pausa"
              value={value.breakStart}
              invalid={invalidNow}
              onChange={(breakStart) => onChange({ ...value, breakStart })}
            />
            <TimeField
              id={`${idPrefix}-break-end`}
              label="Retorno"
              value={value.breakEnd}
              invalid={invalidNow}
              onChange={(breakEnd) => onChange({ ...value, breakEnd })}
            />
          </>
        ) : null}
        <TimeField
          id={`${idPrefix}-end`}
          label="Saída"
          value={value.endTime}
          invalid={invalidNow}
          onChange={(endTime) => onChange({ ...value, endTime })}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        {value.hasBreak ? (
          <button
            type="button"
            onClick={() =>
              onChange({ ...value, hasBreak: false, breakStart: "", breakEnd: "" })
            }
            className="inline-flex items-center gap-1 text-xs font-semibold text-medium hover:text-strong"
          >
            <X aria-hidden="true" className="size-3.5" />
            Remover pausa
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...value,
                hasBreak: true,
                breakStart: emptyClock.breakStart,
                breakEnd: emptyClock.breakEnd,
              })
            }
            className="inline-flex items-center gap-1 text-xs font-semibold text-medium hover:text-strong"
          >
            <Coffee aria-hidden="true" className="size-3.5" />
            Adicionar pausa
          </button>
        )}
        <span className="text-xs text-soft">
          Horas:{" "}
          <span className="font-semibold tabular-nums text-strong">
            {hours !== null ? formatHours(hours) : "—"}
          </span>
        </span>
      </div>

      {showError && invalid && !result.ok ? (
        <p className="text-xs text-danger">{result.message}</p>
      ) : null}
    </div>
  );
}
