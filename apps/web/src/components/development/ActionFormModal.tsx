"use client";

import { useState, useTransition } from "react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import type { FeedbackTone } from "@/components/ui/Feedback";
import { addAction, updateAction } from "@/app/app/pdi/actions";
import type { SkillOption } from "@/lib/competencies/types";
import {
  developmentActionTypeLabels,
  type DevelopmentActionType,
  type DevelopmentActionView,
} from "@/lib/development/types";
import { EnumSelect, TextField } from "./fields";

export interface ActionFormModalProps {
  open: boolean;
  planId: string;
  /** Quando presente, edita a estrutura da ação; senão, adiciona uma nova. */
  action: DevelopmentActionView | null;
  skillOptions: SkillOption[];
  onClose: () => void;
  notify: (tone: FeedbackTone, text: string) => void;
}

/**
 * Cria/edita a ESTRUTURA de uma ação (tipo, skill alvo, descrição, prazo) —
 * operação de GESTÃO (US17.02). O servidor revalida RBAC (gestor com escopo) e
 * Zod. O progresso (status/evidência) é alterado em outro fluxo.
 */
export function ActionFormModal({
  open,
  planId,
  action,
  skillOptions,
  onClose,
  notify,
}: ActionFormModalProps) {
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<DevelopmentActionType>("TRAINING");
  const [targetSkillId, setTargetSkillId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [seededFor, setSeededFor] = useState<string | null>(null);

  // Deriva o rascunho do alvo de edição (sem efeito). Reseta para nova ação
  // quando `action` é null e o modal abre.
  const seedKey = action ? action.id : `new:${planId}`;
  if (open && seededFor !== seedKey) {
    setType(action?.type ?? "TRAINING");
    setTargetSkillId(action?.targetSkillId ?? "");
    setDescription(action?.description ?? "");
    setDueAt(action?.dueAt ?? "");
    setSeededFor(seedKey);
  }

  const editing = action !== null;

  function submit() {
    startTransition(async () => {
      const payload = {
        type,
        targetSkillId: targetSkillId || null,
        description: description.trim(),
        dueAt: dueAt || null,
      };
      const result = editing
        ? await updateAction({ id: action.id, ...payload })
        : await addAction({ planId, ...payload });
      if (result.ok) {
        setSeededFor(null);
        onClose();
        notify("success", editing ? "Ação atualizada." : "Ação adicionada.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  const canSubmit = !pending && description.trim().length >= 3;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Editar ação" : "Adicionar ação"}
      description="Tipo, skill alvo (opcional), descrição e prazo. O status é atualizado depois, no acompanhamento."
      footer={
        <>
          <ActionButton variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </ActionButton>
          <ActionButton onClick={submit} disabled={!canSubmit}>
            {editing ? "Salvar" : "Adicionar"}
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
        <EnumSelect
          label="Tipo"
          value={type}
          options={developmentActionTypeLabels}
          onChange={(value) => value && setType(value)}
        />
        <EnumSelect
          label="Skill alvo (opcional)"
          value={targetSkillId}
          includeEmpty
          emptyLabel="Sem skill alvo"
          options={Object.fromEntries(
            skillOptions.map((s) => [s.id, s.name]),
          )}
          onChange={(value) => setTargetSkillId(value)}
        />
        <TextField
          label="Descrição"
          value={description}
          placeholder="O que será feito"
          required
          onChange={setDescription}
        />
        <TextField
          label="Prazo (opcional)"
          type="date"
          value={dueAt}
          onChange={setDueAt}
        />
      </div>
    </Modal>
  );
}
