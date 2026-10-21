import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import type {
  TalentDashboardData,
  TalentTabId,
} from "@/components/talent-dashboard/types";

const requireRoleOrPermissionMock = vi.fn();
const canEachMock = vi.fn();
const getTalentDashboardDataMock = vi.fn();

vi.mock("@/lib/auth/guards", () => ({
  requireRoleOrPermission: (...args: unknown[]) =>
    requireRoleOrPermissionMock(...args),
}));
vi.mock("@/lib/auth/permissions", () => ({
  canEach: (...args: unknown[]) => canEachMock(...args),
}));
vi.mock("@/lib/db/config", () => ({ isDatabaseConfigured: () => true }));
vi.mock("@/lib/db/talent-dashboard", () => ({
  getTalentDashboardData: () => getTalentDashboardDataMock(),
}));

import PainelTalentosPage from "./page";
import { TalentDashboardView } from "@/components/talent-dashboard/TalentDashboardView";

const SUB = {
  talentFinder: "PAINEL_TALENTOS_TALENT_FINDER",
  skills: "PAINEL_TALENTOS_SKILLS",
  certifications: "PAINEL_TALENTOS_CERTIFICACOES",
  consultants: "PAINEL_TALENTOS_CONSULTORES",
  skillsMatrix: "PAINEL_TALENTOS_MATRIZ_SKILLS",
  inactive: "PAINEL_TALENTOS_INATIVOS",
  governance: "PAINEL_TALENTOS_GOVERNANCA",
};

function grant(denied: string[] = []) {
  canEachMock.mockImplementation(async (codes: string[]) =>
    Object.fromEntries(codes.map((c) => [c, !denied.includes(c)])),
  );
}

function fullData(): TalentDashboardData {
  return {
    summary: {
      totalConsultants: 1,
      active: 1,
      inactive: 0,
      onLeave: 0,
      skillLinks: 0,
      validatedSkillLinks: 0,
      consultantsWithSkill: 0,
      certs: 0,
      certsValid: 0,
      certsExpired: 0,
      consultantsWithCert: 0,
      coursesCompleted: 0,
      distinctSkills: 0,
      distinctIssuers: 0,
      byContract: [],
      bySeniority: [],
      byArea: [],
      bySkillCategory: [],
      byIssuer: [],
      bySkillLevel: [],
    },
    consultants: [{ id: "c1" } as TalentDashboardData["consultants"][number]],
    skillCatalog: [{ name: "TS" } as TalentDashboardData["skillCatalog"][number]],
    certCatalog: [{ name: "AWS" } as TalentDashboardData["certCatalog"][number]],
    governance: {
      pendingSkills: [{ label: "x", detail: "y", consultantId: "c1" }],
      expiringCerts: [],
      missingData: [],
      pendingSkillsTotal: 1,
      expiringCertsTotal: 0,
      missingDataTotal: 0,
    },
    generatedAt: "2026-10-21T00:00:00.000Z",
    databaseReady: true,
  };
}

type ViewProps = { data: TalentDashboardData; allowedTabs: TalentTabId[] };

async function renderPage(): Promise<ViewProps> {
  const element = (await PainelTalentosPage()) as ReactElement<ViewProps>;
  expect(isValidElement(element)).toBe(true);
  return element.props;
}

beforeEach(() => {
  requireRoleOrPermissionMock.mockResolvedValue({ id: "u1" });
  getTalentDashboardDataMock.mockResolvedValue(fullData());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("/app/painel-talentos — matriz de subtelas", () => {
  it("guarda a tela pelo código próprio PAINEL_TALENTOS", async () => {
    grant();
    await renderPage();
    expect(requireRoleOrPermissionMock).toHaveBeenCalledWith(
      expect.arrayContaining(["ADMIN", "PEOPLE"]),
      "PAINEL_TALENTOS",
      "view",
    );
    expect(canEachMock).toHaveBeenCalledWith(
      expect.arrayContaining(Object.values(SUB)),
    );
  });

  it("com tudo liberado, mantém todas as abas e o payload completo", async () => {
    grant();
    const props = await renderPage();
    expect(props.allowedTabs).toEqual([
      "visao",
      "talent",
      "skills",
      "certificacoes",
      "consultores",
      "matriz",
      "inativos",
      "governanca",
    ]);
    expect(props.data).toEqual(fullData());
  });

  it("aba negada some e seus dados não são enviados ao cliente", async () => {
    grant([SUB.governance, SUB.certifications]);
    const props = await renderPage();
    expect(props.allowedTabs).not.toContain("governanca");
    expect(props.allowedTabs).not.toContain("certificacoes");
    expect(props.data.governance.pendingSkills).toEqual([]);
    expect(props.data.governance.pendingSkillsTotal).toBe(0);
    expect(props.data.certCatalog).toEqual([]);
    // Fatias usadas por abas ainda liberadas continuam.
    expect(props.data.skillCatalog).toHaveLength(1);
    expect(props.data.consultants).toHaveLength(1);
  });

  it("só a Visão Executiva: mantém o summary e descarta o restante", async () => {
    grant(Object.values(SUB));
    const props = await renderPage();
    expect(props.allowedTabs).toEqual(["visao"]);
    expect(props.data.summary.totalConsultants).toBe(1);
    expect(props.data.consultants).toEqual([]);
    expect(props.data.skillCatalog).toEqual([]);
    expect(props.data.certCatalog).toEqual([]);
  });

  it("a view só renderiza os rótulos das abas liberadas", async () => {
    grant([SUB.governance]);
    const props = await renderPage();
    render(<TalentDashboardView {...props} />);
    expect(screen.getByText("Visão Executiva")).toBeTruthy();
    expect(screen.getByText("Talent Finder")).toBeTruthy();
    expect(screen.queryByText("Governança")).toBeNull();
  });
});
