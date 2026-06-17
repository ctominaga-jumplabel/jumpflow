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

export interface ClockFieldsProps {
  value: ClockFieldsValue;
  onChange: (value: ClockFieldsValue) => void;
  /** Show the inline validation message (after a submit attempt). */
  showError?: boolean;
  /** Optional id prefix to keep labels unique when rendered more than once. */
  idPrefix?: string;
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
}: ClockFieldsProps) {
  const hours = clockHours(value);
  const invalid = hours === null;
  const result = validateClockTimes({
    startTime: value.startTime,
    endTime: value.endTime,
    breakStart: value.hasBreak ? value.breakStart : null,
    breakEnd: value.hasBreak ? value.breakEnd : null,
  });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-start`} className={labelClass}>
            Início
          </label>
          <input
            id={`${idPrefix}-start`}
            type="time"
            value={value.startTime}
            onChange={(e) => onChange({ ...value, startTime: e.target.value })}
            aria-invalid={showError && invalid}
            className={inputClass(showError && invalid)}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-end`} className={labelClass}>
            Saída
          </label>
          <input
            id={`${idPrefix}-end`}
            type="time"
            value={value.endTime}
            onChange={(e) => onChange({ ...value, endTime: e.target.value })}
            aria-invalid={showError && invalid}
            className={inputClass(showError && invalid)}
          />
        </div>
      </div>

      {value.hasBreak ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${idPrefix}-break-start`} className={labelClass}>
              Pausa
            </label>
            <input
              id={`${idPrefix}-break-start`}
              type="time"
              value={value.breakStart}
              onChange={(e) => onChange({ ...value, breakStart: e.target.value })}
              aria-invalid={showError && invalid}
              className={inputClass(showError && invalid)}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-break-end`} className={labelClass}>
              Retorno
            </label>
            <input
              id={`${idPrefix}-break-end`}
              type="time"
              value={value.breakEnd}
              onChange={(e) => onChange({ ...value, breakEnd: e.target.value })}
              aria-invalid={showError && invalid}
              className={inputClass(showError && invalid)}
            />
          </div>
        </div>
      ) : null}

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
