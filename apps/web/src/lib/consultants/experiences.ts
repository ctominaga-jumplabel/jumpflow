/**
 * Experiencia profissional DECLARADA do consultor (P27 — curriculo-first).
 *
 * Read-model + ordenacao PURA (testavel sem I/O) das linhas de
 * `ConsultantExperience`. Ordem canonica: experiencias ATUAIS primeiro
 * (endDate null), depois por data de inicio DECRESCENTE (mais recente no topo).
 * ZERO campos financeiros — o model nao tem valor/custo por construcao.
 */
import { prisma } from "@jumpflow/database";

export interface ConsultantExperienceView {
  id: string;
  company: string;
  role: string;
  /** ISO date (yyyy-mm-dd). */
  startDate: string;
  /** ISO date (yyyy-mm-dd) ou null quando a experiencia e atual. */
  endDate: string | null;
  description: string | null;
  location: string | null;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Ordena experiencias: atuais (sem endDate) primeiro, depois por startDate
 * decrescente. Empate no startDate: mais recente por endDate. Funcao PURA.
 */
export function orderExperiences(
  rows: ConsultantExperienceView[],
): ConsultantExperienceView[] {
  return [...rows].sort((a, b) => {
    const aCurrent = a.endDate === null;
    const bCurrent = b.endDate === null;
    if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
    if (a.startDate !== b.startDate) return b.startDate.localeCompare(a.startDate);
    return (b.endDate ?? "").localeCompare(a.endDate ?? "");
  });
}

/** Le e ordena as experiencias declaradas de um consultor. */
export async function listConsultantExperiences(
  consultantId: string,
): Promise<ConsultantExperienceView[]> {
  const rows = await prisma.consultantExperience.findMany({
    where: { consultantId },
    select: {
      id: true,
      company: true,
      role: true,
      startDate: true,
      endDate: true,
      description: true,
      location: true,
    },
  });
  return orderExperiences(
    rows.map((row) => ({
      id: row.id,
      company: row.company,
      role: row.role,
      startDate: isoDate(row.startDate),
      endDate: row.endDate ? isoDate(row.endDate) : null,
      description: row.description,
      location: row.location,
    })),
  );
}
