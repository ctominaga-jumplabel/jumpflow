/**
 * Pure helpers for the "relógio de ponto" time entry pattern:
 * Início (start) / Pausa (break start) / Retorno (break end) / Saída (end).
 *
 * Hours are derived as: (Saída - Início) - (Retorno - Pausa).
 * The break is optional — when removed, breakStart/breakEnd are absent and the
 * worked time is simply (Saída - Início).
 *
 * Times use the "HH:mm" 24h format. No server-only imports: safe for client
 * components, server actions and unit tests alike.
 */

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface ClockTimes {
  startTime: string;
  endTime: string;
  /** Both present = break taken; both absent = break removed. */
  breakStart?: string | null;
  breakEnd?: string | null;
}

/** Parse "HH:mm" into minutes since midnight, or null when malformed. */
export function parseClockMinutes(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = TIME_RE.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export interface ClockValidationOk {
  ok: true;
  /** Worked hours, rounded to 2 decimals. */
  hours: number;
  /** Whether a break is part of the entry. */
  hasBreak: boolean;
}

export interface ClockValidationError {
  ok: false;
  message: string;
}

export type ClockValidationResult = ClockValidationOk | ClockValidationError;

/**
 * Validate a set of clock times and compute the worked hours.
 * Rules:
 * - start and end are required and well-formed; end > start.
 * - break is all-or-nothing: either both breakStart/breakEnd are set or neither.
 * - the break must sit inside [start, end] with breakEnd > breakStart.
 * - resulting worked time must be > 0 and <= 24h.
 */
export function validateClockTimes(times: ClockTimes): ClockValidationResult {
  const start = parseClockMinutes(times.startTime);
  const end = parseClockMinutes(times.endTime);

  if (start === null) {
    return { ok: false, message: "Informe um horário de início válido." };
  }
  if (end === null) {
    return { ok: false, message: "Informe um horário de saída válido." };
  }
  if (end <= start) {
    return {
      ok: false,
      message: "O horário de saída deve ser maior que o de início.",
    };
  }

  const hasBreakStart = Boolean(times.breakStart);
  const hasBreakEnd = Boolean(times.breakEnd);

  if (hasBreakStart !== hasBreakEnd) {
    return {
      ok: false,
      message: "Informe os horários de pausa e retorno, ou remova a pausa.",
    };
  }

  let workedMinutes = end - start;

  if (hasBreakStart && hasBreakEnd) {
    const breakStart = parseClockMinutes(times.breakStart);
    const breakEnd = parseClockMinutes(times.breakEnd);
    if (breakStart === null) {
      return { ok: false, message: "Informe um horário de pausa válido." };
    }
    if (breakEnd === null) {
      return { ok: false, message: "Informe um horário de retorno válido." };
    }
    if (breakEnd <= breakStart) {
      return {
        ok: false,
        message: "O retorno deve ser maior que a pausa.",
      };
    }
    if (breakStart < start || breakEnd > end) {
      return {
        ok: false,
        message: "A pausa deve estar entre o início e a saída.",
      };
    }
    workedMinutes -= breakEnd - breakStart;
  }

  if (workedMinutes <= 0) {
    return {
      ok: false,
      message: "O período trabalhado deve ser maior que zero.",
    };
  }
  if (workedMinutes > 24 * 60) {
    return {
      ok: false,
      message: "O período trabalhado não pode passar de 24 horas.",
    };
  }

  // Round to 2 decimals to match TimeEntry.hours Decimal(5,2).
  const hours = Math.round((workedMinutes / 60) * 100) / 100;
  return { ok: true, hours, hasBreak: hasBreakStart && hasBreakEnd };
}

/**
 * Compute worked hours from clock times, throwing when invalid.
 * Use in server actions where validation already ran via Zod and a number is
 * needed for persistence.
 */
export function computeHoursFromClock(times: ClockTimes): number {
  const result = validateClockTimes(times);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.hours;
}

/** Normalize optional break fields: blank strings become null. */
export function normalizeBreak(
  breakStart?: string | null,
  breakEnd?: string | null,
): { breakStart: string | null; breakEnd: string | null } {
  const start = breakStart && breakStart.trim().length > 0 ? breakStart.trim() : null;
  const end = breakEnd && breakEnd.trim().length > 0 ? breakEnd.trim() : null;
  return { breakStart: start, breakEnd: end };
}
