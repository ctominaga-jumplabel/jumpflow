import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectItem } from "@/lib/projects/types";

/**
 * Subtelas do detalhe 360 em /app/projetos: o servidor resolve a matriz, passa
 * só as abas liberadas, omite do payload os dados das negadas e não carrega o
 * que só elas usam. A lista/detalhe seguem governados por PROJETOS.
 */

const project: ProjectItem = {
  id: "prj-1",
  clientId: "cli-1",
  clientName: "Cliente",
  name: "Atlas",
  status: "ACTIVE",
  startDate: "2026-01-01",
  paymentType: "MONTHLY",
  consumedHours: 0,
  allocatedConsultants: 1,
  allocations: [
    {
      id: "alloc-1",
      projectId: "prj-1",
      consultantId: "con-1",
      consultantName: "Ana",
      role: "Dev",
      allocationPercent: 100,
      startDate: "2026-01-01",
      status: "ACTIVE",
      skills: [{ id: "as-1", skillId: "sk-1", skillName: "React" }],
    },
  ] as unknown as ProjectItem["allocations"],
  saleRates: [{ id: "sr-1" }] as unknown as ProjectItem["saleRates"],
  receivables: [{ id: "rcv-1" }] as unknown as ProjectItem["receivables"],
  billingConfig: { id: "bc-1" } as unknown as ProjectItem["billingConfig"],
  autoApprovalRule: { id: "aar-1" } as unknown as ProjectItem["autoApprovalRule"],
  autoApprovalConsultantRules: [
    { id: "car-1" },
  ] as unknown as ProjectItem["autoApprovalConsultantRules"],
  hasActiveSaleRate: true,
  hasBillingConfig: true,
};

const h = vi.hoisted(() => ({
  user: { id: "u", roles: ["ADMIN"] as string[] },
  denied: new Set<string>(),
  listProjectConsultants: vi.fn(async () => [{ id: "con-1" }]),
  listSkillCatalog: vi.fn(async () => [{ id: "sk-1" }]),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => h.user),
}));
vi.mock("@/lib/auth/permissions", () => ({
  canEach: vi.fn(async (codes: string[]) =>
    Object.fromEntries(codes.map((c) => [c, !h.denied.has(c)])),
  ),
}));
vi.mock("@/lib/db/config", () => ({ isDatabaseConfigured: () => true }));
vi.mock("@/lib/db/users", () => ({ resolveDbUser: vi.fn(async () => null) }));
vi.mock("@/lib/db/clients", () => ({ listBillingTypes: vi.fn(async () => []) }));
vi.mock("@/lib/db/projects", () => ({
  listProjects: vi.fn(async () => [structuredClone(project)]),
  listProjectClients: vi.fn(async () => []),
  listProjectConsultants: h.listProjectConsultants,
  listProjectManagers: vi.fn(async () => []),
  listSkillCatalog: h.listSkillCatalog,
}));
vi.mock("@/components/ui/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("@/components/projects/ProjectSummaryPanel", () => ({
  ProjectSummaryPanel: () => null,
}));
vi.mock("@/components/projects/ProjectsView", () => ({
  ProjectsView: () => null,
}));

import ProjetosPage from "./page";

async function viewProps(): Promise<Record<string, unknown>> {
  const tree = await ProjetosPage();
  // ProjectsView é o 3º filho do wrapper.
  const children = (tree as { props: { children: unknown[] } }).props.children;
  return (children[2] as { props: Record<string, unknown> }).props;
}

function firstProject(props: Record<string, unknown>): ProjectItem {
  return (props.projects as ProjectItem[])[0];
}

beforeEach(() => {
  h.user = { id: "u", roles: ["ADMIN"] };
  h.denied = new Set();
  h.listProjectConsultants.mockClear();
  h.listSkillCatalog.mockClear();
});

describe("ProjetosPage — subtelas do detalhe", () => {
  it("concedidas: todas as abas e o payload completo (padrão inalterado)", async () => {
    const props = await viewProps();
    expect(props.allowedDetailTabs).toEqual([
      "ALLOCATIONS",
      "SKILLS",
      "APPROVAL",
      "RATES",
      "RECEIVABLES",
      "BILLING",
      "TRACKING",
    ]);
    expect(props.canViewTracking).toBe(true);
    expect(props.canEditBillingConfig).toBe(true);
    const item = firstProject(props);
    expect(item.allocations[0].skills).toHaveLength(1);
    expect(item.saleRates).toHaveLength(1);
    expect(item.paymentType).toBe("MONTHLY");
    expect(item.receivables).toHaveLength(1);
    expect(item.billingConfig).toBeDefined();
    expect(item.autoApprovalRule).toBeDefined();
    expect(h.listSkillCatalog).toHaveBeenCalledTimes(1);
    expect(h.listProjectConsultants).toHaveBeenCalledTimes(1);
  });

  it("negadas as financeiras: abas somem e os valores não trafegam", async () => {
    h.denied = new Set([
      "PROJETOS_FINANCEIRO",
      "PROJETOS_RECEBIMENTOS",
      "PROJETOS_COBRANCA",
      "PROJETOS_RELATORIOS",
    ]);
    const props = await viewProps();
    expect(props.allowedDetailTabs).toEqual(["ALLOCATIONS", "SKILLS", "APPROVAL"]);
    expect(props.canViewTracking).toBe(false);
    const item = firstProject(props);
    expect(item.saleRates).toEqual([]);
    expect(item.paymentType).toBeUndefined();
    expect(item.receivables).toEqual([]);
    expect(item.billingConfig).toBeUndefined();
    // Flags de pendência da lista (não são valores) seguem intactos.
    expect(item.hasActiveSaleRate).toBe(true);
    expect(item.hasBillingConfig).toBe(true);
  });

  it("Skills e Aprovação negadas: sem catálogo de skills nem regras no payload", async () => {
    h.denied = new Set(["PROJETOS_SKILLS", "PROJETOS_APROVACAO"]);
    const props = await viewProps();
    expect(props.allowedDetailTabs).not.toContain("SKILLS");
    expect(props.allowedDetailTabs).not.toContain("APPROVAL");
    expect(h.listSkillCatalog).not.toHaveBeenCalled();
    const item = firstProject(props);
    expect(item.allocations).toHaveLength(1);
    expect(item.allocations[0].skills).toEqual([]);
    expect(item.autoApprovalRule).toBeUndefined();
    expect(item.autoApprovalConsultantRules).toEqual([]);
  });

  it("nenhuma aba que use vínculos: vínculos e consultores não são carregados/enviados", async () => {
    h.denied = new Set([
      "PROJETOS_EQUIPES",
      "PROJETOS_SKILLS",
      "PROJETOS_APROVACAO",
      "PROJETOS_FINANCEIRO",
    ]);
    const props = await viewProps();
    expect(firstProject(props).allocations).toEqual([]);
    expect(h.listProjectConsultants).not.toHaveBeenCalled();
    expect(props.allowedDetailTabs).toEqual(["RECEIVABLES", "BILLING", "TRACKING"]);
  });

  it("Cobrança liberada na matriz continua exigindo o papel financeiro", async () => {
    h.user = { id: "u", roles: ["PROJECT_MANAGER"] };
    const props = await viewProps();
    expect(props.allowedDetailTabs).toContain("BILLING");
    expect(props.canEditBillingConfig).toBe(false);
  });
});
