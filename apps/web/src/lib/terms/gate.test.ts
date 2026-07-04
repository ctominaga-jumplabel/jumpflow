import { describe, expect, it } from "vitest";
import { shouldGateTerms } from "@/lib/terms/gate";

describe("shouldGateTerms", () => {
  it("blocks a real user with a database who has NOT accepted (flag on)", () => {
    expect(
      shouldGateTerms({
        enabled: true,
        devMode: false,
        dbConfigured: true,
        accepted: false,
      }),
    ).toBe(true);
  });

  it("lets a real user with a database who HAS accepted through", () => {
    expect(
      shouldGateTerms({
        enabled: true,
        devMode: false,
        dbConfigured: true,
        accepted: true,
      }),
    ).toBe(false);
  });

  it("never blocks when the feature flag is OFF (draft pending legal review)", () => {
    expect(
      shouldGateTerms({
        enabled: false,
        devMode: false,
        dbConfigured: true,
        accepted: false,
      }),
    ).toBe(false);
  });

  it("never blocks in dev mode (nowhere to persist acceptance)", () => {
    expect(
      shouldGateTerms({
        enabled: true,
        devMode: true,
        dbConfigured: true,
        accepted: false,
      }),
    ).toBe(false);
    expect(
      shouldGateTerms({
        enabled: true,
        devMode: true,
        dbConfigured: false,
        accepted: false,
      }),
    ).toBe(false);
  });

  it("never blocks when no database is configured", () => {
    expect(
      shouldGateTerms({
        enabled: true,
        devMode: false,
        dbConfigured: false,
        accepted: false,
      }),
    ).toBe(false);
  });
});
