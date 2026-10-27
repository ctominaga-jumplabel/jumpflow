import { describe, expect, it } from "vitest";
import { buildInvoiceProjectBreakdown } from "./invoice-request";

const line = (over: Partial<Parameters<typeof buildInvoiceProjectBreakdown>[0][number]>) => ({
  projectId: "p1",
  projectName: "Alpha",
  clientName: "Cliente A",
  description: "Horas aprovadas - Alpha",
  hours: 10,
  amount: 1000,
  ...over,
});

describe("buildInvoiceProjectBreakdown", () => {
  it("uses the line amounts when they add up to the expected NF amount", () => {
    const result = buildInvoiceProjectBreakdown(
      [
        line({}),
        line({
          projectId: "p2",
          projectName: "Beta",
          clientName: "Cliente B",
          hours: 5,
          amount: 600,
        }),
      ],
      1600,
    );
    expect(result.proportional).toBe(false);
    expect(result.projects).toEqual([
      { projectName: "Alpha", clientName: "Cliente A", hours: 10, amount: 1000 },
      { projectName: "Beta", clientName: "Cliente B", hours: 5, amount: 600 },
    ]);
  });

  it("ignores benefit (no project) and ad-hoc lines", () => {
    const result = buildInvoiceProjectBreakdown(
      [
        line({}),
        line({ projectId: null, projectName: null, description: "Beneficio VR", amount: 300 }),
        line({ description: "Remuneracao pontual (BONUS) - Alpha", hours: 0, amount: 500 }),
      ],
      1000,
    );
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]).toMatchObject({ hours: 10, amount: 1000 });
    expect(result.proportional).toBe(false);
  });

  it("prorates a fixed PJ amount by hours, summing exactly to the expected amount", () => {
    const result = buildInvoiceProjectBreakdown(
      [
        line({ amount: 0, hours: 100 }),
        line({ projectId: "p2", projectName: "Beta", amount: 0, hours: 50 }),
      ],
      10000,
    );
    expect(result.proportional).toBe(true);
    expect(result.projects.map((p) => p.amount)).toEqual([6666.67, 3333.33]);
    expect(result.projects.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(10000, 2);
  });

  it("returns no projects when there are no project lines", () => {
    expect(buildInvoiceProjectBreakdown([], 500)).toEqual({
      projects: [],
      proportional: false,
    });
  });
});
