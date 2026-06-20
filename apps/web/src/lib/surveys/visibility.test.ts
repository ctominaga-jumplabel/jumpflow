import { describe, expect, it } from "vitest";
import {
  canManageSurveys,
  canViewSurveyDashboards,
  isValidSurveyTransition,
} from "./visibility";

describe("canManageSurveys", () => {
  it("allows ADMIN and PEOPLE only", () => {
    expect(canManageSurveys(["ADMIN"])).toBe(true);
    expect(canManageSurveys(["PEOPLE"])).toBe(true);
    expect(canManageSurveys(["AREA_MANAGER"])).toBe(false);
    expect(canManageSurveys(["CONSULTANT"])).toBe(false);
    expect(canManageSurveys(["FINANCE", "SALES"])).toBe(false);
  });
});

describe("canViewSurveyDashboards", () => {
  it("allows management plus AREA_MANAGER (team-level aggregates)", () => {
    expect(canViewSurveyDashboards(["ADMIN"])).toBe(true);
    expect(canViewSurveyDashboards(["PEOPLE"])).toBe(true);
    expect(canViewSurveyDashboards(["AREA_MANAGER"])).toBe(true);
    // CONSULTANT only answers — never sees aggregated dashboards.
    expect(canViewSurveyDashboards(["CONSULTANT"])).toBe(false);
    expect(canViewSurveyDashboards(["PROJECT_MANAGER"])).toBe(false);
    expect(canViewSurveyDashboards(["FINANCE"])).toBe(false);
  });
});

describe("isValidSurveyTransition", () => {
  it("permits DRAFT → OPEN → CLOSED only", () => {
    expect(isValidSurveyTransition("DRAFT", "OPEN")).toBe(true);
    expect(isValidSurveyTransition("OPEN", "CLOSED")).toBe(true);
  });

  it("never skips or reverses", () => {
    expect(isValidSurveyTransition("DRAFT", "CLOSED")).toBe(false);
    expect(isValidSurveyTransition("OPEN", "DRAFT")).toBe(false);
    expect(isValidSurveyTransition("CLOSED", "OPEN")).toBe(false);
    expect(isValidSurveyTransition("CLOSED", "CLOSED")).toBe(false);
    expect(isValidSurveyTransition("DRAFT", "DRAFT")).toBe(false);
  });
});
