"use client";

import { useState, useTransition } from "react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import type { FeedbackTone } from "@/components/ui/Feedback";
import { updateActionProgress } from "@/app/app/pdi/actions";
import { isValidActionTransition } from "@/lib/development/visibility";
import {
  developmentActionStatusLabels,
  type DevelopmentActionStatus,
  type DevelopmentActionView,
} from "@/lib/development/types";
import { EnumSelect, TextAreaField } from "./fields";

export interface ActionProgressModalProps {
  open: boolean;
  action: DevelopmentActionView | null;
  onClose: () => void;
  notify: (tone: FeedbackTone, text: string) => void;
}

/** Estados de destino alcançáveis a partir do estado atual (transição válida). */
function reachableStatuses(
  from: DevelopmentActionStatus,
): DevelopmentActionStatus[] {
  const all: DevelopmentActionStatus[] = [
    "PLANNED",
    "IN_PROGRESS",
    "DONE",
    "CANCELLED",
  ];
  return [from, ...all.filter((s) => isValidActionTransition(from, s))];
}

/**
 * Atualiza o PROGRESSO de uma ação (US17.02/03): status + evidência. Usado tanto
 * pela gestão quanto pelo consultor dono (que só pode atualizar o progresso das
 * próprias ações). O servidor revalida a fronteira e a transição; aqui apenas
 * guiamos para transições válidas.
 */
export function ActionProgressModal({
  open,
  action,
  onClose,
  notify,
}: ActionProgressModalProps) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<DevelopmentActionStatus>("PLANNED");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [seededFor, setSeededFor] = useState<string | null>(null);

  // Deriva o rascunho da ação atual (sem efeito).
  if (action && seededFor !== action.id) {
    setStatus(action.status);
    setEvidenceNote(action.evidenceNote ?? "");
    setSeededFor(action.id);
  }

  if (!action) return null;

  const options = Object.fromEntries(
    reachableStatuses(action.status).map((s) => [
      s,
      developmentActionStatusLabels[s],
    ]),
  ) as Record<DevelopmentActionStatus, string>;

  function submit() {
    if (!action) return;
    startTransition(async () => {
      const result = await updateActionProgress({
        id: action.id,
        status,
        evidenceNote: evidenceNote.trim() || null,
      });
      if (result.ok) {
        onClose();
        notify("success", "Progresso da ação atualizado.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  const changed =
    status !== action.status || (evidenceNote.trim() || null) !== action.evidenceNote;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Atualizar progresso"
      description={action.description}
      footer={
        <>
          <ActionButton variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </ActionButton>
          <ActionButton onClick={submit} disabled={pending || !changed}>
            Salvar
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
        <EnumSelect
          label="Status"
          value={status}
          options={options}
          hint="PLANEJADA → EM ANDAMENTO → CONCLUÍDA (ou CANCELADA)."
          onChange={(value) => value && setStatus(value)}
        />
        <TextAreaField
          label="Evidência (opcional)"
          value={evidenceNote}
          placeholder="Ex.: certificado emitido, link do curso, resultado obtido."
          onChange={setEvidenceNote}
        />
      </div>
    </Modal>
  );
}
