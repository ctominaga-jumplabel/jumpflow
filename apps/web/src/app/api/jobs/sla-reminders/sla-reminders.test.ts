import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Prisma mock (somente leitura) + motor de notificacao com idempotencia
// equivalente ao AutomationEmailLog (referenceKey = evento:dedupe:destinatario).
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  const OCT = { month: 10, year: 2026 };
  const store = {
    sentRefs: new Set<string>(),
    emits: [] as Array<{ event: string; dedupeKey: string; titles: string[]; texts: string[] }>,
    includeAugust: false,
    recipients: [
      { key: "fin@jump.test", channel: "EMAIL" as const, address: "fin@jump.test", name: "Fin" },
      { key: "dp@jump.test", channel: "EMAIL" as const, address: "dp@jump.test", name: "DP" },
    ],
  };
  const isOct = (where: { month?: number; year?: number }) =>
    where.month === OCT.month && where.year === OCT.year;
  // Pagamento esquecido de agosto: so deve escalar enquanto dentro do lookback.
  const isAug = (where: { month?: number; year?: number }) =>
    store.includeAugust && where.month === 8 && where.year === 2026;

  const prismaMock = {
    slaSettings: { findUnique: async () => ({ paymentDay: 16, considerStateHolidays: false }) },
    slaStage: {
      // Configuracao persistida: aviso de 3 dias uteis para o recebimento da NF.
      findMany: async () => [
        {
          process: "HOURS_TO_PAYMENT",
          stageKey: "INVOICE_RECEIPT",
          area: "CONSULTANT",
          label: "Envio da NF pelo consultor",
          anchor: "PAYMENT_DATE",
          businessDays: 2,
          warningBusinessDays: 3,
          sortOrder: 60,
          active: true,
        },
      ],
    },
    holiday: {
      findMany: async () => [
        { date: new Date("2026-11-02T00:00:00.000Z"), name: "Finados", scope: "NATIONAL" },
        { date: new Date("2026-11-20T00:00:00.000Z"), name: "Consciência Negra", scope: "NATIONAL" },
      ],
    },
    allocation: { findMany: async () => [] },
    timeEntry: { findMany: async () => [] },
    approval: { findMany: async () => [] },
    operationClosing: { findMany: async () => [] },
    revenueClosing: { findMany: async () => [] },
    consultantPayment: {
      findMany: async ({ where }: { where: { month: number; year: number } }) =>
        isOct(where) || isAug(where)
          ? [
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
                updatedAt: new Date("2026-11-01T00:00:00.000Z"),
              },
            ]
          : [],
    },
    project: { findMany: async () => [] },
    consultant: { findMany: async () => [{ id: "c1", name: "Ana PJ" }] },
    user: { findMany: async () => [] },
  };
  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: { JsonNull: "__JsonNull__" },
}));

vi.mock("@/lib/db/config", () => ({ isDatabaseConfigured: () => true }));

vi.mock("@/lib/automation/notifications/emit", () => ({
  emitNotification: async (input: {
    event: string;
    dedupeKey: string;
    buildFragment: (r: unknown) => { title: string; blocks?: Array<{ text: string }> } | null;
  }) => {
    let sent = 0;
    let skipped = 0;
    const titles: string[] = [];
    const texts: string[] = [];
    for (const recipient of h.store.recipients) {
      const ref = `${input.event}:${input.dedupeKey}:${recipient.key}`;
      if (h.store.sentRefs.has(ref)) {
        skipped += 1;
        continue;
      }
      const fragment = input.buildFragment(recipient);
      if (!fragment) {
        skipped += 1;
        continue;
      }
      titles.push(fragment.title);
      texts.push((fragment.blocks ?? []).map((b) => b.text).join("\n"));
      h.store.sentRefs.add(ref);
      sent += 1;
    }
    h.store.emits.push({ event: input.event, dedupeKey: input.dedupeKey, titles, texts });
    return { sent, skipped, failed: 0 };
  },
}));

import { runSlaReminders } from "@/lib/automation/sla-reminders";
import * as route from "./route";

beforeEach(() => {
  h.store.sentRefs.clear();
  h.store.emits = [];
  h.store.includeAugust = false;
});

describe("runSlaReminders", () => {
  // 10/11/2026 08:00 BRT (terca).
  const tuesday = new Date("2026-11-10T11:00:00.000Z");

  it("emits OVERDUE for late stages and APPROACHING within the warning window", async () => {
    const result = await runSlaReminders({ now: tuesday, appUrl: "https://flow.test" });
    expect(result.skipped).toBe(false);
    expect(result.competences).toEqual(["2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(result.overdue).toBe(2); // liberacao DP (06/11) + solicitacao NF (09/11)
    expect(result.approaching).toBe(1); // recebimento NF (12/11, aviso 3)
    expect(result.sent).toBe(6); // 3 etapas x 2 destinatarios

    const events = h.store.emits.map((e) => `${e.event}:${e.dedupeKey}`).sort();
    expect(events).toEqual([
      "SLA_DEADLINE_APPROACHING:2026-10:HOURS_TO_PAYMENT:INVOICE_RECEIPT:2026-11-10",
      "SLA_OVERDUE:2026-10:HOURS_TO_PAYMENT:INVOICE_REQUEST:2026-11-10",
      "SLA_OVERDUE:2026-10:HOURS_TO_PAYMENT:PEOPLE_PAYMENT_RELEASE:2026-11-10",
    ]);
    const people = h.store.emits.find((e) => e.dedupeKey.includes("PEOPLE_PAYMENT_RELEASE"))!;
    expect(people.titles[0]).toContain("SLA atrasado: Liberação do pagamento pelo DP — 2 dias úteis");
    const receipt = h.store.emits.find((e) => e.dedupeKey.includes("INVOICE_RECEIPT"))!;
    expect(receipt.titles[0]).toContain("faltam 2 dias úteis");
  });

  it("payment-stage e-mails carry only counts, never consultant names", async () => {
    await runSlaReminders({ now: tuesday });
    const payment = h.store.emits.filter((e) => e.dedupeKey.includes("2026-10:HOURS_TO_PAYMENT"));
    expect(payment.length).toBeGreaterThan(0);
    for (const e of payment) {
      for (const text of e.texts) {
        expect(text).not.toContain("Ana PJ");
        expect(text).toContain("Atrasados");
      }
    }
  });

  it("keeps escalating overdue items of older competences within the lookback", async () => {
    h.store.includeAugust = true;
    const result = await runSlaReminders({ now: tuesday });
    const aug = h.store.emits.filter((e) => e.dedupeKey.startsWith("2026-08:"));
    // Agosto: liberacao DP, solicitacao NF, recebimento NF e pagamento vencidos.
    expect(aug.map((e) => e.event)).toEqual(Array(4).fill("SLA_OVERDUE"));
    expect(result.overdue).toBe(6);
    // Fora do lookback (4 meses depois) agosto deixa de ser cobrado.
    h.store.emits = [];
    await runSlaReminders({ now: new Date("2026-12-10T11:00:00.000Z") });
    expect(h.store.emits.some((e) => e.dedupeKey.startsWith("2026-08:"))).toBe(false);
  });

  it("is idempotent within the same day and repeats the next business day", async () => {
    await runSlaReminders({ now: tuesday });
    const again = await runSlaReminders({ now: new Date("2026-11-10T18:00:00.000Z") });
    expect(again.sent).toBe(0);
    expect(again.skippedRecipients).toBe(6);

    const nextDay = await runSlaReminders({ now: new Date("2026-11-11T11:00:00.000Z") });
    expect(nextDay.sent).toBe(6);
  });

  it("does not send on weekends or holidays", async () => {
    const saturday = await runSlaReminders({ now: new Date("2026-11-14T11:00:00.000Z") });
    expect(saturday).toMatchObject({ skipped: true, reason: "non-business-day", sent: 0 });
    const finados = await runSlaReminders({ now: new Date("2026-11-02T11:00:00.000Z") });
    expect(finados.reason).toBe("non-business-day");
    expect(h.store.emits).toHaveLength(0);
  });
});

describe("sla-reminders route", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("exposes GET aliased to POST (scheduler sends GET)", () => {
    expect(route.GET).toBe(route.POST);
  });

  it("returns 401 without a valid CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await route.GET(new Request("http://localhost/api/jobs/sla-reminders"));
    expect(res.status).toBe(401);
  });
});
