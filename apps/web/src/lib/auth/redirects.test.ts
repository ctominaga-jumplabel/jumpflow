import { describe, expect, it } from "vitest";
import { DEFAULT_APP_PATH, safeAppPath } from "@/lib/auth/redirects";

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
