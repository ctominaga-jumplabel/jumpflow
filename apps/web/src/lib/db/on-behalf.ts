import { prisma } from "@jumpflow/database";
import type { AppUser } from "@/lib/auth/types";
import { hasRole } from "@/lib/auth/route-permissions";
import type { RoleName } from "@/lib/auth/roles";

/**
 * Lançamento "em nome de" (on-behalf): um Gestor de Área ou Admin pode lançar
 * horas e despesas por um consultor que faça parte de um projeto. A regra
 * "consultor precisa estar no projeto" NÃO é imposta aqui — ela já é garantida
 * por `findActiveAllocation`/`ensureActiveAllocation` em cada gravação (nenhum
 * lançamento existe sem alocação ativa cobrindo a data). Este módulo cuida só de
 * (1) QUEM pode agir em nome de terceiros e (2) resolver o consultor-alvo.
 *
 * Escopo (decisão de produto): ADMIN e AREA_MANAGER são AMPLOS — podem lançar
 * por qualquer consultor ativo, com a trava de alocação como fronteira real.
 * PROJECT_MANAGER NÃO entra (a decisão limitou a "Gestor de Área ou Admin").
 */

/** Papéis que podem lançar horas/despesas em nome de outro consultor. */
export const ON_BEHALF_ROLES: RoleName[] = ["ADMIN", "AREA_MANAGER"];

/** Se o usuário pode lançar em nome de outro consultor. */
export function canActOnBehalf(user: AppUser): boolean {
  return hasRole(user, ON_BEHALF_ROLES);
}

/** Consultor ATIVO por id (alvo do lançamento em nome de). Null se não existir. */
export async function findActiveConsultantById(id: string) {
  return prisma.consultant.findFirst({ where: { id, status: "ACTIVE" } });
}

export interface OnBehalfConsultantOption {
  id: string;
  name: string;
}

export interface OnBehalfPickerData {
  /** Consultores elegíveis (ativos com alocação ativa em projeto não encerrado). */
  consultants: OnBehalfConsultantOption[];
  /** Projetos não encerrados que têm ao menos um desses consultores alocados. */
  projects: { id: string; name: string }[];
  /** Pares (consultor, projeto) para a cascata client-side projeto→consultor. */
  allocations: { consultantId: string; projectId: string }[];
}

/**
 * Dados do seletor "Lançar em nome de" com o grafo para o FILTRO CONJUNTO
 * client-side: escolher um projeto afunila a lista de consultores NA SELEÇÃO
 * (sem recarregar). Uma única leitura das alocações ATIVAS (consultor ativo,
 * projeto não encerrado) deriva as três listas — consultores, projetos e o grafo
 * — de forma consistente. Escopo amplo (só ADMIN/AREA_MANAGER chegam aqui).
 */
export async function getOnBehalfPickerData(): Promise<OnBehalfPickerData> {
  const rows = await prisma.allocation.findMany({
    where: {
      status: "ACTIVE",
      consultant: { status: "ACTIVE" },
      project: { status: { not: "CLOSED" } },
    },
    select: {
      consultantId: true,
      projectId: true,
      consultant: { select: { name: true } },
      project: { select: { name: true } },
    },
  });
  const consultantMap = new Map<string, string>();
  const projectMap = new Map<string, string>();
  const pairs = new Set<string>();
  const allocations: { consultantId: string; projectId: string }[] = [];
  for (const row of rows) {
    consultantMap.set(row.consultantId, row.consultant.name);
    projectMap.set(row.projectId, row.project.name);
    const key = `${row.consultantId}|${row.projectId}`;
    if (!pairs.has(key)) {
      pairs.add(key);
      allocations.push({
        consultantId: row.consultantId,
        projectId: row.projectId,
      });
    }
  }
  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, "pt-BR");
  return {
    consultants: [...consultantMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort(byName),
    projects: [...projectMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort(byName),
    allocations,
  };
}

