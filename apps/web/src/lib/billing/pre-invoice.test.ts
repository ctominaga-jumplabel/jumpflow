import { describe, expect, it } from "vitest";
import {
  buildPreInvoice,
  preInvoiceReferenceKey,
  preInvoiceStorageKey,
  renderPreInvoiceText,
  type PreInvoiceInput,
} from "@/lib/billing/pre-invoice";

function baseInput(over: Partial<PreInvoiceInput> = {}): PreInvoiceInput {
  return {
    closing: { id: "rc-1", month: 6, year: 2026, adjustmentAmount: 0 },
    client: {
      id: "cli-1",
      name: "Atlas Energia",
      document: "12.345.678/0001-90",
      municipality: "Sao Paulo",
      issRate: 2,
    },
    lines: [
      { projectId: "p-1", projectName: "Projeto Alfa", hours: 10, unitRate: 200 },
      { projectId: "p-2", projectName: "Projeto Beta", hours: 5, unitRate: 300 },
    ],
    generatedAt: new Date("2026-06-15T00:00:00.000Z"),
    ...over,
  };
}

describe("buildPreInvoice — lines, subtotal, ISS and total", () => {
  it("computes one line per project and the services subtotal", () => {
    const pre = buildPreInvoice(baseInput());
    expect(pre.lines).toHaveLength(2);
    expect(pre.lines[0]!.amount).toBe(2000); // 10 * 200
    expect(pre.lines[1]!.amount).toBe(1500); // 5 * 300
    expect(pre.servicesSubtotal).toBe(3500);
  });

  it("estimates ISS as issRate% of the net services and keeps it off the total", () => {
    const pre = buildPreInvoice(baseInput());
    // 2% of 3500 = 70
    expect(pre.estimatedIss).toBe(70);
    // Total faturavel is the services net, NOT inflated by ISS.
    expect(pre.total).toBe(3500);
    expect(pre.issRate).toBe(2);
  });

  it("applies a manual adjustment to the net services and total (not the subtotal)", () => {
    const pre = buildPreInvoice(
      baseInput({
        closing: { id: "rc-1", month: 6, year: 2026, adjustmentAmount: -500 },
      }),
    );
    expect(pre.servicesSubtotal).toBe(3500);
    expect(pre.adjustmentAmount).toBe(-500);
    expect(pre.netServices).toBe(3000);
    expect(pre.total).toBe(3000);
    // ISS estimated on the adjusted net: 2% of 3000 = 60.
    expect(pre.estimatedIss).toBe(60);
  });

  it("treats a missing/zero issRate as 0% ISS", () => {
    const pre = buildPreInvoice(
      baseInput({
        client: { id: "cli-1", name: "Sem ISS", issRate: null },
      }),
    );
    expect(pre.issRate).toBe(0);
    expect(pre.estimatedIss).toBe(0);
    expect(pre.total).toBe(3500);
  });

  it("prefers a persisted amount over hours*unitRate when present", () => {
    const pre = buildPreInvoice(
      baseInput({
        lines: [
          {
            projectId: "p-1",
            projectName: "Arredondado",
            hours: 3,
            unitRate: 333.33,
            amount: 1000, // persisted, overrides 3 * 333.33 = 999.99
          },
        ],
      }),
    );
    expect(pre.lines[0]!.amount).toBe(1000);
    expect(pre.servicesSubtotal).toBe(1000);
  });

  it("is deterministic for the same input", () => {
    const a = buildPreInvoice(baseInput());
    const b = buildPreInvoice(baseInput());
    expect(a).toEqual(b);
  });

  it("rounds cents without floating-point drift", () => {
    const pre = buildPreInvoice(
      baseInput({
        client: { id: "cli-1", name: "X", issRate: 5 },
        lines: [
          { projectId: "p-1", projectName: "A", hours: 1, unitRate: 0.1 },
          { projectId: "p-2", projectName: "B", hours: 1, unitRate: 0.2 },
        ],
      }),
    );
    expect(pre.servicesSubtotal).toBe(0.3);
    expect(pre.estimatedIss).toBe(0.02); // 5% of 0.30 = 0.015 -> 0.02
  });
});

describe("pre-invoice keys", () => {
  it("builds a stable reference key per closing + competence", () => {
    expect(
      preInvoiceReferenceKey({ id: "rc-1", month: 6, year: 2026 }),
    ).toBe("rc-1:2026-06");
  });

  it("builds a deterministic storage key", () => {
    expect(
      preInvoiceStorageKey({ id: "rc-1", month: 6, year: 2026 }),
    ).toBe("2026-06/pre-fatura-rc-1.html");
  });
});

describe("renderPreInvoiceText", () => {
  it("includes per-project lines, totals and a non-fiscal disclaimer", () => {
    const text = renderPreInvoiceText(buildPreInvoice(baseInput()));
    expect(text).toContain("Projeto Alfa");
    expect(text).toContain("Total faturavel");
    expect(text).toContain("ISS estimado (2%)");
    expect(text).toContain("Nao constitui documento fiscal.");
  });
});
