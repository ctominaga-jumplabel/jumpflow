import { prisma } from "@jumpflow/database";
import type { AppUser } from "@/lib/auth/types";
import { hasRole } from "@/lib/auth/route-permissions";
import { getConsultantForUser } from "@/lib/db/timesheet";
import { resolveDbUser } from "@/lib/db/users";
import { parseIsoDateUtc, toIsoDate } from "@/lib/timesheet/week";
import {
  buildAvailabilityMap,
  buildWeeklyPeriods,
} from "@/lib/availability/map";
import type {
  AvailabilityConsultantInput,
  AvailabilityMap,
  ConsultantStatusForAvailability,
} from "@/lib/availability/types";
import { isDatabaseConfigured } from "./config";

/**
 * Prisma read for the Mapa de Disponibilidade (EP11). RBAC scope is applied
 * HERE — never trust client hints. The read is split from the pure read-model
 * (lib/availability/map.ts): this module only fetches and shapes rows. Derived
 * from existing data (Allocation + ConsultantTimeOff + Consultant.status) —
 * no new schema.
 */

/** Quantidade padrão de semanas exibidas no heatmap. */
export const DEFAULT_AVAILABILITY_WEEKS = 8;

interface AvailabilityScope {
  /** ADMIN/PEOPLE/AREA_MANAGER/SALES: todos os consultores. */
  broad: boolean;
  /** PROJECT_MANAGER: apenas consultores alocados em projetos que gerencia. */
  managerUserId?: string;
  /** CONSULTANT sem papel de gestão: apenas o próprio. */
  ownConsultantId?: string;
}

/**
 * Escopo de visibilidade do heatmap (docs/backlog-talentos.md §2, US11.02).
 * União de papéis: o mais amplo vence. AREA_MANAGER vê seu time — como o MVP
 * não tem vínculo formal gestor→área, AREA_MANAGER recebe escopo amplo (igual a
 * PEOPLE); o refinamento por área fica como pendência, coerente com a matriz de
 * competências. PROJECT_MANAGER vê quem está alocado em seus projetos.
 * CONSULTANT vê só o próprio.
 */
export async function resolveAvailabilityScope(
  user: AppUser,
): Promise<AvailabilityScope> {
  if (hasRole(user, ["ADMIN", "PEOPLE", "AREA_MANAGER", "SALES"])) {
    return { broad: true };
  }
  if (hasRole(user, "PROJECT_MANAGER")) {
    const dbUser = await resolveDbUser(user);
    return { broad: false, managerUserId: dbUser?.id };
  }
  const consultant = await getConsultantForUser(user);
  return { broad: false, ownConsultantId: consultant?.id };
}

type ConsultantWhere = {
  id?: string;
  allocations?: { some: { project: { managerUserId: string } } };
};

/**
 * `null` significa "sem universo" (escopo sem alvo) — retorna mapa vazio para
 * não vazar dados de outro time. Note que NÃO filtramos por status na query:
 * o read-model precisa de inativos/afastados para classificá-los corretamente
 * (US11.01: inativo não conta como capacidade; afastado aparece como ON_LEAVE).
 */
function consultantWhereForScope(
  scope: AvailabilityScope,
): ConsultantWhere | null | "broad" {
  if (scope.broad) return "broad";
  if (scope.managerUserId) {
    return {
      allocations: { some: { project: { managerUserId: scope.managerUserId } } },
    };
  }
  if (scope.ownConsultantId) return { id: scope.ownConsultantId };
  return null;
}

function mapStatus(status: string): ConsultantStatusForAvailability {
  if (status === "INACTIVE") return "INACTIVE";
  if (status === "ON_LEAVE") return "ON_LEAVE";
  return "ACTIVE";
}

export interface AvailabilityReadOptions {
  /** Início da janela; default = hoje (snap para a segunda-feira). */
  from?: Date;
  /** Número de semanas; default = DEFAULT_AVAILABILITY_WEEKS. */
  weeks?: number;
}

/**
 * Lê e monta o read-model do heatmap para o escopo RBAC do usuário. As somas de
 * percentual consideram apenas alocações ACTIVE (US11.01); férias e
 * afastamentos derivam de ConsultantTimeOff com status em (PLANNED, CONFIRMED)
 * — CANCELLED é descartado — cujo intervalo [startDate, endDate] cruza a janela.
 * São datas concretas de gozo (não mais o período aquisitivo de
 * ConsultantVacation): VACATION → estado VACATION; LEAVE/OTHER → ON_LEAVE.
 */
export async function getAvailabilityMap(
  user: AppUser,
  options: AvailabilityReadOptions = {},
): Promise<AvailabilityMap> {
  const from = options.from ?? new Date();
  const weeks = options.weeks ?? DEFAULT_AVAILABILITY_WEEKS;
  const periods = buildWeeklyPeriods(from, weeks);

  if (!isDatabaseConfigured()) return { periods, rows: [] };

  const scope = await resolveAvailabilityScope(user);
  const where = consultantWhereForScope(scope);
  if (where === null) return { periods, rows: [] };

  // Limites da janela exibida, para só trazer ausências que possam cruzá-la:
  // intervalos com fim antes do início da janela ou início após o fim não
  // interessam. [windowStart, windowEnd] são as datas extremas dos períodos.
  const windowStart = parseIsoDateUtc(periods[0].start) ?? from;
  const windowEnd =
    parseIsoDateUtc(periods[periods.length - 1].end) ?? from;

  const rows = await prisma.consultant.findMany({
    where: where === "broad" ? {} : where,
    select: {
      id: true,
      name: true,
      seniority: true,
      area: true,
      jobTitle: true,
      status: true,
      allocations: {
        where: { status: "ACTIVE" },
        select: {
          allocationPercent: true,
          startDate: true,
          endDate: true,
        },
      },
      timeOffs: {
        where: {
          status: { in: ["PLANNED", "CONFIRMED"] },
          startDate: { lte: windowEnd },
          endDate: { gte: windowStart },
        },
        select: { kind: true, startDate: true, endDate: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const consultants: AvailabilityConsultantInput[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    seniority: row.seniority,
    area: row.area,
    jobTitle: row.jobTitle,
    status: mapStatus(row.status),
    allocations: row.allocations.map((a) => ({
      allocationPercent: a.allocationPercent,
      startDate: toIsoDate(a.startDate),
      endDate: a.endDate ? toIsoDate(a.endDate) : null,
    })),
    absences: row.timeOffs.map((t) => ({
      kind: t.kind,
      start: toIsoDate(t.startDate),
      end: toIsoDate(t.endDate),
    })),
  }));

  return buildAvailabilityMap(consultants, periods);
}
