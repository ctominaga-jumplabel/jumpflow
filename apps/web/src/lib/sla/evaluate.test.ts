import { describe, expect, it } from "vitest";
import { slaCalendarFromHolidays } from "./business-days";
import {
  SLA_BROAD_SCOPE,
  buildHistory,
  buildHistoryFromDigests,
  buildSlaFacts,
  digestEvaluations,
  scopeProcessEvaluation,
  classifyItem,
  evaluateProcess,
  evaluateStage,
  type SlaItemFact,
  type SlaRawData,
} from "./evaluate";
import { previewDeadlines, slaConfigUpdateSchema, stageOrderWarnings } from "./schemas";
import { SLA_SETTINGS_DEFAULTS, SLA_STAGE_DEFAULTS, type SlaConfig } from "./types";

const cal = slaCalendarFromHolidays(
  [
    { date: "2026-10-12", name: "Aparecida", scope: "NATIONAL" },
    { date: "2026-11-02", name: "Finados", scope: "NATIONAL" },
    { date: "2026-11-20", name: "Consciência Negra", scope: "NATIONAL" },
  ],
  false,
);
const config: SlaConfig = {
  settings: { ...SLA_SETTINGS_DEFAULTS },
  stages: SLA_STAGE_DEFAULTS.map((s) => ({ ...s })),
};
const oct = { year: 2026, month: 10 };

function fact(partial: Partial<SlaItemFact>): SlaItemFact {
  return {
    id: "x",
    label: "Item",
    href: "/app",
    applicable: true,
    done: false,
    doneAt: null,
    ...partial,
  };
}

describe("classifyItem (deadline 2026-11-06, warning 1)", () => {
  const deadline = "2026-11-06";
  it("done before end of day (Sao Paulo) is on time", () => {
    // 23:30 BRT do dia do prazo = 02:30Z do dia seguinte.
    const r = classifyItem(fact({ done: true, doneAt: "2026-11-07T02:30:00.000Z" }), deadline, "2026-11-10", 1, cal);
    expect(r.status).toBe("ON_TIME_DONE");
  });
  it("done after the deadline is late, with business days of delay", () => {
    const r = classifyItem(fact({ done: true, doneAt: "2026-11-10T15:00:00.000Z" }), deadline, "2026-11-12", 1, cal);
    expect(r.status).toBe("LATE_DONE");
    expect(r.businessDaysLate).toBe(2); // 09 e 10/11
  });
  it("pending with slack is PENDING_OK; within warning is AT_RISK; deadline day is AT_RISK", () => {
    expect(classifyItem(fact({}), deadline, "2026-11-03", 1, cal).status).toBe("PENDING_OK");
    expect(classifyItem(fact({}), deadline, "2026-11-05", 1, cal).status).toBe("AT_RISK");
    expect(classifyItem(fact({}), deadline, "2026-11-06", 1, cal).status).toBe("AT_RISK");
    expect(classifyItem(fact({}), deadline, "2026-11-03", 3, cal).status).toBe("AT_RISK");
  });
  it("pending after the deadline is OVERDUE (weekend counts as at least 1)", () => {
    const r = classifyItem(fact({}), deadline, "2026-11-10", 1, cal);
    expect(r.status).toBe("OVERDUE");
    expect(r.businessDaysLate).toBe(2);
    expect(classifyItem(fact({}), deadline, "2026-11-07", 1, cal).businessDaysLate).toBe(1);
  });
  it("not applicable", () => {
    expect(classifyItem(fact({ applicable: false }), deadline, "2026-11-10", 1, cal).status).toBe("NOT_APPLICABLE");
  });
});

describe("evaluateStage aggregate", () => {
  const stage = SLA_STAGE_DEFAULTS.find((s) => s.process === "HOURS_TO_PAYMENT" && s.stageKey === "PEOPLE_PAYMENT_RELEASE")!;
  it("countdown, % done and aggregate status", () => {
    const r = evaluateStage({
      stage,
      competence: oct,
      settings: config.settings,
      calendar: cal,
      today: "2026-11-04",
      facts: [
        fact({ id: "a", done: true, doneAt: "2026-11-03T12:00:00.000Z" }),
        fact({ id: "b" }),
        fact({ id: "c", applicable: false }),
      ],
    });
    expect(r.deadline).toBe("2026-11-06");
    expect(r.businessDaysRemaining).toBe(2);
    expect(r.businessDaysOverdue).toBeNull();
    expect(r.status).toBe("PENDING_OK");
    expect(r.total).toBe(2);
    expect(r.percentDone).toBe(50);
    expect(r.items[0].id).toBe("b"); // pendentes primeiro
  });
  it("all done late -> LATE_DONE; nothing applicable -> NOT_APPLICABLE", () => {
    const late = evaluateStage({
      stage,
      competence: oct,
      settings: config.settings,
      calendar: cal,
      today: "2026-11-20",
      facts: [fact({ done: true, doneAt: "2026-11-12T12:00:00.000Z" })],
    });
    expect(late.status).toBe("LATE_DONE");
    expect(late.onTimePct).toBe(0);
    const none = evaluateStage({ stage, competence: oct, settings: config.settings, calendar: cal, today: "2026-11-20", facts: [] });
    expect(none.status).toBe("NOT_APPLICABLE");
    expect(none.percentDone).toBeNull();
  });
});

function raw(partial: Partial<SlaRawData>): SlaRawData {
  return {
    competence: oct,
    consultants: { c1: "Ana", c2: "Bruno" },
    projects: {
      p1: { id: "p1", name: "Projeto A", clientId: "cl1", clientName: "Cliente 1", managerName: "Gestora", dailyEntryRequired: true },
    },
    allocations: [],
    entries: [],
    operationClosings: [],
    revenueClosings: [],
    payments: [],
    ...partial,
  };
}

describe("facts from raw data", () => {
  it("timesheet: allocation covering Oct 26-31 requires 5 business days", () => {
    const days = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"];
    const facts = buildSlaFacts(
      raw({
        allocations: [{ consultantId: "c1", projectId: "p1", startDate: "2026-10-26", endDate: null }],
        entries: days.map((date, i) => ({
          id: `e${i}`,
          consultantId: "c1",
          projectId: "p1",
          date,
          status: "SUBMITTED" as const,
          billable: true,
          submittedAt: `${date}T20:00:00.000Z`,
          updatedAt: `${date}T20:00:00.000Z`,
          approvedAt: null,
        })),
      }),
      cal,
    );
    const ts = facts.TIMESHEET_SUBMISSION!;
    expect(ts).toHaveLength(1);
    expect(ts[0].done).toBe(false);
    expect(ts[0].detail).toBe("1 dia útil sem lançamento enviado");
    // Aprovacao: 4 aguardando.
    expect(facts.MANAGER_APPROVAL![0].done).toBe(false);
    expect(facts.MANAGER_APPROVAL![0].responsible).toBe("Gestora");
    // Fechamento e faturamento pendentes para p1.
    expect(facts.OPERATION_CLOSING![0].done).toBe(false);
    expect(facts.BILLING_RELEASE![0].detail).toBe("Fechamento de receita não iniciado");
  });

  it("approval done uses the latest Approval timestamp; closings use closedAt", () => {
    const facts = buildSlaFacts(
      raw({
        entries: [
          { id: "e1", consultantId: "c1", projectId: "p1", date: "2026-10-05", status: "APPROVED", billable: true, submittedAt: "2026-10-05T20:00:00.000Z", updatedAt: "2026-11-10T00:00:00.000Z", approvedAt: "2026-11-02T13:00:00.000Z" },
          { id: "e2", consultantId: "c1", projectId: "p1", date: "2026-10-06", status: "REJECTED", billable: true, submittedAt: null, updatedAt: "2026-10-07T00:00:00.000Z", approvedAt: null },
        ],
        operationClosings: [{ projectId: "p1", status: "CLOSED", closedAt: "2026-11-03T18:00:00.000Z", updatedAt: "2026-11-05T00:00:00.000Z" }],
        revenueClosings: [{ clientId: "cl1", projectId: null, status: "INVOICED", closedAt: "2026-11-04T18:00:00.000Z", updatedAt: "2026-11-09T00:00:00.000Z" }],
      }),
      cal,
    );
    expect(facts.MANAGER_APPROVAL![0]).toMatchObject({ done: true, doneAt: "2026-11-02T13:00:00.000Z" });
    expect(facts.OPERATION_CLOSING![0]).toMatchObject({ done: true, doneAt: "2026-11-03T18:00:00.000Z" });
    // Fechamento de receita no nivel do cliente cobre o projeto.
    expect(facts.BILLING_RELEASE![0]).toMatchObject({ done: true, doneAt: "2026-11-04T18:00:00.000Z" });
  });

  it("payments: CLT is excluded from every payment stage; status rank decides completion", () => {
    const base = {
      peopleReleasedAt: null,
      invoiceRequestSentAt: null,
      invoiceReceivedAt: null,
      invoiceValidatedAt: null,
      approvedAt: null,
      confirmedPaidAt: null,
      updatedAt: "2026-11-10T00:00:00.000Z",
    };
    const facts = buildSlaFacts(
      raw({
        payments: [
          { ...base, id: "pay1", consultantId: "c1", contractType: "PJ", status: "WAITING_FOR_INVOICE", peopleReleasedAt: "2026-11-05T12:00:00.000Z", invoiceRequestSentAt: "2026-11-09T12:00:00.000Z" },
          { ...base, id: "pay2", consultantId: "c2", contractType: "CLT", status: "OPEN" },
          { ...base, id: "pay3", consultantId: "c2", contractType: "PJ", status: "CANCELLED" },
        ],
      }),
      cal,
    );
    expect(facts.PEOPLE_PAYMENT_RELEASE).toHaveLength(1);
    expect(facts.PEOPLE_PAYMENT_RELEASE!.find((f) => f.id.endsWith("pay1"))).toMatchObject({ done: true, doneAt: "2026-11-05T12:00:00.000Z" });
    expect(facts.INVOICE_REQUEST!.find((f) => f.id.endsWith("pay1"))).toMatchObject({ done: true, doneAt: "2026-11-09T12:00:00.000Z" });
    expect(facts.INVOICE_RECEIPT!.find((f) => f.id.endsWith("pay1"))!.done).toBe(false);
    for (const key of ["PEOPLE_PAYMENT_RELEASE", "INVOICE_REQUEST", "INVOICE_RECEIPT", "PAYMENT"] as const) {
      expect(facts[key]!.some((f) => f.id.endsWith("pay2"))).toBe(false);
    }
  });
});

describe("evaluateProcess + history", () => {
  it("evaluates competence Oct 2026 on Nov 10 with area summaries", () => {
    const facts = buildSlaFacts(
      raw({
        payments: [
          {
            id: "pay1",
            consultantId: "c1",
            contractType: "PJ",
            status: "OPEN",
            peopleReleasedAt: null,
            invoiceRequestSentAt: null,
            invoiceReceivedAt: null,
            invoiceValidatedAt: null,
            approvedAt: null,
            confirmedPaidAt: null,
            updatedAt: "2026-11-01T00:00:00.000Z",
          },
        ],
      }),
      cal,
    );
    const r = evaluateProcess({ process: "HOURS_TO_PAYMENT", competence: oct, config, calendar: cal, today: "2026-11-10", facts });
    const byKey = Object.fromEntries(r.stages.map((s) => [s.stage.stageKey, s]));
    expect(byKey.PEOPLE_PAYMENT_RELEASE.status).toBe("OVERDUE");
    expect(byKey.PEOPLE_PAYMENT_RELEASE.businessDaysOverdue).toBe(2);
    expect(byKey.INVOICE_REQUEST.status).toBe("OVERDUE");
    expect(byKey.INVOICE_RECEIPT.status).toBe("PENDING_OK");
    expect(byKey.INVOICE_RECEIPT.businessDaysRemaining).toBe(2);
    const people = r.areas.find((a) => a.area === "PEOPLE")!;
    expect(people.overdue).toBe(1);
    expect(people.onTimePct).toBe(0);

    const history = buildHistory([r]);
    expect(history.competences).toEqual(["2026-10"]);
    expect(history.rows.find((row) => row.stageKey === "PEOPLE_PAYMENT_RELEASE")!.onTimePct).toEqual([0]);
  });
});

describe("config validation and warnings", () => {
  const payload = {
    settings: { paymentDay: 16, considerStateHolidays: false },
    stages: SLA_STAGE_DEFAULTS.map((s) => ({
      process: s.process,
      stageKey: s.stageKey,
      label: s.label,
      businessDays: s.businessDays,
      warningBusinessDays: s.warningBusinessDays,
      active: s.active,
    })),
  };

  it("accepts defaults and rejects negative days", () => {
    expect(slaConfigUpdateSchema.safeParse(payload).success).toBe(true);
    const bad = structuredClone(payload);
    bad.stages[0].businessDays = -1;
    const parsed = slaConfigUpdateSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("Dias úteis não podem ser negativos.");
  });

  it("defaults produce no order warnings", () => {
    expect(stageOrderWarnings(config, [oct, { year: 2026, month: 11 }], cal)).toEqual([]);
  });

  it("warns when the NF request is due before the DP release", () => {
    const tweaked: SlaConfig = {
      ...config,
      stages: config.stages.map((s) =>
        s.stageKey === "INVOICE_REQUEST" ? { ...s, businessDays: 8 } : s,
      ),
    };
    const warnings = stageOrderWarnings(tweaked, [oct], cal);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Solicitação da NF ao consultor");
    expect(warnings[0]).toContain("Liberação do pagamento pelo DP");
  });

  it("previews next competences with the payment date", () => {
    const p = previewDeadlines(config, oct, 2, cal);
    expect(p[0].paymentDate).toBe("2026-11-16");
    expect(p[1].deadlines["HOURS_TO_PAYMENT:INVOICE_REQUEST"]).toBe("2026-12-09");
  });
});

describe("viewer scope", () => {
  const entry = (id: string, projectId: string, consultantId: string, status: "SUBMITTED" | "APPROVED") => ({
    id,
    consultantId,
    projectId,
    date: "2026-10-05",
    status,
    billable: true,
    submittedAt: "2026-10-05T20:00:00.000Z",
    updatedAt: "2026-10-06T20:00:00.000Z",
    approvedAt: status === "APPROVED" ? "2026-10-06T20:00:00.000Z" : null,
  });
  const data = raw({
    projects: {
      p1: { id: "p1", name: "Projeto A", clientId: "cl1", clientName: "Cliente 1", managerName: "Gestora", dailyEntryRequired: true },
      p2: { id: "p2", name: "Projeto B", clientId: "cl1", clientName: "Cliente 1", managerName: "Outro", dailyEntryRequired: true },
    },
    entries: [entry("e1", "p1", "c1", "APPROVED"), entry("e2", "p2", "c2", "SUBMITTED")],
    payments: [
      {
        id: "pay1",
        consultantId: "c1",
        contractType: "PJ",
        status: "OPEN",
        peopleReleasedAt: null,
        invoiceRequestSentAt: null,
        invoiceReceivedAt: null,
        invoiceValidatedAt: null,
        approvedAt: null,
        confirmedPaidAt: null,
        updatedAt: "2026-11-01T00:00:00.000Z",
      },
    ],
  });
  const full = evaluateProcess({
    process: "HOURS_TO_PAYMENT",
    competence: oct,
    config,
    calendar: cal,
    today: "2026-11-10",
    facts: buildSlaFacts(data, cal),
  });
  const byKey = (e: typeof full) => Object.fromEntries(e.stages.map((s) => [s.stage.stageKey, s]));

  it("broad scope keeps everything", () => {
    expect(scopeProcessEvaluation(full, SLA_BROAD_SCOPE)).toEqual(full);
  });

  it("without PAGAMENTOS view, payment stages keep counts but drop items (no names)", () => {
    const scoped = byKey(scopeProcessEvaluation(full, { canSeePayments: false, managedProjectIds: null }));
    const people = scoped.PEOPLE_PAYMENT_RELEASE;
    expect(people.items).toEqual([]);
    expect(people.itemsHidden).toBe(true);
    expect(people.counts.OVERDUE).toBe(1);
    expect(people.status).toBe("OVERDUE");
    expect(JSON.stringify(scoped.INVOICE_REQUEST)).not.toContain("Ana");
    // Etapas operacionais intactas.
    expect(scoped.MANAGER_APPROVAL.items).toHaveLength(2);
  });

  it("project manager sees only managed projects in operational stages, with recomputed aggregates", () => {
    const scoped = byKey(
      scopeProcessEvaluation(full, { canSeePayments: false, managedProjectIds: new Set(["p1"]) }),
    );
    const approval = scoped.MANAGER_APPROVAL;
    expect(approval.items.map((i) => i.label)).toEqual(["Ana"]);
    expect(approval.total).toBe(1);
    expect(approval.status).toBe("ON_TIME_DONE"); // p2 (pendente) fora do escopo
    expect(byKey(full).MANAGER_APPROVAL.status).toBe("OVERDUE");
    expect(scoped.OPERATION_CLOSING.items.every((i) => i.projectIds?.includes("p1"))).toBe(true);
  });

  it("history from digests honors the manager scope", () => {
    const digest = digestEvaluations(oct, { HOURS_TO_PAYMENT: full, HOURS_TO_BILLING: full });
    expect(JSON.stringify(digest)).not.toContain("Ana");
    const broad = buildHistoryFromDigests([digest], "HOURS_TO_PAYMENT", SLA_BROAD_SCOPE);
    const manager = buildHistoryFromDigests([digest], "HOURS_TO_PAYMENT", {
      canSeePayments: false,
      managedProjectIds: new Set(["p1"]),
    });
    const pct = (h: typeof broad) => h.rows.find((r) => r.stageKey === "MANAGER_APPROVAL")!.onTimePct[0];
    expect(pct(broad)).toBe(50);
    expect(pct(manager)).toBe(100);
  });
});
