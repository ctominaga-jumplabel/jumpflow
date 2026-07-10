import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RBAC (D5) da server action getProjectTracking — acompanhamento financeiro do
 * projeto (VALORES ABSOLUTOS). Gate SERVER-SIDE:
 * - Financeiro/Comercial (ADMIN/AREA_MANAGER/FINANCE/SALES) veem qualquer projeto.
 * - PROJECT_MANAGER só os PRÓPRIOS (managerUserId === seu id real).
 * - Consultor e demais: FORBIDDEN.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

const h = vi.hoisted(() => {
  const store = {
    // managerUserId do projeto consultado.
    projectManagerUserId: "usr-pm-1" as string | null,
    projectExists: true,
    currentUser: {
      id: "dev-user",
      name: "Sam",
      email: "sam@jumplabel.com.br",
      roles: ["FINANCE"] as string[],
    },
    dbUserId: "usr-pm-1" as string | null,
  };

  const prismaMock = {
    project: {
      findUnique: async ({ where }: { where: Where }) =>
        store.projectExists && where.id === "prj-1"
          ? { managerUserId: store.projectManagerUserId }
          : null,
    },
  };

  const loadTracking = vi.fn(async () => ({ projectId: "prj-1", rows: [] }));

  return { store, prismaMock, loadTracking };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: {
    JsonNull: "__JsonNull__",
    PrismaClientKnownRequestError: class extends Error {},
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => h.store.currentUser),
  requireRole: vi.fn(async () => h.store.currentUser),
}));

vi.mock("@/lib/db/users", () => ({
  resolveDbUser: vi.fn(async () =>
    h.store.dbUserId
      ? { id: h.store.dbUserId, name: "PM", email: "pm@x.com" }
      : null,
  ),
}));

vi.mock("@/lib/db/project-tracking", () => ({
  loadProjectTracking: h.loadTracking,
}));

import { getProjectTracking } from "./actions";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  vi.stubEnv("AUTH_DEV_MODE", "true");
  h.store.projectManagerUserId = "usr-pm-1";
  h.store.projectExists = true;
  h.store.currentUser = {
    id: "dev-user",
    name: "Sam",
    email: "sam@jumplabel.com.br",
    roles: ["FINANCE"],
  };
  h.store.dbUserId = "usr-pm-1";
  h.loadTracking.mockClear();
});

afterEach(() => vi.unstubAllEnvs());

describe("getProjectTracking RBAC (D5)", () => {
  it("allows FINANCE on any project", async () => {
    h.store.currentUser.roles = ["FINANCE"];
    const r = await getProjectTracking({ projectId: "prj-1" });
    expect(r.ok).toBe(true);
    expect(h.loadTracking).toHaveBeenCalledWith("prj-1");
  });

  it("allows SALES (comercial) on any project", async () => {
    h.store.currentUser.roles = ["SALES"];
    const r = await getProjectTracking({ projectId: "prj-1" });
    expect(r.ok).toBe(true);
  });

  it("denies a CONSULTANT", async () => {
    h.store.currentUser.roles = ["CONSULTANT"];
    const r = await getProjectTracking({ projectId: "prj-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("FORBIDDEN");
    expect(h.loadTracking).not.toHaveBeenCalled();
  });

  it("allows a PROJECT_MANAGER on its OWN project", async () => {
    h.store.currentUser.roles = ["PROJECT_MANAGER"];
    h.store.dbUserId = "usr-pm-1";
    h.store.projectManagerUserId = "usr-pm-1";
    const r = await getProjectTracking({ projectId: "prj-1" });
    expect(r.ok).toBe(true);
  });

  it("denies a PROJECT_MANAGER on ANOTHER manager's project", async () => {
    h.store.currentUser.roles = ["PROJECT_MANAGER"];
    h.store.dbUserId = "usr-pm-1";
    h.store.projectManagerUserId = "usr-pm-2";
    const r = await getProjectTracking({ projectId: "prj-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("FORBIDDEN");
    expect(h.loadTracking).not.toHaveBeenCalled();
  });

  it("denies a PROJECT_MANAGER whose db user cannot be resolved (fail closed)", async () => {
    h.store.currentUser.roles = ["PROJECT_MANAGER"];
    h.store.dbUserId = null;
    const r = await getProjectTracking({ projectId: "prj-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("FORBIDDEN");
  });

  it("returns NOT_FOUND for an unknown project (authorized role)", async () => {
    h.store.currentUser.roles = ["FINANCE"];
    h.store.projectExists = false;
    const r = await getProjectTracking({ projectId: "prj-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("NOT_FOUND");
  });
});
