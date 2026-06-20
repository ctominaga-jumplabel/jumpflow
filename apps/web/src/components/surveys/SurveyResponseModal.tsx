"use client";

import { useState, useTransition } from "react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import type { FeedbackTone } from "@/components/ui/Feedback";
import { submitSurveyResponse } from "@/app/app/clima/actions";
import { NPS_MAX, NPS_MIN, SCALE_MAX, SCALE_MIN } from "@/lib/surveys/types";
import type { SurveyAssignment } from "@/lib/surveys/types";
import { fieldClass } from "./fields";

type AnswerState = {
  scoreValue?: number;
  choiceValue?: string;
  textValue?: string;
};

export interface SurveyResponseModalProps {
  assignment: SurveyAssignment | null;
  onClose: () => void;
  notify: (tone: FeedbackTone, text: string) => void;
}

/**
 * Formulário de resposta de um convite (EP 7.1). O servidor revalida o tipo de
 * cada resposta, garante que o convite é do próprio consultor e cria a resposta
 * de forma anônima (sem ligar resposta à identidade). A UI não envia nenhum
 * identificador do respondente.
 */
export function SurveyResponseModal({
  assignment,
  onClose,
  notify,
}: SurveyResponseModalProps) {
  const [pending, startTransition] = useTransition();
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  // Reseta o rascunho a cada novo convite SEM useEffect (evita setState em
  // efeito): guardamos o invitationId atual e zeramos durante o render quando
  // ele muda — padrão recomendado pelo React para derivar de props.
  const currentId = assignment?.invitationId ?? null;
  const [trackedId, setTrackedId] = useState<string | null>(currentId);
  if (trackedId !== currentId) {
    setTrackedId(currentId);
    setAnswers({});
  }

  if (!assignment) return null;

  function setAnswer(questionId: string, patch: AnswerState) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], ...patch },
    }));
  }

  function submit() {
    if (!assignment) return;
    const payload = assignment.questions
      .map((q) => {
        const a = answers[q.id] ?? {};
        return {
          questionId: q.id,
          scoreValue: a.scoreValue,
          choiceValue: a.choiceValue,
          textValue: a.textValue,
        };
      })
      .filter(
        (a) =>
          a.scoreValue !== undefined ||
          (a.choiceValue && a.choiceValue.length > 0) ||
          (a.textValue && a.textValue.length > 0),
      );

    startTransition(async () => {
      const result = await submitSurveyResponse({
        invitationId: assignment.invitationId,
        answers: payload,
      });
      if (result.ok) {
        onClose();
        notify("success", "Resposta enviada. Obrigado por participar!");
      } else {
        notify("warning", result.message);
      }
    });
  }

  // Exige resposta nas perguntas não-TEXT (escala/NPS/escolha).
  const requiredAnswered = assignment.questions.every((q) => {
    if (q.type === "TEXT") return true;
    const a = answers[q.id] ?? {};
    if (q.type === "CHOICE") return Boolean(a.choiceValue);
    return a.scoreValue !== undefined;
  });
  const canSubmit = !pending && requiredAnswered;

  return (
    <Modal
      open={assignment !== null}
      onClose={onClose}
      title={assignment.surveyTitle}
      description={
        assignment.anonymous
          ? "Pesquisa anônima: a sua resposta não é ligada à sua identidade."
          : assignment.surveyDescription ?? undefined
      }
      className="max-w-2xl"
      footer={
        <>
          <ActionButton
            variant="secondary"
            onClick={onClose}
            disabled={pending}
          >
            Cancelar
          </ActionButton>
          <ActionButton onClick={submit} disabled={!canSubmit}>
            Enviar resposta
          </ActionButton>
        </>
      }
    >
      <div className="space-y-5">
        {assignment.questions.map((q, index) => {
          const a = answers[q.id] ?? {};
          return (
            <div key={q.id} className="space-y-2">
              <p className="text-sm font-medium text-strong">
                {index + 1}. {q.text}
              </p>
              {q.type === "NPS" ? (
                <ScaleButtons
                  min={NPS_MIN}
                  max={NPS_MAX}
                  value={a.scoreValue}
                  onChange={(v) => setAnswer(q.id, { scoreValue: v })}
                />
              ) : null}
              {q.type === "SCALE" ? (
                <ScaleButtons
                  min={SCALE_MIN}
                  max={SCALE_MAX}
                  value={a.scoreValue}
                  onChange={(v) => setAnswer(q.id, { scoreValue: v })}
                />
              ) : null}
              {q.type === "CHOICE" ? (
                <div className="flex flex-wrap gap-2">
                  {q.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={a.choiceValue === option}
                      onClick={() => setAnswer(q.id, { choiceValue: option })}
                      className={
                        a.choiceValue === option
                          ? "rounded-md border-2 border-ink bg-marker px-3 py-1.5 text-xs font-semibold text-ink shadow-[2px_2px_0_0_var(--color-ink)]"
                          : "rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-medium hover:bg-surface-muted"
                      }
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}
              {q.type === "TEXT" ? (
                <textarea
                  value={a.textValue ?? ""}
                  onChange={(e) => setAnswer(q.id, { textValue: e.target.value })}
                  rows={3}
                  className={fieldClass().replace("h-10", "min-h-20 py-2")}
                  placeholder="Sua resposta (opcional)"
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function ScaleButtons({
  min,
  max,
  value,
  onChange,
}: {
  min: number;
  max: number;
  value: number | undefined;
  onChange: (value: number) => void;
}) {
  const range: number[] = [];
  for (let i = min; i <= max; i += 1) range.push(i);
  return (
    <div className="flex flex-wrap gap-1.5">
      {range.map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className={
            value === n
              ? "grid size-9 place-items-center rounded-md border-2 border-ink bg-marker text-sm font-semibold text-ink shadow-[2px_2px_0_0_var(--color-ink)]"
              : "grid size-9 place-items-center rounded-md border border-border bg-surface text-sm font-semibold text-medium hover:bg-surface-muted"
          }
        >
          {n}
        </button>
      ))}
    </div>
  );
}
