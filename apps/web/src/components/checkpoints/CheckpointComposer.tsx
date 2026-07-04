"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Mic, Sparkles, Upload } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { FeedbackTone } from "@/components/ui/Feedback";
import {
  checkpointTypeLabels,
  checkpointVisibilityLabels,
  type CheckpointOption,
  type CheckpointType,
  type CheckpointVisibility,
  type PipelineStatus,
} from "@/lib/checkpoint/types";
import type { CheckpointFlags } from "@/lib/checkpoint/flags";
import {
  attachCheckpointAudio,
  createCheckpoint,
  transcribeCheckpoint,
} from "@/app/app/checkpoints/actions";
import { EnumSelect, OptionSelect, TextArea, TextField } from "./fields";

interface Draft {
  consultantId: string;
  type: CheckpointType;
  occurredAt: string;
  relatedProjectId: string;
  title: string;
  notes: string;
  visibility: CheckpointVisibility;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(): Draft {
  return {
    consultantId: "",
    type: "ONE_ON_ONE",
    occurredAt: todayIso(),
    relatedProjectId: "",
    title: "",
    notes: "",
    // Decisão da melhoria: o 1-on-1 nasce PRIVATE (o consultor não vê).
    visibility: "PRIVATE",
  };
}

export interface CheckpointComposerProps {
  open: boolean;
  onClose: () => void;
  consultants: CheckpointOption[];
  projects: CheckpointOption[];
  flags: CheckpointFlags;
  notify: (tone: FeedbackTone, text: string) => void;
}

/**
 * Formulário de registro de checkpoint / 1-on-1 (FATIA 5). O servidor revalida
 * tudo com Zod + RBAC + escopo por consultor-alvo; aqui só guiamos. Voz (F3)
 * fica atrás de `isCheckpointVoiceEnabled()`: o gravador/upload só aparece após
 * o registro existir (precisa de um checkpointId para anexar o áudio).
 */
export function CheckpointComposer({
  open,
  onClose,
  consultants,
  projects,
  flags,
  notify,
}: CheckpointComposerProps) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  // Após criar, guardamos o id para liberar a etapa de voz (anexo + transcrição).
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [transcriptionStatus, setTranscriptionStatus] =
    useState<PipelineStatus>("NONE");
  const [busyVoice, setBusyVoice] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function close() {
    setDraft(emptyDraft());
    setCreatedId(null);
    setTranscriptionStatus("NONE");
    onClose();
  }

  function submit() {
    startTransition(async () => {
      const result = await createCheckpoint({
        consultantId: draft.consultantId,
        type: draft.type,
        occurredAt: draft.occurredAt,
        relatedProjectId: draft.relatedProjectId || undefined,
        title: draft.title || undefined,
        notes: draft.notes || undefined,
        visibility: draft.visibility,
      });
      if (result.ok) {
        if (flags.voice) {
          // Mantém o modal aberto para anexar áudio ao registro recém-criado.
          setCreatedId(result.data.id);
          notify("success", "Checkpoint registrado. Você pode anexar um áudio.");
        } else {
          close();
          notify("success", "Checkpoint registrado.");
        }
      } else {
        notify("warning", result.message);
      }
    });
  }

  function onPickAudio(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !createdId) return;
    setBusyVoice(true);
    startTransition(async () => {
      const form = new FormData();
      form.set("checkpointId", createdId);
      form.set("file", file);
      const result = await attachCheckpointAudio(form);
      setBusyVoice(false);
      if (result.ok) {
        setTranscriptionStatus("PENDING");
        notify("success", "Áudio anexado. Você já pode transcrever.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  function transcribe() {
    if (!createdId) return;
    setBusyVoice(true);
    startTransition(async () => {
      const result = await transcribeCheckpoint(createdId);
      setBusyVoice(false);
      if (result.ok) {
        if (result.data.unavailable) {
          setTranscriptionStatus("NONE");
          notify("info", "Transcrição indisponível no momento.");
        } else {
          setTranscriptionStatus("DONE");
          notify("success", "Áudio transcrito.");
        }
      } else {
        setTranscriptionStatus("FAILED");
        notify("warning", result.message);
      }
    });
  }

  const canSubmit =
    !pending && draft.consultantId.length > 0 && draft.occurredAt.length > 0;

  const transcriptionLabel: Record<PipelineStatus, string> = {
    NONE: "Sem transcrição",
    PENDING: "Áudio na fila",
    DONE: "Transcrito",
    FAILED: "Falhou",
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Novo checkpoint"
      description="Registre um 1-on-1 ou um checkpoint semanal por projeto. O 1-on-1 nasce privado — só o gestor responsável e PEOPLE veem."
      footer={
        createdId ? (
          <ActionButton onClick={close} disabled={pending}>
            Concluir
          </ActionButton>
        ) : (
          <>
            <ActionButton
              variant="secondary"
              onClick={close}
              disabled={pending}
            >
              Cancelar
            </ActionButton>
            <ActionButton onClick={submit} disabled={!canSubmit}>
              Registrar
            </ActionButton>
          </>
        )
      }
    >
      <div className="space-y-4">
        <OptionSelect
          label="Consultor"
          value={draft.consultantId}
          options={consultants}
          placeholder="Selecione o consultor"
          hint={
            consultants.length === 0
              ? "Nenhum consultor no seu escopo de checkpoint."
              : undefined
          }
          onChange={(consultantId) =>
            setDraft((d) => ({ ...d, consultantId }))
          }
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <EnumSelect
            label="Tipo"
            value={draft.type}
            options={checkpointTypeLabels}
            onChange={(type) => setDraft((d) => ({ ...d, type }))}
          />
          <TextField
            label="Data"
            type="date"
            value={draft.occurredAt}
            onChange={(occurredAt) => setDraft((d) => ({ ...d, occurredAt }))}
          />
        </div>

        <OptionSelect
          label="Projeto relacionado (opcional)"
          value={draft.relatedProjectId}
          options={projects}
          placeholder="Sem projeto"
          onChange={(relatedProjectId) =>
            setDraft((d) => ({ ...d, relatedProjectId }))
          }
        />

        <TextField
          label="Título (opcional)"
          value={draft.title}
          placeholder="Ex.: Acompanhamento semanal"
          onChange={(title) => setDraft((d) => ({ ...d, title }))}
        />

        <EnumSelect
          label="Visibilidade"
          value={draft.visibility}
          options={checkpointVisibilityLabels}
          hint="Compartilhado libera um resumo ao consultor; privado fica restrito ao gestor responsável e PEOPLE. A transcrição e os insights crus nunca são compartilhados."
          onChange={(visibility) => setDraft((d) => ({ ...d, visibility }))}
        />

        <TextArea
          label="Notas"
          value={draft.notes}
          placeholder="Pontos discutidos, combinados e próximos passos."
          onChange={(notes) => setDraft((d) => ({ ...d, notes }))}
        />

        {/* Voz (F3) — atrás de isCheckpointVoiceEnabled(). Só após o registro
            existir (precisa do checkpointId para anexar o áudio). */}
        {flags.voice ? (
          <div
            className="space-y-3 border-t border-border pt-3"
            aria-label="Registro por voz"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-strong">
              <Mic aria-hidden="true" className="size-4" />
              Registro por voz
              <StatusBadge
                tone={transcriptionStatus === "DONE" ? "success" : "neutral"}
              >
                {transcriptionLabel[transcriptionStatus]}
              </StatusBadge>
            </div>
            {createdId ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  className="sr-only"
                  aria-label="Arquivo de áudio"
                  onChange={onPickAudio}
                />
                <ActionButton
                  variant="secondary"
                  size="sm"
                  icon={Upload}
                  disabled={busyVoice || pending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Enviar áudio
                </ActionButton>
                <ActionButton
                  variant="secondary"
                  size="sm"
                  icon={busyVoice ? Loader2 : Sparkles}
                  disabled={
                    busyVoice || pending || transcriptionStatus === "NONE"
                  }
                  onClick={transcribe}
                >
                  Transcrever
                </ActionButton>
              </div>
            ) : (
              <p className="text-xs text-soft">
                Registre o checkpoint primeiro para anexar e transcrever um áudio.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
