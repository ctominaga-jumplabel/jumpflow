import { afterEach, describe, expect, it, vi } from "vitest";

// `assertModuleEnabled` calls Next's `notFound()`, which throws internally.
// Mock it as a throwing sentinel so we can assert the guard behavior.
const NOT_FOUND = new Error("NEXT_NOT_FOUND");
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
}));

import {
  DISABLED_MODULE_CODES,
  assertModuleEnabled,
  isModuleDisabled,
} from "@/lib/modules/disabled-modules";

afterEach(() => {
  vi.clearAllMocks();
});

describe("disabled modules (EP-M07)", () => {
  it("lists exactly the turned-off codes", () => {
    expect([...DISABLED_MODULE_CODES].sort()).toEqual(
      ["AVALIACOES", "CLIMA", "COMPETENCIAS", "METAS", "PDI"].sort(),
    );
  });

  it("does NOT disable Skills (Skills != Competências)", () => {
    expect(isModuleDisabled("SKILLS")).toBe(false);
  });

  it("keeps other live modules enabled", () => {
    for (const code of ["HORAS", "FEED", "UNIVERSIDADE", "CERTIFICADOS"]) {
      expect(isModuleDisabled(code)).toBe(false);
    }
  });

  it("assertModuleEnabled triggers notFound() for a disabled code", () => {
    for (const code of DISABLED_MODULE_CODES) {
      expect(() => assertModuleEnabled(code)).toThrow(NOT_FOUND);
    }
  });

  it("assertModuleEnabled is a no-op for an enabled code", () => {
    expect(() => assertModuleEnabled("SKILLS")).not.toThrow();
    expect(() => assertModuleEnabled("HORAS")).not.toThrow();
  });
});
