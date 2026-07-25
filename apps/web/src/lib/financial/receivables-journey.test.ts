import { describe, expect, it } from "vitest";

import {
  apuracaoExportRows,
  apuracaoResumoRows,
  buildApuracao,
  groupEntriesByDay,
  receivablesFilterSchema,
  summarizeReceivables,
  type ReceivablesEntry,
} from "./receivables-journey-core";

/**
 * Build a `ReceivablesEntry` with sane defaults. `hours`/`effectiveHours` are
 * distinct so tests can prove the aggregators use the EFFECTIVE (remunerated)
 * value — e.g. an ON_CALL entry with multiplier 0.33. `billedAmount` is the
 * per-entry `effectiveHours × saleRate` (already resolved via resolveSaleRate at
 * load time), so the pure builders only sum it.
 */
function entry(overrides: Partial<ReceivablesEntry> = {}): ReceivablesEntry {
  const effectiveHours = overrides.effectiveHours ?? overrides.hours ?? 8;
  const saleRate = overrides.saleRate ?? 200;
  return {
    id: "e1",
    date: "2026-07-01",
    consultantId: "c1",
    consultantName: "Ana",
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
      overrides.billedAmount ??
      (saleRate != null ? Math.round(effectiveHours * saleRate * 100) / 100 : null),
    nonHourlyBilling: false,
    ...overrides,
  };
}

describe("groupEntriesByDay", () => {
  it("groups by ISO day, sums EFFECTIVE hours, sorts days asc + consultants", () => {
    const days = groupEntriesByDay([
      entry({ id: "a", date: "2026-07-02", consultantName: "Bruno", hours: 8, effectiveHours: 8 }),
      entry({ id: "b", date: "2026-07-01", consultantName: "Ana", hours: 8, effectiveHours: 8 }),
      // ON_CALL: raw 9h but 3h effective (multiplier 0.33 applied at load time).
      entry({ id: "c", date: "2026-07-01", consultantName: "Carla", hours: 9, effectiveHours: 3 }),
    ]);

    expect(days.map((d) => d.date)).toEqual(["2026-07-01", "2026-07-02"]);
    // Day 1 = 8 (Ana) + 3 (Carla, effective) = 11, NOT 17 (raw).
    expect(days[0].totalHours).toBe(11);
    expect(days[0].entries.map((e) => e.consultantName)).toEqual(["Ana", "Carla"]);
    expect(days[1].totalHours).toBe(8);
  });

  it("includes non-billable entries in the day total (toggle is shown)", () => {
    const days = groupEntriesByDay([
      entry({ id: "a", effectiveHours: 8, billable: true }),
      entry({ id: "b", effectiveHours: 4, billable: false, consultantName: "Zoe" }),
    ]);
    expect(days).toHaveLength(1);
    expect(days[0].totalHours).toBe(12);
    expect(days[0].entries).toHaveLength(2);
  });
});

describe("summarizeReceivables", () => {
  const entries = [
    entry({ id: "a", consultantId: "c1", effectiveHours: 8, saleRate: 200 }), // billed 1600
    entry({ id: "b", consultantId: "c2", effectiveHours: 5, saleRate: 100 }), // billed 500
    // non-billable: excluded from every card.
    entry({ id: "c", consultantId: "c3", effectiveHours: 8, saleRate: 300, billable: false }),
  ];

  it("sums billable effective hours, value and distinct consultants", () => {
    const summary = summarizeReceivables(entries, true);
    expect(summary.totalHours).toBe(13);
    expect(summary.totalToInvoice).toBe(2100);
    expect(summary.allocatedCount).toBe(2); // c1, c2 (c3 non-billable excluded)
  });

  it("masks the monetary card when financials are not allowed", () => {
    const summary = summarizeReceivables(entries, false);
    expect(summary.totalHours).toBe(13);
    expect(summary.totalToInvoice).toBeNull();
    expect(summary.allocatedCount).toBe(2);
  });
});

describe("buildApuracao", () => {
  it("aggregates per consultant (effective hours × sale rate) and totals", () => {
    const apuracao = buildApuracao(
      [
        entry({ id: "a", projectId: "p1", projectName: "Atlas", clientName: "Vix", consultantId: "c1", consultantName: "Ana", effectiveHours: 8, saleRate: 200 }),
        entry({ id: "b", projectId: "p1", projectName: "Atlas", clientName: "Vix", consultantId: "c1", consultantName: "Ana", effectiveHours: 2, saleRate: 200 }),
        entry({ id: "c", projectId: "p1", projectName: "Atlas", clientName: "Vix", consultantId: "c2", consultantName: "Bruno", effectiveHours: 5, saleRate: 100 }),
      ],
      true,
    );

    expect(apuracao.projects).toHaveLength(1);
    const project = apuracao.projects[0];
    expect(project.totalHours).toBe(15);
    expect(project.totalAmount).toBe(2500); // 10*200 + 5*100
    const [ana, bruno] = project.consultants;
    expect(ana).toMatchObject({ consultantName: "Ana", totalHours: 10, saleRate: 200, totalAmount: 2000 });
    expect(bruno).toMatchObject({ consultantName: "Bruno", totalHours: 5, saleRate: 100, totalAmount: 500 });
    expect(apuracao.grandTotalHours).toBe(15);
    expect(apuracao.grandTotalAmount).toBe(2500);
  });

  it("computes a weighted average sale rate when rates vary per entry", () => {
    const apuracao = buildApuracao(
      [
        entry({ id: "a", consultantId: "c1", consultantName: "Ana", effectiveHours: 10, saleRate: 100 }), // 1000
        entry({ id: "b", consultantId: "c1", consultantName: "Ana", effectiveHours: 10, saleRate: 300 }), // 3000
      ],
      true,
    );
    const ana = apuracao.projects[0].consultants[0];
    expect(ana.totalHours).toBe(20);
    expect(ana.totalAmount).toBe(4000);
    expect(ana.saleRate).toBe(200); // 4000 / 20 weighted
  });

  it("stacks multiple projects, ordered by client then project", () => {
    const apuracao = buildApuracao(
      [
        entry({ id: "a", projectId: "p2", projectName: "Orion", clientName: "Vix", effectiveHours: 4, saleRate: 100 }),
        entry({ id: "b", projectId: "p1", projectName: "Atlas", clientName: "Vix", effectiveHours: 6, saleRate: 200 }),
      ],
      true,
    );
    expect(apuracao.projects.map((p) => p.projectName)).toEqual(["Atlas", "Orion"]);
    expect(apuracao.grandTotalHours).toBe(10);
    expect(apuracao.grandTotalAmount).toBe(1600); // 6*200 + 4*100
  });

  it("excludes non-billable entries and masks money without financials", () => {
    const rows = [
      entry({ id: "a", consultantId: "c1", effectiveHours: 8, saleRate: 200, billable: true }),
      entry({ id: "b", consultantId: "c2", effectiveHours: 8, saleRate: 200, billable: false }),
    ];
    const billableOnly = buildApuracao(rows, true);
    expect(billableOnly.projects[0].consultants).toHaveLength(1);
    expect(billableOnly.grandTotalAmount).toBe(1600);

    const masked = buildApuracao(rows, false);
    expect(masked.grandTotalAmount).toBeNull();
    expect(masked.projects[0].totalAmount).toBeNull();
    expect(masked.projects[0].consultants[0].saleRate).toBeNull();
    // Hours are never masked.
    expect(masked.projects[0].totalHours).toBe(8);
  });
});

describe("apuracao export shaping", () => {
  const apuracao = buildApuracao(
    [
      entry({ id: "a", projectId: "p1", projectName: "Atlas", clientName: "Vix", consultantId: "c1", consultantName: "Ana", effectiveHours: 8, saleRate: 200 }),
      entry({ id: "b", projectId: "p2", projectName: "Orion", clientName: "Vix", consultantId: "c2", consultantName: "Bruno", effectiveHours: 5, saleRate: 100 }),
    ],
    true,
  );

  it("flattens one export row per allocated consultant", () => {
    const rows = apuracaoExportRows(apuracao);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ projectName: "Atlas", consultantName: "Ana", totalHours: 8, saleRate: 200, totalAmount: 1600 });
  });

  it("builds resumo rows per project plus a grand total", () => {
    const rows = apuracaoResumoRows(apuracao);
    expect(rows.map((r) => r.label)).toEqual([
      "Vix / Atlas",
      "Vix / Orion",
      "Total geral",
    ]);
    expect(rows.at(-1)).toMatchObject({ totalHours: 13, totalAmount: 2100 });
  });
});

describe("receivablesFilterSchema", () => {
  it("normalizes projectIds from a single value, array, blanks and ALL", () => {
    expect(receivablesFilterSchema.parse({ projectIds: "p1" }).projectIds).toEqual(["p1"]);
    expect(
      receivablesFilterSchema.parse({ projectIds: ["p1", "", "ALL", "p1", "p2"] }).projectIds,
    ).toEqual(["p1", "p2"]);
    expect(receivablesFilterSchema.parse({}).projectIds).toEqual([]);
  });

  it("rejects an inverted date range", () => {
    const result = receivablesFilterSchema.safeParse({
      from: "2026-07-31",
      to: "2026-07-01",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid client + range + multi project filter", () => {
    const parsed = receivablesFilterSchema.parse({
      from: "2026-07-01",
      to: "2026-07-31",
      clientId: "cli1",
      projectIds: ["p1", "p2"],
    });
    expect(parsed).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
      clientId: "cli1",
      projectIds: ["p1", "p2"],
    });
  });
});
