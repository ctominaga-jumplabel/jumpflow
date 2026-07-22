"use client";

import { useMemo, useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { FeedbackTone } from "@/components/ui/Feedback";
import type {
  ClientOption,
  ConsultantOption,
  ProjectOption,
} from "@/lib/feedback/types";
import { requestClientFeedback } from "@/app/app/feedback/actions";
import { OptionSelect, TextArea } from "./fields";

interface Draft {
  subjectConsultantId: string;
  relatedProjectId: string;
  relatedClientId: string;
  email: string;
  note: string;
}

const emptyDraft: Draft = {
  subjectConsultantId: "",
  relatedProjectId: "",
  relatedClientId: "",
  email: "",
  note: "",
};

export interface FeedbackRequestModalProps {
  open: boolean;
  onClose: () => void;
  consultants: ConsultantOption[];
  projects: ProjectOption[];
  clients: ClientOption[];
  notify: (tone: FeedbackTone, text: string) => void;
}

/**
 * P29 — Solicitar feedback ao cliente por e-mail. O usuário informa o e-mail do
 * cliente (ou usa o contato de cobrança prefilled a partir do cliente/projeto) e
 * dispara um pedido. Tudo é revalidado no servidor (RBAC + escopo por
 * consultor). Degrade honesto: sem provedor real, o transporte cai no console e
 * o disparo é registrado do mesmo jeito.
 */
export function FeedbackRequestModal({
  open,
  onClose,
  consultants,
  projects,
  clients,
  notify,
}: FeedbackRequestModalProps) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === draft.relatedProjectId) ?? null,
    [projects, draft.relatedProjectId],
  );

  function clientEmail(clientId: string | undefined): string {
    if (!clientId) return "";
    return clients.find((c) => c.id === clientId)?.contactEmail ?? "";
  }

  function reset() {
    setDraft(emptyDraft);
  }

  function chooseProject(relatedProjectId: string) {
    const project = projects.find((p) => p.id === relatedProjectId) ?? null;
    setDraft((d) => ({
      ...d,
      relatedProjectId,
      relatedClientId: "",
      // Prefill do e-mail a partir do cliente do projeto (sobrescreve o vazio).
      email: relatedProjectId ? clientEmail(project?.clientId) || d.email : d.email,
    }));
  }

  function chooseClient(relatedClientId: string) {
    setDraft((d) => ({
      ...d,
      relatedClientId,
      email: relatedClientId ? clientEmail(relatedClientId) || d.email : d.email,
    }));
  }

  function submit() {
    startTransition(async () => {
      const result = await requestClientFeedback({
        subjectConsultantId: draft.subjectConsultantId,
        relatedProjectId: draft.relatedProjectId || undefined,
        relatedClientId: draft.relatedProjectId
          ? undefined
          : draft.relatedClientId || undefined,
        email: draft.email || undefined,
        note: draft.note || undefined,
      });
      if (result.ok) {
        reset();
        onClose();
        notify(
          "success",
          result.data.provider === "console"
            ? `Pedido registrado (envio simulado no console para ${result.data.email}).`
            : `Pedido de feedback enviado para ${result.data.email}.`,
        );
      } else {
        notify("warning", result.message);
      }
    });
  }

  const canSubmit = !pending && draft.subjectConsultantId.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Solicitar feedback ao cliente"
      description="Dispara um e-mail pedindo que o cliente avalie o trabalho do consultor. O retorno volta por e-mail e pode ser cadastrado depois como feedback do cliente."
      footer={
        <>
          <ActionButton variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </ActionButton>
          <ActionButton icon={Mail} onClick={submit} disabled={!canSubmit}>
            Enviar pedido
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
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
          <OptionSelect
            label="Projeto (opcional)"
            value={draft.relatedProjectId}
            options={projects}
            placeholder="Sem projeto"
            onChange={chooseProject}
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
              label="Cliente (opcional)"
              value={draft.relatedClientId}
              options={clients}
              placeholder="Sem cliente"
              onChange={chooseClient}
            />
          )}
        </div>

        <label className="space-y-1 text-sm font-medium text-medium">
          E-mail do cliente
          <input
            type="email"
            aria-label="E-mail do cliente"
            value={draft.email}
            placeholder="contato@cliente.com"
            onChange={(event) =>
              setDraft((d) => ({ ...d, email: event.target.value }))
            }
            className={cn(
              "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm",
              focusRingInput,
            )}
          />
          <span className="text-xs font-normal text-soft">
            Se ficar vazio, usamos o contato de cobrança do cliente selecionado.
          </span>
        </label>

        <TextArea
          label="Mensagem ao cliente (opcional)"
          value={draft.note}
          rows={3}
          placeholder="Um recado curto ao cliente. Não inclua dados internos ou financeiros."
          onChange={(note) => setDraft((d) => ({ ...d, note }))}
        />
      </div>
    </Modal>
  );
}
