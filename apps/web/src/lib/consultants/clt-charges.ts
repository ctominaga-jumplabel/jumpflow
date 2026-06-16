/**
 * CLT payroll charge calculator (encargos CLT).
 *
 * Pure, deterministic and parameterized so that the bracket tables can be
 * versioned per competence year. The defaults below reflect the 2026 tables;
 * they MUST be reviewed whenever the government updates INSS/IRRF/salario
 * minimo (typically every January, sometimes mid-year). Never hardcode bracket
 * numbers elsewhere — feed a {@link CltChargeTables} object instead.
 *
 * Scope:
 * - INSS (employee deduction) — progressive brackets, capped at the ceiling.
 * - IRRF (employee deduction) — progressive brackets applied on the base
 *   (gross minus INSS minus the per-dependent deduction).
 * - FGTS (employer cost) — informational only; it is NEVER deducted from the
 *   employee net. Surfaced so the UI can show the full employer picture.
 *
 * Coordinate with `jump-payments-agent` before wiring these numbers into an
 * actual payment instruction; this module only computes, it does not pay.
 */

/** A progressive bracket. `upTo === null` means "no upper bound" (top band). */
export interface ProgressiveBracket {
  /** Inclusive upper bound of the band, in BRL. `null` for the last band. */
  upTo: number | null;
  /** Marginal rate for the portion of income inside this band (0..1). */
  rate: number;
}

export interface CltChargeTables {
  /** Competence year these tables apply to (audit/versioning aid). */
  year: number;
  /**
   * INSS progressive brackets. The contribution is capped: income above the
   * last bracket's `upTo` is not charged (the INSS ceiling). The last bracket
   * here therefore has a finite `upTo` (the ceiling), NOT `null`.
   */
  inssBrackets: ProgressiveBracket[];
  /** IRRF progressive brackets applied to the IRRF base. Last band `upTo: null`. */
  irrfBrackets: ProgressiveBracket[];
  /** Monthly IRRF deduction granted per dependent, in BRL. */
  irrfDependentDeduction: number;
  /** Employer FGTS rate (informational), e.g. 0.08 = 8%. */
  fgtsRate: number;
}

/**
 * 2026 reference tables. Values change by year — keep them here, named, and
 * pass a different {@link CltChargeTables} to recompute historical competences.
 */
export const CLT_CHARGE_TABLES_2026: CltChargeTables = {
  year: 2026,
  // INSS 2026 reference brackets (employee). The final upTo is the ceiling:
  // earnings above it do not increase the contribution.
  inssBrackets: [
    { upTo: 1518.0, rate: 0.075 },
    { upTo: 2793.88, rate: 0.09 },
    { upTo: 4190.83, rate: 0.12 },
    { upTo: 8157.41, rate: 0.14 },
  ],
  // IRRF 2026 reference brackets (employee), applied on the IRRF base.
  irrfBrackets: [
    { upTo: 2428.8, rate: 0 },
    { upTo: 2826.65, rate: 0.075 },
    { upTo: 3751.05, rate: 0.15 },
    { upTo: 4664.68, rate: 0.225 },
    { upTo: null, rate: 0.275 },
  ],
  irrfDependentDeduction: 189.59,
  fgtsRate: 0.08,
};

export interface CltChargeInput {
  /** Gross CLT salary (salario bruto CLT), in BRL. */
  cltAmount: number;
  /** Number of IRRF dependents. Default 0. */
  dependents?: number;
  /** Bracket tables. Defaults to {@link CLT_CHARGE_TABLES_2026}. */
  tables?: CltChargeTables;
}

export interface CltChargeResult {
  /** Competence year of the tables used. */
  year: number;
  /** Gross CLT salary considered. */
  base: number;
  /** INSS employee deduction (rounded to cents). */
  inss: number;
  /** Effective base used for IRRF (gross - INSS - dependent deduction). */
  irrfBase: number;
  /** IRRF employee deduction (rounded to cents). */
  irrf: number;
  /** FGTS employer cost — INFORMATIONAL, not deducted from the employee. */
  fgts: number;
  /** Total deducted FROM the employee (inss + irrf). FGTS is excluded. */
  employeeDeductions: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Generic progressive computation: charges each band's rate only on the slice
 * of income that falls inside it. A band with finite `upTo` followed by no
 * further band acts as a ceiling (income beyond it is ignored).
 */
function progressive(amount: number, brackets: ProgressiveBracket[]): number {
  let total = 0;
  let lower = 0;
  for (const bracket of brackets) {
    const upper = bracket.upTo ?? Infinity;
    if (amount <= lower) break;
    const slice = Math.min(amount, upper) - lower;
    if (slice > 0) total += slice * bracket.rate;
    lower = upper;
  }
  return total;
}

/** INSS ceiling = the last bracket's finite upper bound. */
function inssCeiling(brackets: ProgressiveBracket[]): number {
  const last = brackets[brackets.length - 1];
  return last?.upTo ?? Infinity;
}

/**
 * Computes CLT employee deductions (INSS, IRRF) and the informational employer
 * FGTS cost from a gross salary. Pure and deterministic.
 */
export function computeCltCharges(input: CltChargeInput): CltChargeResult {
  const tables = input.tables ?? CLT_CHARGE_TABLES_2026;
  const dependents = Math.max(0, Math.floor(input.dependents ?? 0));
  const base = Math.max(0, input.cltAmount);

  // INSS is capped at the ceiling: contribution on the ceiling, not on `base`.
  const ceiling = inssCeiling(tables.inssBrackets);
  const inss = round2(
    progressive(Math.min(base, ceiling), tables.inssBrackets),
  );

  const irrfBase = round2(
    Math.max(0, base - inss - dependents * tables.irrfDependentDeduction),
  );
  const irrf = round2(progressive(irrfBase, tables.irrfBrackets));

  const fgts = round2(base * tables.fgtsRate);

  return {
    year: tables.year,
    base: round2(base),
    inss,
    irrfBase,
    irrf,
    fgts,
    employeeDeductions: round2(inss + irrf),
  };
}
