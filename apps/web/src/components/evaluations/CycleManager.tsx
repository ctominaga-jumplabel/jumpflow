"use client";

import { useState, useTransition } from "react";
import { LockOpen, Lock, Plus } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import type { FeedbackTone } from "@/components/ui/Feedback";
import { transitionCycle } from "@/app/app/avaliacoes/actions";
import {
  evaluationCycleStatusLabels,
  evaluationTypeLabels,
  type EvaluationCycleStatus,
  type EvaluationCycleSummary,
} from "@/lib/evaluations/types";
import { CycleFormModal } from "./CycleFormModal";

const statusTone: Record<EvaluationCycleStatus, StatusTone> = {
  DRAFT: "neutral",
  OPEN: "info",
  CLOSED: "success",
};

function formatPeriod(startIso: string, endIso: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(startIso)} – ${fmt(endIso)}`;
}

export interface CycleManagerProps {
  cycles: EvaluationCycleSummary[];
  notify: (tone: FeedbackTone, text: string) => void;
}

/**
 * Gestão de ciclos (ADMIN/PEOPLE): criar, abrir (DRAFT→OPEN, gera avaliações) e
 * fechar (OPEN→CLOSED). As transições e a geração são enforced no servidor;
 * aqui só disparamos a ação e refletimos o resultado.
 */
export function CycleManager({ cycles, notify }: CycleManagerProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function transition(id: string, to: "OPEN" | "CLOSED") {
    setBusyId(id);
    startTransition(async () => {
      const result = await transitionCycle({ id, to });
      setBusyId(null);
      if (result.ok) {
        notify(
          "success",
          to === "OPEN"
            ? "Ciclo aberto. Avaliações e avaliadores gerados."
            : "Ciclo fechado. Resultados liberados aos avaliados.",
        );
      } else {
        notify("warning", result.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <SectionPanel
        title="Ciclos de avaliação"
        description="Crie, abra e feche ciclos. Abrir gera as avaliações dos consultores ativos e os avaliadores conforme o tipo (90/180/360)."
        action={
          <ActionButton icon={Plus} size="sm" onClick={() => setOpen(true)}>
            Novo ciclo
          </ActionButton>
        }
      >
        {cycles.length === 0 ? (
          <div className="px-5 py-10">
            <EmptyState
              icon={Plus}
              title="Nenhum ciclo ainda"
              description="Crie o primeiro ciclo de avaliação. Ele nasce como rascunho e você o abre quando quiser iniciar a rodada."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {cycles.map((cycle) => (
              <li
                key={cycle.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-strong">
                      {cycle.name}
                    </span>
                    <StatusBadge tone={statusTone[cycle.status]} strong>
                      {evaluationCycleStatusLabels[cycle.status]}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 text-xs text-soft">
                    {evaluationTypeLabels[cycle.type]} ·{" "}
                    {formatPeriod(cycle.periodStart, cycle.periodEnd)} ·{" "}
                    {cycle.evaluationCount} avaliados · {cycle.completedCount}{" "}
                    concluídas
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {cycle.status === "DRAFT" ? (
                    <ActionButton
                      size="sm"
                      icon={LockOpen}
                      disabled={pending && busyId === cycle.id}
                      onClick={() => transition(cycle.id, "OPEN")}
                    >
                      Abrir
                    </ActionButton>
                  ) : null}
                  {cycle.status === "OPEN" ? (
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      icon={Lock}
                      disabled={pending && busyId === cycle.id}
                      onClick={() => transition(cycle.id, "CLOSED")}
                    >
                      Fechar
                    </ActionButton>
                  ) : null}
                  {cycle.status === "CLOSED" ? (
                    <span className="text-xs font-medium text-soft">
                      Encerrado
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionPanel>

      <CycleFormModal
        open={open}
        onClose={() => setOpen(false)}
        notify={notify}
      />
    </div>
  );
}
