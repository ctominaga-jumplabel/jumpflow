import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `reconcileConsultantPaymentsForConsultants` (payments.ts) — reconciliação
 * escopada disparada pelo Fechamento Operacional.
 *
 * Regras críticas provadas (SEGURANÇA FINANCEIRA):
 *  - Sem pagamento no mês => CRIA (created++, status default OPEN no schema).
 *  - Pagamento OPEN       => RECONCILIA (refreshed++, linhas recriadas, update
 *                            condicional `where status = OPEN`).
 *  - Pagamento != OPEN    => NUNCA reescreve; entra em lockedDivergent SÓ se o
 *                            total recomputado diverge. NENHUM update/delete de
 *                            linha é chamado (asserção sobre o mock).
 *  - Consultor sem compensação => skippedNoCompensation.
 *  - Escopo: só os consultantIds passados são lidos (where consultantId in [...]).
 *
 * Mock do Prisma no mesmo estilo de payments.adhoc.test.ts.
 */

type AnyRow = Record<string, unknown>;

// Dados devolvidos pelas leituras em lote (configuráveis por teste).
const state: {
  entries: AnyRow[];
  adHocs: AnyRow[];
  projectRates: AnyRow[];
  consultants: AnyRow[];
  existingByConsultant: Record<string, AnyRow | null>;
  updateManyCount: number;
} = {
  entries: [],
  adHocs: [],
  projectRates: [],
  consultants: [],
  existingByConsultant: {},
  updateManyCount: 1,
};

// Captura dos writes/args para asserções.
const calls: {
  timeEntryWhere: AnyRow | null;
  adHocWhere: AnyRow | null;
  projectRateWhere: AnyRow | null;
  consultantWhere: AnyRow | null;
  txCreatePayments: AnyRow[];
  txCreateLines: AnyRow[];
  paymentUpdateMany: AnyRow[];
  lineDeleteMany: AnyRow[];
  lineCreateMany: AnyRow[];
  audits: AnyRow[];
} = {
  timeEntryWhere: null,
  adHocWhere: null,
  projectRateWhere: null,
  consultantWhere: null,
  txCreatePayments: [],
  txCreateLines: [],
  paymentUpdateMany: [],
  lineDeleteMany: [],
  lineCreateMany: [],
  audits: [],
};

const txMock = {
  consultantPayment: {
    create: async ({ data }: { data: AnyRow }) => {
      const row = { id: `pay-created-${calls.txCreatePayments.length + 1}`, ...data };
      calls.txCreatePayments.push(row);
      return row;
    },
    updateMany: async ({ where, data }: { where: AnyRow; data: AnyRow }) => {
      calls.paymentUpdateMany.push({ where, data });
      return { count: state.updateManyCount };
    },
  },
  consultantPaymentLine: {
    deleteMany: async ({ where }: { where: AnyRow }) => {
      calls.lineDeleteMany.push(where);
      return { count: 0 };
    },
    createMany: async ({ data }: { data: AnyRow[] }) => {
      calls.lineCreateMany.push(...data);
      return { count: data.length };
    },
  },
  auditEvent: {
    create: async ({ data }: { data: AnyRow }) => {
      calls.audits.push(data);
      return data;
    },
  },
};

vi.mock("@jumpflow/database", () => ({
  prisma: {
    timeEntry: {
      findMany: async ({ where }: { where: AnyRow }) => {
        calls.timeEntryWhere = where;
        return state.entries;
      },
    },
    consultantAdHocPayment: {
      findMany: async ({ where }: { where: AnyRow }) => {
        calls.adHocWhere = where;
        return state.adHocs;
      },
    },
    consultantProjectRate: {
      findMany: async ({ where }: { where: AnyRow }) => {
        calls.projectRateWhere = where;
        return state.projectRates;
      },
    },
    consultant: {
      findMany: async ({ where }: { where: AnyRow }) => {
        calls.consultantWhere = where;
        return state.consultants;
      },
    },
    consultantPayment: {
      findUnique: async ({ where }: { where: AnyRow }) => {
        const key = where.consultantId_month_year as { consultantId: string };
        return state.existingByConsultant[key.consultantId] ?? null;
      },
    },
    auditEvent: {
      create: async ({ data }: { data: AnyRow }) => {
        calls.audits.push(data);
        return data;
      },
    },
    $transaction: async (cb: (tx: unknown) => unknown) => cb(txMock),
  },
  Prisma: { JsonNull: "__JsonNull__" },
}));

import { reconcileConsultantPaymentsForConsultants } from "@/lib/db/payments";

const MONTH = 6;
const YEAR = 2026;
const entryDate = new Date(Date.UTC(YEAR, MONTH - 1, 10));

function pjConsultant(id: string, hourlyRate: number, name = "Consultor") {
  return {
    id,
    name,
    compensations: [
      {
        contractType: "PJ" as const,
        pjRateMode: "HOURLY" as const,
        hourlyRate,
        cltAmount: 0,
        pjAmount: 0,
        benefitCardAmount: 0,
        discountRules: null,
        startsAt: new Date(Date.UTC(2020, 0, 1)),
        endsAt: null,
      },
    ],
    benefits: [],
  };
}

/** Consultor sem NENHUMA compensação vigente. */
function consultantNoComp(id: string, name = "SemComp") {
  return { id, name, compensations: [], benefits: [] };
}

/** CLT puro: folha — NÃO é pagável neste fluxo (só PJ/CLT_FLEX). */
function cltConsultant(id: string, name = "Carla") {
  return {
    id,
    name,
    compensations: [
      {
        contractType: "CLT" as const,
        hourlyRate: 0,
        cltAmount: 5000,
        pjAmount: 0,
        benefitCardAmount: 0,
        discountRules: null,
        startsAt: new Date(Date.UTC(2020, 0, 1)),
        endsAt: null,
      },
    ],
    benefits: [],
  };
}

function entry(consultantId: string, hours: number, projectId = "p1", projectName = "Alpha") {
  return {
    consultantId,
    projectId,
    hours,
    multiplier: 1,
    date: entryDate,
    project: { name: projectName },
  };
}

function resetState() {
  state.entries = [];
  state.adHocs = [];
  state.projectRates = [];
  state.consultants = [];
  state.existingByConsultant = {};
  state.updateManyCount = 1;
  calls.timeEntryWhere = null;
  calls.adHocWhere = null;
  calls.projectRateWhere = null;
  calls.consultantWhere = null;
  calls.txCreatePayments.length = 0;
  calls.txCreateLines.length = 0;
  calls.paymentUpdateMany.length = 0;
  calls.lineDeleteMany.length = 0;
  calls.lineCreateMany.length = 0;
  calls.audits.length = 0;
}

beforeEach(resetState);
afterEach(() => vi.clearAllMocks());

describe("reconcileConsultantPaymentsForConsultants — decisão por estado", () => {
  it("consultor SEM pagamento no mês => CRIA (created++, status não é reescrito p/ != OPEN)", async () => {
    state.consultants = [pjConsultant("c1", 100)];
    state.entries = [entry("c1", 10)]; // 1000
    state.existingByConsultant = { c1: null };

    const result = await reconcileConsultantPaymentsForConsultants({
      month: MONTH,
      year: YEAR,
      consultantIds: ["c1"],
    });

    expect(result.created).toBe(1);
    expect(result.refreshed).toBe(0);
    expect(result.lockedDivergent).toEqual([]);
    expect(result.skippedNoCompensation).toEqual([]);

    expect(calls.txCreatePayments).toHaveLength(1);
    const created = calls.txCreatePayments[0];
    expect(created.consultantId).toBe("c1");
    expect(created.totalAmount).toBeCloseTo(1000, 6);
    // Create NÃO seta status => usa o default OPEN do schema.
    expect(created.status).toBeUndefined();
    // Linhas de projeto criadas; nada de update/delete no caminho de criação.
    expect(calls.lineCreateMany.length).toBeGreaterThan(0);
    expect(calls.paymentUpdateMany).toHaveLength(0);
    expect(calls.lineDeleteMany).toHaveLength(0);
  });

  it("consultor COM pagamento OPEN => RECONCILIA (refreshed++, update where status=OPEN, linhas recriadas)", async () => {
    state.consultants = [pjConsultant("c1", 100)];
    state.entries = [entry("c1", 10)]; // recomputa 1000
    state.existingByConsultant = {
      c1: { id: "pay1", status: "OPEN", totalAmount: 500 }, // valor antigo defasado
    };

    const result = await reconcileConsultantPaymentsForConsultants({
      month: MONTH,
      year: YEAR,
      consultantIds: ["c1"],
    });

    expect(result.refreshed).toBe(1);
    expect(result.created).toBe(0);
    expect(result.lockedDivergent).toEqual([]);

    // Update CONDICIONAL por status OPEN + montante recomputado.
    expect(calls.paymentUpdateMany).toHaveLength(1);
    const upd = calls.paymentUpdateMany[0];
    expect(upd.where).toMatchObject({ id: "pay1", status: "OPEN" });
    expect((upd.data as AnyRow).totalAmount).toBeCloseTo(1000, 6);

    // Linhas substituídas (delete + recreate) escopadas ao pagamento existente.
    expect(calls.lineDeleteMany).toHaveLength(1);
    expect(calls.lineDeleteMany[0]).toMatchObject({ consultantPaymentId: "pay1" });
    expect(calls.lineCreateMany.length).toBeGreaterThan(0);
    // Nenhuma criação de pagamento novo.
    expect(calls.txCreatePayments).toHaveLength(0);
  });

  it("pagamento != OPEN e DIVERGENTE => lockedDivergent, SEM reescrever (nenhum update/delete)", async () => {
    state.consultants = [pjConsultant("c1", 100, "Ana")];
    state.entries = [entry("c1", 10)]; // recomputa 1000
    state.existingByConsultant = {
      c1: { id: "pay1", status: "WAITING_FOR_INVOICE", totalAmount: 500 },
    };

    const result = await reconcileConsultantPaymentsForConsultants({
      month: MONTH,
      year: YEAR,
      consultantIds: ["c1"],
    });

    expect(result.created).toBe(0);
    expect(result.refreshed).toBe(0);
    expect(result.lockedDivergent).toEqual([
      {
        consultantId: "c1",
        name: "Ana",
        currentTotal: 500,
        recomputedTotal: 1000,
        status: "WAITING_FOR_INVOICE",
      },
    ]);

    // SEGURANÇA: nenhuma escrita no pagamento travado.
    expect(calls.paymentUpdateMany).toHaveLength(0);
    expect(calls.lineDeleteMany).toHaveLength(0);
    expect(calls.lineCreateMany).toHaveLength(0);
    expect(calls.txCreatePayments).toHaveLength(0);
  });

  it("pagamento != OPEN e SEM divergência => não trava nem reescreve", async () => {
    state.consultants = [pjConsultant("c1", 100)];
    state.entries = [entry("c1", 10)]; // recomputa 1000 == atual
    state.existingByConsultant = {
      c1: { id: "pay1", status: "PAID", totalAmount: 1000 },
    };

    const result = await reconcileConsultantPaymentsForConsultants({
      month: MONTH,
      year: YEAR,
      consultantIds: ["c1"],
    });

    expect(result.lockedDivergent).toEqual([]);
    expect(result.created).toBe(0);
    expect(result.refreshed).toBe(0);
    expect(calls.paymentUpdateMany).toHaveLength(0);
    expect(calls.lineDeleteMany).toHaveLength(0);
    expect(calls.lineCreateMany).toHaveLength(0);
  });

  it("corrida: update where status=OPEN afeta 0 linhas => trata como travado (divergente reportado, linhas intactas)", async () => {
    state.consultants = [pjConsultant("c1", 100, "Bea")];
    state.entries = [entry("c1", 10)]; // recomputa 1000
    state.existingByConsultant = {
      c1: { id: "pay1", status: "OPEN", totalAmount: 500 },
    };
    state.updateManyCount = 0; // saiu de OPEN entre leitura e escrita

    const result = await reconcileConsultantPaymentsForConsultants({
      month: MONTH,
      year: YEAR,
      consultantIds: ["c1"],
    });

    expect(result.refreshed).toBe(0);
    expect(result.lockedDivergent).toEqual([
      {
        consultantId: "c1",
        name: "Bea",
        currentTotal: 500,
        recomputedTotal: 1000,
        status: "OPEN",
      },
    ]);
    // updateMany foi TENTADO (condicional), mas linhas NÃO foram tocadas.
    expect(calls.paymentUpdateMany).toHaveLength(1);
    expect(calls.lineDeleteMany).toHaveLength(0);
    expect(calls.lineCreateMany).toHaveLength(0);
  });

  it("consultor no escopo SEM compensação vigente => skippedNoCompensation (nada é escrito)", async () => {
    state.consultants = [consultantNoComp("c1", "SemComp")];
    state.entries = [entry("c1", 10)];
    state.existingByConsultant = { c1: null };

    const result = await reconcileConsultantPaymentsForConsultants({
      month: MONTH,
      year: YEAR,
      consultantIds: ["c1"],
    });

    expect(result.skippedNoCompensation).toEqual([
      { consultantId: "c1", name: "SemComp" },
    ]);
    expect(result.created).toBe(0);
    expect(calls.txCreatePayments).toHaveLength(0);
    expect(calls.paymentUpdateMany).toHaveLength(0);
  });

  it("consultor no escopo inexistente (sem registro) => skippedNoCompensation", async () => {
    state.consultants = []; // c1 não retorna da consulta
    state.existingByConsultant = {};

    const result = await reconcileConsultantPaymentsForConsultants({
      month: MONTH,
      year: YEAR,
      consultantIds: ["c1"],
    });

    expect(result.skippedNoCompensation).toEqual([
      { consultantId: "c1", name: "Consultor" },
    ]);
  });

  it("escopo: TODAS as leituras restringem por consultantId in [...] (deduplicado)", async () => {
    state.consultants = [pjConsultant("c1", 100), pjConsultant("c2", 100)];
    state.existingByConsultant = { c1: null, c2: null };

    await reconcileConsultantPaymentsForConsultants({
      month: MONTH,
      year: YEAR,
      consultantIds: ["c1", "c2", "c1"], // duplicado
    });

    // dedup preserva ordem de primeira ocorrência.
    expect((calls.timeEntryWhere as AnyRow).consultantId).toEqual({ in: ["c1", "c2"] });
    expect((calls.timeEntryWhere as AnyRow).status).toBe("APPROVED");
    expect((calls.adHocWhere as AnyRow).consultantId).toEqual({ in: ["c1", "c2"] });
    expect((calls.projectRateWhere as AnyRow).consultantId).toEqual({ in: ["c1", "c2"] });
    expect((calls.consultantWhere as AnyRow).id).toEqual({ in: ["c1", "c2"] });
  });

  it("lista vazia (sem consultores no escopo) => retorna cedo, sem tocar no banco", async () => {
    const result = await reconcileConsultantPaymentsForConsultants({
      month: MONTH,
      year: YEAR,
      consultantIds: [],
    });

    expect(result).toEqual({
      created: 0,
      refreshed: 0,
      lockedDivergent: [],
      skippedNoCompensation: [],
      skippedNotPayable: [],
    });
    // Nenhuma leitura em lote sequer aconteceu.
    expect(calls.timeEntryWhere).toBeNull();
    expect(calls.consultantWhere).toBeNull();
  });

  it("CLT puro NÃO é pagável => skippedNotPayable (nada é criado/reconciliado)", async () => {
    state.consultants = [cltConsultant("c1", "Carla")];
    state.entries = [entry("c1", 10)];
    state.existingByConsultant = { c1: null };

    const result = await reconcileConsultantPaymentsForConsultants({
      month: MONTH,
      year: YEAR,
      consultantIds: ["c1"],
    });

    expect(result.skippedNotPayable).toEqual([
      { consultantId: "c1", name: "Carla", contractType: "CLT" },
    ]);
    expect(result.created).toBe(0);
    expect(result.refreshed).toBe(0);
    expect(calls.txCreatePayments).toHaveLength(0);
    expect(calls.paymentUpdateMany).toHaveLength(0);
    expect(calls.lineDeleteMany).toHaveLength(0);
  });

  it("divergência de exatamente R$ 0,01 (travado) É sinalizada (epsilon < 1 centavo)", async () => {
    state.consultants = [pjConsultant("c1", 100, "Ana")];
    state.entries = [entry("c1", 10)]; // recomputa 1000,00
    state.existingByConsultant = {
      c1: { id: "pay1", status: "PAID", totalAmount: 1000.01 },
    };

    const result = await reconcileConsultantPaymentsForConsultants({
      month: MONTH,
      year: YEAR,
      consultantIds: ["c1"],
    });

    expect(result.lockedDivergent).toEqual([
      {
        consultantId: "c1",
        name: "Ana",
        currentTotal: 1000.01,
        recomputedTotal: 1000,
        status: "PAID",
      },
    ]);
    // Auditou a divergência travada (dado sensível fica server-side).
    expect(
      calls.audits.some(
        (a) => a.action === "CONSULTANT_PAYMENT_RECONCILE_LOCKED_DIVERGENT",
      ),
    ).toBe(true);
  });

  it("ad-hoc entra no total recomputado da criação", async () => {
    state.consultants = [pjConsultant("c1", 100)];
    state.entries = [entry("c1", 10)]; // 1000
    state.adHocs = [
      { consultantId: "c1", projectId: "p1", kind: "BONUS", amount: 250, project: { name: "Alpha" } },
    ];
    state.existingByConsultant = { c1: null };

    const result = await reconcileConsultantPaymentsForConsultants({
      month: MONTH,
      year: YEAR,
      consultantIds: ["c1"],
    });

    expect(result.created).toBe(1);
    expect(calls.txCreatePayments[0].totalAmount).toBeCloseTo(1250, 6);
  });
});
