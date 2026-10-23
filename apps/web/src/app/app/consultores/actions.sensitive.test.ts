import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ENCRYPTED_FIELDS,
  decryptMoneyNumber,
  encryptMoney,
  isEncryptedValue,
} from "@jumpflow/database/field-encryption";

/**
 * Grupo "Dados Sensíveis": valor acordado (ConsultantCompensation) e valor/hora
 * por projeto (ConsultantProjectRate) são custo do consultor. Só o grupo lê e
 * grava — ADMIN e Financeiro, sem o grupo, são barrados no servidor. Gravação
 * sempre cifrada (inclusive na auditoria).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const h = vi.hoisted(() => {
  const store = {
    compensations: [] as Row[],
    projectRates: [] as Row[],
    audits: [] as Row[],
    roles: ["SENSITIVE_DATA"] as string[],
    seq: 0,
  };
  const nextId = (p: string) => `${p}-${++store.seq}`;
  const prismaMock = {
    consultantCompensation: {
      findUnique: async ({ where }: { where: Row }) =>
        store.compensations.find((r) => r.id === where.id) ?? null,
      findMany: async ({ where }: { where: Row }) =>
        store.compensations.filter((r) => r.consultantId === where.consultantId),
      create: async ({ data }: { data: Row }) => {
        const row = { id: nextId("comp"), ...data };
        store.compensations.push(row);
        return row;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = store.compensations.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
    consultantProjectRate: {
      findMany: async () =>
        store.projectRates.map((r) => ({
          ...r,
          project: { name: "Alpha", client: { name: "Acme" } },
        })),
      findUnique: async ({ where }: { where: Row }) =>
        store.projectRates.find((r) => r.id === where.id) ?? null,
      create: async ({ data }: { data: Row }) => {
        const row = { id: nextId("rate"), ...data };
        store.projectRates.push(row);
        return row;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = store.projectRates.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: { where: Row }) => {
        store.projectRates = store.projectRates.filter((r) => r.id !== where.id);
      },
    },
    project: { findMany: async () => [] },
    auditEvent: {
      create: async ({ data }: { data: Row }) => {
        store.audits.push(data);
        return data;
      },
    },
  };
  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: { JsonNull: "__JsonNull__" },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    const error = new Error("NEXT_REDIRECT");
    Object.assign(error, { digest: `NEXT_REDIRECT;replace;${path};307;` });
    throw error;
  },
}));
vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => ({
    id: "u1",
    name: "U",
    email: "u@jump.test",
    roles: h.store.roles,
  })),
  requireRole: vi.fn(),
  requireRoleOrPermission: vi.fn(),
  hasRoleOrPermission: vi.fn(async () => true),
}));
vi.mock("@/lib/db/users", () => ({
  resolveDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

import {
  deleteConsultantProjectRate,
  loadConsultantProjectRates,
  loadConsultantSensitiveCompensation,
  saveCompensation,
  saveConsultantProjectRate,
} from "./actions";

import type {
  CompensationInput,
  ProjectRateInput,
} from "@/lib/consultants/schemas";

const CONSULTANT_ID = "seed-consultant-1";
const compensationInput = {
  consultantId: CONSULTANT_ID,
  contractType: "PJ" as const,
  pjRateMode: "HOURLY" as const,
  startsAt: "2026-01-01",
  hourlyRate: 180,
} as CompensationInput;
const rateInput = {
  consultantId: CONSULTANT_ID,
  projectId: "seed-project-1",
  hourlyRate: 210,
  startsAt: "2026-01-01",
} as ProjectRateInput;

const denied = { digest: expect.stringContaining("/access-denied") };

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.compensations = [];
  h.store.projectRates = [];
  h.store.audits = [];
  h.store.roles = ["SENSITIVE_DATA"];
  h.store.seq = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("grupo Dados Sensíveis — valor acordado", () => {
  it("grava o valor/hora CIFRADO (tabela e auditoria) e devolve decifrado", async () => {
    const saved = await saveCompensation(compensationInput);
    expect(saved.ok).toBe(true);
    const row = h.store.compensations[0];
    expect(isEncryptedValue(row.hourlyRateEncrypted)).toBe(true);
    expect(
      decryptMoneyNumber(
        ENCRYPTED_FIELDS.compensationHourlyRate,
        row.hourlyRateEncrypted,
      ),
    ).toBe(180);
    expect(JSON.stringify(h.store.audits)).not.toContain("180");

    const loaded = await loadConsultantSensitiveCompensation(CONSULTANT_ID);
    expect(loaded).toMatchObject({ ok: true, data: { hourlyRate: 180 } });
  });

  it.each([["ADMIN"], ["FINANCE"], ["PEOPLE"], ["AREA_MANAGER"]])(
    "%s sem o grupo não grava nem lê",
    async (role) => {
      h.store.roles = [role];
      await expect(saveCompensation(compensationInput)).rejects.toMatchObject(
        denied,
      );
      await expect(
        loadConsultantSensitiveCompensation(CONSULTANT_ID),
      ).rejects.toMatchObject(denied);
      expect(h.store.compensations).toHaveLength(0);
    },
  );
});

describe("grupo Dados Sensíveis — valor/hora por projeto", () => {
  it("cria cifrado e lista decifrado para o grupo", async () => {
    const saved = await saveConsultantProjectRate(rateInput);
    expect(saved.ok).toBe(true);
    expect(isEncryptedValue(h.store.projectRates[0].hourlyRateEncrypted)).toBe(
      true,
    );
    const loaded = await loadConsultantProjectRates(CONSULTANT_ID);
    expect(loaded.ok && loaded.data.rates[0].hourlyRate).toBe(210);
  });

  it.each([["ADMIN"], ["FINANCE"]])(
    "%s sem o grupo não lista, grava nem remove",
    async (role) => {
      h.store.projectRates.push({
        id: "rate-x",
        consultantId: CONSULTANT_ID,
        projectId: "seed-project-1",
        hourlyRateEncrypted: encryptMoney(
          ENCRYPTED_FIELDS.projectRateHourlyRate,
          99,
        ),
        startsAt: new Date("2026-01-01T00:00:00.000Z"),
        endsAt: null,
        note: null,
      });
      h.store.roles = [role];
      await expect(
        loadConsultantProjectRates(CONSULTANT_ID),
      ).rejects.toMatchObject(denied);
      await expect(saveConsultantProjectRate(rateInput)).rejects.toMatchObject(
        denied,
      );
      await expect(
        deleteConsultantProjectRate({ id: "rate-x" }),
      ).rejects.toMatchObject(denied);
      expect(h.store.projectRates).toHaveLength(1);
    },
  );
});
