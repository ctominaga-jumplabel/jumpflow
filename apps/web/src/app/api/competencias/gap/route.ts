import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { COMPETENCY_READ_ROLES } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  csvResponse,
  invalidInputResponse,
  noDatabaseResponse,
} from "../../relatorios/shared";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  view: z.enum(["matrix", "team"]).default("team"),
  type: z.enum(["ALL", "TECHNICAL", "BEHAVIORAL"]).default("ALL"),
});

/**
 * CSV export do gap de competências (EP14 US14.03). Mesmo read e mesmo escopo
 * RBAC da tela (recomputados do usuário REAL — qualquer hint do cliente é
 * ignorado). `view=team` exporta o agregado por skill; `view=matrix` exporta a
 * matriz detalhada por (consultor, skill). `type` filtra técnica/comportamental.
 */
export async function GET(request: Request) {
  const user = await requireRole(COMPETENCY_READ_ROLES);
  if (!isDatabaseConfigured()) return noDatabaseResponse();

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return invalidInputResponse();

  const { getCompetencyMatrix } = await import("@/lib/db/competencies");
  const { filterMatrixByType, aggregateTeamGap } = await import(
    "@/lib/competencies/gap"
  );
  const { buildMatrixCsv, buildTeamGapCsv } = await import(
    "@/lib/competencies/csv"
  );

  const full = await getCompetencyMatrix(user);
  const matrix = filterMatrixByType(full, parsed.data.type);

  if (parsed.data.view === "matrix") {
    return csvResponse(buildMatrixCsv(matrix), "competencias-matriz.csv");
  }
  const team = aggregateTeamGap(matrix.consultants, matrix.skills);
  return csvResponse(buildTeamGapCsv(team), "competencias-gap-time.csv");
}
