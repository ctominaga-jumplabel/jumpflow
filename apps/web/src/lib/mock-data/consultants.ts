/**
 * Mocked consultant directory for the MVP.
 *
 * NOTE: not connected to the database yet. Shapes mirror the `Consultant`
 * entity in docs/modelo-dados.md so this layer can be swapped for Prisma
 * queries without changing the components. Names/ids are reused across modules
 * (projects, timesheet, skills, certificates) to keep the demo data coherent.
 */

export type Seniority = "JUNIOR" | "PLENO" | "SENIOR" | "ESPECIALISTA";

export type ConsultantStatus = "ACTIVE" | "INACTIVE";

/** Derived capacity bucket from the consultant's current allocation. */
export type Availability = "AVAILABLE" | "BALANCED" | "FULL" | "OVER";

export interface ConsultantSkillTag {
  skillId: string;
  name: string;
}

export interface Consultant {
  id: string;
  name: string;
  email: string;
  jobTitle: string;
  seniority: Seniority;
  area: string;
  status: ConsultantStatus;
  /** Sum of active allocations as a percentage (may exceed 100). */
  allocationPercent: number;
  /** Top skills for quick directory scanning. */
  topSkills: ConsultantSkillTag[];
}

export const seniorityLabels: Record<Seniority, string> = {
  JUNIOR: "Júnior",
  PLENO: "Pleno",
  SENIOR: "Sênior",
  ESPECIALISTA: "Especialista",
};

export const consultants: Consultant[] = [
  {
    id: "con-bruno",
    name: "Bruno Lima",
    email: "bruno.lima@jumplabel.com.br",
    jobTitle: "Tech Lead",
    seniority: "ESPECIALISTA",
    area: "Engenharia",
    status: "ACTIVE",
    allocationPercent: 95,
    topSkills: [
      { skillId: "sk-react", name: "React" },
      { skillId: "sk-node", name: "Node.js" },
      { skillId: "sk-aws", name: "AWS" },
    ],
  },
  {
    id: "con-marina",
    name: "Marina Alves",
    email: "marina.alves@jumplabel.com.br",
    jobTitle: "Data Engineer",
    seniority: "SENIOR",
    area: "Dados",
    status: "ACTIVE",
    allocationPercent: 120,
    topSkills: [
      { skillId: "sk-python", name: "Python" },
      { skillId: "sk-sql", name: "SQL" },
      { skillId: "sk-airflow", name: "Airflow" },
    ],
  },
  {
    id: "con-carlos",
    name: "Carlos Nunes",
    email: "carlos.nunes@jumplabel.com.br",
    jobTitle: "Consultor Pleno",
    seniority: "PLENO",
    area: "Engenharia",
    status: "ACTIVE",
    allocationPercent: 80,
    topSkills: [
      { skillId: "sk-react", name: "React" },
      { skillId: "sk-typescript", name: "TypeScript" },
    ],
  },
  {
    id: "con-julia",
    name: "Júlia Reis",
    email: "julia.reis@jumplabel.com.br",
    jobTitle: "Consultora Sênior",
    seniority: "SENIOR",
    area: "Produto",
    status: "ACTIVE",
    allocationPercent: 0,
    topSkills: [
      { skillId: "sk-discovery", name: "Discovery" },
      { skillId: "sk-ux", name: "UX Research" },
    ],
  },
  {
    id: "con-pedro",
    name: "Pedro Santana",
    email: "pedro.santana@jumplabel.com.br",
    jobTitle: "Consultor Júnior",
    seniority: "JUNIOR",
    area: "Engenharia",
    status: "ACTIVE",
    allocationPercent: 60,
    topSkills: [
      { skillId: "sk-typescript", name: "TypeScript" },
      { skillId: "sk-sql", name: "SQL" },
    ],
  },
  {
    id: "con-helena",
    name: "Helena Costa",
    email: "helena.costa@jumplabel.com.br",
    jobTitle: "Cloud Architect",
    seniority: "ESPECIALISTA",
    area: "Cloud",
    status: "ACTIVE",
    allocationPercent: 100,
    topSkills: [
      { skillId: "sk-aws", name: "AWS" },
      { skillId: "sk-azure", name: "Azure" },
      { skillId: "sk-terraform", name: "Terraform" },
    ],
  },
  {
    id: "con-rafael",
    name: "Rafael Moreira",
    email: "rafael.moreira@jumplabel.com.br",
    jobTitle: "Data Scientist",
    seniority: "SENIOR",
    area: "Dados",
    status: "ACTIVE",
    allocationPercent: 75,
    topSkills: [
      { skillId: "sk-python", name: "Python" },
      { skillId: "sk-ml", name: "Machine Learning" },
    ],
  },
  {
    id: "con-luiza",
    name: "Luíza Farias",
    email: "luiza.farias@jumplabel.com.br",
    jobTitle: "Consultora Pleno",
    seniority: "PLENO",
    area: "Produto",
    status: "INACTIVE",
    allocationPercent: 0,
    topSkills: [{ skillId: "sk-discovery", name: "Discovery" }],
  },
];

/** Capacity bucket derived from an allocation percentage. */
export function availabilityFor(allocationPercent: number): Availability {
  if (allocationPercent <= 0) return "AVAILABLE";
  if (allocationPercent > 100) return "OVER";
  if (allocationPercent >= 90) return "FULL";
  return "BALANCED";
}

export interface ConsultantFilter {
  search?: string;
  seniority?: Seniority | "ALL";
  skillId?: string | "ALL";
  status?: ConsultantStatus | "ALL";
}

/**
 * Pure filter used by the directory. Search matches name, job title and area
 * (case/accent-insensitive). Kept pure so it can be unit tested in isolation.
 */
export function filterConsultants(
  list: Consultant[],
  filter: ConsultantFilter,
): Consultant[] {
  const term = normalize(filter.search ?? "");
  return list.filter((c) => {
    if (
      term &&
      !normalize(`${c.name} ${c.jobTitle} ${c.area}`).includes(term)
    ) {
      return false;
    }
    if (
      filter.seniority &&
      filter.seniority !== "ALL" &&
      c.seniority !== filter.seniority
    ) {
      return false;
    }
    if (
      filter.status &&
      filter.status !== "ALL" &&
      c.status !== filter.status
    ) {
      return false;
    }
    if (
      filter.skillId &&
      filter.skillId !== "ALL" &&
      !c.topSkills.some((s) => s.skillId === filter.skillId)
    ) {
      return false;
    }
    return true;
  });
}

/** Lowercase + strip diacritics for forgiving search matching. */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

/** Distinct skill tags across the directory, for the skill filter dropdown. */
export function distinctSkills(list: Consultant[]): ConsultantSkillTag[] {
  const map = new Map<string, ConsultantSkillTag>();
  for (const c of list) {
    for (const s of c.topSkills) map.set(s.skillId, s);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
