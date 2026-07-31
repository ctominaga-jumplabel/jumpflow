import { describe, expect, it } from "vitest";

import {
  apuracaoFilterSchema,
  apuracaoResumoRows,
  buildApuracao,
  buildApuracaoWorkbook,
  groupEntriesByDay,
  monthsInRange,
  receivablesFilterSchema,
  summarizeReceivables,
  type ReceivablesEntry,
} from "./receivables-journey-core";

/**
 * Suíte de QA (Wave E) complementar a `receivables-journey.test.ts`. Foca em
 * lacunas de risco real dos cenários críticos da jornada Contas a Receber
 * (docs/proposta-contas-a-receber/README.md §3/§4): coerência cards↔apuração,
 * multi-projeto no mesmo dia, degradação honesta quando falta taxa de venda,
 * validação do filtro e enumeração de competências do envio (multi-competência).
 * Tudo é lógica PURA — sem banco/jsdom (flaky nesta máquina).
 */

function entry(overrides: Partial<ReceivablesEntry> = {}): ReceivablesEntry {
  const effectiveHours = overrides.effectiveHours ?? overrides.hours ?? 8;
  const saleRate =
    "saleRate" in overrides ? (overrides.saleRate as number | null) : 200;
  return {
    id: "e1",
    date: "2026-07-01",
    consultantId: "c1",
    consultantName: "Ana",
    contractType: null,
    projectId: "p1",
    projectName: "Atlas",
    clientName: "Vix",
    activityType: "WORKDAY",
    activityLabel: "Dia Útil",
    hours: 8,
    effectiveHours,
    billable: true,
    hasAttachment: false,
    attachmentFileName: null,
    saleRate,
    billedAmount:
      "billedAmount" in overrides
        ? (overrides.billedAmount as number | null)
        : saleRate != null
          ? Math.round(effectiveHours * saleRate * 100) / 100
          : null,
    nonHourlyBilling: false,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Coerência cards ↔ apuração (README item 6: "totais consistentes com os      */
/* cards do item 2"). Regressão financeira: as duas leituras precisam somar    */
/* IGUAL sobre o mesmo recorte.                                                */
/* -------------------------------------------------------------------------- */

describe("coerência summarizeReceivables ↔ buildApuracao", () => {
  const entries = [
    entry({ id: "a", projectId: "p1", consultantId: "c1", effectiveHours: 8, saleRate: 200 }),
    entry({ id: "b", projectId: "p1", consultantId: "c2", consultantName: "Bruno", effectiveHours: 5, saleRate: 100 }),
    entry({ id: "c", projectId: "p2", projectName: "Orion", consultantId: "c3", consultantName: "Carla", effectiveHours: 3, saleRate: 150 }),
    // ON_CALL efetivo fracionado (multiplier já aplicado no load).
    entry({ id: "d", projectId: "p2", projectName: "Orion", consultantId: "c1", activityType: "ON_CALL", hours: 9, effectiveHours: 3, saleRate: 100 }),
    // não faturável: excluído de ambos.
    entry({ id: "e", projectId: "p1", consultantId: "c4", effectiveHours: 8, saleRate: 999, billable: false }),
  ];

  it("horas e valor totais batem entre os cards e a apuração", () => {
    const summary = summarizeReceivables(entries, true);
    const apuracao = buildApuracao(entries, true);
    expect(summary.totalHours).toBe(apuracao.grandTotalHours);
    expect(summary.totalToInvoice).toBe(apuracao.grandTotalAmount);
    // 8+5+3+3 = 19 horas efetivas faturáveis.
    expect(summary.totalHours).toBe(19);
    // 1600 + 500 + 450 + 300 = 2850.
    expect(summary.totalToInvoice).toBe(2850);
  });

  it("allocatedCount = consultores distintos faturáveis (c1,c2,c3), não linhas", () => {
    // c1 aparece em 2 projetos + 1 entrada não faturável de c4 é ignorada.
    expect(summarizeReceivables(entries, true).allocatedCount).toBe(3);
  });

  it("mascara os dois lados de forma consistente sem financials", () => {
    const summary = summarizeReceivables(entries, false);
    const apuracao = buildApuracao(entries, false);
    expect(summary.totalToInvoice).toBeNull();
    expect(apuracao.grandTotalAmount).toBeNull();
    // Horas NUNCA são mascaradas e continuam coerentes.
    expect(summary.totalHours).toBe(apuracao.grandTotalHours);
  });
});

/* -------------------------------------------------------------------------- */
/* Multi-projeto no mesmo dia (README item 3).                                 */
/* -------------------------------------------------------------------------- */

describe("groupEntriesByDay — multi-projeto e bordas", () => {
  it("mantém lançamentos de projetos distintos no MESMO dia num só grupo", () => {
    const days = groupEntriesByDay([
      entry({ id: "a", date: "2026-07-10", projectId: "p1", consultantName: "Ana", effectiveHours: 8 }),
      entry({ id: "b", date: "2026-07-10", projectId: "p2", projectName: "Orion", consultantName: "Bruno", effectiveHours: 4 }),
    ]);
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe("2026-07-10");
    expect(days[0].entries).toHaveLength(2);
    expect(days[0].totalHours).toBe(12);
  });

  it("retorna vazio para lista vazia", () => {
    expect(groupEntriesByDay([])).toEqual([]);
  });

  it("arredonda o total do dia a 2 casas (soma de frações)", () => {
    const days = groupEntriesByDay([
      entry({ id: "a", effectiveHours: 2.005, consultantName: "Ana" }),
      entry({ id: "b", effectiveHours: 1.005, consultantName: "Bruno" }),
    ]);
    // 2.005 + 1.005 = 3.01 (round2).
    expect(days[0].totalHours).toBe(3.01);
  });
});

/* -------------------------------------------------------------------------- */
/* Degradação honesta quando falta taxa de venda (risco: subfaturamento        */
/* silencioso). Documenta o comportamento atual — ver "Riscos" no relatório.   */
/* -------------------------------------------------------------------------- */

describe("taxa de venda ausente (saleRate null em lançamento faturável)", () => {
  it("card 'Valor a faturar' NÃO conta a hora sem taxa, mas as horas somam", () => {
    const entries = [
      entry({ id: "a", consultantId: "c1", effectiveHours: 8, saleRate: 200 }),
      // faturável, mas sem taxa de venda resolvida (saleRate/billedAmount null).
      entry({ id: "b", consultantId: "c2", consultantName: "Bruno", effectiveHours: 5, saleRate: null }),
    ];
    const summary = summarizeReceivables(entries, true);
    expect(summary.totalHours).toBe(13); // conta as 5h sem taxa
    expect(summary.totalToInvoice).toBe(1600); // mas só fatura as 8h com taxa
    expect(summary.allocatedCount).toBe(2);
  });

  it("apuração: consultor sem taxa tem valor 0 e puxa a média ponderada p/ baixo", () => {
    const apuracao = buildApuracao(
      [
        entry({ id: "a", consultantId: "c1", effectiveHours: 10, saleRate: 200 }), // 2000
        entry({ id: "b", consultantId: "c1", effectiveHours: 10, saleRate: null }), // 0
      ],
      true,
    );
    const ana = apuracao.projects[0].consultants[0];
    expect(ana.totalHours).toBe(20);
    expect(ana.totalAmount).toBe(2000);
    // média ponderada = 2000/20 = 100 (metade das horas sem taxa "dilui" o valor/hora).
    expect(ana.saleRate).toBe(100);
  });
});

/* -------------------------------------------------------------------------- */
/* Sinais: subfaturamento (unrated) + cobrança não-horária (review #3).        */
/* -------------------------------------------------------------------------- */

describe("sinais unratedBillableHours + nonHourlyBilling", () => {
  it("summarize expõe horas faturáveis sem taxa e o flag não-horário", () => {
    const entries = [
      entry({ id: "a", consultantId: "c1", effectiveHours: 8, saleRate: 200 }),
      entry({ id: "b", consultantId: "c2", effectiveHours: 5, saleRate: null }),
      // não faturável não conta como subfaturamento.
      entry({ id: "c", consultantId: "c3", effectiveHours: 4, saleRate: null, billable: false }),
    ];
    const summary = summarizeReceivables(entries, true);
    expect(summary.unratedBillableHours).toBe(5); // só o billable sem taxa
    expect(summary.hasNonHourlyBilling).toBe(false);
  });

  it("sem financials não sinaliza subfaturamento falso (unrated = 0)", () => {
    const entries = [entry({ id: "a", effectiveHours: 8, saleRate: null })];
    expect(summarizeReceivables(entries, false).unratedBillableHours).toBe(0);
  });

  it("propaga nonHourlyBilling para summary e apuração por projeto/total", () => {
    const entries = [
      entry({ id: "a", projectId: "p1", effectiveHours: 8, saleRate: 200, nonHourlyBilling: true }),
      entry({ id: "b", projectId: "p2", projectName: "Orion", effectiveHours: 5, saleRate: 100 }),
    ];
    expect(summarizeReceivables(entries, true).hasNonHourlyBilling).toBe(true);
    const apuracao = buildApuracao(entries, true);
    expect(apuracao.hasNonHourlyBilling).toBe(true);
    const p1 = apuracao.projects.find((p) => p.projectId === "p1");
    const p2 = apuracao.projects.find((p) => p.projectId === "p2");
    expect(p1?.nonHourlyBilling).toBe(true);
    expect(p2?.nonHourlyBilling).toBe(false);
  });

  it("apuração agrega unrated por projeto e no total geral", () => {
    const apuracao = buildApuracao(
      [
        entry({ id: "a", projectId: "p1", consultantId: "c1", effectiveHours: 8, saleRate: 200 }),
        entry({ id: "b", projectId: "p1", consultantId: "c2", effectiveHours: 3, saleRate: null }),
        entry({ id: "c", projectId: "p2", projectName: "Orion", consultantId: "c3", effectiveHours: 2, saleRate: null }),
      ],
      true,
    );
    const p1 = apuracao.projects.find((p) => p.projectId === "p1");
    expect(p1?.unratedBillableHours).toBe(3);
    expect(apuracao.grandUnratedBillableHours).toBe(5);
  });
});

/* -------------------------------------------------------------------------- */
/* apuracaoFilterSchema — from/to OBRIGATÓRIOS (review BAIXO #7).               */
/* -------------------------------------------------------------------------- */

describe("apuracaoFilterSchema — período obrigatório", () => {
  it("rejeita ausência de from/to (nunca roda all-time)", () => {
    expect(apuracaoFilterSchema.safeParse({}).success).toBe(false);
    expect(apuracaoFilterSchema.safeParse({ from: "2026-07-01" }).success).toBe(false);
    expect(apuracaoFilterSchema.safeParse({ to: "2026-07-31" }).success).toBe(false);
  });

  it("aceita período completo + cliente + projetos", () => {
    const parsed = apuracaoFilterSchema.parse({
      from: "2026-07-01",
      to: "2026-07-31",
      clientId: "cli1",
      projectIds: ["p1", "p2"],
    });
    expect(parsed.from).toBe("2026-07-01");
    expect(parsed.to).toBe("2026-07-31");
    expect(parsed.projectIds).toEqual(["p1", "p2"]);
  });

  it("rejeita range invertido", () => {
    expect(
      apuracaoFilterSchema.safeParse({ from: "2026-07-31", to: "2026-07-01" }).success,
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* buildApuracao — bordas.                                                     */
/* -------------------------------------------------------------------------- */

describe("buildApuracao — bordas", () => {
  it("recorte só com não faturáveis → nenhum projeto, totais zerados/nulos", () => {
    const apuracao = buildApuracao(
      [entry({ id: "a", billable: false }), entry({ id: "b", billable: false })],
      true,
    );
    expect(apuracao.projects).toEqual([]);
    expect(apuracao.grandTotalHours).toBe(0);
    expect(apuracao.grandTotalAmount).toBe(0);
  });

  it("lista vazia → apuração vazia coerente", () => {
    const apuracao = buildApuracao([], true);
    expect(apuracao.projects).toEqual([]);
    expect(apuracao.grandTotalHours).toBe(0);
    expect(apuracao.grandTotalAmount).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Export shaping com máscara e vazio.                                         */
/* -------------------------------------------------------------------------- */

describe("apuracaoResumoRows — máscara e vazio", () => {
  it("sem financials, valores do resumo ficam null e sempre há 'Total geral'", () => {
    const rows = apuracaoResumoRows(
      buildApuracao([entry({ id: "a", effectiveHours: 8, saleRate: 200 })], false),
    );
    expect(rows.at(-1)?.label).toBe("Total geral");
    expect(rows.at(-1)?.totalAmount).toBeNull();
    expect(rows.at(-1)?.totalHours).toBe(8);
  });

  it("apuração vazia gera só a linha 'Total geral'", () => {
    const rows = apuracaoResumoRows(buildApuracao([], true));
    expect(rows.map((r) => r.label)).toEqual(["Total geral"]);
    expect(rows[0]).toMatchObject({ totalHours: 0, totalAmount: 0 });
  });
});

describe("buildApuracaoWorkbook (smoke)", () => {
  it("serializa um .xlsx não vazio a partir da apuração", async () => {
    const buffer = await buildApuracaoWorkbook(
      buildApuracao([entry({ id: "a", effectiveHours: 8, saleRate: 200 })], true),
    );
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* receivablesFilterSchema — lacunas (formato de data, blanks, range).         */
/* -------------------------------------------------------------------------- */

describe("receivablesFilterSchema — validação", () => {
  it("rejeita data em formato inválido", () => {
    expect(receivablesFilterSchema.safeParse({ from: "31/07/2026" }).success).toBe(false);
    expect(receivablesFilterSchema.safeParse({ from: "2026-13-01" }).success).toBe(false);
  });

  it("descarta clientId em branco e 'ALL' (vira undefined)", () => {
    expect(receivablesFilterSchema.parse({ clientId: "  " }).clientId).toBeUndefined();
    expect(receivablesFilterSchema.parse({ clientId: "ALL" }).clientId).toBeUndefined();
  });

  it("aceita from == to (range de um único dia)", () => {
    const result = receivablesFilterSchema.safeParse({
      from: "2026-07-15",
      to: "2026-07-15",
    });
    expect(result.success).toBe(true);
  });

  it("aceita apenas 'from' sem 'to' (período aberto)", () => {
    const parsed = receivablesFilterSchema.parse({ from: "2026-07-01" });
    expect(parsed.from).toBe("2026-07-01");
    expect(parsed.to).toBeUndefined();
  });

  it("aceita projectIds como CSV via getAll (array) preservando ordem e dedupe", () => {
    expect(
      receivablesFilterSchema.parse({ projectIds: ["p3", "p1", "p3", "p2"] }).projectIds,
    ).toEqual(["p3", "p1", "p2"]);
  });
});

/* -------------------------------------------------------------------------- */
/* monthsInRange — enumeração de competências do envio (multi-competência).    */
/* Extraída do actions.ts p/ o núcleo puro nesta Wave (ver relatório).         */
/* -------------------------------------------------------------------------- */

describe("monthsInRange", () => {
  it("range dentro de um único mês → uma competência", () => {
    expect(monthsInRange("2026-07-01", "2026-07-31")).toEqual([
      { month: 7, year: 2026 },
    ]);
  });

  it("mesmo dia → uma competência", () => {
    expect(monthsInRange("2026-07-15", "2026-07-15")).toEqual([
      { month: 7, year: 2026 },
    ]);
  });

  it("range de vários meses no mesmo ano → competências inclusivas", () => {
    expect(monthsInRange("2026-05-10", "2026-08-05")).toEqual([
      { month: 5, year: 2026 },
      { month: 6, year: 2026 },
      { month: 7, year: 2026 },
      { month: 8, year: 2026 },
    ]);
  });

  it("range cruzando o fim de ano → rola para janeiro do ano seguinte", () => {
    expect(monthsInRange("2025-11-20", "2026-02-10")).toEqual([
      { month: 11, year: 2025 },
      { month: 12, year: 2025 },
      { month: 1, year: 2026 },
      { month: 2, year: 2026 },
    ]);
  });

  it("respeita o teto de segurança (não estoura para ranges absurdos)", () => {
    // 30 anos: > 240 meses seria ~360; o cap corta em 241 (240 push + 1).
    const months = monthsInRange("2000-01-01", "2030-01-01");
    expect(months.length).toBeLessThanOrEqual(241);
    expect(months[0]).toEqual({ month: 1, year: 2000 });
  });
});
