"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  CircleSlash,
  Flag,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import {
  removeKeyResult,
  setObjectiveStatus,
  syncKeyResultFromSource,
} from "@/app/app/metas/actions";
import { isKnownAutoSource } from "@/lib/okrs/auto-source";
import {
  keyResultMetricLabels,
  objectiveScopeLabels,
  objectiveStatusLabels,
  type ConsultantOption,
  type KeyResultView,
  type ObjectiveScope,
  type ObjectiveStatus,
  type ObjectiveView,
  type ProjectOption,
} from "@/lib/okrs/types";
import { ObjectiveFormModal } from "./ObjectiveFormModal";
import { KeyResultFormModal } from "./KeyResultFormModal";
import { KeyResultValueModal } from "./KeyResultValueModal";

const objectiveStatusTone: Record<ObjectiveStatus, StatusTone> = {
  DRAFT: "neutral",
  ACTIVE: "info",
  COMPLETED: "success",
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

function scopeLabel(o: ObjectiveView): string {
  const base = objectiveScopeLabels[o.scope];
  if (o.scope === "CONSULTANT") return o.consultantName ?? base;
  if (o.scope === "PROJECT") return o.projectName ?? base;
  return o.referenceKey ?? base;
}

export interface ObjectivesViewProps {
  canManage: boolean;
  objectives: ObjectiveView[];
  consultants: ConsultantOption[];
  projects: ProjectOption[];
}

/**
 * Orquestrador de Metas e OKRs (EP 7.2). Lista os objetivos visíveis ao
 * espectador (escopo RBAC resolvido no servidor), com progresso derivado e KRs.
 * Gestores criam/editam estrutura; o consultor dono atualiza o valor dos
 * próprios KRs. A UI só reflete o que o servidor permitiu (canManage/
 * canUpdateProgress).
 */
export function ObjectivesView({
  canManage,
  objectives,
  consultants,
  projects,
}: ObjectivesViewProps) {
  const { feedback, notify } = useFeedback();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [krForm, setKrForm] = useState<{
    objectiveId: string;
    scope: ObjectiveScope;
    keyResult: KeyResultView | null;
  } | null>(null);
  const [valueFor, setValueFor] = useState<KeyResultView | null>(null);

  function changeStatus(id: string, status: ObjectiveStatus) {
    startTransition(async () => {
      const result = await setObjectiveStatus({ id, status });
      if (result.ok) {
        notify("success", `Objetivo ${objectiveStatusLabels[status].toLowerCase()}.`);
      } else {
        notify("warning", result.message);
      }
    });
  }

  function deleteKr(id: string) {
    startTransition(async () => {
      const result = await removeKeyResult({ id });
      if (result.ok) {
        notify("success", "Key Result removido.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  function syncKr(id: string) {
    startTransition(async () => {
      const result = await syncKeyResultFromSource({ id });
      if (result.ok) {
        notify("success", `Valor sincronizado: ${result.data.currentValue}.`);
      } else {
        notify("warning", result.message);
      }
    });
  }

  return (
    <div className="space-y-5">
      <FeedbackBanner message={feedback} />

      <SectionPanel
        title="Objetivos"
        description="Cada objetivo mostra o progresso (rollup dos Key Results) e o detalhe de cada KR. KRs com fonte operacional podem sincronizar o valor do dado real."
        action={
          canManage ? (
            <ActionButton
              icon={Plus}
              size="sm"
              onClick={() => setCreateOpen(true)}
            >
              Novo objetivo
            </ActionButton>
          ) : undefined
        }
      >
        {objectives.length === 0 ? (
          <div className="px-5 py-10">
            <EmptyState
              icon={Flag}
              title="Nenhum objetivo ainda"
              description={
                canManage
                  ? "Crie o primeiro objetivo e cadastre os Key Results para medir o progresso."
                  : "Quando você tiver um OKR, ele aparece aqui."
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {objectives.map((o) => (
              <li key={o.id} className="space-y-3 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-strong">
                        {o.title}
                      </span>
                      <StatusBadge tone={objectiveStatusTone[o.status]} strong>
                        {objectiveStatusLabels[o.status]}
                      </StatusBadge>
                      <StatusBadge tone="neutral">
                        {objectiveScopeLabels[o.scope]}: {scopeLabel(o)}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 text-xs text-soft">
                      {formatPeriod(o.periodStart, o.periodEnd)}
                      {o.ownerName ? ` · Responsável: ${o.ownerName}` : ""}
                    </p>
                    {o.description ? (
                      <p className="mt-1 text-xs text-medium">{o.description}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {o.canManage ? (
                      <>
                        {o.status === "DRAFT" ? (
                          <ActionButton
                            size="sm"
                            variant="secondary"
                            icon={PlayCircle}
                            disabled={pending}
                            onClick={() => changeStatus(o.id, "ACTIVE")}
                          >
                            Ativar
                          </ActionButton>
                        ) : null}
                        {o.status === "DRAFT" || o.status === "ACTIVE" ? (
                          <ActionButton
                            size="sm"
                            variant="secondary"
                            icon={Plus}
                            onClick={() =>
                              setKrForm({
                                objectiveId: o.id,
                                scope: o.scope,
                                keyResult: null,
                              })
                            }
                          >
                            KR
                          </ActionButton>
                        ) : null}
                        {o.status === "ACTIVE" ? (
                          <ActionButton
                            size="sm"
                            variant="success"
                            icon={CheckCircle2}
                            disabled={pending}
                            onClick={() => changeStatus(o.id, "COMPLETED")}
                          >
                            Concluir
                          </ActionButton>
                        ) : null}
                        {o.status === "DRAFT" || o.status === "ACTIVE" ? (
                          <ActionButton
                            size="sm"
                            variant="danger"
                            icon={CircleSlash}
                            disabled={pending}
                            onClick={() => changeStatus(o.id, "CANCELLED")}
                          >
                            Cancelar
                          </ActionButton>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>

                <ProgressBar percent={o.progress} />

                {o.keyResults.length === 0 ? (
                  <p className="text-xs text-soft">
                    Sem Key Results neste objetivo.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {o.keyResults.map((kr) => (
                      <li
                        key={kr.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-muted px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-strong">
                              {kr.title}
                            </span>
                            <StatusBadge tone="neutral">
                              {keyResultMetricLabels[kr.metricType]}
                            </StatusBadge>
                            {isKnownAutoSource(kr.autoSource) ? (
                              <StatusBadge tone="info">auto</StatusBadge>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-xs text-soft">
                            {kr.metricType === "BOOLEAN"
                              ? kr.currentValue >= kr.targetValue
                                ? "Atingido"
                                : "Pendente"
                              : `${kr.currentValue}${
                                  kr.unit ? ` ${kr.unit}` : ""
                                } de ${kr.targetValue}${
                                  kr.unit ? ` ${kr.unit}` : ""
                                } (início ${kr.startValue})`}
                          </p>
                          <div className="mt-1">
                            <ProgressBar percent={kr.progress} small />
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {(o.canUpdateProgress || o.canManage) &&
                          (o.status === "ACTIVE" || o.status === "DRAFT") ? (
                            <ActionButton
                              size="sm"
                              variant="secondary"
                              onClick={() => setValueFor(kr)}
                            >
                              Valor
                            </ActionButton>
                          ) : null}
                          {(o.canUpdateProgress || o.canManage) &&
                          isKnownAutoSource(kr.autoSource) &&
                          (o.status === "ACTIVE" || o.status === "DRAFT") ? (
                            <button
                              type="button"
                              aria-label="Sincronizar da fonte"
                              disabled={pending}
                              onClick={() => syncKr(kr.id)}
                              className="grid size-8 place-items-center rounded-md text-medium hover:bg-surface hover:text-strong disabled:opacity-50"
                            >
                              <RefreshCw
                                aria-hidden="true"
                                className="size-4"
                              />
                            </button>
                          ) : null}
                          {o.canManage &&
                          (o.status === "DRAFT" || o.status === "ACTIVE") ? (
                            <>
                              <button
                                type="button"
                                aria-label="Editar Key Result"
                                onClick={() =>
                                  setKrForm({
                                    objectiveId: o.id,
                                    scope: o.scope,
                                    keyResult: kr,
                                  })
                                }
                                className="grid size-8 place-items-center rounded-md text-medium hover:bg-surface hover:text-strong"
                              >
                                <Pencil
                                  aria-hidden="true"
                                  className="size-4"
                                />
                              </button>
                              <button
                                type="button"
                                aria-label="Remover Key Result"
                                disabled={pending}
                                onClick={() => deleteKr(kr.id)}
                                className="grid size-8 place-items-center rounded-md text-medium hover:bg-surface hover:text-danger disabled:opacity-50"
                              >
                                <Trash2
                                  aria-hidden="true"
                                  className="size-4"
                                />
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
        <ObjectiveFormModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          consultants={consultants}
          projects={projects}
          notify={notify}
        />
      ) : null}

      {krForm ? (
        <KeyResultFormModal
          key={krForm.keyResult?.id ?? "new"}
          open={krForm !== null}
          objectiveId={krForm.objectiveId}
          scope={krForm.scope}
          keyResult={krForm.keyResult}
          onClose={() => setKrForm(null)}
          notify={notify}
        />
      ) : null}

      {valueFor ? (
        <KeyResultValueModal
          key={valueFor.id}
          open={valueFor !== null}
          keyResult={valueFor}
          onClose={() => setValueFor(null)}
          notify={notify}
        />
      ) : null}
    </div>
  );
}

function ProgressBar({
  percent,
  small,
}: {
  percent: number;
  small?: boolean;
}) {
  return (
    <div className="space-y-1">
      {!small ? (
        <div className="flex items-center justify-between text-xs text-soft">
          <span>Progresso do objetivo</span>
          <span className="font-semibold text-medium">{percent}%</span>
        </div>
      ) : null}
      <div
        className={`${small ? "h-1.5" : "h-2"} w-full overflow-hidden rounded-full border border-ink/15 bg-surface-muted`}
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
