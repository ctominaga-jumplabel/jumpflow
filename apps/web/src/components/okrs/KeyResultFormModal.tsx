"use client";

import { useState, useTransition } from "react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import type { FeedbackTone } from "@/components/ui/Feedback";
import { addKeyResult, updateKeyResult } from "@/app/app/metas/actions";
import type {
  KeyResultView,
  ObjectiveScope,
} from "@/lib/okrs/types";
import {
  KeyResultDraftEditor,
  emptyKeyResultDraft,
  type KeyResultDraft,
} from "./KeyResultDraftEditor";

export interface KeyResultFormModalProps {
  open: boolean;
  objectiveId: string;
  scope: ObjectiveScope;
  /** KR existente quando editando; null ao adicionar. */
  keyResult: KeyResultView | null;
  onClose: () => void;
  notify: (tone: FeedbackTone, text: string) => void;
}

function num(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function draftFromView(kr: KeyResultView): KeyResultDraft {
  return {
    title: kr.title,
    metricType: kr.metricType,
    startValue: String(kr.startValue),
    targetValue: String(kr.targetValue),
    currentValue: String(kr.currentValue),
    unit: kr.unit ?? "",
    autoSource: kr.autoSource ?? "",
  };
}

/**
 * Adicionar/editar um Key Result de um objetivo existente (US OKR.02). O servidor
 * reaplica RBAC (gestão do objetivo) e a aplicabilidade do autoSource ao escopo.
 *
 * Derivamos o rascunho inicial de uma key no Modal (keyResult?.id) em vez de
 * sincronizar via useEffect — segue a regra react-hooks/set-state-in-effect.
 */
export function KeyResultFormModal({
  open,
  objectiveId,
  scope,
  keyResult,
  onClose,
  notify,
}: KeyResultFormModalProps) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<KeyResultDraft>(() =>
    keyResult ? draftFromView(keyResult) : emptyKeyResultDraft(),
  );

  function patch(p: Partial<KeyResultDraft>) {
    setDraft((prev) => ({ ...prev, ...p }));
  }

  function submit() {
    startTransition(async () => {
      const base = {
        title: draft.title.trim(),
        metricType: draft.metricType,
        startValue: num(draft.startValue),
        targetValue: num(draft.targetValue),
        currentValue: num(draft.currentValue),
        unit: draft.unit.trim() ? draft.unit.trim() : null,
        autoSource: draft.autoSource ? draft.autoSource : null,
      };
      const result = keyResult
        ? await updateKeyResult({ id: keyResult.id, ...base })
        : await addKeyResult({ objectiveId, ...base });
      if (result.ok) {
        onClose();
        notify(
          "success",
          keyResult ? "Key Result atualizado." : "Key Result adicionado.",
        );
      } else {
        notify("warning", result.message);
      }
    });
  }

  const canSubmit =
    !pending && draft.title.trim().length >= 3 && draft.targetValue !== "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={keyResult ? "Editar Key Result" : "Novo Key Result"}
      description="Defina a métrica, os valores e (opcional) a fonte operacional de auto-update."
      className="max-w-xl"
      footer={
        <>
          <ActionButton variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </ActionButton>
          <ActionButton onClick={submit} disabled={!canSubmit}>
            {keyResult ? "Salvar" : "Adicionar"}
          </ActionButton>
        </>
      }
    >
      <ul className="space-y-4">
        <KeyResultDraftEditor
          draft={draft}
          scope={scope}
          onChange={patch}
          onRemove={onClose}
        />
      </ul>
    </Modal>
  );
}
