"use client";

import { useState } from "react";
import { BadgeDollarSign, Edit, Plus, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  deleteConsultantProjectRate,
  saveConsultantProjectRate,
  type ConsultantProjectRatesView,
  type ConsultantProjectRateView,
} from "@/app/app/consultores/actions";
import type { ProjectRateInput } from "@/lib/consultants/schemas";

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function fieldClass() {
  return cn(
    "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm",
    focusRingInput,
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(consultantId: string): ProjectRateInput {
  return {
    id: undefined,
    consultantId,
    projectId: "",
    hourlyRate: 0,
    startsAt: todayIso(),
    endsAt: "",
    note: undefined,
  };
}

export interface ConsultantProjectRatesSectionProps {
  consultantId: string;
  data: ConsultantProjectRatesView | null;
  canEdit: boolean;
  onMessage: (message: string | null) => void;
  onReload: () => void;
}

/**
 * M2: valor/hora diferenciado do consultor por projeto (com vigência). Lista as
 * vigências e um formulário para criar/editar. Toda escrita passa por Server
 * Action (grupo de remuneração) + AuditEvent; exclusão confirmada por Modal.
 */
export function ConsultantProjectRatesSection({
  consultantId,
  data,
  canEdit,
  onMessage,
  onReload,
}: ConsultantProjectRatesSectionProps) {
  const [draft, setDraft] = useState<ProjectRateInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] =
    useState<ConsultantProjectRateView | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!data) {
    return (
      <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-medium">
        Carregando valores/hora por projeto...
      </p>
    );
  }

  const projects = data.projects;

  function startCreate() {
    onMessage(null);
    setDraft(emptyDraft(consultantId));
  }

  function startEdit(rate: ConsultantProjectRateView) {
    onMessage(null);
    setDraft({
      id: rate.id,
      consultantId,
      projectId: rate.projectId,
      hourlyRate: rate.hourlyRate,
      startsAt: rate.startsAt,
      endsAt: rate.endsAt ?? "",
      note: rate.note ?? undefined,
    });
  }

  async function save() {
    if (!draft) return;
    if (!draft.projectId) {
      onMessage("Selecione o projeto do valor/hora.");
      return;
    }
    if (!(Number(draft.hourlyRate) > 0)) {
      onMessage("Informe um valor/hora maior que zero.");
      return;
    }
    setSaving(true);
    const result = await saveConsultantProjectRate(draft);
    setSaving(false);
    if (result.ok) {
      setDraft(null);
      onMessage("Valor/hora por projeto salvo.");
      onReload();
    } else {
      onMessage(result.message);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const result = await deleteConsultantProjectRate({ id: pendingDelete.id });
    setDeleting(false);
    setPendingDelete(null);
    if (result.ok) {
      onMessage("Valor/hora por projeto excluído.");
      onReload();
    } else {
      onMessage(result.message);
    }
  }

  return (
    <div className="space-y-3">
      {data.rates.length === 0 ? (
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-medium">
          Nenhum valor/hora por projeto cadastrado (usa o valor/hora acordado).
        </p>
      ) : (
        <ul className="space-y-2">
          {data.rates.map((rate) => (
            <li
              key={rate.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-muted/40 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-strong">
                    {brlFormatter.format(rate.hourlyRate)}/h
                  </span>
                  <span className="text-sm text-medium">{rate.projectName}</span>
                </div>
                <p className="truncate text-xs text-soft">
                  {rate.clientName} · vigência {rate.startsAt}
                  {rate.endsAt ? ` até ${rate.endsAt}` : " (aberta)"}
                  {rate.note ? ` · ${rate.note}` : ""}
                </p>
              </div>
              {canEdit ? (
                <div className="flex shrink-0 gap-2">
                  <ActionButton
                    size="sm"
                    variant="secondary"
                    icon={Edit}
                    onClick={() => startEdit(rate)}
                  >
                    Editar
                  </ActionButton>
                  <ActionButton
                    size="sm"
                    variant="danger"
                    icon={Trash2}
                    onClick={() => {
                      onMessage(null);
                      setPendingDelete(rate);
                    }}
                  >
                    Excluir
                  </ActionButton>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-medium">
              Projeto
              <select
                aria-label="Projeto do valor/hora"
                value={draft.projectId}
                onChange={(event) =>
                  setDraft({ ...draft, projectId: event.target.value })
                }
                className={fieldClass()}
              >
                <option value="">Selecione o projeto</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} ({project.clientName})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium text-medium">
              Valor/hora (R$)
              <input
                type="number"
                aria-label="Valor/hora"
                value={draft.hourlyRate || ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    hourlyRate:
                      event.target.value === ""
                        ? 0
                        : Number(event.target.value),
                  })
                }
                className={fieldClass()}
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-medium">
              Vigência (início)
              <input
                type="date"
                aria-label="Início da vigência"
                value={draft.startsAt}
                onChange={(event) =>
                  setDraft({ ...draft, startsAt: event.target.value })
                }
                className={fieldClass()}
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-medium">
              Vigência (fim, opcional)
              <input
                type="date"
                aria-label="Fim da vigência"
                value={draft.endsAt ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, endsAt: event.target.value })
                }
                className={fieldClass()}
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-medium md:col-span-2">
              Observação (opcional)
              <input
                aria-label="Observação"
                value={draft.note ?? ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    note: event.target.value === "" ? undefined : event.target.value,
                  })
                }
                className={fieldClass()}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              size="sm"
              icon={BadgeDollarSign}
              disabled={saving}
              onClick={save}
            >
              {draft.id ? "Salvar alterações" : "Adicionar valor/hora"}
            </ActionButton>
            <ActionButton
              size="sm"
              variant="secondary"
              disabled={saving}
              onClick={() => setDraft(null)}
            >
              Cancelar
            </ActionButton>
          </div>
        </div>
      ) : canEdit ? (
        <ActionButton size="sm" icon={Plus} onClick={startCreate}>
          Adicionar valor/hora por projeto
        </ActionButton>
      ) : null}

      <Modal
        open={pendingDelete !== null}
        onClose={() => (deleting ? undefined : setPendingDelete(null))}
        title="Excluir valor/hora por projeto"
        description="Esta ação remove a vigência e será auditada."
        footer={
          <>
            <ActionButton
              variant="secondary"
              disabled={deleting}
              onClick={() => setPendingDelete(null)}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              variant="danger"
              icon={Trash2}
              disabled={deleting}
              onClick={confirmDelete}
            >
              Excluir
            </ActionButton>
          </>
        }
      >
        {pendingDelete ? (
          <p className="text-sm text-medium">
            Confirmar a exclusão de{" "}
            <span className="font-semibold text-strong">
              {brlFormatter.format(pendingDelete.hourlyRate)}/h
            </span>{" "}
            em{" "}
            <span className="font-semibold text-strong">
              {pendingDelete.projectName}
            </span>
            ?
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
