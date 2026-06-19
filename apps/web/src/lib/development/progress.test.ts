import { describe, expect, it } from "vitest";
import { computePlanProgress, type ProgressActionInput } from "./progress";

const TODAY = "2026-06-19";

const a = (over: Partial<ProgressActionInput>): ProgressActionInput => ({
  status: "PLANNED",
  dueAt: null,
  ...over,
});

describe("computePlanProgress (US17.03)", () => {
  it("plano vazio → 0%", () => {
    expect(computePlanProgress([], TODAY)).toEqual({
      total: 0,
      done: 0,
      overdue: 0,
      donePercent: 0,
    });
  });

  it("conta % de concluídas sobre as não canceladas", () => {
    const p = computePlanProgress(
      [
        a({ status: "DONE" }),
        a({ status: "IN_PROGRESS" }),
        a({ status: "PLANNED" }),
        a({ status: "CANCELLED" }), // não entra no denominador
      ],
      TODAY,
    );
    expect(p.total).toBe(4);
    expect(p.done).toBe(1);
    // 1 done / 3 não-canceladas = 33%
    expect(p.donePercent).toBe(33);
  });

  it("100% quando todas as não canceladas estão DONE", () => {
    const p = computePlanProgress(
      [a({ status: "DONE" }), a({ status: "DONE" }), a({ status: "CANCELLED" })],
      TODAY,
    );
    expect(p.donePercent).toBe(100);
  });

  it("conta vencidas: dueAt < hoje e status != DONE/CANCELLED", () => {
    const p = computePlanProgress(
      [
        a({ status: "PLANNED", dueAt: "2026-06-01" }), // vencida
        a({ status: "IN_PROGRESS", dueAt: "2026-06-10" }), // vencida
        a({ status: "DONE", dueAt: "2026-06-01" }), // concluída: não vencida
        a({ status: "CANCELLED", dueAt: "2026-06-01" }), // cancelada: não vencida
        a({ status: "PLANNED", dueAt: "2026-12-31" }), // futura: não vencida
        a({ status: "PLANNED", dueAt: null }), // sem prazo: não vencida
      ],
      TODAY,
    );
    expect(p.overdue).toBe(2);
  });

  it("dueAt exatamente hoje não é vencida (estrito <)", () => {
    const p = computePlanProgress(
      [a({ status: "PLANNED", dueAt: TODAY })],
      TODAY,
    );
    expect(p.overdue).toBe(0);
  });
});
