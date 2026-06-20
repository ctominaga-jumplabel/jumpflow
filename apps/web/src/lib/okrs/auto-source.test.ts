import { describe, expect, it } from "vitest";
import {
  autoSourceMetricType,
  autoSourceOptionsForScope,
  getAutoSourceDef,
  isAutoSourceApplicable,
  isKnownAutoSource,
} from "./auto-source";

describe("isKnownAutoSource", () => {
  it("reconhece as fontes implementadas", () => {
    expect(isKnownAutoSource("hours_total")).toBe(true);
    expect(isKnownAutoSource("hours_billable")).toBe(true);
  });

  it("rejeita desconhecidas e vazios → KR manual", () => {
    expect(isKnownAutoSource("margin")).toBe(false);
    expect(isKnownAutoSource(null)).toBe(false);
    expect(isKnownAutoSource(undefined)).toBe(false);
    expect(isKnownAutoSource("")).toBe(false);
  });
});

describe("isAutoSourceApplicable — por escopo", () => {
  it("horas aplicam a CONSULTANT e PROJECT", () => {
    expect(isAutoSourceApplicable("hours_total", "CONSULTANT")).toBe(true);
    expect(isAutoSourceApplicable("hours_total", "PROJECT")).toBe(true);
    expect(isAutoSourceApplicable("hours_billable", "CONSULTANT")).toBe(true);
  });

  it("horas NÃO aplicam a AREA/COMPANY (sem âncora operacional única)", () => {
    expect(isAutoSourceApplicable("hours_total", "AREA")).toBe(false);
    expect(isAutoSourceApplicable("hours_total", "COMPANY")).toBe(false);
  });

  it("fonte desconhecida nunca é aplicável", () => {
    expect(isAutoSourceApplicable("margin", "PROJECT")).toBe(false);
  });
});

describe("autoSourceOptionsForScope", () => {
  it("oferece fontes em CONSULTANT/PROJECT", () => {
    expect(autoSourceOptionsForScope("CONSULTANT").map((o) => o.key).sort()).toEqual(
      ["hours_billable", "hours_total"],
    );
    expect(autoSourceOptionsForScope("PROJECT")).toHaveLength(2);
  });

  it("não oferece fontes em AREA/COMPANY", () => {
    expect(autoSourceOptionsForScope("AREA")).toHaveLength(0);
    expect(autoSourceOptionsForScope("COMPANY")).toHaveLength(0);
  });
});

describe("metadados da fonte", () => {
  it("as fontes de horas são NUMBER em 'h'", () => {
    expect(autoSourceMetricType("hours_total")).toBe("NUMBER");
    expect(getAutoSourceDef("hours_billable")?.unit).toBe("h");
  });

  it("fonte desconhecida não tem metricType nem def", () => {
    expect(autoSourceMetricType("margin")).toBeNull();
    expect(getAutoSourceDef("margin")).toBeNull();
  });
});
