/**
 * Curriculo do Consultor (EP-M06) — read-model DERIVADO.
 *
 * O curriculo e montado sob demanda a partir das tabelas-fonte do consultor,
 * de modo que esta SEMPRE atualizado por construcao (sem hooks nas server
 * actions de escrita). A UNICA parte nao-derivada e a bio curada
 * (headline/summary), armazenada no proprio Consultant.
 *
 * REGRA FIRME: nenhum dado financeiro entra aqui. O agregador nao le nem
 * projeta custo, valor-hora, remuneracao ou beneficio. Ha uma unica projecao
 * (nao existe versao "cliente").
 *
 * A montagem e separada em duas partes:
 *  - {@link assembleCurriculum}: funcao PURA (recebe os dados brutos ja lidos e
 *    monta as secoes). Testavel isoladamente, sem I/O.
 *  - {@link buildConsultantCurriculum}: le as tabelas-fonte via Prisma e delega
 *    para a funcao pura.
 */
import { prisma } from "@jumpflow/database";
import { skillLevelLabels, type SkillLevel } from "@/lib/competencies/types";
import type { EducationDegree, LanguageLevel } from "./schemas";
import { educationDegreeLabels, languageLevelLabels } from "./labels";

const SENIORITY_LABELS: Record<string, string> = {
  INTERN: "Estagiario",
  JUNIOR: "Junior",
  MID_LEVEL: "Pleno",
  SENIOR: "Senior",
  SPECIALIST: "Especialista",
  PRINCIPAL: "Principal",
};

/** Entrada bruta do agregador — desacoplada do Prisma para facilitar testes. */
export interface CurriculumSourceData {
  consultant: {
    id: string;
    name: string;
    jobTitle: string | null;
    seniority: string;
    area: string | null;
    curriculumHeadline: string | null;
    curriculumSummary: string | null;
  };
  educations: Array<{
    institution: string;
    course: string;
    degree: EducationDegree;
    startYear: number | null;
    endYear: number | null;
    completed: boolean;
  }>;
  languages: Array<{
    name: string;
    level: LanguageLevel;
  }>;
  /** Somente skills VALIDATED devem chegar aqui. */
  skills: Array<{
    name: string;
    category: string | null;
    level: SkillLevel;
    yearsExperience: number | null;
  }>;
  /** Somente certificados VALIDATED devem chegar aqui. */
  certificates: Array<{
    name: string;
    issuer: string;
    issuedAt: Date;
    expiresAt: Date | null;
    credentialUrl: string | null;
  }>;
  allocations: Array<{
    projectName: string;
    clientName: string | null;
    role: string;
    startDate: Date;
    endDate: Date | null;
  }>;
  highlights: {
    developmentPlansActive: number;
    evaluationsCompleted: number;
  };
}

export interface CurriculumIdentitySection {
  name: string;
  jobTitle: string | null;
  seniority: string | null;
  area: string | null;
  headline: string | null;
  summary: string | null;
}

export interface CurriculumEducationEntry {
  institution: string;
  course: string;
  degree: string;
  period: string | null;
  completed: boolean;
}

export interface CurriculumLanguageEntry {
  name: string;
  level: string;
}

export interface CurriculumSkillEntry {
  name: string;
  category: string | null;
  level: string;
  yearsExperience: number | null;
}

export interface CurriculumCertificateEntry {
  name: string;
  issuer: string;
  issuedAt: string;
  expiresAt: string | null;
  credentialUrl: string | null;
}

export interface CurriculumProjectEntry {
  projectName: string;
  clientName: string | null;
  role: string;
  period: string;
}

export interface CurriculumHighlight {
  label: string;
  value: string;
}

/** Estrutura final do curriculo, em secoes. ZERO campos financeiros. */
export interface ConsultantCurriculum {
  consultantId: string;
  generatedAt: string;
  identity: CurriculumIdentitySection;
  education: CurriculumEducationEntry[];
  languages: CurriculumLanguageEntry[];
  skills: CurriculumSkillEntry[];
  certificates: CurriculumCertificateEntry[];
  projects: CurriculumProjectEntry[];
  highlights: CurriculumHighlight[];
}

function formatYearPeriod(start: number | null, end: number | null): string | null {
  if (start && end) return `${start} - ${end}`;
  if (start) return `${start} - atual`;
  if (end) return `ate ${end}`;
  return null;
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatAllocationPeriod(start: Date, end: Date | null): string {
  const startLabel = formatIsoDate(start);
  const endLabel = end ? formatIsoDate(end) : "atual";
  return `${startLabel} - ${endLabel}`;
}

/**
 * Monta o curriculo a partir dos dados brutos. FUNCAO PURA: sem I/O, sem
 * relogio implicito (recebe `generatedAt`). Nao inclui NENHUM campo financeiro.
 */
export function assembleCurriculum(
  data: CurriculumSourceData,
  generatedAt: Date,
): ConsultantCurriculum {
  const identity: CurriculumIdentitySection = {
    name: data.consultant.name,
    jobTitle: data.consultant.jobTitle,
    seniority: SENIORITY_LABELS[data.consultant.seniority] ?? data.consultant.seniority,
    area: data.consultant.area,
    headline: data.consultant.curriculumHeadline,
    summary: data.consultant.curriculumSummary,
  };

  const education: CurriculumEducationEntry[] = data.educations
    .map((entry) => ({
      institution: entry.institution,
      course: entry.course,
      degree: educationDegreeLabels[entry.degree] ?? entry.degree,
      period: formatYearPeriod(entry.startYear, entry.endYear),
      completed: entry.completed,
    }))
    .sort((a, b) => (b.period ?? "").localeCompare(a.period ?? ""));

  const languages: CurriculumLanguageEntry[] = data.languages
    .map((entry) => ({
      name: entry.name,
      level: languageLevelLabels[entry.level] ?? entry.level,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const skills: CurriculumSkillEntry[] = data.skills
    .map((entry) => ({
      name: entry.name,
      category: entry.category,
      level: skillLevelLabels[entry.level] ?? entry.level,
      yearsExperience: entry.yearsExperience,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const certificates: CurriculumCertificateEntry[] = data.certificates
    .map((entry) => ({
      name: entry.name,
      issuer: entry.issuer,
      issuedAt: formatIsoDate(entry.issuedAt),
      expiresAt: entry.expiresAt ? formatIsoDate(entry.expiresAt) : null,
      credentialUrl: entry.credentialUrl,
    }))
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));

  const projects: CurriculumProjectEntry[] = data.allocations
    .map((entry) => ({
      projectName: entry.projectName,
      clientName: entry.clientName,
      role: entry.role,
      period: formatAllocationPeriod(entry.startDate, entry.endDate),
    }))
    .sort((a, b) => b.period.localeCompare(a.period));

  const highlights: CurriculumHighlight[] = [];
  if (data.highlights.developmentPlansActive > 0) {
    highlights.push({
      label: "Planos de desenvolvimento ativos",
      value: String(data.highlights.developmentPlansActive),
    });
  }
  if (data.highlights.evaluationsCompleted > 0) {
    highlights.push({
      label: "Avaliacoes concluidas",
      value: String(data.highlights.evaluationsCompleted),
    });
  }

  return {
    consultantId: data.consultant.id,
    generatedAt: generatedAt.toISOString(),
    identity,
    education,
    languages,
    skills,
    certificates,
    projects,
    highlights,
  };
}

/**
 * Le as tabelas-fonte do consultor e monta o curriculo derivado. Retorna null
 * quando o consultor nao existe. Le apenas dados NAO financeiros: identidade,
 * formacao, idiomas, skills VALIDATED, certificados VALIDATED, historico de
 * projetos (papel/periodo) e sinais de destaque.
 */
export async function buildConsultantCurriculum(
  consultantId: string,
  now: Date = new Date(),
): Promise<ConsultantCurriculum | null> {
  const consultant = await prisma.consultant.findUnique({
    where: { id: consultantId },
    select: {
      id: true,
      name: true,
      jobTitle: true,
      seniority: true,
      area: true,
      curriculumHeadline: true,
      curriculumSummary: true,
      educations: {
        select: {
          institution: true,
          course: true,
          degree: true,
          startYear: true,
          endYear: true,
          completed: true,
        },
      },
      languages: {
        select: { name: true, level: true },
      },
      skills: {
        where: { validationStatus: "VALIDATED" },
        select: {
          level: true,
          yearsExperience: true,
          skill: { select: { name: true, category: true } },
        },
      },
      certificates: {
        where: { status: "VALIDATED" },
        select: {
          name: true,
          issuer: true,
          issuedAt: true,
          expiresAt: true,
          credentialUrl: true,
        },
      },
      allocations: {
        select: {
          role: true,
          startDate: true,
          endDate: true,
          project: {
            select: { name: true, client: { select: { name: true } } },
          },
        },
      },
      developmentPlans: {
        where: { status: "ACTIVE" },
        select: { id: true },
      },
      evaluations: {
        where: { status: "COMPLETED" },
        select: { id: true },
      },
    },
  });

  if (!consultant) return null;

  const source: CurriculumSourceData = {
    consultant: {
      id: consultant.id,
      name: consultant.name,
      jobTitle: consultant.jobTitle,
      seniority: consultant.seniority,
      area: consultant.area,
      curriculumHeadline: consultant.curriculumHeadline,
      curriculumSummary: consultant.curriculumSummary,
    },
    educations: consultant.educations,
    languages: consultant.languages,
    skills: consultant.skills.map((row) => ({
      name: row.skill.name,
      category: row.skill.category,
      level: row.level,
      yearsExperience:
        row.yearsExperience != null ? Number(row.yearsExperience) : null,
    })),
    certificates: consultant.certificates,
    allocations: consultant.allocations.map((row) => ({
      projectName: row.project.name,
      clientName: row.project.client?.name ?? null,
      role: row.role,
      startDate: row.startDate,
      endDate: row.endDate,
    })),
    highlights: {
      developmentPlansActive: consultant.developmentPlans.length,
      evaluationsCompleted: consultant.evaluations.length,
    },
  };

  return assembleCurriculum(source, now);
}
