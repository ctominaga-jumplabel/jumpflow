import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The detail export serves only the "Detalhamento por consultor" subtela, so it
 * requires the subtela code on top of the screen code. requirePermission is
 * mocked to throw (like Next's redirect) for denied codes.
 */

let denied = new Set<string>();

vi.mock("@/lib/auth/guards", () => ({
  requirePermission: vi.fn(async (code: string) => {
    if (denied.has(code)) throw new Error("NEXT_REDIRECT:/access-denied");
    return {
      id: "u1",
      name: "Ana",
      email: "ana@jumplabel.com.br",
      roles: ["ADMIN"],
    };
  }),
}));
vi.mock("@/lib/db/config", () => ({ isDatabaseConfigured: () => true }));
const listOperationDetailRows = vi.fn(async () => []);
vi.mock("@/lib/db/operation-closing", () => ({
  listOperationDetailRows: () => listOperationDetailRows(),
}));
vi.mock("@/lib/db/users", () => ({
  resolveDbUser: vi.fn(async () => ({ id: "u1" })),
}));
const recordAuditEvent = vi.fn(async (_input: unknown) => {});
vi.mock("@/lib/db/audit", () => ({
  recordAuditEvent: (input: unknown) => recordAuditEvent(input as never),
}));

import { GET } from "./route";

const req = () =>
  new Request("http://localhost/api/operacao/fechamento/detalhe/export");

beforeEach(() => {
  denied = new Set();
  listOperationDetailRows.mockClear();
  recordAuditEvent.mockClear();
});

describe("GET /api/operacao/fechamento/detalhe/export", () => {
  it("exports when both the screen and the subtela are granted", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(listOperationDetailRows).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
  });

  it("refuses when the matrix denies the Detalhamento subtela", async () => {
    denied = new Set(["OPERACAO_FECHAMENTO_DETALHAMENTO"]);
    await expect(GET(req())).rejects.toThrow("NEXT_REDIRECT:/access-denied");
    expect(listOperationDetailRows).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("still refuses when the screen itself is denied", async () => {
    denied = new Set(["OPERACAO_FECHAMENTO"]);
    await expect(GET(req())).rejects.toThrow("NEXT_REDIRECT:/access-denied");
    expect(listOperationDetailRows).not.toHaveBeenCalled();
  });
});
