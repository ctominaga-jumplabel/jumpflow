"use client";

import { useState } from "react";
import { ClipboardList, Gauge, ListChecks } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { ActionButton } from "@/components/ui/ActionButton";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import {
  evaluationRelationshipLabels,
  evaluationStatusLabels,
  type EvaluationAssignment,
  type EvaluationCycleSummary,
  type EvaluationResult,
  type EvaluationStatus,
  type HistorySeries,
} from "@/lib/evaluations/types";
import type { EvaluationListItem } from "@/lib/db/evaluations";
import { CycleManager } from "./CycleManager";
import { ResponseModal } from "./ResponseModal";
import { ResultPanel } from "./ResultPanel";

type Tab = "results" | "inbox" | "cycles";

const statusTone: Record<EvaluationStatus, StatusTone> = {
  PENDING: "neutral",
  IN_PROGRESS: "info",
  COMPLETED: "success",
};

export interface EvaluationsViewProps {
  canManage: boolean;
  cycles: EvaluationCycleSummary[];
  assignments: EvaluationAssignment[];
  evaluations: EvaluationListItem[];
  results: Record<string, EvaluationResult>;
  histories: Record<string, HistorySeries[]>;
}

/**
 * Orchestrator do módulo de Avaliação (EP16). Três superfícies: Resultados
 * (radar/gap/histórico — escopo RBAC resolvido no servidor), Minhas avaliações
 * (responder as próprias atribuições) e Ciclos (config — só ADMIN/PEOPLE). A
 * UI apenas reflete o que o servidor já permitiu; toda fronteira é server-side.
 */
export function EvaluationsView({
  canManage,
  cycles,
  assignments,
  evaluations,
  results,
  histories,
}: EvaluationsViewProps) {
  const { feedback, notify } = useFeedback();
  const [tab, setTab] = useState<Tab>(
    assignments.length > 0 ? "inbox" : "results",
  );
  const [activeAssignment, setActiveAssignment] =
    useState<EvaluationAssignment | null>(null);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);

  const availableResults = evaluations.filter((e) => e.resultAvailable);
  const activeResultId =
    selectedResultId ?? availableResults[0]?.evaluationId ?? null;
  const activeResult = activeResultId ? results[activeResultId] : null;

  return (
    <div className="space-y-5">
      <FeedbackBanner message={feedback} />

      <div className="flex flex-wrap gap-2">
        <FilterChip
          label={`Resultados${availableResults.length ? ` (${availableResults.length})` : ""}`}
          active={tab === "results"}
          onClick={() => setTab("results")}
        />
        <FilterChip
          label={`Minhas avaliações${assignments.length ? ` (${assignments.length})` : ""}`}
          active={tab === "inbox"}
          onClick={() => setTab("inbox")}
        />
        {canManage ? (
          <FilterChip
            label="Ciclos"
            active={tab === "cycles"}
            onClick={() => setTab("cycles")}
          />
        ) : null}
      </div>

      {tab === "cycles" && canManage ? (
        <CycleManager cycles={cycles} notify={notify} />
      ) : null}

      {tab === "inbox" ? (
        <SectionPanel
          title="Minhas avaliações"
          description="Avaliações atribuídas a você. Você só vê e responde as suas; respostas de outros avaliadores ficam ocultas até o ciclo fechar."
        >
          {assignments.length === 0 ? (
            <div className="px-5 py-10">
              <EmptyState
                icon={ClipboardList}
                title="Nada para responder"
                description="Quando você for designado como avaliador em um ciclo aberto, as avaliações aparecem aqui."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {assignments.map((a) => (
                <li
                  key={a.responseId}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-strong">
                        {a.subjectConsultantName}
                      </span>
                      <StatusBadge tone="neutral">
                        {evaluationRelationshipLabels[a.relationship]}
                      </StatusBadge>
                      <StatusBadge tone={statusTone[a.status]}>
                        {evaluationStatusLabels[a.status]}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 text-xs text-soft">
                      {a.cycleName} · {a.skills.length} competências
                    </p>
                  </div>
                  <ActionButton
                    size="sm"
                    variant={a.status === "COMPLETED" ? "secondary" : "primary"}
                    icon={ListChecks}
                    onClick={() => setActiveAssignment(a)}
                  >
                    {a.cycleStatus !== "OPEN" || a.status === "COMPLETED"
                      ? "Ver"
                      : "Responder"}
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}
        </SectionPanel>
      ) : null}

      {tab === "results" ? (
        availableResults.length === 0 ? (
          <SectionPanel
            title="Resultados"
            description="Radar, gap e evolução por competência."
          >
            <div className="px-5 py-10">
              <EmptyState
                icon={Gauge}
                title="Nenhum resultado disponível"
                description="Os resultados aparecem aqui após o fechamento do ciclo (para o avaliado) ou conforme o seu escopo de gestão."
              />
            </div>
          </SectionPanel>
        ) : (
          <div className="space-y-4">
            {availableResults.length > 1 ? (
              <label className="flex flex-wrap items-center gap-2 text-sm font-medium text-medium">
                Avaliação
                <select
                  value={activeResultId ?? ""}
                  onChange={(e) => setSelectedResultId(e.target.value)}
                  className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
                >
                  {availableResults.map((e) => (
                    <option key={e.evaluationId} value={e.evaluationId}>
                      {e.subjectConsultantName} · {e.cycleName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {activeResult ? (
              <ResultPanel
                result={activeResult}
                history={histories[activeResult.subjectConsultantId] ?? []}
              />
            ) : (
              <SectionPanel title="Resultados">
                <p className="px-5 py-6 text-sm text-medium">
                  Selecione uma avaliação para ver o resultado.
                </p>
              </SectionPanel>
            )}
          </div>
        )
      ) : null}

      <ResponseModal
        open={activeAssignment !== null}
        assignment={activeAssignment}
        onClose={() => setActiveAssignment(null)}
        notify={notify}
      />
    </div>
  );
}
