"use client";

import { useState, useTransition } from "react";
import { Lock, LockOpen, Plus } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import type { FeedbackTone } from "@/components/ui/Feedback";
import { transitionSurvey } from "@/app/app/clima/actions";
import {
  surveyStatusLabels,
  surveyTypeLabels,
  type SurveyStatus,
  type SurveySummary,
} from "@/lib/surveys/types";
import { SurveyFormModal } from "./SurveyFormModal";

const statusTone: Record<SurveyStatus, StatusTone> = {
  DRAFT: "neutral",
  OPEN: "info",
  CLOSED: "success",
};

export interface SurveyManagerProps {
  surveys: SurveySummary[];
  notify: (tone: FeedbackTone, text: string) => void;
}

/**
 * Gestão de pesquisas (ADMIN/PEOPLE): criar, abrir (DRAFT→OPEN, gera convites +
 * tokenHash para o público-alvo) e fechar (OPEN→CLOSED). As transições e a
 * geração de convites são enforced no servidor; aqui só disparamos a ação.
 */
export function SurveyManager({ surveys, notify }: SurveyManagerProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function transition(id: string, to: "OPEN" | "CLOSED") {
    setBusyId(id);
    startTransition(async () => {
      const result = await transitionSurvey({ id, to });
      setBusyId(null);
      if (result.ok) {
        notify(
          "success",
          to === "OPEN"
            ? "Pesquisa aberta. Convites gerados para os consultores ativos."
            : "Pesquisa encerrada. Os dashboards ficam congelados.",
        );
      } else {
        notify("warning", result.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <SectionPanel
        title="Pesquisas"
        description="Crie, abra e feche pesquisas. Abrir gera os convites do público-alvo (consultores ativos); fechar encerra a coleta."
        action={
          <ActionButton icon={Plus} size="sm" onClick={() => setOpen(true)}>
            Nova pesquisa
          </ActionButton>
        }
      >
        {surveys.length === 0 ? (
          <div className="px-5 py-10">
            <EmptyState
              icon={Plus}
              title="Nenhuma pesquisa ainda"
              description="Crie a primeira pesquisa de clima ou eNPS. Ela nasce como rascunho e você a abre quando quiser iniciar a coleta."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {surveys.map((survey) => (
              <li
                key={survey.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-strong">
                      {survey.title}
                    </span>
                    <StatusBadge tone={statusTone[survey.status]} strong>
                      {surveyStatusLabels[survey.status]}
                    </StatusBadge>
                    {survey.anonymous ? (
                      <StatusBadge tone="info">Anônima</StatusBadge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-soft">
                    {surveyTypeLabels[survey.type]} · {survey.questionCount}{" "}
                    perguntas · {survey.invitationCount} convidados ·{" "}
                    {survey.responseCount} respostas
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {survey.status === "DRAFT" ? (
                    <ActionButton
                      size="sm"
                      icon={LockOpen}
                      disabled={pending && busyId === survey.id}
                      onClick={() => transition(survey.id, "OPEN")}
                    >
                      Abrir
                    </ActionButton>
                  ) : null}
                  {survey.status === "OPEN" ? (
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      icon={Lock}
                      disabled={pending && busyId === survey.id}
                      onClick={() => transition(survey.id, "CLOSED")}
                    >
                      Fechar
                    </ActionButton>
                  ) : null}
                  {survey.status === "CLOSED" ? (
                    <span className="text-xs font-medium text-soft">
                      Encerrada
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionPanel>

      <SurveyFormModal
        open={open}
        onClose={() => setOpen(false)}
        notify={notify}
      />
    </div>
  );
}
