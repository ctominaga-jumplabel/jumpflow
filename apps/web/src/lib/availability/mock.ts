import { consultants as demoConsultants } from "@/lib/mock-data/consultants";
import { addDays, toIsoDate, weekStartOf } from "@/lib/timesheet/week";
import { buildAvailabilityMap, buildWeeklyPeriods } from "./map";
import type {
  AvailabilityConsultantInput,
  AvailabilityMap,
} from "./types";

/**
 * Mock read-model for graceful degradation when the database is not configured.
 * Derives plausible availability from the demo consultant directory so the
 * heatmap renders (clearly labelled as demo in the page). No persistence.
 */

const SENIORITY_LABEL: Record<string, string> = {
  JUNIOR: "Júnior",
  PLENO: "Pleno",
  SENIOR: "Sênior",
  ESPECIALISTA: "Especialista",
};

export function buildMockAvailabilityMap(
  from: Date,
  weeks: number,
): AvailabilityMap {
  const periods = buildWeeklyPeriods(from, weeks);
  const monday = weekStartOf(from);
  // Janela "ampla" para que as alocações cruzem todos os períodos da janela.
  const windowStart = toIsoDate(addDays(monday, -30));
  const windowEnd = toIsoDate(addDays(monday, weeks * 7 + 30));

  const consultants: AvailabilityConsultantInput[] = demoConsultants.map(
    (c, index) => {
      const allocations =
        c.allocationPercent > 0
          ? [
              {
                allocationPercent: c.allocationPercent,
                startDate: windowStart,
                endDate: windowEnd,
              },
            ]
          : [];
      // Ausências agendadas de demonstração (datas concretas de gozo, como em
      // ConsultantTimeOff). A cada 4º consultor: uma semana de férias; e a cada
      // 4º deslocado: uma semana de afastamento — para ilustrar VACATION e
      // ON_LEAVE no mock (apenas demonstração visual).
      const absences: AvailabilityConsultantInput["absences"] = [];
      if (index % 4 === 1) {
        absences.push({
          kind: "VACATION",
          start: toIsoDate(addDays(monday, 7)),
          end: toIsoDate(addDays(monday, 13)),
        });
      } else if (index % 4 === 3) {
        absences.push({
          kind: "LEAVE",
          start: toIsoDate(addDays(monday, 14)),
          end: toIsoDate(addDays(monday, 20)),
        });
      }
      return {
        id: c.id,
        name: c.name,
        seniority: SENIORITY_LABEL[c.seniority] ?? c.seniority,
        area: c.area,
        jobTitle: c.jobTitle,
        status: c.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
        allocations,
        absences,
      };
    },
  );

  return buildAvailabilityMap(consultants, periods);
}
