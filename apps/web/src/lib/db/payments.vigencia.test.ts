import { describe, expect, it, vi } from "vitest";

/**
 * Vigência da compensação (`activeOn`, payments.ts ~:79-88) exercida através do
 * comportamento observável de `computeConsultantMonthlyPayment` — a função pura
 * `activeOn` NÃO é exportada, então validamos a seleção pela virada do mês
 * (`start`) que o compute usa.
 *
 * Regra de vigência (leitura direta da implementação):
 *   ativa = startsAt <= start && (endsAt == null || start < endsAt)
 *   entre as ativas, escolhe a de MAIOR startsAt (mais recente <= start).
 * `endsAt` é EXCLUSIVO: endsAt == start => já NÃO é vigente.
 *
 * Cobre o bug de origem: compensação com vigência retroativa ao 1º do mês entra;
 * compensação que só começa depois do mês-alvo faz o consultor ser PULADO (null).
 *
 * Também reforça o modo de precificação PJ COMBINADO com vigência (HOURLY vs
 * FIXED vs null) no nível do compute (o unitário puro vive em amounts.test.ts).
 *
 * Função PURA: sem I/O — o client do banco é apenas um stub (mesmo padrão dos
 * demais testes de payments).
 */

vi.mock("@jumpflow/database", () => ({
  prisma: {},
  Prisma: { JsonNull: "__JsonNull__" },
}));

import { computeConsultantMonthlyPayment } from "@/lib/db/payments";
import type { ProjectRateWindow } from "@/lib/consultants/project-rate";

const MONTH = 7; // Julho
const YEAR = 2026;
const start = new Date(Date.UTC(YEAR, MONTH - 1, 1)); // 01/07/2026 (virada do mês)
const entryDate = new Date(Date.UTC(YEAR, MONTH - 1, 10)); // 10/07/2026

const noRates = new Map<string, ProjectRateWindow[]>();

type PjMode = "HOURLY" | "FIXED" | null;

/** Uma compensação PJ com vigência explícita. */
function comp(opts: {
  startsAt: Date;
  endsAt?: Date | null;
  pjRateMode?: PjMode;
  hourlyRate?: number;
  pjAmount?: number;
}) {
  return {
    contractType: "PJ" as const,
    pjRateMode: opts.pjRateMode ?? null,
    hourlyRate: opts.hourlyRate ?? 0,
    cltAmount: 0,
    pjAmount: opts.pjAmount ?? 0,
    benefitCardAmount: 0,
    discountRules: null,
    startsAt: opts.startsAt,
    endsAt: opts.endsAt ?? null,
  };
}

function record(compensations: ReturnType<typeof comp>[]) {
  return { compensations, benefits: [] as never[] };
}

function entry(projectId: string, projectName: string, hours: number) {
  return { projectId, date: entryDate, hours, multiplier: 1, project: { name: projectName } };
}

function run(consultantRecord: ReturnType<typeof record>, approvedEntries = [entry("p1", "Alpha", 10)]) {
  return computeConsultantMonthlyPayment({
    consultantId: "c1",
    consultantRecord,
    approvedEntries,
    adHocs: [],
    start,
    projectRateWindows: noRates,
  });
}

describe("computeConsultantMonthlyPayment — vigência (activeOn)", () => {
  it("startsAt = 01/07/2026 é vigente no mês-alvo Julho/2026 (retroativa ao 1º dia OK)", () => {
    // startsAt == start => `startsAt <= start` inclui a igualdade.
    const result = run(
      record([comp({ startsAt: new Date(Date.UTC(YEAR, MONTH - 1, 1)), pjRateMode: "HOURLY", hourlyRate: 100 })]),
    );

    expect(result).not.toBeNull();
    expect(result!.pjAmount).toBeCloseTo(1000, 6); // 10h x 100
    expect(result!.totalAmount).toBeCloseTo(1000, 6);
  });

  it("startsAt = 10/08/2026 NÃO é vigente em Julho/2026 => consultor pulado (null) [bug de origem]", () => {
    const result = run(
      record([comp({ startsAt: new Date(Date.UTC(YEAR, MONTH, 10)), pjRateMode: "HOURLY", hourlyRate: 100 })]),
    );

    expect(result).toBeNull();
  });

  it("duas compensações (uma antes, uma depois do início do mês) => usa a de antes (a de depois é filtrada)", () => {
    // Antes: rate 100 (vigente). Depois: rate 999 (startsAt 15/07 > 01/07 => fora).
    const result = run(
      record([
        comp({ startsAt: new Date(Date.UTC(2026, 0, 1)), pjRateMode: "HOURLY", hourlyRate: 100 }),
        comp({ startsAt: new Date(Date.UTC(YEAR, MONTH - 1, 15)), pjRateMode: "HOURLY", hourlyRate: 999 }),
      ]),
    );

    expect(result).not.toBeNull();
    expect(result!.pjAmount).toBeCloseTo(1000, 6); // 10h x 100 (não 999)
  });

  it("duas compensações ambas <= início do mês => escolhe a de startsAt mais recente", () => {
    // Antiga: rate 100 (01/01). Recente: rate 200 (01/06). Ambas <= 01/07.
    const result = run(
      record([
        comp({ startsAt: new Date(Date.UTC(2026, 0, 1)), pjRateMode: "HOURLY", hourlyRate: 100 }),
        comp({ startsAt: new Date(Date.UTC(2026, 5, 1)), pjRateMode: "HOURLY", hourlyRate: 200 }),
      ]),
    );

    expect(result).not.toBeNull();
    expect(result!.pjAmount).toBeCloseTo(2000, 6); // 10h x 200 (mais recente)
  });

  it("endsAt anterior ao mês => compensação encerrada NÃO é vigente (null)", () => {
    const result = run(
      record([
        comp({
          startsAt: new Date(Date.UTC(2026, 0, 1)),
          endsAt: new Date(Date.UTC(2026, 5, 1)), // encerra 01/06, antes de Julho
          pjRateMode: "HOURLY",
          hourlyRate: 100,
        }),
      ]),
    );

    expect(result).toBeNull();
  });

  it("endsAt EXATAMENTE no 1º do mês (== start) já NÃO é vigente (endsAt exclusivo)", () => {
    const result = run(
      record([
        comp({
          startsAt: new Date(Date.UTC(2026, 0, 1)),
          endsAt: new Date(Date.UTC(YEAR, MONTH - 1, 1)), // 01/07 == start => start < endsAt é falso
          pjRateMode: "HOURLY",
          hourlyRate: 100,
        }),
      ]),
    );

    expect(result).toBeNull();
  });

  it("compensação vigente com endsAt DEPOIS do início do mês continua ativa", () => {
    const result = run(
      record([
        comp({
          startsAt: new Date(Date.UTC(2026, 0, 1)),
          endsAt: new Date(Date.UTC(YEAR, MONTH, 1)), // encerra 01/08, ainda cobre Julho
          pjRateMode: "HOURLY",
          hourlyRate: 100,
        }),
      ]),
    );

    expect(result).not.toBeNull();
    expect(result!.totalAmount).toBeCloseTo(1000, 6);
  });
});

describe("computeConsultantMonthlyPayment — modo PJ vigente x horas aprovadas", () => {
  it("PJ HOURLY vigente + horas aprovadas => total = horas x taxa", () => {
    const result = run(
      record([comp({ startsAt: new Date(Date.UTC(2026, 0, 1)), pjRateMode: "HOURLY", hourlyRate: 150 })]),
      [entry("p1", "Alpha", 8)],
    );

    expect(result!.pjAmount).toBeCloseTo(1200, 6); // 8h x 150
    expect(result!.totalAmount).toBeCloseTo(1200, 6);
  });

  it("PJ FIXED vigente + horas aprovadas => pjAmount fixo (horas NÃO alteram o total)", () => {
    // hourlyRate 100 x 10h = 1000 nas LINHAS, mas o modo FIXED ignora isso no total.
    const result = run(
      record([
        comp({ startsAt: new Date(Date.UTC(2026, 0, 1)), pjRateMode: "FIXED", hourlyRate: 100, pjAmount: 12000 }),
      ]),
      [entry("p1", "Alpha", 10)],
    );

    expect(result!.pjAmount).toBeCloseTo(12000, 6);
    expect(result!.totalAmount).toBeCloseTo(12000, 6);
    // A linha de horas existe (rastreabilidade) mas não compõe o total no FIXED.
    const p1 = result!.lines.find((l) => l.projectId === "p1")!;
    expect(p1.amount).toBeCloseTo(1000, 6);
  });

  it("PJ null (compat) vigente => tratado como FIXED (usa pjAmount)", () => {
    const result = run(
      record([
        comp({ startsAt: new Date(Date.UTC(2026, 0, 1)), pjRateMode: null, hourlyRate: 100, pjAmount: 9000 }),
      ]),
      [entry("p1", "Alpha", 10)],
    );

    expect(result!.pjAmount).toBeCloseTo(9000, 6);
    expect(result!.totalAmount).toBeCloseTo(9000, 6);
  });
});
