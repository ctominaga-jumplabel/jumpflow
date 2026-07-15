import { afterEach, describe, expect, it, vi } from "vitest";

import type { CrmClient } from "./contract";
import {
  WARNING_CLIENT_CREATED,
  WARNING_CLIENT_DOCUMENT_MISSING,
  resolveClientId,
} from "./client-match";

/**
 * CRM -> JumpFlow client de/para (D11). The `tx` (transaction client) is
 * INJECTED; we pass a minimal fake with the `client` delegate.
 */
const findFirst = vi.fn();
const create = vi.fn();

function fakeTx() {
  return { client: { findFirst, create } } as unknown as Parameters<
    typeof resolveClientId
  >[0];
}

function baseClient(overrides: Partial<CrmClient> = {}): CrmClient {
  return {
    document: "12345678000199",
    name: "Acme S.A.",
    ...overrides,
  } as CrmClient;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveClientId", () => {
  it("matches an existing client by normalized 14-digit CNPJ (no warning, no create)", async () => {
    findFirst.mockResolvedValue({ id: "client-existing" });

    const result = await resolveClientId(fakeTx(), baseClient());

    expect(findFirst).toHaveBeenCalledWith({
      where: { document: "12345678000199" },
      select: { id: true },
    });
    expect(create).not.toHaveBeenCalled();
    expect(result).toEqual({ clientId: "client-existing", warnings: [] });
  });

  it("re-normalizes a masked CNPJ before matching", async () => {
    findFirst.mockResolvedValue({ id: "client-existing" });

    await resolveClientId(
      fakeTx(),
      baseClient({ document: "12.345.678/0001-99" }),
    );

    expect(findFirst).toHaveBeenCalledWith({
      where: { document: "12345678000199" },
      select: { id: true },
    });
  });

  it("creates a Client + CLIENT_CREATED warning when there is no CNPJ match", async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: "client-new" });

    const result = await resolveClientId(fakeTx(), baseClient());

    expect(create).toHaveBeenCalledWith({
      data: {
        name: "Acme S.A.",
        document: "12345678000199",
        status: "ACTIVE",
      },
      select: { id: true },
    });
    expect(result.clientId).toBe("client-new");
    expect(result.warnings).toEqual([
      `${WARNING_CLIENT_CREATED}:12345678000199`,
    ]);
  });

  it("creates by name + CLIENT_DOCUMENT_MISSING when the document is absent/short", async () => {
    create.mockResolvedValue({ id: "client-noc" });

    const result = await resolveClientId(
      fakeTx(),
      baseClient({ document: "123" }),
    );

    // No CNPJ lookup when the document cannot be normalized to 14 digits.
    expect(findFirst).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      data: { name: "Acme S.A.", status: "ACTIVE" },
      select: { id: true },
    });
    expect(result.clientId).toBe("client-noc");
    expect(result.warnings).toEqual([WARNING_CLIENT_DOCUMENT_MISSING]);
  });
});
