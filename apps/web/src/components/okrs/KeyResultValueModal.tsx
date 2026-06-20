"use client";

import { useState, useTransition } from "react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import type { FeedbackTone } from "@/components/ui/Feedback";
import {
  syncKeyResultFromSource,
  updateKeyResultValue,
} from "@/app/app/metas/actions";
import { isKnownAutoSource } from "@/lib/okrs/auto-source";
import type { KeyResultView } from "@/lib/okrs/types";
import { TextField } from "./fields";

export interface KeyResultValueModalProps {
  open: boolean;
  keyResult: KeyResultView;
  onClose: () => void;
  notify: (tone: FeedbackTone, text: string) => void;
}

function num(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Atualiza o valor ATUAL de um KR (US OKR.03). Quem pode: gestão do objetivo ou
 * o consultor dono (escopo CONSULTANT). Para KRs com fonte operacional
 * reconhecida, oferece "Sincronizar" — recalcula do dado real (horas aprovadas).
 *
 * Estado inicial derivado por key (keyResult.id) no Modal pai; sem useEffect.
 */
export function KeyResultValueModal({
  open,
  keyResult,
  onClose,
  notify,
}: KeyResultValueModalProps) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(String(keyResult.currentValue));
  const isBoolean = keyResult.metricType === "BOOLEAN";
  const hasSource = isKnownAutoSource(keyResult.autoSource);

  function submit() {
    startTransition(async () => {
      const result = await updateKeyResultValue({
        id: keyResult.id,
        currentValue: num(value),
      });
      if (result.ok) {
        onClose();
        notify("success", "Valor atual atualizado.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  function sync() {
    startTransition(async () => {
      const result = await syncKeyResultFromSource({ id: keyResult.id });
      if (result.ok) {
        onClose();
        notify(
          "success",
          `Valor sincronizado da fonte operacional: ${result.data.currentValue}.`,
        );
      } else {
        notify("warning", result.message);
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Atualizar valor atual"
      description={keyResult.title}
      className="max-w-md"
      footer={
        <>
          <ActionButton variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </ActionButton>
          <ActionButton onClick={submit} disabled={pending}>
            Salvar valor
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
        <TextField
          label={
            isBoolean
              ? "Atual (0 = não, 1 = sim)"
              : `Valor atual${keyResult.unit ? ` (${keyResult.unit})` : ""}`
          }
          type="number"
          step="any"
          value={value}
          onChange={setValue}
        />
        <p className="text-xs text-soft">
          Alvo: {keyResult.targetValue}
          {keyResult.unit ? ` ${keyResult.unit}` : ""} · Início:{" "}
          {keyResult.startValue}
          {keyResult.unit ? ` ${keyResult.unit}` : ""}
        </p>
        {hasSource ? (
          <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-soft">
            Este KR tem fonte operacional. Você pode sincronizar o valor atual a
            partir do dado real (horas aprovadas no período).
            <div className="mt-2">
              <ActionButton
                size="sm"
                variant="secondary"
                onClick={sync}
                disabled={pending}
              >
                Sincronizar da fonte
              </ActionButton>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
