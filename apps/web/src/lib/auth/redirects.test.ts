import { describe, expect, it } from "vitest";
import { safeAppPath } from "@/lib/auth/redirects";

describe("safeAppPath", () => {
  it("allows internal app paths", () => {
    expect(safeAppPath("/app/dashboard")).toBe("/app/dashboard");
    expect(safeAppPath("/app/financeiro/fechamento")).toBe(
      "/app/financeiro/fechamento",
    );
    expect(safeAppPath("/app")).toBe("/app");
  });

  it("rejects external or non-app targets (open redirect guard)", () => {
    expect(safeAppPath("https://evil.com")).toBe("/app/dashboard");
    expect(safeAppPath("//evil.com")).toBe("/app/dashboard");
    expect(safeAppPath("/login")).toBe("/app/dashboard");
    // Prefix confusion: "/apple" must not pass as an app path.
    expect(safeAppPath("/apple")).toBe("/app/dashboard");
    expect(safeAppPath("/app@evil.com")).toBe("/app/dashboard");
  });

  it("falls back for missing or array values", () => {
    expect(safeAppPath(undefined)).toBe("/app/dashboard");
    expect(safeAppPath(["/app/horas"])).toBe("/app/dashboard");
  });
});
