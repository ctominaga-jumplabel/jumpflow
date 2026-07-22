import { describe, expect, it } from "vitest";
import {
  orderExperiences,
  type ConsultantExperienceView,
} from "./experiences";

function exp(
  overrides: Partial<ConsultantExperienceView> = {},
): ConsultantExperienceView {
  return {
    id: "e-1",
    company: "Empresa",
    role: "Cargo",
    startDate: "2020-01-01",
    endDate: null,
    description: null,
    location: null,
    ...overrides,
  };
}

describe("orderExperiences", () => {
  it("coloca experiencias atuais (sem endDate) primeiro", () => {
    const rows = orderExperiences([
      exp({ id: "past", startDate: "2015-01-01", endDate: "2018-01-01" }),
      exp({ id: "current", startDate: "2020-01-01", endDate: null }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["current", "past"]);
  });

  it("ordena por inicio decrescente dentro do mesmo grupo", () => {
    const rows = orderExperiences([
      exp({ id: "a", startDate: "2010-01-01", endDate: "2012-01-01" }),
      exp({ id: "b", startDate: "2016-01-01", endDate: "2019-01-01" }),
      exp({ id: "c", startDate: "2013-01-01", endDate: "2015-01-01" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("nao muta a lista de entrada", () => {
    const input = [
      exp({ id: "past", startDate: "2015-01-01", endDate: "2018-01-01" }),
      exp({ id: "current", endDate: null }),
    ];
    const snapshot = input.map((r) => r.id);
    orderExperiences(input);
    expect(input.map((r) => r.id)).toEqual(snapshot);
  });
});
