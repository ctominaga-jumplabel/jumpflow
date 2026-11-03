import { describe, expect, it } from "vitest";
import {
  computeProjectRuleDeadline,
  describeDateRule,
  resolveDateRule,
  slaCalendarFromHolidays,
} from "./business-days";
import {
  applyItemDeadlines,
  evaluateProcess,
  latestCompetenceDeadline,
  type SlaItemFact,
} from "./evaluate";
import {
  buildInvoiceWindows,
  invoiceWindowWarnings,
  windowForReceipt,
  windowForReceivedAt,
} from "./invoice-windows";
import { slaConfigUpdateSchema, slaProjectRuleSchema } from "./schemas";
import { SLA_SETTINGS_DEFAULTS, SLA_STAGE_DEFAULTS, type SlaConfig } from "./types";

const cal = slaCalendarFromHolidays(
  [
    { date: "2026-11-02", name: "Finados", scope: "NATIONAL" },
    { date: "2026-11-20", name: "Consciência Negra", scope: "NATIONAL" },
  ],
  false,
);
const oct = { year: 2026, month: 10 };

const baseConfig: SlaConfig = {
  settings: { ...SLA_SETTINGS_DEFAULTS },
  stages: SLA_STAGE_DEFAULTS.map((s) => ({ ...s })),
  invoiceTiers: [],
  projectRules: [],
};

const tier2 = {
  label: "Janela 2",
  receipt: { kind: "FIXED_DAY" as const, value: 25, monthOffset: 1 },
  payment: { kind: "FIXED_DAY" as const, value: 30, monthOffset: 1 },
  sortOrder: 0,
  active: true,
};

function fact(partial: Partial<SlaItemFact>): SlaItemFact {
  return { id: "x", label: "Item", href: "/app", applicable: true, done: false, doneAt: null, ...partial };
}

describe("resolveDateRule", () => {
  it("BUSINESS_DAY = N-ésimo dia útil do mês (Finados pulado)", () => {
    // nov/2026: 02 é feriado → 1º útil = 03, 5º útil = 09.
    expect(resolveDateRule({ kind: "BUSINESS_DAY", value: 1, monthOffset: 1 }, oct, cal)).toBe("2026-11-03");
    expect(resolveDateRule({ kind: "BUSINESS_DAY", value: 5, monthOffset: 1 }, oct, cal)).toBe("2026-11-09");
  });
  it("FIXED_DAY em dia não útil antecipa; limita ao fim do mês", () => {
    // 21/11/2026 = sábado → sexta 20 é feriado → quinta 19.
    expect(resolveDateRule({ kind: "FIXED_DAY", value: 21, monthOffset: 1 }, oct, cal)).toBe("2026-11-19");
    // dia 31 em novembro → 30/11 (segunda).
    expect(resolveDateRule({ kind: "FIXED_DAY", value: 31, monthOffset: 1 }, oct, cal)).toBe("2026-11-30");
    // monthOffset 0 = o próprio mês de competência (25/10/2026 = domingo → 23).
    expect(resolveDateRule({ kind: "FIXED_DAY", value: 25, monthOffset: 0 }, oct, cal)).toBe("2026-10-23");
  });
  it("FIXED_DAY no dia 1 não útil não volta para o mês anterior", () => {
    // 01/11/2026 = domingo → 1º útil seguinte (02 feriado) = 03.
    expect(resolveDateRule({ kind: "FIXED_DAY", value: 1, monthOffset: 1 }, oct, cal)).toBe("2026-11-03");
  });
  it("descreve a regra", () => {
    expect(describeDateRule({ kind: "BUSINESS_DAY", value: 5, monthOffset: 1 })).toBe("5º dia útil do mês seguinte");
    expect(describeDateRule({ kind: "FIXED_DAY", value: 25, monthOffset: 0 })).toBe("dia 25 do mês de competência");
  });
});

describe("computeProjectRuleDeadline", () => {
  it("BUSINESS_DAYS segue a âncora fim do mês", () => {
    expect(
      computeProjectRuleDeadline({ mode: "BUSINESS_DAYS", businessDays: 3, fixedDay: null, monthOffset: 1 }, oct, cal),
    ).toBe("2026-11-05");
    expect(
      computeProjectRuleDeadline({ mode: "BUSINESS_DAYS", businessDays: 0, fixedDay: null, monthOffset: 1 }, oct, cal),
    ).toBe("2026-10-30");
  });
  it("FIXED_DAY trava o dia do mês", () => {
    expect(
      computeProjectRuleDeadline({ mode: "FIXED_DAY", businessDays: null, fixedDay: 10, monthOffset: 1 }, oct, cal),
    ).toBe("2026-11-10");
  });
});

describe("janelas de envio da NF", () => {
  it("janela padrão vem das etapas Envio da NF / Pagamento", () => {
    const windows = buildInvoiceWindows(baseConfig, oct, cal);
    expect(windows).toEqual([
      { index: 1, label: "Janela padrão", receiptDeadline: "2026-11-12", paymentDate: "2026-11-16", primary: true },
    ]);
  });
  it("janelas adicionais ordenadas pelo prazo de envio", () => {
    const config = {
      ...baseConfig,
      invoiceTiers: [
        { ...tier2, label: "Janela 3", receipt: { kind: "FIXED_DAY" as const, value: 10, monthOffset: 2 }, payment: { kind: "FIXED_DAY" as const, value: 16, monthOffset: 2 } },
        tier2,
        { ...tier2, label: "Inativa", active: false },
      ],
    };
    const windows = buildInvoiceWindows(config, oct, cal);
    expect(windows.map((w) => [w.index, w.label, w.receiptDeadline, w.paymentDate])).toEqual([
      [1, "Janela padrão", "2026-11-12", "2026-11-16"],
      [2, "Janela 2", "2026-11-25", "2026-11-30"],
      [3, "Janela 3", "2026-12-10", "2026-12-16"],
    ]);
    expect(windowForReceipt(windows, "2026-11-12")?.index).toBe(1);
    expect(windowForReceipt(windows, "2026-11-13")?.index).toBe(2);
    expect(windowForReceipt(windows, "2026-12-11")).toBeNull();
    // 23:00 BRT do dia 12 ainda é a janela 1 (dia em São Paulo).
    expect(windowForReceivedAt(windows, "2026-11-13T02:00:00.000Z")?.index).toBe(1);
    expect(invoiceWindowWarnings(windows)).toEqual([]);
  });
  it("avisa janela que paga antes de receber ou antes da anterior", () => {
    const config = {
      ...baseConfig,
      invoiceTiers: [{ ...tier2, payment: { kind: "FIXED_DAY" as const, value: 10, monthOffset: 1 } }],
    };
    const warnings = invoiceWindowWarnings(buildInvoiceWindows(config, oct, cal));
    expect(warnings.some((w) => w.includes("vence antes do prazo de envio"))).toBe(true);
    expect(warnings.some((w) => w.includes("paga antes da janela anterior"))).toBe(true);
  });
});

describe("prazo por item na avaliação", () => {
  it("SLA do projeto substitui o prazo da etapa só no faturamento e só para o projeto", () => {
    const config: SlaConfig = {
      ...baseConfig,
      projectRules: [
        {
          id: "r1",
          projectId: "p1",
          projectName: "P1",
          clientName: "C",
          stageKey: "BILLING_RELEASE",
          mode: "FIXED_DAY",
          businessDays: null,
          fixedDay: 25,
          monthOffset: 0,
          warningBusinessDays: 2,
          active: true,
          notes: null,
        },
      ],
    };
    const facts = [fact({ id: "br:p1", projectIds: ["p1"] }), fact({ id: "br:p2", projectIds: ["p2"] })];
    const billing = applyItemDeadlines({ process: "HOURS_TO_BILLING", stageKey: "BILLING_RELEASE", competence: oct, config, calendar: cal, facts });
    expect(billing[0]).toMatchObject({ deadline: "2026-10-23", warningBusinessDays: 2, deadlineNote: "SLA do projeto" });
    expect(billing[1].deadline).toBeUndefined();

    // Hoje 26/10: p1 (prazo 23/10) já atrasado; p2 segue o global (03/11).
    const evaluation = evaluateProcess({
      process: "HOURS_TO_BILLING",
      competence: oct,
      config,
      calendar: cal,
      today: "2026-10-26",
      facts: { BILLING_RELEASE: facts },
    });
    const stage = evaluation.stages.find((s) => s.stage.stageKey === "BILLING_RELEASE")!;
    expect(stage.deadline).toBe("2026-11-03");
    expect(stage.items.find((i) => i.id === "br:p1")?.status).toBe("OVERDUE");
    expect(stage.items.find((i) => i.id === "br:p2")?.status).toBe("PENDING_OK");
    expect(stage.status).toBe("OVERDUE");
    // Contagem segue a pendência mais crítica (23/10), não o prazo global.
    expect(stage.criticalDeadline).toBe("2026-10-23");
    expect(stage.businessDaysOverdue).toBe(1);
    expect(stage.businessDaysRemaining).toBeNull();
  });

  it("regra inativa é ignorada", () => {
    const config: SlaConfig = {
      ...baseConfig,
      projectRules: [
        { id: "r1", projectId: "p1", projectName: "P1", clientName: "C", stageKey: "BILLING_RELEASE", mode: "FIXED_DAY", businessDays: null, fixedDay: 25, monthOffset: 0, warningBusinessDays: 1, active: false, notes: null },
      ],
    };
    const out = applyItemDeadlines({ process: "HOURS_TO_BILLING", stageKey: "BILLING_RELEASE", competence: oct, config, calendar: cal, facts: [fact({ projectIds: ["p1"] })] });
    expect(out[0].deadline).toBeUndefined();
  });

  it("pagamento vence na data da janela em que a NF chegou", () => {
    const config: SlaConfig = { ...baseConfig, invoiceTiers: [tier2] };
    const facts = [
      fact({ id: "pay:a", invoiceReceivedAt: "2026-11-10T12:00:00.000Z" }),
      fact({ id: "pay:b", invoiceReceivedAt: "2026-11-20T12:00:00.000Z" }),
      fact({ id: "pay:c", invoiceReceivedAt: "2026-11-27T12:00:00.000Z" }),
      fact({ id: "pay:d", invoiceReceivedAt: null }),
    ];
    const out = applyItemDeadlines({ process: "HOURS_TO_PAYMENT", stageKey: "PAYMENT", competence: oct, config, calendar: cal, facts });
    expect(out[0].deadline).toBeUndefined();
    expect(out[1]).toMatchObject({ deadline: "2026-11-30", deadlineNote: "NF na janela 2 (Janela 2)" });
    // Depois da última janela: mesmo prazo da janela padrão (2 dias úteis) após o recebimento.
    expect(out[2].deadline).toBe("2026-12-01");
    expect(out[2].deadlineNote).toContain("após a última janela");
    expect(out[3].deadline).toBeUndefined();

    // 17/11: a NF da janela 2 ainda está no prazo de pagamento (30/11).
    const evaluation = evaluateProcess({
      process: "HOURS_TO_PAYMENT",
      competence: oct,
      config,
      calendar: cal,
      today: "2026-11-17",
      facts: { PAYMENT: [facts[1]] },
    });
    const payment = evaluation.stages.find((s) => s.stage.stageKey === "PAYMENT")!;
    expect(payment.items[0].status).toBe("PENDING_OK");
    expect(payment.status).toBe("PENDING_OK");
  });

  it("sem etapas de NF ativas não há janelas", () => {
    const config: SlaConfig = {
      ...baseConfig,
      invoiceTiers: [tier2],
      stages: baseConfig.stages.map((st) => (st.stageKey === "INVOICE_RECEIPT" ? { ...st, active: false } : st)),
    };
    expect(buildInvoiceWindows(config, oct, cal)).toEqual([]);
  });

  it("último prazo da competência considera janelas e regras de projeto", () => {
    expect(latestCompetenceDeadline(baseConfig, oct, cal)).toBe("2026-11-16");
    expect(latestCompetenceDeadline({ ...baseConfig, invoiceTiers: [tier2] }, oct, cal)).toBe("2026-11-30");
  });
});

describe("validação", () => {
  it("aceita janelas válidas e rejeita dia útil fora do intervalo", () => {
    const base = {
      settings: { paymentDay: 16, considerStateHolidays: false },
      stages: [{ process: "HOURS_TO_PAYMENT", stageKey: "PAYMENT", label: "Pagamento", businessDays: 0, warningBusinessDays: 1, active: true }],
    };
    expect(slaConfigUpdateSchema.safeParse({ ...base, invoiceTiers: [tier2] }).success).toBe(true);
    expect(slaConfigUpdateSchema.safeParse(base).success).toBe(true);
    const bad = slaConfigUpdateSchema.safeParse({
      ...base,
      invoiceTiers: [{ ...tier2, receipt: { kind: "BUSINESS_DAY", value: 30, monthOffset: 1 } }],
    });
    expect(bad.success).toBe(false);
  });
  it("regra de projeto exige o valor do modo e normaliza o outro", () => {
    const ok = slaProjectRuleSchema.parse({
      projectId: "p1",
      stageKey: "BILLING_RELEASE",
      mode: "BUSINESS_DAYS",
      businessDays: 3,
      fixedDay: 25,
      monthOffset: 0,
      warningBusinessDays: 1,
      active: true,
      notes: "",
    });
    expect(ok).toMatchObject({ fixedDay: null, monthOffset: 1, notes: null });
    expect(
      slaProjectRuleSchema.safeParse({ projectId: "p1", stageKey: "BILLING_RELEASE", mode: "FIXED_DAY", fixedDay: null, warningBusinessDays: 1, active: true }).success,
    ).toBe(false);
    expect(
      slaProjectRuleSchema.safeParse({ projectId: "p1", stageKey: "PAYMENT", mode: "BUSINESS_DAYS", businessDays: 1, warningBusinessDays: 1, active: true }).success,
    ).toBe(false);
  });
});
