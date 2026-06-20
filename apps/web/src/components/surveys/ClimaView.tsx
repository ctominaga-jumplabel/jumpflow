"use client";

import { useState } from "react";
import { ClipboardList, Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { ActionButton } from "@/components/ui/ActionButton";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import {
  surveyInvitationStatusLabels,
  surveyTypeLabels,
  type SurveyAssignment,
  type SurveyDashboard,
  type SurveyInvitationStatus,
  type SurveySummary,
} from "@/lib/surveys/types";
import { SurveyManager } from "./SurveyManager";
import { SurveyResponseModal } from "./SurveyResponseModal";
import { SurveyDashboardPanel } from "./SurveyDashboardPanel";

type Tab = "inbox" | "dashboards" | "manage";

const invitationTone: Record<SurveyInvitationStatus, StatusTone> = {
  PENDING: "info",
  ANSWERED: "success",
  EXPIRED: "neutral",
};

export interface ClimaViewProps {
  canManage: boolean;
  canDashboards: boolean;
  surveys: SurveySummary[];
  assignments: SurveyAssignment[];
  dashboards: Record<string, SurveyDashboard>;
}

/**
 * Orchestrator do módulo de Clima / NPS (EP 7.1). Três superfícies: Minhas
 * pesquisas (responder os próprios convites), Dashboards (agregados anônimos,
 * acima do piso mínimo) e Gestão (criar/abrir/fechar — ADMIN/PEOPLE). A UI só
 * reflete o que o servidor já permitiu; toda fronteira é server-side.
 */
export function ClimaView({
  canManage,
  canDashboards,
  surveys,
  assignments,
  dashboards,
}: ClimaViewProps) {
  const { feedback, notify } = useFeedback();
  const pendingAssignments = assignments.filter((a) => a.status === "PENDING");
  const [tab, setTab] = useState<Tab>(
    pendingAssignments.length > 0
      ? "inbox"
      : canDashboards
        ? "dashboards"
        : "inbox",
  );
  const [activeAssignment, setActiveAssignment] =
    useState<SurveyAssignment | null>(null);

  return (
    <div className="space-y-5">
      <FeedbackBanner message={feedback} />

      <div className="flex flex-wrap gap-2">
        <FilterChip
          label={`Minhas pesquisas${assignments.length ? ` (${assignments.length})` : ""}`}
          active={tab === "inbox"}
          onClick={() => setTab("inbox")}
        />
        {canDashboards ? (
          <FilterChip
            label="Dashboards"
            active={tab === "dashboards"}
            onClick={() => setTab("dashboards")}
          />
        ) : null}
        {canManage ? (
          <FilterChip
            label="Gestão"
            active={tab === "manage"}
            onClick={() => setTab("manage")}
          />
        ) : null}
      </div>

      {tab === "manage" && canManage ? (
        <SurveyManager surveys={surveys} notify={notify} />
      ) : null}

      {tab === "dashboards" && canDashboards ? (
        <SurveyDashboardPanel surveys={surveys} dashboards={dashboards} />
      ) : null}

      {tab === "inbox" ? (
        <SectionPanel
          title="Minhas pesquisas"
          description="Convites de pesquisa atribuídos a você. Você responde uma única vez; em pesquisas anônimas a sua resposta nunca é ligada à sua identidade."
        >
          {assignments.length === 0 ? (
            <div className="px-5 py-10">
              <EmptyState
                icon={Inbox}
                title="Nenhum convite"
                description="Quando uma pesquisa for aberta para você, o convite aparece aqui para responder."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {assignments.map((a) => (
                <li
                  key={a.invitationId}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-strong">
                        {a.surveyTitle}
                      </span>
                      <StatusBadge tone={invitationTone[a.status]} strong>
                        {surveyInvitationStatusLabels[a.status]}
                      </StatusBadge>
                      {a.anonymous ? (
                        <StatusBadge tone="info">Anônima</StatusBadge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-soft">
                      {surveyTypeLabels[a.surveyType]} · {a.questions.length}{" "}
                      {a.questions.length === 1 ? "pergunta" : "perguntas"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {a.status === "PENDING" && a.surveyStatus === "OPEN" ? (
                      <ActionButton
                        size="sm"
                        icon={ClipboardList}
                        onClick={() => setActiveAssignment(a)}
                      >
                        Responder
                      </ActionButton>
                    ) : a.status === "ANSWERED" ? (
                      <span className="text-xs font-medium text-soft">
                        Respondida
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-soft">
                        Indisponível
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionPanel>
      ) : null}

      <SurveyResponseModal
        assignment={activeAssignment}
        onClose={() => setActiveAssignment(null)}
        notify={notify}
      />
    </div>
  );
}
