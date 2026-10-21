import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Gate da matriz nas telas sem item de menu próprio: a tela cheia de
 * lançamento exige HORAS_LANCAMENTOS e a JumpAcademy exige UNIVERSIDADE.
 * `requirePermission` redireciona para /access-denied quando nega — aqui o
 * mock lança para provar que nada é carregado depois do gate.
 */
const user = {
  id: "u1",
  name: "Ana",
  email: "ana@jumplabel.com.br",
  roles: ["CONSULTANT" as const],
};
const requirePermissionMock = vi.fn(async (code: string, action?: string) => {
  void code;
  void action;
  return user;
});

const canMock = vi.fn(async (code: string, action?: string) => {
  void code;
  void action;
  return true;
});
const redirectMock = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});
vi.mock("@/lib/auth/permissions", () => ({
  can: (code: string, action?: string) => canMock(code, action),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => redirectMock(to),
}));
vi.mock("@/lib/auth/guards", () => ({
  requirePermission: (code: string, action?: string) =>
    requirePermissionMock(code, action),
  requireUser: vi.fn(async () => user),
}));
vi.mock("@/components/timesheet/NewTimeEntryScreen", () => ({
  NewTimeEntryScreen: () => null,
}));
vi.mock("@/components/university/UniversityView", () => ({
  UniversityView: () => null,
}));
const { timesheetDb, universityDb } = vi.hoisted(() => ({
  timesheetDb: {
    getConsultantForUser: vi.fn(async () => null),
    getHolidayLookup: vi.fn(),
    listAllowedProjects: vi.fn(),
  },
  universityDb: {
    getCatalogForConsultant: vi.fn(async () => []),
    getMyGamification: vi.fn(async () => null),
    getRanking: vi.fn(async () => []),
    listCourses: vi.fn(async () => []),
    listTrackOptions: vi.fn(async () => []),
    listTracks: vi.fn(async () => []),
  },
}));
vi.mock("@/lib/db/timesheet", () => timesheetDb);
vi.mock("@/lib/db/university", () => universityDb);
vi.mock("@/lib/db/competencies", () => ({
  listActiveSkillOptions: vi.fn(async () => []),
}));
vi.mock("@/lib/db/time-off", () => ({ getTimeOffLookup: vi.fn() }));
vi.mock("@/lib/db/on-behalf", () => ({
  canActOnBehalf: vi.fn(() => false),
  getOnBehalfPickerData: vi.fn(),
}));

import NovoLancamentoPage from "./page";
import UniversidadePage from "../../universidade/page";

const DENIED = new Error("NEXT_REDIRECT:/access-denied");

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("Novo Lançamento de Horas — HORAS_LANCAMENTOS", () => {
  it("exige view em HORAS_LANCAMENTOS e carrega a tela quando concedido", async () => {
    await NovoLancamentoPage({ searchParams: Promise.resolve({}) });
    expect(canMock).toHaveBeenCalledWith("HORAS_LANCAMENTOS", "view");
    expect(timesheetDb.getConsultantForUser).toHaveBeenCalledWith(user);
  });

  it("sem a permissão, volta para a grade de Horas antes de carregar dados", async () => {
    canMock.mockResolvedValueOnce(false);
    await expect(
      NovoLancamentoPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_REDIRECT:/app/horas");
    expect(redirectMock).toHaveBeenCalledWith("/app/horas");
    expect(timesheetDb.getConsultantForUser).not.toHaveBeenCalled();
  });
});

describe("JumpAcademy — UNIVERSIDADE", () => {
  it("exige view em UNIVERSIDADE e carrega o catálogo quando concedido", async () => {
    await UniversidadePage();
    expect(requirePermissionMock).toHaveBeenCalledWith("UNIVERSIDADE", "view");
    expect(universityDb.getCatalogForConsultant).toHaveBeenCalledWith(user);
  });

  it("nega antes de carregar qualquer dado", async () => {
    requirePermissionMock.mockRejectedValueOnce(DENIED);
    await expect(UniversidadePage()).rejects.toBe(DENIED);
    expect(universityDb.getCatalogForConsultant).not.toHaveBeenCalled();
  });
});
