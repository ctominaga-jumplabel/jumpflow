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

/**
 * Consultores que um gestor pode alcançar no seletor "Lançar em nome de":
 * ATIVOS e com ao menos uma alocação ATIVA em projeto não encerrado (só esses
 * têm onde lançar). Ordenados por nome.
 */
export async function listOnBehalfConsultants(): Promise<
  OnBehalfConsultantOption[]
> {
  const rows = await prisma.consultant.findMany({
    where: {
      status: "ACTIVE",
      allocations: {
        some: { status: "ACTIVE", project: { status: { not: "CLOSED" } } },
      },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return rows;
}
