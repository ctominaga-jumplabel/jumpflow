"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import type { FeedbackTone } from "@/components/ui/Feedback";
import { createSurvey } from "@/app/app/clima/actions";
import {
  surveyQuestionTypeLabels,
  surveyTypeLabels,
  type SurveyQuestionType,
  type SurveyType,
} from "@/lib/surveys/types";
import { EnumSelect, TextField, fieldClass } from "./fields";

interface QuestionDraft {
  text: string;
  type: SurveyQuestionType;
  /** Linha única separada por vírgula (CHOICE). */
  optionsText: string;
}

interface Draft {
  title: string;
  description: string;
  type: SurveyType;
  anonymous: boolean;
  periodStart: string;
  periodEnd: string;
  questions: QuestionDraft[];
}

const emptyQuestion: QuestionDraft = {
  text: "",
  type: "NPS",
  optionsText: "",
};

const emptyDraft: Draft = {
  title: "",
  description: "",
  type: "CLIMATE",
  anonymous: true,
  periodStart: "",
  periodEnd: "",
  questions: [{ ...emptyQuestion }],
};

function parseOptions(text: string): string[] {
  return text
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

export interface SurveyFormModalProps {
  open: boolean;
  onClose: () => void;
  notify: (tone: FeedbackTone, text: string) => void;
}

/**
 * Formulário de criação de pesquisa (EP 7.1). O servidor revalida com Zod e
 * RBAC (SURVEY_MANAGE_ROLES = ADMIN/PEOPLE). A pesquisa nasce DRAFT; a abertura
 * (gera convites + tokenHash) é uma ação separada na lista.
 */
export function SurveyFormModal({
  open,
  onClose,
  notify,
}: SurveyFormModalProps) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  function setQuestion(index: number, patch: Partial<QuestionDraft>) {
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((q, i) =>
        i === index ? { ...q, ...patch } : q,
      ),
    }));
  }

  function addQuestion() {
    setDraft((d) => ({
      ...d,
      questions: [...d.questions, { ...emptyQuestion }],
    }));
  }

  function removeQuestion(index: number) {
    setDraft((d) => ({
      ...d,
      questions: d.questions.filter((_, i) => i !== index),
    }));
  }

  function submit() {
    startTransition(async () => {
      const result = await createSurvey({
        title: draft.title,
        description: draft.description || undefined,
        type: draft.type,
        anonymous: draft.anonymous,
        periodStart: draft.periodStart || undefined,
        periodEnd: draft.periodEnd || undefined,
        questions: draft.questions.map((q) => ({
          text: q.text,
          type: q.type,
          options: q.type === "CHOICE" ? parseOptions(q.optionsText) : [],
        })),
      });
      if (result.ok) {
        setDraft(emptyDraft);
        onClose();
        notify(
          "success",
          "Pesquisa criada como rascunho. Abra-a para gerar os convites.",
        );
      } else {
        notify("warning", result.message);
      }
    });
  }

  const questionsValid = draft.questions.every(
    (q) =>
      q.text.trim().length >= 2 &&
      (q.type !== "CHOICE" || parseOptions(q.optionsText).length >= 2),
  );
  const canSubmit =
    !pending &&
    draft.title.trim().length >= 2 &&
    draft.questions.length >= 1 &&
    questionsValid &&
    (!draft.periodStart ||
      !draft.periodEnd ||
      draft.periodStart <= draft.periodEnd);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova pesquisa"
      description="Defina o tipo, o anonimato e as perguntas. A pesquisa começa como rascunho; ao abrir, os convites são gerados para os consultores ativos."
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
            Criar rascunho
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
        <TextField
          label="Título"
          value={draft.title}
          placeholder="Ex.: Pesquisa de clima 2026.1"
          required
          onChange={(title) => setDraft((d) => ({ ...d, title }))}
        />
        <label className="space-y-1 text-sm font-medium text-medium">
          Descrição (opcional)
          <textarea
            value={draft.description}
            onChange={(e) =>
              setDraft((d) => ({ ...d, description: e.target.value }))
            }
            rows={2}
            className={fieldClass().replace("h-10", "min-h-16 py-2")}
            placeholder="Contexto para quem vai responder."
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <EnumSelect
            label="Tipo"
            value={draft.type}
            options={surveyTypeLabels}
            onChange={(type) => setDraft((d) => ({ ...d, type }))}
          />
          <label className="flex items-center gap-2 self-end text-sm font-medium text-medium">
            <input
              type="checkbox"
              checked={draft.anonymous}
              onChange={(e) =>
                setDraft((d) => ({ ...d, anonymous: e.target.checked }))
              }
              className="size-4 rounded border-border"
            />
            Anônima (recomendado)
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Início (opcional)"
            type="date"
            value={draft.periodStart}
            onChange={(periodStart) => setDraft((d) => ({ ...d, periodStart }))}
          />
          <TextField
            label="Fim (opcional)"
            type="date"
            value={draft.periodEnd}
            onChange={(periodEnd) => setDraft((d) => ({ ...d, periodEnd }))}
          />
        </div>

        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-strong">Perguntas</span>
            <ActionButton
              size="sm"
              variant="secondary"
              icon={Plus}
              onClick={addQuestion}
            >
              Adicionar
            </ActionButton>
          </div>
          {draft.questions.map((q, index) => (
            <div
              key={index}
              className="space-y-2 rounded-md border border-border bg-surface-muted/40 p-3"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <TextField
                    label={`Pergunta ${index + 1}`}
                    value={q.text}
                    placeholder="Texto da pergunta"
                    required
                    onChange={(text) => setQuestion(index, { text })}
                  />
                  <EnumSelect
                    label="Tipo de resposta"
                    value={q.type}
                    options={surveyQuestionTypeLabels}
                    onChange={(type) => setQuestion(index, { type })}
                  />
                  {q.type === "CHOICE" ? (
                    <TextField
                      label="Alternativas (separadas por vírgula)"
                      value={q.optionsText}
                      placeholder="Sim, Não, Talvez"
                      onChange={(optionsText) =>
                        setQuestion(index, { optionsText })
                      }
                    />
                  ) : null}
                </div>
                {draft.questions.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Remover pergunta ${index + 1}`}
                    onClick={() => removeQuestion(index)}
                    className="mt-6 grid size-9 shrink-0 place-items-center rounded-md text-medium hover:bg-surface-muted hover:text-danger"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
