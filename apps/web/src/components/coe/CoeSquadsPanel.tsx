"use client";

import { useTransition } from "react";
import { Archive, ClipboardList, Send, Trash2, Undo2 } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { coeSquadStatusLabels, type CoeSquadView } from "@/lib/coe/types";
import type { CoeSquadStatus } from "@/lib/coe/types";
import { deleteCoeSquad, setCoeSquadStatus } from "@/app/app/coe/actions";

export interface CoeSquadsPanelProps {
  squads: CoeSquadView[];
  canPropose: boolean;
}

const STATUS_TONE: Record<CoeSquadStatus, StatusTone> = {
  DRAFT: "neutral",
  PROPOSED: "info",
  ARCHIVED: "warning",
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/**
 * Histórico das propostas de time. São cenários guardados para decisão, nunca
 * alocações: por isso o único ciclo de vida aqui é rascunho → proposta →
 * arquivada, sem nenhuma ação que toque o projeto.
 */
export function CoeSquadsPanel({ squads, canPropose }: CoeSquadsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const { feedback, notify } = useFeedback();

  function changeStatus(squad: CoeSquadView, status: CoeSquadStatus) {
    startTransition(async () => {
      const res = await setCoeSquadStatus({ id: squad.id, status });
      if (res.ok) {
        notify(
          "success",
          `“${squad.name}” agora está como ${coeSquadStatusLabels[status].toLowerCase()}.`,
        );
      } else {
        notify("warning", res.message);
      }
    });
  }

  function remove(squad: CoeSquadView) {
    startTransition(async () => {
      const res = await deleteCoeSquad({ id: squad.id });
      if (res.ok) {
        notify("success", `Proposta “${squad.name}” removida.`);
      } else {
        notify("warning", res.message);
      }
    });
  }

  if (squads.length === 0) {
    return (
      <SectionPanel title="Propostas salvas">
        <div className="px-5 py-6">
          <EmptyState
            icon={ClipboardList}
            title="Nenhuma proposta salva"
            description="Componha um time na aba “Composição de time” e salve o cenário para comparar alternativas antes de decidir a alocação."
          />
        </div>
      </SectionPanel>
    );
  }

  return (
    <div className="space-y-4">
      <FeedbackBanner message={feedback} />
      <SectionPanel
        title="Propostas salvas"
        description="Cenários de time guardados para decisão. Nenhuma proposta cria ou altera alocação."
      >
        <ul className="divide-y divide-border">
          {squads.map((squad) => (
            <li key={squad.id} className="space-y-2.5 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-strong">
                      {squad.name}
                    </span>
                    <StatusBadge tone={STATUS_TONE[squad.status]}>
                      {coeSquadStatusLabels[squad.status]}
                    </StatusBadge>
                  </div>
                  <p className="mt-0.5 text-xs text-soft">
                    {squad.projectName} · {squad.clientName} ·{" "}
                    {squad.members.length} frente(s) ·{" "}
                    {squad.periodStart
                      ? `a partir de ${formatDate(squad.periodStart)}`
                      : "sem período"}{" "}
                    · {squad.weeks} semana(s)
                  </p>
                  <p className="text-xs text-soft">
                    Criada em {formatDate(squad.createdAt)}
                    {squad.createdByName ? ` por ${squad.createdByName}` : ""}
                  </p>
                </div>

                {canPropose ? (
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {squad.status === "DRAFT" ? (
                      <ActionButton
                        variant="secondary"
                        size="sm"
                        icon={Send}
                        onClick={() => changeStatus(squad, "PROPOSED")}
                        disabled={isPending}
                      >
                        Formalizar
                      </ActionButton>
                    ) : null}
                    {squad.status === "ARCHIVED" ? (
                      <ActionButton
                        variant="secondary"
                        size="sm"
                        icon={Undo2}
                        onClick={() => changeStatus(squad, "DRAFT")}
                        disabled={isPending}
                      >
                        Reabrir
                      </ActionButton>
                    ) : (
                      <ActionButton
                        variant="secondary"
                        size="sm"
                        icon={Archive}
                        onClick={() => changeStatus(squad, "ARCHIVED")}
                        disabled={isPending}
                      >
                        Arquivar
                      </ActionButton>
                    )}
                    <ActionButton
                      variant="danger"
                      size="sm"
                      icon={Trash2}
                      onClick={() => remove(squad)}
                      disabled={isPending}
                    >
                      Remover
                    </ActionButton>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {squad.members.map((m) => (
                  <span
                    key={`${squad.id}-${m.slotKey}`}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-muted px-2 py-0.5 text-xs text-medium"
                  >
                    <strong className="font-medium text-strong">
                      {m.consultantName}
                    </strong>
                    · {m.slotLabel} · {m.slotScore}/100
                  </span>
                ))}
              </div>

              {squad.note ? (
                <p className="text-xs text-medium">{squad.note}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </SectionPanel>
    </div>
  );
}
