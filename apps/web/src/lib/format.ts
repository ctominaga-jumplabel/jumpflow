/**
 * Small, pure formatting helpers shared across operational modules.
 * Locale fixed to pt-BR / BRL to match the product audience.
 */

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const currencyPreciseFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a BRL amount without decimals (e.g. "R$ 48.000"). */
export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

/** Format a BRL amount with two decimals (e.g. hourly rates: "R$ 320,00"). */
export function formatCurrencyPrecise(value: number): string {
  return currencyPreciseFormatter.format(value);
}

/** Format a number of hours (e.g. 186 -> "186h", 8.5 -> "8,5h"). */
export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `${text}h`;
}

/** Format a 0–100 percentage (e.g. 95 -> "95%"). */
export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

const monthNames = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** Format a month/year pair (1-based month) as "Maio/2026". */
export function formatMonth(month: number, year: number): string {
  const name = monthNames[Math.min(Math.max(month, 1), 12) - 1];
  return `${name}/${year}`;
}

/** Format an ISO date string (yyyy-mm-dd) as a short pt-BR date "dd/mm/yyyy". */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

/** Masked placeholder for financial fields hidden from the current role. */
export const MASKED_VALUE = "•••";
