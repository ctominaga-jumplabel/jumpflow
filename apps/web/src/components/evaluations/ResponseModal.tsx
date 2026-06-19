"use client";

import { useState, useTransition } from "react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import type { FeedbackTone } from "@/components/ui/Feedback";
import { saveResponse } from "@/app/app/avaliacoes/actions";
import {
  evaluationRelationshipLabels,
  type EvaluationAssignment,
} from "@/lib/evaluations/types";

const SCORE_OPTIONS = [1, 2, 3, 4, 5] as const;
const SCORE_HINTS: Record<number, string> = {
  1: "Muito abaixo",
  2: "Abaixo",
  3: "Atende",
  4: "Acima",
  5: "Muito acima",
};

interface AnswerDraft {
  score: number | null;
  comment: string;
}

export interface ResponseModalProps {
  open: boolean;
  assignment: EvaluationAssignment | null;
  onClose: () => void;
  notify: (tone: FeedbackTone, text: string) => void;
}

/**
 * Formulário do avaliador (US16.03): pontua 1–5 por competência + comentário.
 * Salvar mantém rascunho; submeter trava (status COMPLETED + submittedAt). O
 * servidor revalida RBAC (só o próprio rater), o estado do ciclo (OPEN) e o
 * intervalo do score; aqui só guiamos o preenchimento.
 */
export function ResponseModal({
  open,
  assignment,
  onClose,
  notify,
}: ResponseModalProps) {
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({});

  // Inicializa os rascunhos a partir das respostas já gravadas quando a
  // atribuição muda (deriva de props, sem efeito).
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (assignment && seededFor !== assignment.responseId) {
    const initial: Record<string, AnswerDraft> = {};
    for (const skill of assignment.skills) {
      const existing = assignment.answers[skill.skillId];
      initial[skill.skillId] = {
        score: existing?.score ?? null,
        comment: existing?.comment ?? "",
      };
    }
    setDrafts(initial);
    setSeededFor(assignment.responseId);
  }

  if (!assignment) return null;

  const readOnly =
    assignment.cycleStatus !== "OPEN" || assignment.status === "COMPLETED";

  function setScore(skillId: string, score: number) {
    setDrafts((d) => ({
      ...d,
      [skillId]: { ...(d[skillId] ?? { score: null, comment: "" }), score },
    }));
  }
  function setComment(skillId: string, comment: string) {
    setDrafts((d) => ({
      ...d,
      [skillId]: { ...(d[skillId] ?? { score: null, comment: "" }), comment },
    }));
  }

  function buildAnswers() {
    if (!assignment) return [];
    return assignment.skills
      .filter((s) => drafts[s.skillId]?.score != null)
      .map((s) => ({
        skillId: s.skillId,
        score: drafts[s.skillId].score as number,
        comment: drafts[s.skillId].comment.trim() || undefined,
      }));
  }

  function persist(submit: boolean) {
    if (!assignment) return;
    const answers = buildAnswers();
    if (submit && answers.length < assignment.skills.length) {
      notify("warning", "Pontue todas as competências antes de submeter.");
      return;
    }
    startTransition(async () => {
      const result = await saveResponse({
        responseId: assignment.responseId,
        submit,
        answers,
      });
      if (result.ok) {
        onClose();
        notify(
          "success",
          submit ? "Avaliação submetida." : "Rascunho salvo.",
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
      title={`Avaliar ${assignment.subjectConsultantName}`}
      description={`${evaluationRelationshipLabels[assignment.relationship]} · ${assignment.cycleName}`}
      className="max-w-2xl"
      footer={
        readOnly ? (
          <ActionButton variant="secondary" onClick={onClose}>
            Fechar
          </ActionButton>
        ) : (
          <>
            <ActionButton
              variant="secondary"
              onClick={() => persist(false)}
              disabled={pending}
            >
              Salvar rascunho
            </ActionButton>
            <ActionButton onClick={() => persist(true)} disabled={pending}>
              Submeter
            </ActionButton>
          </>
        )
      }
    >
      {assignment.skills.length === 0 ? (
        <p className="text-sm text-medium">
          Sem competências definidas para este avaliado. Defina o perfil de
          competência aplicável (ou skills do consultor) para liberar o
          formulário.
        </p>
      ) : (
        <div className="space-y-5">
          {readOnly ? (
            <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-soft">
              {assignment.status === "COMPLETED"
                ? "Esta avaliação já foi submetida e está em modo somente leitura."
                : "O ciclo não está aberto; a avaliação está em modo somente leitura."}
            </p>
          ) : null}
          {assignment.skills.map((skill) => {
            const draft = drafts[skill.skillId] ?? { score: null, comment: "" };
            return (
              <div
                key={skill.skillId}
                className="space-y-2 border-b border-border pb-4 last:border-b-0 last:pb-0"
              >
                <p className="text-sm font-semibold text-strong">
                  {skill.skillName}
                  <span className="ml-2 text-xs font-normal text-soft">
                    {skill.skillType === "TECHNICAL"
                      ? "Técnica"
                      : "Comportamental"}
                  </span>
                </p>
                <div
                  role="radiogroup"
                  aria-label={`Score de ${skill.skillName}`}
                  className="flex flex-wrap gap-2"
                >
                  {SCORE_OPTIONS.map((score) => {
                    const active = draft.score === score;
                    return (
                      <button
                        key={score}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={readOnly}
                        onClick={() => setScore(skill.skillId, score)}
                        title={SCORE_HINTS[score]}
                        className={
                          "flex size-10 items-center justify-center rounded-md border-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 " +
                          (active
                            ? "border-ink bg-brand text-white shadow-[2px_2px_0_0_var(--color-ink)]"
                            : "border-border bg-surface text-medium")
                        }
                      >
                        {score}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={draft.comment}
                  disabled={readOnly}
                  placeholder="Comentário (opcional)"
                  onChange={(e) => setComment(skill.skillId, e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm disabled:opacity-50"
                />
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
