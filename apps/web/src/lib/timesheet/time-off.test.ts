import { describe, expect, it } from "vitest";
import {
  ACTIVITY_TYPE_BY_KIND,
  buildMaterializationPlan,
  collectWorkdayConflicts,
  computeLedgerDebit,
  computeLedgerReversal,
  computeWorkingDays,
  enumerateIsoDates,
  FALLBACK_HOURS_PER_DAY,
  isWeekendIso,
  PAID_BY_KIND,
  resolveTimeOff,
  resolveTimeOffActivityType,
  resolveTimeOffPaid,
  type AllocationForMaterialization,
  type TimeOffLookup,
} from "./time-off";

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("mapa kind → paid / activityType", () => {
  it("VACATION e LEAVE são remuneradas; OTHER não", () => {
    expect(resolveTimeOffPaid("VACATION")).toBe(true);
    expect(resolveTimeOffPaid("LEAVE")).toBe(true);
    expect(resolveTimeOffPaid("OTHER")).toBe(false);
    expect(PAID_BY_KIND.OTHER).toBe(false);
  });

  it("activityType materializado segue o catálogo de horas", () => {
    expect(resolveTimeOffActivityType("VACATION")).toBe("VACATION");
    expect(resolveTimeOffActivityType("LEAVE")).toBe("LEAVE");
    expect(resolveTimeOffActivityType("OTHER")).toBe("PAID_ABSENCE");
    expect(ACTIVITY_TYPE_BY_KIND.OTHER).toBe("PAID_ABSENCE");
  });
});

describe("enumerateIsoDates / isWeekendIso", () => {
  it("lista as datas inclusivas em UTC", () => {
    expect(enumerateIsoDates(utc("2026-07-06"), utc("2026-07-08"))).toEqual([
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
    ]);
  });

  it("retorna vazio quando start > end", () => {
    expect(enumerateIsoDates(utc("2026-07-08"), utc("2026-07-06"))).toEqual([]);
  });

  it("reconhece fim de semana (2026-07-11 = sábado, 12 = domingo)", () => {
    expect(isWeekendIso("2026-07-11")).toBe(true);
    expect(isWeekendIso("2026-07-12")).toBe(true);
    expect(isWeekendIso("2026-07-10")).toBe(false);
  });
});

describe("computeWorkingDays", () => {
  it("exclui fins de semana", () => {
    // 2026-07-06 (seg) a 2026-07-12 (dom): 5 dias úteis.
    const result = computeWorkingDays(
      utc("2026-07-06"),
      utc("2026-07-12"),
      new Set(),
    );
    expect(result.count).toBe(5);
    expect(result.dates).toEqual([
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
    ]);
  });

  it("exclui feriados que caem em dia útil", () => {
    const result = computeWorkingDays(
      utc("2026-07-06"),
      utc("2026-07-10"),
      new Set(["2026-07-08"]),
    );
    expect(result.count).toBe(4);
    expect(result.dates).not.toContain("2026-07-08");
  });
});

describe("buildMaterializationPlan", () => {
  const allocA: AllocationForMaterialization = {
    allocationId: "alloc-a",
    projectId: "proj-a",
    allocationPercent: 60,
    startDate: utc("2026-01-01"),
    endDate: null,
    hoursPerDay: 6,
    billDuringVacation: true,
  };
  const allocB: AllocationForMaterialization = {
    allocationId: "alloc-b",
    projectId: "proj-b",
    allocationPercent: 40,
    startDate: utc("2026-01-01"),
    endDate: null,
    hoursPerDay: null,
    billDuringVacation: false,
  };

  it("gera 1 entry por alocação COM default, com hours do default e billable=billDuringVacation", () => {
    const plan = buildMaterializationPlan({
      kind: "VACATION",
      workingDates: ["2026-07-06", "2026-07-07"],
      allocations: [allocA],
    });
    expect(plan.entries).toHaveLength(2);
    expect(plan.usedFallback).toBe(false);
    expect(plan.noActiveAllocation).toBe(false);
    for (const e of plan.entries) {
      expect(e.hours).toBe(6);
      expect(e.activityType).toBe("VACATION");
      expect(e.billable).toBe(true);
      expect(e.fromFallback).toBe(false);
    }
  });

  it("ignora alocação SEM default quando outra TEM default", () => {
    const plan = buildMaterializationPlan({
      kind: "LEAVE",
      workingDates: ["2026-07-06"],
      allocations: [allocA, allocB],
    });
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0].allocationId).toBe("alloc-a");
    expect(plan.entries[0].activityType).toBe("LEAVE");
  });

  it("fallback 8h na alocação de maior % quando NENHUMA tem default", () => {
    const noDefaultHigh: AllocationForMaterialization = {
      ...allocB,
      allocationId: "alloc-high",
      allocationPercent: 80,
      hoursPerDay: null,
      billDuringVacation: false,
    };
    const noDefaultLow: AllocationForMaterialization = {
      ...allocB,
      allocationId: "alloc-low",
      allocationPercent: 20,
      hoursPerDay: null,
    };
    const plan = buildMaterializationPlan({
      kind: "OTHER",
      workingDates: ["2026-07-06"],
      allocations: [noDefaultLow, noDefaultHigh],
    });
    expect(plan.entries).toHaveLength(1);
    expect(plan.usedFallback).toBe(true);
    expect(plan.entries[0].allocationId).toBe("alloc-high");
    expect(plan.entries[0].hours).toBe(FALLBACK_HOURS_PER_DAY);
    expect(plan.entries[0].billable).toBe(false);
    expect(plan.entries[0].fromFallback).toBe(true);
  });

  it("sinaliza noActiveAllocation quando nada é gerado", () => {
    const outside: AllocationForMaterialization = {
      ...allocA,
      startDate: utc("2026-08-01"),
      endDate: utc("2026-08-31"),
    };
    const plan = buildMaterializationPlan({
      kind: "VACATION",
      workingDates: ["2026-07-06"],
      allocations: [outside],
    });
    expect(plan.entries).toHaveLength(0);
    expect(plan.noActiveAllocation).toBe(true);
  });

  it("respeita a vigência da alocação por data", () => {
    const bounded: AllocationForMaterialization = {
      ...allocA,
      startDate: utc("2026-07-07"),
      endDate: utc("2026-07-07"),
    };
    const plan = buildMaterializationPlan({
      kind: "VACATION",
      workingDates: ["2026-07-06", "2026-07-07", "2026-07-08"],
      allocations: [bounded],
    });
    expect(plan.entries.map((e) => e.date)).toEqual(["2026-07-07"]);
  });
});

describe("ledger de férias", () => {
  it("debita quando há saldo suficiente", () => {
    expect(computeLedgerDebit(30, 0, 5)).toEqual({
      ok: true,
      balanceDays: 25,
      takenDays: 5,
    });
  });

  it("permite consumir exatamente o saldo", () => {
    expect(computeLedgerDebit(5, 25, 5)).toEqual({
      ok: true,
      balanceDays: 0,
      takenDays: 30,
    });
  });

  it("bloqueia quando dias > saldo", () => {
    expect(computeLedgerDebit(3, 27, 5)).toEqual({
      ok: false,
      reason: "INSUFFICIENT_BALANCE",
    });
  });

  it("estorna devolvendo dias ao saldo (takenDays nunca negativo)", () => {
    expect(computeLedgerReversal(25, 5, 5)).toEqual({
      balanceDays: 30,
      takenDays: 0,
    });
    expect(computeLedgerReversal(30, 2, 5)).toEqual({
      balanceDays: 35,
      takenDays: 0,
    });
  });
});

describe("collectWorkdayConflicts", () => {
  it("retorna a interseção ordenada e deduplicada", () => {
    const conflicts = collectWorkdayConflicts(
      ["2026-07-08", "2026-07-06", "2026-07-08", "2026-07-20"],
      ["2026-07-06", "2026-07-07", "2026-07-08"],
    );
    expect(conflicts).toEqual(["2026-07-06", "2026-07-08"]);
  });

  it("vazio quando não há sobreposição", () => {
    expect(
      collectWorkdayConflicts(["2026-07-20"], ["2026-07-06", "2026-07-07"]),
    ).toEqual([]);
  });
});

describe("resolveTimeOff (lookup para a UI)", () => {
  it("resolve info por data", () => {
    const lookup: TimeOffLookup = {
      byDate: {
        "2026-07-06": {
          timeOffId: "to-1",
          kind: "VACATION",
          paid: true,
          status: "CONFIRMED",
        },
      },
    };
    expect(resolveTimeOff(lookup, "2026-07-06")?.kind).toBe("VACATION");
    expect(resolveTimeOff(lookup, "2026-07-07")).toBeUndefined();
    expect(resolveTimeOff(undefined, "2026-07-06")).toBeUndefined();
  });
});
