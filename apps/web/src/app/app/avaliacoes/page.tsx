import type { Metadata } from "next";
import { Gauge } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { EvaluationsView } from "@/components/evaluations/EvaluationsView";
import { requireRole } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  getConsultantHistory,
  getEvaluationResult,
  listCycles,
  listMyAssignments,
  listVisibleEvaluations,
} from "@/lib/db/evaluations";
import {
  EVALUATION_READ_ROLES,
  canManageCycles,
} from "@/lib/evaluations/visibility";
import type {
  EvaluationResult,
  HistorySeries,
} from "@/lib/evaluations/types";

export const metadata: Metadata = { title: "Avaliações" };

export default async function AvaliacoesPage() {
  const user = await requireRole(EVALUATION_READ_ROLES);
  const databaseReady = isDatabaseConfigured();
  const canManage = canManageCycles(user.roles);

  if (!databaseReady) {
    // Degradação graciosa honesta: avaliação é dado pessoal sensível persistido;
    // sem DB não há fallback silencioso para mock (LGPD §3).
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Talentos"
          title="Avaliações"
          description="Ciclos de avaliação 90/180/360, radar de competências, gap e evolução histórica."
        />
        <EmptyState
          icon={Gauge}
          title="Banco de dados não configurado"
          description="O módulo de avaliações consome dados sensíveis persistidos. Configure o banco para conduzir ciclos, responder avaliações e ver resultados."
        />
      </div>
    );
  }

  const [cycles, assignments, evaluations] = await Promise.all([
    canManage ? listCycles() : Promise.resolve([]),
    listMyAssignments(user),
    listVisibleEvaluations(user),
  ]);

  // Pré-carrega o resultado das avaliações cujo resultado já está disponível
  // ao espectador (RBAC + estado do ciclo resolvidos no servidor). O escopo já
  // garante que nenhuma avaliação fora do papel chega aqui.
  const availableResultIds = evaluations
    .filter((e) => e.resultAvailable)
    .map((e) => e.evaluationId);
  const resultEntries = await Promise.all(
    availableResultIds.map(async (id) => {
      const result = await getEvaluationResult(user, id);
      return [id, result] as const;
    }),
  );
  const results: Record<string, EvaluationResult> = {};
  for (const [id, result] of resultEntries) {
    if (result) results[id] = result;
  }

  // Série histórica por consultor (US16.05). Carrega uma vez por consultor com
  // resultado disponível; o escopo RBAC é reaplicado dentro de getConsultantHistory.
  const subjectIds = [
    ...new Set(Object.values(results).map((r) => r.subjectConsultantId)),
  ];
  const historyEntries = await Promise.all(
    subjectIds.map(async (consultantId) => {
      const series = await getConsultantHistory(user, consultantId);
      return [consultantId, series] as const;
    }),
  );
  const histories: Record<string, HistorySeries[]> = {};
  for (const [consultantId, series] of historyEntries) {
    histories[consultantId] = series;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Talentos"
        title="Avaliações"
        description="Conduza ciclos de avaliação 90/180/360, responda as avaliações atribuídas a você e acompanhe o resultado em radar, gap (contra o nível requerido) e evolução histórica."
      />
      <EvaluationsView
        canManage={canManage}
        cycles={cycles}
        assignments={assignments}
        evaluations={evaluations}
        results={results}
        histories={histories}
      />
    </div>
  );
}
