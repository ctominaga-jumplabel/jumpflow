/**
 * Mocked projects + clients for the MVP.
 *
 * NOTE: not connected to the database yet. Shapes mirror `Project`/`Client`
 * in docs/modelo-dados.md. Financial fields (`billingHourlyRate`, `budgetHours`)
 * are role-protected in the UI — see the projetos page and ProjectSummaryPanel.
 */

export type ProjectStatus = "ACTIVE" | "PLANNED" | "ON_HOLD" | "CLOSED";

export interface ProjectClient {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  client: ProjectClient;
  status: ProjectStatus;
  managerName: string;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string | null;
  /** Sold hourly rate (BRL). Financial — masked for non-authorized roles. */
  billingHourlyRate: number;
  /** Budgeted hours for the engagement. Financial — masked when unauthorized. */
  budgetHours: number;
  /** Hours already consumed (approved + submitted). */
  consumedHours: number;
  /** Active consultants allocated to the project. */
  allocatedConsultants: number;
}

export const projectStatusLabels: Record<ProjectStatus, string> = {
  ACTIVE: "Ativo",
  PLANNED: "Planejado",
  ON_HOLD: "Em espera",
  CLOSED: "Encerrado",
};

export const clients: ProjectClient[] = [
  { id: "cli-vix", name: "Vix Energia" },
  { id: "cli-bsul", name: "Banco Sul" },
  { id: "cli-norte", name: "Loja Norte" },
  { id: "cli-meridian", name: "Meridian Saúde" },
];

export const projects: Project[] = [
  {
    id: "prj-atlas",
    name: "Atlas",
    client: clients[0],
    status: "ACTIVE",
    managerName: "Bruno Lima",
    startDate: "2026-01-15",
    endDate: "2026-12-31",
    billingHourlyRate: 320,
    budgetHours: 2400,
    consumedHours: 1320,
    allocatedConsultants: 5,
  },
  {
    id: "prj-orion",
    name: "Órion",
    client: clients[1],
    status: "ACTIVE",
    managerName: "Helena Costa",
    startDate: "2026-02-01",
    endDate: null,
    billingHourlyRate: 290,
    budgetHours: 1800,
    consumedHours: 980,
    allocatedConsultants: 4,
  },
  {
    id: "prj-vega",
    name: "Vega",
    client: clients[2],
    status: "ACTIVE",
    managerName: "Júlia Reis",
    startDate: "2026-03-10",
    endDate: "2026-09-30",
    billingHourlyRate: 250,
    budgetHours: 900,
    consumedHours: 410,
    allocatedConsultants: 3,
  },
  {
    id: "prj-nimbus",
    name: "Nimbus",
    client: clients[3],
    status: "PLANNED",
    managerName: "Helena Costa",
    startDate: "2026-07-01",
    endDate: null,
    billingHourlyRate: 340,
    budgetHours: 1200,
    consumedHours: 0,
    allocatedConsultants: 0,
  },
  {
    id: "prj-helios",
    name: "Helios",
    client: clients[0],
    status: "ON_HOLD",
    managerName: "Bruno Lima",
    startDate: "2026-01-05",
    endDate: null,
    billingHourlyRate: 300,
    budgetHours: 600,
    consumedHours: 540,
    allocatedConsultants: 2,
  },
  {
    id: "prj-lumen",
    name: "Lumen",
    client: clients[1],
    status: "CLOSED",
    managerName: "Júlia Reis",
    startDate: "2025-08-01",
    endDate: "2026-02-28",
    billingHourlyRate: 260,
    budgetHours: 1500,
    consumedHours: 1490,
    allocatedConsultants: 0,
  },
];

export interface ProjectFilter {
  search?: string;
  status?: ProjectStatus | "ALL";
  clientId?: string | "ALL";
}

/** Pure filter for the project list (search by project or client name). */
export function filterProjects(
  list: Project[],
  filter: ProjectFilter,
): Project[] {
  const term = (filter.search ?? "").toLowerCase().trim();
  return list.filter((p) => {
    if (
      term &&
      !`${p.name} ${p.client.name}`.toLowerCase().includes(term)
    ) {
      return false;
    }
    if (filter.status && filter.status !== "ALL" && p.status !== filter.status) {
      return false;
    }
    if (
      filter.clientId &&
      filter.clientId !== "ALL" &&
      p.client.id !== filter.clientId
    ) {
      return false;
    }
    return true;
  });
}

/** Budget consumption as a 0–100+ percentage (guards divide-by-zero). */
export function budgetConsumption(project: Project): number {
  if (project.budgetHours <= 0) return 0;
  return Math.round((project.consumedHours / project.budgetHours) * 100);
}

export interface ProjectsSummary {
  total: number;
  active: number;
  planned: number;
  closed: number;
}

/** Aggregate counts for the projects summary panel. */
export function summarizeProjects(list: Project[]): ProjectsSummary {
  return {
    total: list.length,
    active: list.filter((p) => p.status === "ACTIVE").length,
    planned: list.filter((p) => p.status === "PLANNED").length,
    closed: list.filter((p) => p.status === "CLOSED").length,
  };
}
