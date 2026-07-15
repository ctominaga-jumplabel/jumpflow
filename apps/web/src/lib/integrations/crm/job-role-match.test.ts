import { afterEach, describe, expect, it, vi } from "vitest";

import {
  WARNING_JOBROLE_CREATED,
  WARNING_JOBROLE_MISSING,
  WARNING_JOBROLE_SLUG_MISMATCH,
  resolveJobRoleId,
  slugifyJobRole,
} from "./job-role-match";

/**
 * CRM -> JumpFlow job role de/para (D6). The `tx` is INJECTED; we pass a minimal
 * fake with the `jobRole` delegate. Catalog is filled on-demand (create if
 * missing), never blocking — same spirit as client-match.
 */
const findUnique = vi.fn();
const create = vi.fn();

function fakeTx() {
  return { jobRole: { findUnique, create } } as unknown as Parameters<
    typeof resolveJobRoleId
  >[0];
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("slugifyJobRole", () => {
  it("lowercases, strips accents and collapses separators", () => {
    expect(slugifyJobRole("Tech Lead")).toBe("tech-lead");
    expect(slugifyJobRole("Analista Sênior de Dados")).toBe(
      "analista-senior-de-dados",
    );
    expect(slugifyJobRole("  Dev / Back-end  ")).toBe("dev-back-end");
  });
});

describe("resolveJobRoleId", () => {
  it("matches an existing JobRole by slug (no create, no warning)", async () => {
    findUnique.mockResolvedValue({ id: "jr-existing" });

    const result = await resolveJobRoleId(fakeTx(), {
      slug: "desenvolvedor",
      name: "Desenvolvedor",
    });

    expect(findUnique).toHaveBeenCalledWith({
      where: { slug: "desenvolvedor" },
      select: { id: true },
    });
    expect(create).not.toHaveBeenCalled();
    expect(result).toEqual({ jobRoleId: "jr-existing", warning: null });
  });

  it("creates the JobRole on-demand + JOBROLE_CREATED when the slug is unknown", async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({ id: "jr-new" });

    const result = await resolveJobRoleId(fakeTx(), {
      slug: "tech-lead",
      name: "Tech Lead",
    });

    expect(create).toHaveBeenCalledWith({
      data: { name: "Tech Lead", slug: "tech-lead", active: true },
      select: { id: true },
    });
    expect(result.jobRoleId).toBe("jr-new");
    expect(result.warning).toBe(`${WARNING_JOBROLE_CREATED}:tech-lead`);
  });

  it("derives the slug from name when slug is absent, then matches/creates", async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({ id: "jr-derived" });

    const result = await resolveJobRoleId(fakeTx(), {
      name: "Arquiteto de Soluções",
    });

    expect(findUnique).toHaveBeenCalledWith({
      where: { slug: "arquiteto-de-solucoes" },
      select: { id: true },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        name: "Arquiteto de Soluções",
        slug: "arquiteto-de-solucoes",
        active: true,
      },
      select: { id: true },
    });
    expect(result.jobRoleId).toBe("jr-derived");
    expect(result.warning).toBe(
      `${WARNING_JOBROLE_CREATED}:arquiteto-de-solucoes`,
    );
  });

  it("reuses an existing JobRole by name (divergent slug) + JOBROLE_SLUG_MISMATCH, without creating", async () => {
    // No match by slug, but the name already exists (created earlier with a
    // DERIVED slug). Creating would violate JobRole_name_key (non-convergent
    // P2002 inside the tx), so we reuse the existing row by name.
    findUnique.mockImplementation(
      async (args: { where: { slug?: string; name?: string } }) => {
        if (args.where.name === "Tech Lead") return { id: "jr-by-name" };
        return null; // no slug match
      },
    );

    const result = await resolveJobRoleId(fakeTx(), {
      slug: "tech-lead-explicit",
      name: "Tech Lead",
    });

    expect(findUnique).toHaveBeenCalledWith({
      where: { slug: "tech-lead-explicit" },
      select: { id: true },
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { name: "Tech Lead" },
      select: { id: true },
    });
    expect(create).not.toHaveBeenCalled();
    expect(result.jobRoleId).toBe("jr-by-name");
    expect(result.warning).toBe(
      `${WARNING_JOBROLE_SLUG_MISMATCH}:tech-lead-explicit`,
    );
  });

  it("returns JOBROLE_MISSING (no lookup, no create) when both slug and name are absent", async () => {
    const result = await resolveJobRoleId(fakeTx(), {
      slug: null,
      name: null,
    });

    expect(findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(result).toEqual({ jobRoleId: null, warning: WARNING_JOBROLE_MISSING });
  });
});
