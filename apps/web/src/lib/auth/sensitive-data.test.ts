import { describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn();
const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("@/lib/auth/guards", () => ({
  requireUser: () => requireUserMock(),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));

import { ROLE_NAMES, type RoleName } from "@/lib/auth/roles";
import {
  canAccessSensitiveCost,
  requireSensitiveData,
} from "@/lib/auth/sensitive-data";
import type { AppUser } from "@/lib/auth/types";

function user(roles: RoleName[]): AppUser {
  return { id: "u1", name: "U", email: "u@jump.test", roles };
}

describe("canAccessSensitiveCost (grupo Dados Sensíveis)", () => {
  it("libera só para quem está no grupo", () => {
    expect(canAccessSensitiveCost(user(["SENSITIVE_DATA"]))).toBe(true);
    expect(canAccessSensitiveCost(user(["FINANCE", "SENSITIVE_DATA"]))).toBe(true);
  });

  it("nega todos os outros grupos, inclusive ADMIN e Financeiro", () => {
    for (const role of ROLE_NAMES.filter((r) => r !== "SENSITIVE_DATA")) {
      expect(canAccessSensitiveCost(user([role]))).toBe(false);
    }
    expect(
      canAccessSensitiveCost(
        user(ROLE_NAMES.filter((r) => r !== "SENSITIVE_DATA")),
      ),
    ).toBe(false);
  });

  it("nega sem usuário", () => {
    expect(canAccessSensitiveCost(null)).toBe(false);
  });
});

describe("requireSensitiveData", () => {
  it("retorna o usuário do grupo", async () => {
    const member = user(["FINANCE", "SENSITIVE_DATA"]);
    requireUserMock.mockResolvedValueOnce(member);
    await expect(requireSensitiveData()).resolves.toBe(member);
  });

  it("redireciona ADMIN fora do grupo para /access-denied", async () => {
    requireUserMock.mockResolvedValueOnce(user(["ADMIN"]));
    await expect(requireSensitiveData()).rejects.toThrow(
      "REDIRECT:/access-denied",
    );
  });
});
