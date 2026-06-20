"use client";

import { useState, useTransition } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { FeedbackTone } from "@/components/ui/Feedback";
import { createPlan, loadGapSuggestions } from "@/app/app/pdi/actions";
import type { SkillOption } from "@/lib/competencies/types";
import {
  developmentActionTypeLabels,
  type ConsultantOption,
  type DevelopmentActionType,
} from "@/lib/development/types";
import { EnumSelect, TextField } from "./fields";

/** Ação em edição no rascunho (sugestão revisável antes de salvar). */
interface DraftAction {
  type: DevelopmentActionType;
  targetSkillId: string | null;
  description: string;
  dueAt: string;
}

export interface PlanFormModalProps {
  open: boolean;
  onClose: () => void;
  consultants: ConsultantOption[];
  skillOptions: SkillOption[];
  notify: (tone: FeedbackTone, text: string) => void;
}

/**
 * Criação de PDI (US17.01). O gestor escolhe o consultor e o período; ao gerar,
 * o servidor calcula o gap (perfil aplicável × nível atual) e devolve sugestões
 * de ações com skill alvo. As sugestões são EDITÁVEIS e REMOVÍVEIS aqui antes de
 * confirmar — nada é criado sem revisão. O servidor revalida RBAC, Zod e o
 * período.
 */
export function PlanFormModal({
  open,
  onClose,
  consultants,
  skillOptions,
  notify,
}: PlanFormModalProps) {
  const [pending, startTransition] = useTransition();
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [consultantId, setConsultantId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [actions, setActions] = useState<DraftAction[]>([]);
  const [profileNote, setProfileNote] = useState<string | null>(null);

  const skillNameById = new Map(skillOptions.map((s) => [s.id, s.name]));

  function reset() {
    setConsultantId("");
    setPeriodStart("");
    setPeriodEnd("");
    setActions([]);
    setProfileNote(null);
  }

  function close() {
    reset();
    onClose();
  }

  function generate() {
    if (!consultantId) {
      notify("warning", "Selecione um consultor para gerar as sugestões.");
      return;
    }
    setLoadingSuggestions(true);
    startTransition(async () => {
      const result = await loadGapSuggestions(consultantId);
      setLoadingSuggestions(false);
      if (!result.ok) {
        notify("warning", result.message);
        return;
      }
      const { suggestions, profileName, gapSkills } = result.data;
      setActions(
        suggestions.map((s) => ({
          type: s.type,
          targetSkillId: s.targetSkillId,
          description: s.description,
          dueAt: "",
        })),
      );
      if (!profileName) {
        setProfileNote(
          "Consultor sem perfil de competência aplicável — sem gap para sugerir. Adicione ações manualmente.",
        );
      } else if (gapSkills.length === 0) {
        setProfileNote(
          `Perfil "${profileName}": nenhuma lacuna positiva. Adicione ações manualmente se quiser.`,
        );
      } else {
        setProfileNote(
          `Perfil "${profileName}": ${gapSkills.length} skill(s) com gap. Revise as sugestões abaixo.`,
        );
      }
    });
  }

  function addBlankAction() {
    setActions((prev) => [
      ...prev,
      { type: "TRAINING", targetSkillId: null, description: "", dueAt: "" },
    ]);
  }

  function updateAction(index: number, patch: Partial<DraftAction>) {
    setActions((prev) =>
      prev.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    );
  }

  function removeAction(index: number) {
    setActions((prev) => prev.filter((_, i) => i !== index));
  }

  function submit() {
    startTransition(async () => {
      const payloadActions = actions
        .filter((a) => a.description.trim().length >= 3)
        .map((a) => ({
          type: a.type,
          targetSkillId: a.targetSkillId,
          description: a.description.trim(),
          dueAt: a.dueAt ? a.dueAt : null,
        }));
      const result = await createPlan({
        consultantId,
        periodStart,
        periodEnd,
        actions: payloadActions,
      });
      if (result.ok) {
        close();
        notify("success", "PDI criado. As ações nascem como planejadas.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  const canSubmit =
    !pending &&
    consultantId.length > 0 &&
    periodStart.length > 0 &&
    periodEnd.length > 0 &&
    periodStart < periodEnd;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Novo PDI"
      description="Escolha o consultor e o período, gere as ações a partir do gap e revise antes de criar."
      className="max-w-2xl"
      footer={
        <>
          <ActionButton variant="secondary" onClick={close} disabled={pending}>
            Cancelar
          </ActionButton>
          <ActionButton onClick={submit} disabled={!canSubmit}>
            Criar PDI
          </ActionButton>
        </>
      }
    >
      <div className="space-y-5">
        <EnumSelect
          label="Consultor"
          value={consultantId as string}
          includeEmpty
          emptyLabel="Selecione um consultor"
          options={Object.fromEntries(
            consultants.map((c) => [c.id, `${c.name} · ${c.seniority}`]),
          )}
          onChange={(v) => {
            setConsultantId(v);
            setActions([]);
            setProfileNote(null);
          }}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Início"
            type="date"
            value={periodStart}
            required
            onChange={setPeriodStart}
          />
          <TextField
            label="Fim"
            type="date"
            value={periodEnd}
            required
            onChange={setPeriodEnd}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            size="sm"
            variant="secondary"
            icon={Sparkles}
            onClick={generate}
            disabled={loadingSuggestions || consultantId.length === 0}
          >
            {loadingSuggestions ? "Gerando…" : "Gerar a partir do gap"}
          </ActionButton>
          <ActionButton
            size="sm"
            variant="secondary"
            icon={Plus}
            onClick={addBlankAction}
          >
            Adicionar ação
          </ActionButton>
        </div>

        {profileNote ? (
          <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-soft">
            {profileNote}
          </p>
        ) : null}

        {actions.length === 0 ? (
          <p className="text-sm text-medium">
            Nenhuma ação ainda. Gere a partir do gap ou adicione manualmente. Você
            pode criar o PDI sem ações e adicioná-las depois.
          </p>
        ) : (
          <ul className="space-y-4">
            {actions.map((action, index) => (
              <li
                key={index}
                className="space-y-3 rounded-md border border-border bg-surface-muted p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  {action.targetSkillId ? (
                    <StatusBadge tone="info">
                      {skillNameById.get(action.targetSkillId) ?? "Skill alvo"}
                    </StatusBadge>
                  ) : (
                    <span className="text-xs text-soft">Sem skill alvo</span>
                  )}
                  <button
                    type="button"
                    aria-label="Remover ação"
                    onClick={() => removeAction(index)}
                    className="grid size-7 place-items-center rounded-md text-medium hover:bg-surface hover:text-danger"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <EnumSelect
                    label="Tipo"
                    value={action.type}
                    options={developmentActionTypeLabels}
                    onChange={(type) =>
                      type
                        ? updateAction(index, { type })
                        : undefined
                    }
                  />
                  <TextField
                    label="Prazo"
                    type="date"
                    value={action.dueAt}
                    onChange={(dueAt) => updateAction(index, { dueAt })}
                  />
                </div>
                <TextField
                  label="Descrição"
                  value={action.description}
                  placeholder="O que será feito"
                  onChange={(description) =>
                    updateAction(index, { description })
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
