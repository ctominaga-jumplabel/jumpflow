"use client";

import { useState, useTransition } from "react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import type { FeedbackTone } from "@/components/ui/Feedback";
import { createCycle } from "@/app/app/avaliacoes/actions";
import {
  evaluationTypeLabels,
  type EvaluationType,
} from "@/lib/evaluations/types";
import { EnumSelect, TextField } from "./fields";

interface Draft {
  name: string;
  type: EvaluationType;
  periodStart: string;
  periodEnd: string;
}

const emptyDraft: Draft = {
  name: "",
  type: "SELF_90",
  periodStart: "",
  periodEnd: "",
};

export interface CycleFormModalProps {
  open: boolean;
  onClose: () => void;
  notify: (tone: FeedbackTone, text: string) => void;
}

/**
 * Formulário de criação de ciclo (US16.01). O servidor revalida com Zod e RBAC
 * (EVALUATION_MANAGE_ROLES = ADMIN/PEOPLE). O ciclo nasce DRAFT; a abertura
 * (gera avaliações + respostas) é uma ação separada na lista.
 */
export function CycleFormModal({ open, onClose, notify }: CycleFormModalProps) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  function submit() {
    startTransition(async () => {
      const result = await createCycle({
        name: draft.name,
        type: draft.type,
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
      });
      if (result.ok) {
        setDraft(emptyDraft);
        onClose();
        notify("success", "Ciclo criado como rascunho. Abra-o para gerar as avaliações.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  const canSubmit =
    !pending &&
    draft.name.trim().length >= 2 &&
    draft.periodStart.length > 0 &&
    draft.periodEnd.length > 0 &&
    draft.periodStart < draft.periodEnd;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo ciclo de avaliação"
      description="Defina o tipo e o período. O ciclo começa como rascunho; ao abrir, as avaliações e os avaliadores são gerados conforme o tipo."
      footer={
        <>
          <ActionButton variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </ActionButton>
          <ActionButton onClick={submit} disabled={!canSubmit}>
            Criar rascunho
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
        <TextField
          label="Nome do ciclo"
          value={draft.name}
          placeholder="Ex.: Avaliação semestral 2026.1"
          required
          onChange={(name) => setDraft((d) => ({ ...d, name }))}
        />
        <EnumSelect
          label="Tipo"
          value={draft.type}
          options={evaluationTypeLabels}
          hint="90° = só autoavaliação · 180° = + gestor · 360° = + pares e cliente."
          onChange={(type) => setDraft((d) => ({ ...d, type }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Início"
            type="date"
            value={draft.periodStart}
            required
            onChange={(periodStart) => setDraft((d) => ({ ...d, periodStart }))}
          />
          <TextField
            label="Fim"
            type="date"
            value={draft.periodEnd}
            required
            onChange={(periodEnd) => setDraft((d) => ({ ...d, periodEnd }))}
          />
        </div>
      </div>
    </Modal>
  );
}
