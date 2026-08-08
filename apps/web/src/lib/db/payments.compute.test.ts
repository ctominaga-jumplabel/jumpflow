import { describe, expect, it } from "vitest";

/**
 * Helper puro `computeConsultantMonthlyPayment` (payments.ts) — extraído do loop
 * de geração e reutilizado pela reconciliação do Fechamento Operacional.
 *
 * Regras cobertas:
 *  - Sem compensação vigente na virada do mês => null (consultor pulado).
 *  - Horas em 2 projetos distintos => 1 linha por projeto (agregação
 *    multi-projeto) e totalAmount coerente.
 *  - Pontuais (ad-hoc) SEMPRE somam ao total, mesmo sem horas.
 *  - Valor/hora por projeto (vigente) tem precedência sobre o hourlyRate.
 *
 * Função PURA: sem I/O — só precisamos do módulo carregado, então o client do
 * banco é apenas um stub (mesmo padrão dos outros testes de payments).
 */

import { vi } from "vitest";

vi.mock("@jumpflow/database", () => ({
  prisma: {},
  Prisma: { JsonNull: "__JsonNull__" },
}));

import { computeConsultantMonthlyPayment } from "@/lib/db/payments";
import type { ProjectRateWindow } from "@/lib/consultants/project-rate";
import { projectRateKey } from "@/lib/consultants/project-rate";

const MONTH = 6;
const YEAR = 2026;
const start = new Date(Date.UTC(YEAR, MONTH - 1, 1));
const entryDate = new Date(Date.UTC(YEAR, MONTH - 1, 10));

function pjRecord(hourlyRate: number, opts?: { benefits?: { type: string; amount: number }[] }) {
  return {
    compensations: [
      {
        contractType: "PJ" as const,
        hourlyRate,
        cltAmount: 0,
        pjAmount: 0,
        benefitCardAmount: 0,
        discountRules: null,
        startsAt: new Date(Date.UTC(2020, 0, 1)),
        endsAt: null,
      },
    ],
    benefits: (opts?.benefits ?? []).map((b) => ({
      type: b.type,
      amount: b.amount,
      startsAt: new Date(Date.UTC(2020, 0, 1)),
      endsAt: null,
    })),
  };
}

function entry(projectId: string, projectName: string, hours: number, multiplier = 1) {
  return { projectId, date: entryDate, hours, multiplier, project: { name: projectName } };
}

function adHoc(amount: number, kind = "BONUS", projectId = "p1", projectName = "Alpha") {
  return { projectId, kind, amount, project: { name: projectName } };
}

const noRates = new Map<string, ProjectRateWindow[]>();

describe("computeConsultantMonthlyPayment — helper puro", () => {
  it("retorna null quando não há compensação vigente na virada do mês", () => {
    const record = pjRecord(100);
    // Vigência começa DEPOIS do início do mês => não ativa em `start`.
    record.compensations[0].startsAt = new Date(Date.UTC(YEAR, MONTH, 1));

    const result = computeConsultantMonthlyPayment({
      consultantId: "c1",
      consultantRecord: record,
      approvedEntries: [entry("p1", "Alpha", 10)],
      adHocs: [],
      start,
      projectRateWindows: noRates,
    });

    expect(result).toBeNull();
  });

  it("horas em 2 projetos distintos => 1 linha por projeto e total coerente", () => {
    const result = computeConsultantMonthlyPayment({
      consultantId: "c1",
      consultantRecord: pjRecord(100),
      approvedEntries: [
        entry("p1", "Alpha", 10), // 10 * 100 = 1000
        entry("p2", "Beta", 5), // 5 * 100 = 500
      ],
      adHocs: [],
      start,
      projectRateWindows: noRates,
    });

    expect(result).not.toBeNull();
    const projectLines = result!.lines.filter((l) => l.projectId !== null);
    expect(projectLines).toHaveLength(2);

    const p1 = projectLines.find((l) => l.projectId === "p1")!;
    const p2 = projectLines.find((l) => l.projectId === "p2")!;
    expect(p1.hours).toBeCloseTo(10, 6);
    expect(p1.amount).toBeCloseTo(1000, 6);
    expect(p2.hours).toBeCloseTo(5, 6);
    expect(p2.amount).toBeCloseTo(500, 6);

    expect(result!.contractType).toBe("PJ");
    expect(result!.pjAmount).toBeCloseTo(1500, 6);
    expect(result!.totalAmount).toBeCloseTo(1500, 6);
  });

  it("agrega múltiplos lançamentos do MESMO projeto numa só linha", () => {
    const result = computeConsultantMonthlyPayment({
      consultantId: "c1",
      consultantRecord: pjRecord(100),
      approvedEntries: [
        entry("p1", "Alpha", 6),
        entry("p1", "Alpha", 4),
      ],
      adHocs: [],
      start,
      projectRateWindows: noRates,
    });

    const projectLines = result!.lines.filter((l) => l.projectId !== null);
    expect(projectLines).toHaveLength(1);
    expect(projectLines[0].hours).toBeCloseTo(10, 6);
    expect(projectLines[0].amount).toBeCloseTo(1000, 6);
    expect(result!.totalAmount).toBeCloseTo(1000, 6);
  });

  it("ad-hoc soma ao total (uma linha extra hours=0)", () => {
    const result = computeConsultantMonthlyPayment({
      consultantId: "c1",
      consultantRecord: pjRecord(100),
      approvedEntries: [entry("p1", "Alpha", 10)], // 1000
      adHocs: [adHoc(500)],
      start,
      projectRateWindows: noRates,
    });

    const adHocLine = result!.lines.find((l) =>
      l.description.startsWith("Remuneracao pontual"),
    )!;
    expect(adHocLine).toBeTruthy();
    expect(adHocLine.hours).toBe(0);
    expect(adHocLine.amount).toBe(500);
    // pjAmount é só a base por horas; o total inclui a pontual.
    expect(result!.pjAmount).toBeCloseTo(1000, 6);
    expect(result!.totalAmount).toBeCloseTo(1500, 6);
  });

  it("consultor SÓ com pontual (sem horas) recebe apenas as pontuais (base zerada)", () => {
    const result = computeConsultantMonthlyPayment({
      consultantId: "c1",
      // base robusta (VR 300) que NÃO deve compor sem horas
      consultantRecord: pjRecord(100, { benefits: [{ type: "MEAL_VOUCHER", amount: 300 }] }),
      approvedEntries: [],
      adHocs: [adHoc(750)],
      start,
      projectRateWindows: noRates,
    });

    expect(result!.totalAmount).toBeCloseTo(750, 6);
    expect(result!.pjAmount).toBeCloseTo(0, 6);
    expect(result!.benefitAmount).toBeCloseTo(0, 6);
    // Nenhuma linha de benefício sem horas.
    expect(result!.lines.some((l) => l.description.startsWith("Beneficio"))).toBe(false);
    expect(
      result!.lines.filter((l) => l.description.startsWith("Remuneracao pontual")),
    ).toHaveLength(1);
  });

  it("valor/hora por projeto vigente tem precedência sobre o hourlyRate acordado", () => {
    const windows = new Map<string, ProjectRateWindow[]>();
    windows.set(projectRateKey("c1", "p1"), [
      { startsAt: new Date(Date.UTC(2020, 0, 1)), endsAt: null, hourlyRate: 200 },
    ]);

    const result = computeConsultantMonthlyPayment({
      consultantId: "c1",
      consultantRecord: pjRecord(100), // acordado 100
      approvedEntries: [entry("p1", "Alpha", 10)],
      adHocs: [],
      start,
      projectRateWindows: windows,
    });

    const p1 = result!.lines.find((l) => l.projectId === "p1")!;
    expect(p1.unitRate).toBeCloseTo(200, 6); // override, não o 100 acordado
    expect(p1.amount).toBeCloseTo(2000, 6);
    expect(result!.totalAmount).toBeCloseTo(2000, 6);
  });
});
