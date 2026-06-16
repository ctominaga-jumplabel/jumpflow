import { describe, expect, it } from "vitest";
import {
  CLT_CHARGE_TABLES_2026,
  computeCltCharges,
  type CltChargeTables,
} from "./clt-charges";

describe("computeCltCharges (2026 defaults)", () => {
  it("returns zeros for a zero salary", () => {
    const r = computeCltCharges({ cltAmount: 0 });
    expect(r).toMatchObject({
      base: 0,
      inss: 0,
      irrf: 0,
      fgts: 0,
      employeeDeductions: 0,
    });
  });

  it("computes progressive INSS + zero-band IRRF for a mid salary", () => {
    const r = computeCltCharges({ cltAmount: 3000 });
    // 1518*0.075 + 1275.88*0.09 + 206.12*0.12
    expect(r.inss).toBe(253.41);
    expect(r.irrfBase).toBe(2746.59);
    // base 2746.59 -> only the 2428.80..2746.59 slice taxed at 7.5%
    expect(r.irrf).toBe(23.83);
    expect(r.fgts).toBe(240);
    expect(r.employeeDeductions).toBe(277.24);
  });

  it("caps INSS at the ceiling for a high salary", () => {
    const r = computeCltCharges({ cltAmount: 20000 });
    // 113.85 + 114.8292 + 167.634 + 555.3212 = 951.6344
    expect(r.inss).toBe(951.63);
    // FGTS is on the FULL salary, not the ceiling.
    expect(r.fgts).toBe(1600);
    // INSS does not grow past the ceiling: 25000 yields the same INSS.
    expect(computeCltCharges({ cltAmount: 25000 }).inss).toBe(951.63);
  });

  it("reduces the IRRF base by the per-dependent deduction", () => {
    const noDep = computeCltCharges({ cltAmount: 6000, dependents: 0 });
    const twoDep = computeCltCharges({ cltAmount: 6000, dependents: 2 });
    const expectedBaseDrop = 2 * CLT_CHARGE_TABLES_2026.irrfDependentDeduction;
    expect(twoDep.irrfBase).toBeCloseTo(noDep.irrfBase - expectedBaseDrop, 2);
    // A lower base means a lower IRRF.
    expect(twoDep.irrf).toBeLessThan(noDep.irrf);
  });

  it("floors fractional and clamps negative dependents to a non-negative integer", () => {
    const fractional = computeCltCharges({ cltAmount: 6000, dependents: 1.9 });
    const one = computeCltCharges({ cltAmount: 6000, dependents: 1 });
    const negative = computeCltCharges({ cltAmount: 6000, dependents: -3 });
    const zero = computeCltCharges({ cltAmount: 6000, dependents: 0 });
    expect(fractional.irrf).toBe(one.irrf);
    expect(negative.irrf).toBe(zero.irrf);
  });

  it("never lets IRRF base go negative", () => {
    const r = computeCltCharges({ cltAmount: 1500, dependents: 50 });
    expect(r.irrfBase).toBe(0);
    expect(r.irrf).toBe(0);
  });

  it("keeps FGTS out of employee deductions", () => {
    const r = computeCltCharges({ cltAmount: 10000 });
    expect(r.employeeDeductions).toBe(
      Math.round((r.inss + r.irrf) * 100) / 100,
    );
    expect(r.employeeDeductions).not.toBe(
      Math.round((r.inss + r.irrf + r.fgts) * 100) / 100,
    );
  });

  it("is parameterizable: custom tables override defaults and set the year", () => {
    const tables: CltChargeTables = {
      year: 2099,
      inssBrackets: [{ upTo: 5000, rate: 0.1 }],
      irrfBrackets: [
        { upTo: 2000, rate: 0 },
        { upTo: null, rate: 0.2 },
      ],
      irrfDependentDeduction: 100,
      fgtsRate: 0.05,
    };
    const r = computeCltCharges({ cltAmount: 4000, tables });
    expect(r.year).toBe(2099);
    expect(r.inss).toBe(400); // 4000*0.10 (within the single 5000 band)
    expect(r.irrfBase).toBe(3600); // 4000 - 400 - 0
    // 1600 slice above 2000 taxed at 20%
    expect(r.irrf).toBe(320);
    expect(r.fgts).toBe(200); // 5%
  });

  it("caps INSS at the custom ceiling too", () => {
    const tables: CltChargeTables = {
      ...CLT_CHARGE_TABLES_2026,
      year: 2030,
      inssBrackets: [{ upTo: 3000, rate: 0.1 }],
    };
    expect(computeCltCharges({ cltAmount: 9999, tables }).inss).toBe(300);
  });
});
