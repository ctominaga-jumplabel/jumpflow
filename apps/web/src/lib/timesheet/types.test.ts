import { describe, expect, it } from "vitest";
import {
  ACTIVITY_TYPES,
  activityLabelOf,
  activityLabels,
  activityOrder,
  isActivityType,
} from "./types";

describe("activity catalog (Rodada 4.2)", () => {
  it("is the new canonical catalog, in form order, WORKDAY first", () => {
    expect([...ACTIVITY_TYPES]).toEqual([
      "WORKDAY",
      "WAITING_PROJECT_START",
      "VACATION",
      "LEAVE",
      "ABSENCE",
      "DAY_OFF",
      "PAID_ABSENCE",
      "ON_CALL",
    ]);
    expect(ACTIVITY_TYPES[0]).toBe("WORKDAY");
    expect(activityOrder).toEqual([...ACTIVITY_TYPES]);
  });

  it("has a pt-BR label for every canonical value", () => {
    for (const value of ACTIVITY_TYPES) {
      expect(activityLabels[value]).toBeTruthy();
    }
    expect(activityLabels.WORKDAY).toBe("Dia Útil");
    expect(activityLabels.WAITING_PROJECT_START).toBe(
      "Aguardando início no projeto",
    );
    expect(activityLabels.ON_CALL).toBe("Sobreaviso");
  });

  it("isActivityType validates only the canonical catalog", () => {
    expect(isActivityType("WORKDAY")).toBe(true);
    expect(isActivityType("ON_CALL")).toBe(true);
    // Legacy values are NOT canonical anymore.
    expect(isActivityType("DEVELOPMENT")).toBe(false);
    expect(isActivityType("NOPE")).toBe(false);
  });
});

describe("activityLabelOf", () => {
  it("resolves canonical values", () => {
    expect(activityLabelOf("WORKDAY")).toBe("Dia Útil");
    expect(activityLabelOf("VACATION")).toBe("Férias");
  });

  it("resolves deprecated/legacy values to their readable label", () => {
    expect(activityLabelOf("DEVELOPMENT")).toBe("Desenvolvimento");
    expect(activityLabelOf("MEETING")).toBe("Reunião");
    expect(activityLabelOf("DOCS")).toBe("Documentação");
  });

  it("falls back to the raw value for an unknown code (no wrong coercion)", () => {
    expect(activityLabelOf("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(activityLabelOf("")).toBe("");
  });
});
