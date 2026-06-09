import { describe, expect, it } from "vitest";
import { findActiveNav, primaryNavigation } from "@/lib/navigation";

describe("findActiveNav", () => {
  it("matches an exact route", () => {
    expect(findActiveNav("/app/dashboard")?.href).toBe("/app/dashboard");
  });

  it("matches a nested subroute", () => {
    expect(findActiveNav("/app/projetos/abc")?.href).toBe("/app/projetos");
  });

  it("returns undefined for an unknown route", () => {
    expect(findActiveNav("/app/inexistente")).toBeUndefined();
  });

  it("does not match a sibling with a shared prefix", () => {
    // Guards against `startsWith` false positives (e.g. /app/horas vs a future
    // /app/horas-extras route).
    expect(findActiveNav("/app/horas-extras")).toBeUndefined();
  });

  it("exposes one entry per operational module", () => {
    expect(primaryNavigation.length).toBeGreaterThanOrEqual(8);
    for (const item of primaryNavigation) {
      expect(item.href.startsWith("/app/")).toBe(true);
    }
  });
});
