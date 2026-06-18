import type { HourBankEntryKind } from "./schemas";

/**
 * Converte a magnitude/valor informado em horas COM SINAL para o banco de horas.
 * O saldo do banco de horas e SUM(hours), entao o sinal e a fonte da verdade:
 * - OVERTIME (hora extra): sempre credito -> +|hours|
 * - COMPENSATION (compensacao/folga): sempre debito -> -|hours|
 * - ADJUSTMENT (ajuste manual): mantem o sinal informado (pode reduzir saldo)
 */
export function signedHourBankHours(
  kind: HourBankEntryKind,
  hours: number,
): number {
  if (kind === "OVERTIME") return Math.abs(hours);
  if (kind === "COMPENSATION") return -Math.abs(hours);
  return hours;
}
