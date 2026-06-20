"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  CircleSlash,
  Pencil,
  Plus,
  Sprout,
  Trash2,
} from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { removeAction, setPlanStatus } from "@/app/app/pdi/actions";
import type { SkillOption } from "@/lib/competencies/types";
import {
  developmentActionStatusLabels,
  developmentActionTypeLabels,
  developmentPlanStatusLabels,
  type ConsultantOption,
  type DevelopmentActionStatus,
  type DevelopmentActionView,
  type DevelopmentPlanStatus,
  type DevelopmentPlanView,
} from "@/lib/development/types";
import { PlanFormModal } from "./PlanFormModal";
import { ActionFormModal } from "./ActionFormModal";
import { ActionProgressModal } from "./ActionProgressModal";

const planStatusTone: Record<DevelopmentPlanStatus, StatusTone> = {
  ACTIVE: "info",
  COMPLETED: "success",
  CANCELLED: "neutral",
};

const actionStatusTone: Record<DevelopmentActionStatus, StatusTone> = {
  PLANNED: "neutral",
  IN_PROGRESS: "info",
  DONE: "success",
  CANCELLED: "neutral",
};

function formatPeriod(startIso: string, endIso: string): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(startIso)} – ${fmt(endIso)}`;
}

export interface DevelopmentViewProps {
  canManage: boolean;
  plans: DevelopmentPlanView[];
  consultants: ConsultantOption[];
  skillOptions: SkillOption[];
}

/**
 * Orquestrador do PDI (EP17). Lista os planos visíveis ao espectador (escopo
 * RBAC resolvido no servidor), com progresso e ações. Gestores criam/editam a
 * estrutura; o consultor dono atualiza o progresso das próprias ações. A UI só
 * reflete o que o servidor já permitiu (flags canManage/canUpdateProgress).
 */
export function DevelopmentView({
  canManage,
  plans,
  consultants,
  skillOptions,
}: DevelopmentViewProps) {
  const { feedback, notify } = useFeedback();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [actionForm, setActionForm] = useState<{
    planId: string;
    action: DevelopmentActionView | null;
  } | null>(null);
  const [progressFor, setProgressFor] = useState<DevelopmentActionView | null>(
    null,
  );

  function changePlanStatus(
    id: string,
    status: "COMPLETED" | "CANCELLED",
  ) {
    startTransition(async () => {
      const result = await setPlanStatus({ id, status });
      if (result.ok) {
        notify(
          "success",
          status === "COMPLETED" ? "PDI concluído." : "PDI cancelado.",
        );
      } else {
        notify("warning", result.message);
      }
    });
  }

  function deleteAction(id: string) {
    startTransition(async () => {
      const result = await removeAction({ id });
      if (result.ok) {
        notify("success", "Ação removida.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  return (
    <div className="space-y-5">
      <FeedbackBanner message={feedback} />

      <SectionPanel
        title="Planos de desenvolvimento"
        description="Cada PDI mostra o progresso (% de ações concluídas) e as ações de desenvolvimento. Ações vencidas são destacadas."
        action={
          canManage ? (
            <ActionButton
              icon={Plus}
              size="sm"
              onClick={() => setCreateOpen(true)}
            >
              Novo PDI
            </ActionButton>
          ) : undefined
        }
      >
        {plans.length === 0 ? (
          <div className="px-5 py-10">
            <EmptyState
              icon={Sprout}
              title="Nenhum PDI ainda"
              description={
                canManage
                  ? "Crie o primeiro PDI a partir do gap de competências de um consultor."
                  : "Quando você tiver um plano de desenvolvimento, ele aparece aqui."
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {plans.map((plan) => (
              <li key={plan.id} className="space-y-3 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-strong">
                        {plan.consultantName}
                      </span>
                      <StatusBadge tone={planStatusTone[plan.status]} strong>
                        {developmentPlanStatusLabels[plan.status]}
                      </StatusBadge>
                      {plan.cycleName ? (
                        <StatusBadge tone="neutral">
                          {plan.cycleName}
                        </StatusBadge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-soft">
                      {formatPeriod(plan.periodStart, plan.periodEnd)}
                      {plan.ownerName ? ` · Responsável: ${plan.ownerName}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {plan.canManage && plan.status === "ACTIVE" ? (
                      <>
                        <ActionButton
                          size="sm"
                          variant="secondary"
                          icon={Plus}
                          onClick={() =>
                            setActionForm({ planId: plan.id, action: null })
                          }
                        >
                          Ação
                        </ActionButton>
                        <ActionButton
                          size="sm"
                          variant="success"
                          icon={CheckCircle2}
                          disabled={pending}
                          onClick={() =>
                            changePlanStatus(plan.id, "COMPLETED")
                          }
                        >
                          Concluir
                        </ActionButton>
                        <ActionButton
                          size="sm"
                          variant="danger"
                          icon={CircleSlash}
                          disabled={pending}
                          onClick={() => changePlanStatus(plan.id, "CANCELLED")}
                        >
                          Cancelar
                        </ActionButton>
                      </>
                    ) : null}
                  </div>
                </div>

                <ProgressBar
                  done={plan.progress.done}
                  total={plan.progress.total}
                  percent={plan.progress.donePercent}
                  overdue={plan.progress.overdue}
                />

                {plan.actions.length === 0 ? (
                  <p className="text-xs text-soft">Sem ações neste plano.</p>
                ) : (
                  <ul className="space-y-2">
                    {plan.actions.map((action) => (
                      <li
                        key={action.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-muted px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-strong">
                              {action.description}
                            </span>
                            <StatusBadge
                              tone={actionStatusTone[action.status]}
                            >
                              {developmentActionStatusLabels[action.status]}
                            </StatusBadge>
                          </div>
                          <p className="mt-0.5 text-xs text-soft">
                            {developmentActionTypeLabels[action.type]}
                            {action.targetSkillName
                              ? ` · ${action.targetSkillName}`
                              : ""}
                            {action.dueAt ? ` · vence ${formatDay(action.dueAt)}` : ""}
                          </p>
                          {action.evidenceNote ? (
                            <p className="mt-0.5 text-xs text-medium">
                              Evidência: {action.evidenceNote}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {plan.canUpdateProgress &&
                          plan.status === "ACTIVE" ? (
                            <ActionButton
                              size="sm"
                              variant="secondary"
                              onClick={() => setProgressFor(action)}
                            >
                              Progresso
                            </ActionButton>
                          ) : null}
                          {plan.canManage && plan.status === "ACTIVE" ? (
                            <>
                              <button
                                type="button"
                                aria-label="Editar ação"
                                onClick={() =>
                                  setActionForm({
                                    planId: plan.id,
                                    action,
                                  })
                                }
                                className="grid size-8 place-items-center rounded-md text-medium hover:bg-surface hover:text-strong"
                              >
                                <Pencil aria-hidden="true" className="size-4" />
                              </button>
                              <button
                                type="button"
                                aria-label="Remover ação"
                                disabled={pending}
                                onClick={() => deleteAction(action.id)}
                                className="grid size-8 place-items-center rounded-md text-medium hover:bg-surface hover:text-danger disabled:opacity-50"
                              >
                                <Trash2 aria-hidden="true" className="size-4" />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionPanel>

      {canManage ? (
        <>
          <PlanFormModal
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            consultants={consultants}
            skillOptions={skillOptions}
            notify={notify}
          />
          {actionForm ? (
            <ActionFormModal
              open={actionForm !== null}
              planId={actionForm.planId}
              action={actionForm.action}
              skillOptions={skillOptions}
              onClose={() => setActionForm(null)}
              notify={notify}
            />
          ) : null}
        </>
      ) : null}

      <ActionProgressModal
        open={progressFor !== null}
        action={progressFor}
        onClose={() => setProgressFor(null)}
        notify={notify}
      />
    </div>
  );
}

function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

function ProgressBar({
  done,
  total,
  percent,
  overdue,
}: {
  done: number;
  total: number;
  percent: number;
  overdue: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-soft">
        <span>
          {done} de {total} concluídas
          {overdue > 0 ? (
            <span className="ml-2 font-semibold text-danger">
              {overdue} vencida{overdue > 1 ? "s" : ""}
            </span>
          ) : null}
        </span>
        <span className="font-semibold text-medium">{percent}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full border border-ink/15 bg-surface-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-success"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
