/**
 * Single source of truth for the remunerated-equivalent hours of a time entry.
 *
 * Melhoria #2 (Sobreaviso vira Atividade): a consultor remuneration is always
 * `hours x multiplier`, regardless of activityType. ON_CALL activities carry a
 * fractional multiplier (ex.: 0.33); normal workdays keep multiplier = 1.00, so
 * `effectiveHours === hours` for them. Billing is decided separately by the
 * per-entry `billable` flag, not by this value.
 *
 * Pure + deterministic rounding (2 decimals) so revenue, payment, closing and
 * UI all agree on the same number.
 */
export function timeEntryEffectiveHours(
  hours: number,
  multiplier: number,
): number {
  return Math.round(hours * multiplier * 100) / 100;
}
