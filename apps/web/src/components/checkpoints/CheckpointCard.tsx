"use client";

import { useState, useTransition } from "react";
import { Archive, Eye, EyeOff } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { FeedbackTone } from "@/components/ui/Feedback";
import type { CheckpointViewModel } from "@/lib/db/checkpoint";
import {
  checkpointTypeLabels,
  checkpointVisibilityLabels,
  type CheckpointInsights,
} from "@/lib/checkpoint/types";
import type { CheckpointFlags } from "@/lib/checkpoint/flags";
import {
  archiveCheckpoint,
  setVisibility,
} from "@/app/app/checkpoints/actions";
import { CheckpointInsightsPanel } from "./CheckpointInsightsPanel";

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

export interface CheckpointCardProps {
  item: CheckpointViewModel;
  insights: CheckpointInsights;
  flags: CheckpointFlags;
  notify: (tone: FeedbackTone, text: string) => void;
}

/**
 * Um checkpoint na timeline + detalhe inline (FATIA 5). Cabeçalho com consultor/
 * gestor/data/tipo; badge de visibilidade; notas só quando `canViewRaw` (o
 * read-model já entrega `notes: null` para quem não pode ver — confiamos nele e
 * nem renderizamos). Controles de gestão (alternar PRIVATE/SHARED, arquivar) só
 * para `canManage`. O painel de insights aparece sob a flag de IA e só para
 * quem vê o cru.
 */
export function CheckpointCard({
  item,
  insights,
  flags,
  notify,
}: CheckpointCardProps) {
  const [pending, startTransition] = useTransition();
  const [visibility, setVisibilityState] = useState(item.visibility);
  const [archived, setArchived] = useState(false);

  function toggleVisibility() {
    const next = visibility === "PRIVATE" ? "SHARED" : "PRIVATE";
    startTransition(async () => {
      const result = await setVisibility({ id: item.id, visibility: next });
      if (result.ok) {
        setVisibilityState(result.data.visibility);
        notify(
          "success",
          result.data.visibility === "SHARED"
            ? "Checkpoint compartilhado com o consultor."
            : "Checkpoint marcado como privado.",
        );
      } else {
        notify("warning", result.message);
      }
    });
  }

  function archive() {
    startTransition(async () => {
      const result = await archiveCheckpoint({ id: item.id });
      if (result.ok) {
        setArchived(true);
        notify("success", "Checkpoint arquivado.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  if (archived) {
    return (
      <li className="px-5 py-4 text-sm text-soft" data-testid="checkpoint-card">
        Checkpoint de {item.consultantName} arquivado.
      </li>
    );
  }

  return (
    <li className="px-5 py-4" data-testid="checkpoint-card">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="info">{checkpointTypeLabels[item.type]}</StatusBadge>
        <StatusBadge tone={visibility === "SHARED" ? "info" : "neutral"}>
          {checkpointVisibilityLabels[visibility]}
        </StatusBadge>
        {item.title ? (
          <span className="text-sm font-semibold text-strong">{item.title}</span>
        ) : null}
        <span className="ml-auto text-xs text-soft tabular-nums">
          {formatDate(item.occurredAt)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-soft">
        <span>
          Consultor{" "}
          <strong className="text-medium">{item.consultantName}</strong>
        </span>
        <span>·</span>
        <span>Gestor: {item.managerName ?? "—"}</span>
        {item.relatedProjectName ? (
          <>
            <span>·</span>
            <span>Projeto: {item.relatedProjectName}</span>
          </>
        ) : null}
      </div>

      {/* Notas crus: o read-model entrega null para quem não pode ver. */}
      {item.notes ? (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-strong">
          {item.notes}
        </p>
      ) : !item.canViewRaw ? (
        <p className="mt-2 text-xs italic text-soft">
          Resumo compartilhado — o conteúdo detalhado fica restrito ao gestor.
        </p>
      ) : null}

      {item.canManage ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ActionButton
            variant="secondary"
            size="sm"
            icon={visibility === "PRIVATE" ? Eye : EyeOff}
            onClick={toggleVisibility}
            disabled={pending}
          >
            {visibility === "PRIVATE" ? "Compartilhar" : "Tornar privado"}
          </ActionButton>
          <ActionButton
            variant="secondary"
            size="sm"
            icon={Archive}
            onClick={archive}
            disabled={pending}
          >
            Arquivar
          </ActionButton>
        </div>
      ) : null}

      {/* Insights só sob flag de IA E para quem vê o cru (o servidor reconfere). */}
      {flags.ai && item.canViewRaw ? (
        <div className="mt-4 border-t border-border pt-4">
          <CheckpointInsightsPanel
            checkpointId={item.id}
            extractionStatus={item.extractionStatus}
            insights={insights}
            notify={notify}
          />
        </div>
      ) : null}
    </li>
  );
}
