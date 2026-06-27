import { prisma } from "@jumpflow/database";
import type { AppUser } from "@/lib/auth/types";
import type {
  CaseInsightItem,
  CheckpointInsights,
  OpportunityInsightItem,
} from "@/lib/checkpoint/types";
import { getCheckpoint } from "./checkpoint";
import { isDatabaseConfigured } from "./config";

/**
 * Read path for the insight candidates (Opportunity / Case) of a single
 * Checkpoint (Melhoria #4, FATIA 5 — telas). Skills NÃO entram aqui: elas caem
 * na curadoria EXISTENTE em /app/skills (a tela só linka, não duplica).
 *
 * RBAC + LGPD/confiança: este helper NÃO inventa um escopo próprio — ele
 * reaproveita {@link getCheckpoint} (que aplica o read-scope e calcula
 * `canViewRaw`) e só projeta os candidatos quando o viewer pode ver o CRU do
 * checkpoint (gestão/autor/gestor responsável). O consultor avaliado NUNCA
 * recebe candidatos, mesmo num checkpoint SHARED — recebe sempre listas vazias,
 * exatamente como o read-model já oculta notes/transcription.
 *
 * Fail-closed: checkpoint fora de escopo / inexistente / sem permissão de cru →
 * insights vazios (nunca um erro que revele a existência da linha).
 */
const EMPTY: CheckpointInsights = { opportunities: [], cases: [] };

export async function getCheckpointInsights(
  user: AppUser,
  checkpointId: string,
): Promise<CheckpointInsights> {
  if (!isDatabaseConfigured()) return EMPTY;

  // Reutiliza o gate de leitura + cálculo de canViewRaw do read-model. Se a
  // linha está fora do escopo, retorna null → vazio. Se o viewer não pode ver o
  // cru (notadamente o consultor avaliado), também vazio.
  const checkpoint = await getCheckpoint(user, checkpointId);
  if (!checkpoint || !checkpoint.canViewRaw) return EMPTY;

  const [opportunities, cases] = await Promise.all([
    prisma.opportunity.findMany({
      where: { sourceCheckpointId: checkpointId },
      select: {
        id: true,
        kind: true,
        title: true,
        description: true,
        priority: true,
        sourceQuote: true,
        aiGenerated: true,
        status: true,
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    prisma.case.findMany({
      where: { sourceCheckpointId: checkpointId },
      select: {
        id: true,
        title: true,
        summary: true,
        outcome: true,
        sourceQuote: true,
        aiGenerated: true,
        status: true,
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  return {
    opportunities: opportunities.map(
      (row): OpportunityInsightItem => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        description: row.description,
        priority: row.priority,
        sourceQuote: row.sourceQuote,
        aiGenerated: row.aiGenerated,
        status: row.status,
      }),
    ),
    cases: cases.map(
      (row): CaseInsightItem => ({
        id: row.id,
        title: row.title,
        summary: row.summary,
        outcome: row.outcome,
        sourceQuote: row.sourceQuote,
        aiGenerated: row.aiGenerated,
        status: row.status,
      }),
    ),
  };
}

/** Project options for the composer (não-fechados), espelha o Feedback. */
export async function listCheckpointProjectOptions(): Promise<
  { id: string; name: string }[]
> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.project.findMany({
    where: { status: { not: "CLOSED" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({ id: row.id, name: row.name }));
}
