import { describe, expect, it } from "vitest";
import { findActiveNav, primaryNavigation } from "@/lib/navigation";

describe("findActiveNav", () => {
  it("matches an exact route", () => {
    expect(findActiveNav("/app/dashboard")?.href).toBe("/app/dashboard");
  });

  it("matches a nested subroute", () => {
    expect(findActiveNav("/app/projetos/abc")?.href).toBe("/app/projetos");
  });

  it("matches the launcher only on the exact /app path", () => {
    expect(findActiveNav("/app")?.href).toBe("/app");
    // A nested route must resolve to its own item, not the exact launcher.
    expect(findActiveNav("/app/horas")?.href).toBe("/app/horas");
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
      // Every item lives under /app (the launcher is exactly "/app").
      expect(item.href === "/app" || item.href.startsWith("/app/")).toBe(true);
    }
  });
});
