"use client";

import { useState } from "react";
import { Building2, Edit, Plus, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/result";
import type { ConsultantExperienceView } from "@/lib/consultants/experiences";

export interface ExperienceDraft {
  id?: string;
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
  location: string;
}

function fieldClass() {
  return cn(
    "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm",
    focusRingInput,
  );
}

function emptyDraft(): ExperienceDraft {
  return {
    company: "",
    role: "",
    startDate: "",
    endDate: "",
    description: "",
    location: "",
  };
}

/**
 * Editor de experiencias profissionais DECLARADAS (P27). Componente de
 * apresentacao: lista + formulario inline + confirmacao de exclusao por Modal.
 * NAO conhece RBAC nem I/O — recebe `onSave`/`onDelete` do pai, que injeta a
 * Server Action correta (autosservico do consultor OU People/RH). Sem dados
 * financeiros. `endDate` vazio = experiencia atual (em andamento).
 */
export function ConsultantExperienceEditor({
  experiences,
  onSave,
  onDelete,
  onReload,
  onMessage,
  canEdit = true,
}: {
  experiences: ConsultantExperienceView[];
  onSave: (draft: ExperienceDraft) => Promise<ActionResult<{ id: string }>>;
  onDelete: (id: string) => Promise<ActionResult<{ id: string }>>;
  onReload: () => void | Promise<void>;
  onMessage: (message: string | null) => void;
  canEdit?: boolean;
}) {
  const [draft, setDraft] = useState<ExperienceDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] =
    useState<ConsultantExperienceView | null>(null);
  const [deleting, setDeleting] = useState(false);

  function startCreate() {
    onMessage(null);
    setDraft(emptyDraft());
  }

  function startEdit(exp: ConsultantExperienceView) {
    onMessage(null);
    setDraft({
      id: exp.id,
      company: exp.company,
      role: exp.role,
      startDate: exp.startDate,
      endDate: exp.endDate ?? "",
      description: exp.description ?? "",
      location: exp.location ?? "",
    });
  }

  async function save() {
    if (!draft) return;
    if (draft.company.trim() === "") {
      onMessage("Informe a empresa.");
      return;
    }
    if (draft.role.trim() === "") {
      onMessage("Informe o cargo.");
      return;
    }
    if (draft.startDate.trim() === "") {
      onMessage("Informe a data de inicio.");
      return;
    }
    setSaving(true);
    const result = await onSave(draft);
    setSaving(false);
    if (result.ok) {
      setDraft(null);
      onMessage("Experiencia salva.");
      await onReload();
    } else {
      onMessage(result.message);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const result = await onDelete(pendingDelete.id);
    setDeleting(false);
    setPendingDelete(null);
    if (result.ok) {
      onMessage("Experiencia removida.");
      await onReload();
    } else {
      onMessage(result.message);
    }
  }

  return (
    <div className="space-y-3">
      {experiences.length === 0 ? (
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-medium">
          Nenhuma experiencia cadastrada. Adicione suas experiencias
          profissionais para montar a espinha do seu curriculo.
        </p>
      ) : (
        <ul className="space-y-2">
          {experiences.map((exp) => (
            <li
              key={exp.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-surface-muted/40 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-strong">{exp.role}</span>
                  {exp.endDate === null ? (
                    <StatusBadge tone="success">Atual</StatusBadge>
                  ) : null}
                </div>
                <p className="truncate text-xs text-soft">
                  {exp.company}
                  {exp.location ? ` · ${exp.location}` : ""} · {exp.startDate} —{" "}
                  {exp.endDate ?? "atual"}
                </p>
                {exp.description ? (
                  <p className="mt-1 whitespace-pre-line text-xs text-medium">
                    {exp.description}
                  </p>
                ) : null}
              </div>
              {canEdit ? (
                <div className="flex shrink-0 gap-2">
                  <ActionButton
                    size="sm"
                    variant="secondary"
                    icon={Edit}
                    onClick={() => startEdit(exp)}
                  >
                    Editar
                  </ActionButton>
                  <ActionButton
                    size="sm"
                    variant="danger"
                    icon={Trash2}
                    onClick={() => {
                      onMessage(null);
                      setPendingDelete(exp);
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

      {!canEdit ? null : draft ? (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-medium">
              Empresa
              <input
                aria-label="Empresa"
                value={draft.company}
                onChange={(event) =>
                  setDraft({ ...draft, company: event.target.value })
                }
                className={fieldClass()}
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-medium">
              Cargo
              <input
                aria-label="Cargo"
                value={draft.role}
                onChange={(event) =>
                  setDraft({ ...draft, role: event.target.value })
                }
                className={fieldClass()}
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-medium">
              Inicio
              <input
                type="date"
                aria-label="Data de inicio"
                value={draft.startDate}
                onChange={(event) =>
                  setDraft({ ...draft, startDate: event.target.value })
                }
                className={fieldClass()}
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-medium">
              Termino (vazio = atual)
              <input
                type="date"
                aria-label="Data de termino"
                value={draft.endDate}
                onChange={(event) =>
                  setDraft({ ...draft, endDate: event.target.value })
                }
                className={fieldClass()}
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-medium">
              Local (opcional)
              <input
                aria-label="Local"
                value={draft.location}
                onChange={(event) =>
                  setDraft({ ...draft, location: event.target.value })
                }
                className={fieldClass()}
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-medium md:col-span-2">
              Descricao (opcional)
              <textarea
                aria-label="Descricao"
                value={draft.description}
                rows={3}
                maxLength={2000}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
                className={cn(
                  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm",
                  focusRingInput,
                )}
                placeholder="Responsabilidades e resultados (sem dados financeiros)."
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              size="sm"
              icon={Building2}
              disabled={saving}
              onClick={save}
            >
              {draft.id ? "Salvar alteracoes" : "Adicionar experiencia"}
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
      ) : (
        <ActionButton size="sm" icon={Plus} onClick={startCreate}>
          Adicionar experiencia
        </ActionButton>
      )}

      <Modal
        open={pendingDelete !== null}
        onClose={() => (deleting ? undefined : setPendingDelete(null))}
        title="Excluir experiencia"
        description="Esta acao remove a experiencia declarada e sera auditada."
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
            Confirmar a exclusao de{" "}
            <span className="font-semibold text-strong">
              {pendingDelete.role}
            </span>{" "}
            em{" "}
            <span className="font-semibold text-strong">
              {pendingDelete.company}
            </span>
            ?
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
