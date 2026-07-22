"use client";

import { useMemo, useState, useTransition } from "react";
import { Mic, Sparkles } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import type { FeedbackTone } from "@/components/ui/Feedback";
import {
  feedbackSourceLabels,
  feedbackTypeLabels,
  feedbackVisibilityLabels,
  type ClientOption,
  type ConsultantOption,
  type FeedbackSource,
  type FeedbackType,
  type FeedbackVisibility,
  type ProjectOption,
} from "@/lib/feedback/types";
import type { FeedbackFlags } from "@/lib/feedback/flags";
import { createFeedback } from "@/app/app/feedback/actions";
import { EnumSelect, OptionSelect, TextArea } from "./fields";

interface Draft {
  subjectConsultantId: string;
  type: FeedbackType;
  source: FeedbackSource;
  visibility: FeedbackVisibility;
  body: string;
  relatedProjectId: string;
  relatedClientId: string;
}

const emptyDraft: Draft = {
  subjectConsultantId: "",
  type: "PRAISE",
  source: "INTERNAL",
  visibility: "PRIVATE",
  body: "",
  relatedProjectId: "",
  relatedClientId: "",
};

export interface FeedbackFormModalProps {
  open: boolean;
  onClose: () => void;
  consultants: ConsultantOption[];
  projects: ProjectOption[];
  clients: ClientOption[];
  flags: FeedbackFlags;
  /** Explicação de escopo vazio (null quando há consultores para escolher). */
  writeScopeNote?: string | null;
  notify: (tone: FeedbackTone, text: string) => void;
}

/**
 * Formulário de criação de feedback (US15.01). O servidor revalida tudo com Zod
 * e RBAC; aqui só guiamos o preenchimento. Voz/IA (US15.04/05) ficam atrás de
 * feature flag: quando off, os botões aparecem como "em breve" e desabilitados.
 */
export function FeedbackFormModal({
  open,
  onClose,
  consultants,
  projects,
  clients,
  flags,
  writeScopeNote,
  notify,
}: FeedbackFormModalProps) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  // Selecionar um projeto fixa o cliente (coerência cliente↔projeto no servidor).
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === draft.relatedProjectId) ?? null,
    [projects, draft.relatedProjectId],
  );

  function reset() {
    setDraft(emptyDraft);
  }

  function submit() {
    startTransition(async () => {
      const result = await createFeedback({
        subjectConsultantId: draft.subjectConsultantId,
        type: draft.type,
        source: draft.source,
        visibility: draft.visibility,
        body: draft.body,
        relatedProjectId: draft.relatedProjectId || undefined,
        // Quando há projeto, o cliente é derivado no servidor; só enviamos
        // cliente avulso quando não há projeto selecionado.
        relatedClientId: draft.relatedProjectId
          ? undefined
          : draft.relatedClientId || undefined,
      });
      if (result.ok) {
        reset();
        onClose();
        notify("success", "Feedback registrado.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  const canSubmit =
    !pending &&
    draft.subjectConsultantId.length > 0 &&
    draft.body.trim().length >= 3;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo feedback"
      description="Registre um feedback ancorado a um projeto ou cliente real. A visibilidade controla o que o consultor enxerga."
      footer={
        <>
          <ActionButton variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </ActionButton>
          <ActionButton onClick={submit} disabled={!canSubmit}>
            Registrar
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
        {consultants.length === 0 ? (
          <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
            {writeScopeNote ??
              "Nenhum consultor disponível no seu escopo de feedback."}
          </p>
        ) : null}
        <OptionSelect
          label="Consultor"
          value={draft.subjectConsultantId}
          options={consultants}
          placeholder="Selecione o consultor"
          hint={
            consultants.length === 0
              ? "Nenhum consultor no seu escopo de feedback."
              : undefined
          }
          onChange={(subjectConsultantId) =>
            setDraft((d) => ({ ...d, subjectConsultantId }))
          }
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <EnumSelect
            label="Tipo"
            value={draft.type}
            options={feedbackTypeLabels}
            onChange={(type) => setDraft((d) => ({ ...d, type }))}
          />
          <EnumSelect
            label="Origem"
            value={draft.source}
            options={feedbackSourceLabels}
            onChange={(source) => setDraft((d) => ({ ...d, source }))}
          />
        </div>

        <EnumSelect
          label="Visibilidade"
          value={draft.visibility}
          options={feedbackVisibilityLabels}
          hint="Compartilhado fica visível ao consultor; privado fica restrito a autor, PEOPLE e gestor responsável."
          onChange={(visibility) => setDraft((d) => ({ ...d, visibility }))}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <OptionSelect
            label="Projeto relacionado (opcional)"
            value={draft.relatedProjectId}
            options={projects}
            placeholder="Sem projeto"
            onChange={(relatedProjectId) =>
              setDraft((d) => ({ ...d, relatedProjectId }))
            }
          />
          {selectedProject ? (
            <label className="space-y-1 text-sm font-medium text-medium">
              Cliente
              <input
                type="text"
                value={selectedProject.clientName}
                readOnly
                className="h-10 w-full rounded-md border border-border bg-surface-muted px-3 text-sm text-soft"
              />
              <span className="text-xs font-normal text-soft">
                Derivado do projeto selecionado.
              </span>
            </label>
          ) : (
            <OptionSelect
              label="Cliente relacionado (opcional)"
              value={draft.relatedClientId}
              options={clients}
              placeholder="Sem cliente"
              onChange={(relatedClientId) =>
                setDraft((d) => ({ ...d, relatedClientId }))
              }
            />
          )}
        </div>

        <TextArea
          label="Feedback"
          value={draft.body}
          placeholder="Descreva o feedback de forma objetiva e ancorada em fatos."
          required
          onChange={(body) => setDraft((d) => ({ ...d, body }))}
        />

        {/* Voz/IA (US15.04/15.05) — preparado, atrás de feature flag. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <ActionButton
            variant="secondary"
            size="sm"
            icon={Mic}
            disabled={!flags.voice}
            title={
              flags.voice
                ? "Registrar feedback por voz"
                : "Em breve — recurso atrás de feature flag (NEXT_PUBLIC_FEEDBACK_VOICE)"
            }
          >
            {flags.voice ? "Registrar por voz" : "Registrar por voz · em breve"}
          </ActionButton>
          <ActionButton
            variant="secondary"
            size="sm"
            icon={Sparkles}
            disabled={!flags.ai}
            title={
              flags.ai
                ? "Sugerir uma versão estruturada com IA"
                : "Em breve — recurso atrás de feature flag (NEXT_PUBLIC_FEEDBACK_AI)"
            }
          >
            {flags.ai ? "Polir com IA" : "Polir com IA · em breve"}
          </ActionButton>
        </div>
      </div>
    </Modal>
  );
}
