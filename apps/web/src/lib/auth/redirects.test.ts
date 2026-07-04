import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_APP_PATH,
  landingPathFor,
  safeAppPath,
} from "@/lib/auth/redirects";

describe("safeAppPath", () => {
  it("defaults to the launcher at /app", () => {
    expect(DEFAULT_APP_PATH).toBe("/app");
    expect(safeAppPath(undefined)).toBe("/app");
  });

  it("allows internal app paths (explicit callbackUrl is preserved)", () => {
    expect(safeAppPath("/app/dashboard")).toBe("/app/dashboard");
    expect(safeAppPath("/app/financeiro/fechamento")).toBe(
      "/app/financeiro/fechamento",
    );
    expect(safeAppPath("/app/despesas")).toBe("/app/despesas");
    expect(safeAppPath("/app")).toBe("/app");
  });

  it("rejects external or non-app targets (open redirect guard)", () => {
    expect(safeAppPath("https://evil.com")).toBe("/app");
    expect(safeAppPath("//evil.com")).toBe("/app");
    expect(safeAppPath("/login")).toBe("/app");
    // Prefix confusion: "/apple" must not pass as an app path.
    expect(safeAppPath("/apple")).toBe("/app");
    expect(safeAppPath("/app@evil.com")).toBe("/app");
  });

  it("falls back for missing or array values", () => {
    expect(safeAppPath(undefined)).toBe("/app");
    expect(safeAppPath(["/app/horas"])).toBe("/app");
  });
});

describe("landingPathFor (EP-M09 — Feed como home do Consultor)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lands a CONSULTANT on the Feed when the flag is ON", () => {
    vi.stubEnv("NEXT_PUBLIC_FEATURE_FEED", "true");
    expect(landingPathFor(["CONSULTANT"])).toBe("/app/feed");
  });

  it("falls back to Horas when the Feed flag is OFF", () => {
    vi.stubEnv("NEXT_PUBLIC_FEATURE_FEED", "");
    expect(landingPathFor(["CONSULTANT"])).toBe("/app/horas");
  });

  it("keeps other roles on the launcher /app", () => {
    vi.stubEnv("NEXT_PUBLIC_FEATURE_FEED", "true");
    expect(landingPathFor(["ADMIN"])).toBe("/app");
    expect(landingPathFor(["PROJECT_MANAGER"])).toBe("/app");
    // A user that also carries a management role is NOT treated as consultant-only.
    expect(landingPathFor(["CONSULTANT", "AREA_MANAGER"])).toBe("/app");
  });

  it("defaults to the launcher for a user without roles", () => {
    expect(landingPathFor([])).toBe("/app");
  });
});
