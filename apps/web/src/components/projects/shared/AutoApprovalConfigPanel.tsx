"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Clock, Link2, Pause, Play, Trash2, Users } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { focusRing, focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  deleteConsultantAutoApprovalRule,
  linkConsultantsToAutoApproval,
  setConsultantAutoApprovalActive,
  setProjectAutoApprovalActive,
  upsertConsultantAutoApprovalRule,
  upsertProjectAutoApprovalRule,
} from "@/app/app/projetos/actions";
import type {
  ProjectConsultantAutoApprovalRuleItem,
  ProjectItem,
} from "@/lib/projects/types";

/** "HH:mm" string ↔ minutos-do-dia. 00:01 = 1, 23:59 = 1439. */
function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(":").map((p) => Number(p));
  return (h || 0) * 60 + (m || 0);
}
function minutesToHHmm(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

interface RuleForm {
  weekendEnabled: boolean;
  hoursRangeEnabled: boolean;
  min: string; // HH:mm
  max: string; // HH:mm
}

function toForm(rule?: {
  weekendEnabled: boolean;
  hoursRangeEnabled: boolean;
  minMinutes: number;
  maxMinutes: number;
}): RuleForm {
  return {
    weekendEnabled: rule?.weekendEnabled ?? false,
    hoursRangeEnabled: rule?.hoursRangeEnabled ?? false,
    min: minutesToHHmm(rule?.minMinutes ?? 1),
    max: minutesToHHmm(rule?.maxMinutes ?? 1439),
  };
}

export interface AutoApprovalConfigPanelProps {
  project: ProjectItem;
  canManageProjects: boolean;
}

/**
 * Configuração da aprovação automática do projeto (Operação). Duas exceções
 * não excludentes (fim de semana + range de horas por lançamento, combinadas
 * por OU). Vincular consultores ativa o modo exclusivo: a regra do projeto
 * deixa de valer e cada consultor segue a sua. Componente autossuficiente —
 * chama as Server Actions e faz `router.refresh()` para refletir o estado.
 */
export function AutoApprovalConfigPanel({
  project,
  canManageProjects,
}: AutoApprovalConfigPanelProps) {
  const router = useRouter();
  const { feedback, notify } = useFeedback();
  const [isPending, startTransition] = useTransition();
  const [linkOpen, setLinkOpen] = useState(false);

  const consultantRules = project.autoApprovalConsultantRules ?? [];
  // O modo exclusivo (que suspende a regra do projeto) é determinado por regras
  // ATIVAS — igual ao motor. Regras inativas continuam listadas para reativação.
  const exclusiveMode = consultantRules.some((r) => r.active);

  const [projectForm, setProjectForm] = useState<RuleForm>(() =>
    toForm(project.autoApprovalRule),
  );

  // Consultores alocados no projeto (candidatos a vínculo), sem duplicar.
  const allocatedConsultants = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of project.allocations) {
      if (!seen.has(a.consultantId)) seen.set(a.consultantId, a.consultantName);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [project.allocations]);

  const linkedIds = new Set(consultantRules.map((r) => r.consultantId));
  const linkableConsultants = allocatedConsultants.filter(
    (c) => !linkedIds.has(c.id),
  );

  function run(action: () => Promise<{ ok: boolean; message?: string }>, okMsg: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        notify("warning", result.message ?? "Não foi possível concluir.");
        return;
      }
      notify("success", okMsg);
      router.refresh();
    });
  }

  function saveProjectRule() {
    if (hhmmToMinutes(projectForm.max) < hhmmToMinutes(projectForm.min)) {
      notify("warning", "Máximo deve ser maior ou igual ao mínimo.");
      return;
    }
    run(
      () =>
        upsertProjectAutoApprovalRule({
          projectId: project.id,
          weekendEnabled: projectForm.weekendEnabled,
          hoursRangeEnabled: projectForm.hoursRangeEnabled,
          minMinutes: hhmmToMinutes(projectForm.min),
          maxMinutes: hhmmToMinutes(projectForm.max),
        }),
      "Regra do projeto salva.",
    );
  }

  return (
    <div className="space-y-4">
      <FeedbackBanner message={feedback} />

      {exclusiveMode ? (
        <div className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
          Modo por consultor ativo: a regra do projeto foi inativada. Apenas os
          consultores vinculados abaixo têm aprovação automática; os demais ficam
          manuais. Inative/remova as regras por consultor e reative a regra do
          projeto para voltar.
        </div>
      ) : null}

      <section className="space-y-3 rounded-md border border-border p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-strong">
          <CalendarClock aria-hidden="true" className="size-4" />
          Regra do projeto
        </div>
        <RuleFields
          value={projectForm}
          disabled={!canManageProjects || exclusiveMode || isPending}
          onChange={setProjectForm}
        />
        <div className="flex flex-wrap gap-2">
          <ActionButton
            size="sm"
            icon={CalendarClock}
            disabled={!canManageProjects || exclusiveMode || isPending}
            onClick={saveProjectRule}
          >
            Salvar regra do projeto
          </ActionButton>
          {project.autoApprovalRule ? (
            <ActionButton
              size="sm"
              variant={project.autoApprovalRule.active ? "secondary" : "success"}
              icon={project.autoApprovalRule.active ? Pause : Play}
              // Em modo exclusivo a regra do projeto fica suspensa: não dá para
              // reativá-la enquanto houver regra por consultor ativa.
              disabled={!canManageProjects || isPending || exclusiveMode}
              onClick={() =>
                run(
                  () =>
                    setProjectAutoApprovalActive({
                      projectId: project.id,
                      active: !project.autoApprovalRule!.active,
                    }),
                  project.autoApprovalRule!.active
                    ? "Regra do projeto inativada."
                    : "Regra do projeto reativada.",
                )
              }
            >
              {project.autoApprovalRule.active ? "Inativar regra" : "Reativar regra"}
            </ActionButton>
          ) : null}
          <ActionButton
            size="sm"
            variant="secondary"
            icon={Link2}
            disabled={!canManageProjects || isPending || linkableConsultants.length === 0}
            onClick={() => setLinkOpen(true)}
          >
            Vincular consultores
          </ActionButton>
        </div>
      </section>

      {consultantRules.length > 0 ? (
        <section className="space-y-3 rounded-md border border-border p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-strong">
            <Users aria-hidden="true" className="size-4" />
            Regras por consultor
          </div>
          {!exclusiveMode ? (
            <p className="text-xs text-soft">
              Todas as regras por consultor estão inativas — a regra do projeto
              acima volta a valer. Reative uma regra para retornar ao modo
              exclusivo.
            </p>
          ) : null}
          <ul className="space-y-3">
            {consultantRules.map((rule) => (
              <ConsultantRuleRow
                key={rule.id}
                projectId={project.id}
                rule={rule}
                disabled={!canManageProjects || isPending}
                onSave={(input) =>
                  run(
                    () => upsertConsultantAutoApprovalRule(input),
                    `Regra de ${rule.consultantName} salva.`,
                  )
                }
                onToggle={() =>
                  run(
                    () =>
                      setConsultantAutoApprovalActive({
                        id: rule.id,
                        active: !rule.active,
                      }),
                    rule.active
                      ? `Regra de ${rule.consultantName} inativada.`
                      : `Regra de ${rule.consultantName} reativada.`,
                  )
                }
                onRemove={() =>
                  run(
                    () => deleteConsultantAutoApprovalRule({ id: rule.id }),
                    `Vínculo de ${rule.consultantName} removido.`,
                  )
                }
              />
            ))}
          </ul>
        </section>
      ) : null}

      {linkOpen ? (
        <LinkConsultantsModal
          consultants={linkableConsultants}
          disabled={isPending}
          onClose={() => setLinkOpen(false)}
          onConfirm={(ids) => {
            setLinkOpen(false);
            run(
              () =>
                linkConsultantsToAutoApproval({
                  projectId: project.id,
                  consultantIds: ids,
                }),
              "Consultores vinculados.",
            );
          }}
        />
      ) : null}
    </div>
  );
}

function RuleFields({
  value,
  disabled,
  onChange,
}: {
  value: RuleForm;
  disabled: boolean;
  onChange: (value: RuleForm) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm font-medium text-medium">
        <input
          type="checkbox"
          checked={value.weekendEnabled}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, weekendEnabled: e.target.checked })}
        />
        <CalendarClock aria-hidden="true" className="size-4" />
        Aprovar lançamentos de fim de semana (5 min após o envio)
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-medium">
        <input
          type="checkbox"
          checked={value.hoursRangeEnabled}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...value, hoursRangeEnabled: e.target.checked })
          }
        />
        <Clock aria-hidden="true" className="size-4" />
        Aprovar quando as horas do lançamento estiverem no intervalo
      </label>
      <div className="flex flex-wrap items-end gap-3 pl-6">
        <label className="space-y-1 text-sm font-medium text-medium">
          Mínimo (HH:mm)
          <input
            type="time"
            value={value.min}
            disabled={disabled || !value.hoursRangeEnabled}
            onChange={(e) => onChange({ ...value, min: e.target.value })}
            className={cn(
              "h-10 rounded-md border border-border bg-surface px-3 text-sm",
              focusRingInput,
            )}
          />
        </label>
        <label className="space-y-1 text-sm font-medium text-medium">
          Máximo (HH:mm)
          <input
            type="time"
            value={value.max}
            disabled={disabled || !value.hoursRangeEnabled}
            onChange={(e) => onChange({ ...value, max: e.target.value })}
            className={cn(
              "h-10 rounded-md border border-border bg-surface px-3 text-sm",
              focusRingInput,
            )}
          />
        </label>
      </div>
    </div>
  );
}

function ConsultantRuleRow({
  projectId,
  rule,
  disabled,
  onSave,
  onToggle,
  onRemove,
}: {
  projectId: string;
  rule: ProjectConsultantAutoApprovalRuleItem;
  disabled: boolean;
  onSave: (input: {
    consultantId: string;
    projectId: string;
    weekendEnabled: boolean;
    hoursRangeEnabled: boolean;
    minMinutes: number;
    maxMinutes: number;
  }) => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const [form, setForm] = useState<RuleForm>(() => toForm(rule));

  return (
    <li
      className={cn(
        "space-y-2 rounded-md border border-border bg-surface-muted/40 p-3",
        !rule.active && "opacity-70",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-strong">
          {rule.consultantName}
          <StatusBadge tone={rule.active ? "success" : "neutral"}>
            {rule.active ? "Ativa" : "Inativa"}
          </StatusBadge>
        </span>
        <div className="flex items-center gap-1">
          <ActionButton
            size="sm"
            variant={rule.active ? "secondary" : "success"}
            icon={rule.active ? Pause : Play}
            disabled={disabled}
            onClick={onToggle}
            aria-label={
              rule.active
                ? `Inativar regra de ${rule.consultantName}`
                : `Reativar regra de ${rule.consultantName}`
            }
          >
            {rule.active ? "Inativar" : "Reativar"}
          </ActionButton>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remover vínculo de ${rule.consultantName}`}
            className={cn(
              "grid size-7 place-items-center rounded-md text-medium transition-colors hover:bg-surface hover:text-danger disabled:opacity-50",
              focusRing,
            )}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
      <RuleFields value={form} disabled={disabled} onChange={setForm} />
      <ActionButton
        size="sm"
        disabled={disabled}
        onClick={() => {
          if (hhmmToMinutes(form.max) < hhmmToMinutes(form.min)) return;
          onSave({
            consultantId: rule.consultantId,
            projectId,
            weekendEnabled: form.weekendEnabled,
            hoursRangeEnabled: form.hoursRangeEnabled,
            minMinutes: hhmmToMinutes(form.min),
            maxMinutes: hhmmToMinutes(form.max),
          });
        }}
      >
        Salvar regra
      </ActionButton>
    </li>
  );
}

function LinkConsultantsModal({
  consultants,
  disabled,
  onClose,
  onConfirm,
}: {
  consultants: { id: string; name: string }[];
  disabled: boolean;
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Vincular consultores"
      description="Os consultores selecionados passam a ter regra própria. A regra do projeto deixa de valer (modo exclusivo); consultores sem regra ficam manuais."
      footer={
        <>
          <ActionButton variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </ActionButton>
          <ActionButton
            size="sm"
            icon={Link2}
            disabled={disabled || selected.size === 0}
            onClick={() => onConfirm([...selected])}
          >
            Vincular ({selected.size})
          </ActionButton>
        </>
      }
    >
      {consultants.length === 0 ? (
        <p className="text-sm text-soft">
          Todos os consultores alocados já estão vinculados.
        </p>
      ) : (
        <ul className="space-y-1">
          {consultants.map((c) => (
            <li key={c.id}>
              <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-strong hover:bg-surface-muted/60">
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                />
                {c.name}
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
