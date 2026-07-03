import { describe, expect, it } from "vitest";
import { shouldGateTerms } from "@/lib/terms/gate";

describe("shouldGateTerms", () => {
  it("blocks a real user with a database who has NOT accepted", () => {
    expect(
      shouldGateTerms({ devMode: false, dbConfigured: true, accepted: false }),
    ).toBe(true);
  });

  it("lets a real user with a database who HAS accepted through", () => {
    expect(
      shouldGateTerms({ devMode: false, dbConfigured: true, accepted: true }),
    ).toBe(false);
  });

  it("never blocks in dev mode (nowhere to persist acceptance)", () => {
    expect(
      shouldGateTerms({ devMode: true, dbConfigured: true, accepted: false }),
    ).toBe(false);
    expect(
      shouldGateTerms({ devMode: true, dbConfigured: false, accepted: false }),
    ).toBe(false);
  });

  it("never blocks when no database is configured", () => {
    expect(
      shouldGateTerms({ devMode: false, dbConfigured: false, accepted: false }),
    ).toBe(false);
  });
});
