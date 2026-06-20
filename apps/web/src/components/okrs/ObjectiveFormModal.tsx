"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import type { FeedbackTone } from "@/components/ui/Feedback";
import { createObjective } from "@/app/app/metas/actions";
import {
  objectiveScopeLabels,
  type ConsultantOption,
  type ObjectiveScope,
  type ProjectOption,
} from "@/lib/okrs/types";
import { EnumSelect, TextAreaField, TextField } from "./fields";
import {
  KeyResultDraftEditor,
  emptyKeyResultDraft,
  type KeyResultDraft,
} from "./KeyResultDraftEditor";

export interface ObjectiveFormModalProps {
  open: boolean;
  onClose: () => void;
  consultants: ConsultantOption[];
  projects: ProjectOption[];
  notify: (tone: FeedbackTone, text: string) => void;
}

/** Converte string do input para número; vazio → 0. */
function num(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Criação de objetivo + Key Results (US OKR.01/02). O gestor escolhe o escopo e
 * o vínculo (consultor/projeto/referência), o período e cadastra vários KRs. O
 * servidor revalida RBAC (canManageObjective por escopo/linha), Zod e a
 * aplicabilidade do autoSource. Nada é gravado sem confirmação.
 */
export function ObjectiveFormModal({
  open,
  onClose,
  consultants,
  projects,
  notify,
}: ObjectiveFormModalProps) {
  const [pending, startTransition] = useTransition();
  const [scope, setScope] = useState<ObjectiveScope>("CONSULTANT");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [consultantId, setConsultantId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [referenceKey, setReferenceKey] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [keyResults, setKeyResults] = useState<KeyResultDraft[]>([]);

  function reset() {
    setScope("CONSULTANT");
    setTitle("");
    setDescription("");
    setConsultantId("");
    setProjectId("");
    setReferenceKey("");
    setPeriodStart("");
    setPeriodEnd("");
    setKeyResults([]);
  }

  function close() {
    reset();
    onClose();
  }

  function changeScope(next: ObjectiveScope) {
    setScope(next);
    // Limpa vínculos e fontes que deixam de fazer sentido no novo escopo.
    setConsultantId("");
    setProjectId("");
    setReferenceKey("");
    setKeyResults((prev) => prev.map((kr) => ({ ...kr, autoSource: "" })));
  }

  function addKr() {
    setKeyResults((prev) => [...prev, emptyKeyResultDraft()]);
  }

  function patchKr(index: number, patch: Partial<KeyResultDraft>) {
    setKeyResults((prev) =>
      prev.map((kr, i) => (i === index ? { ...kr, ...patch } : kr)),
    );
  }

  function removeKr(index: number) {
    setKeyResults((prev) => prev.filter((_, i) => i !== index));
  }

  function submit() {
    startTransition(async () => {
      const payloadKrs = keyResults
        .filter((kr) => kr.title.trim().length >= 3 && kr.targetValue !== "")
        .map((kr) => ({
          title: kr.title.trim(),
          metricType: kr.metricType,
          startValue: num(kr.startValue),
          targetValue: num(kr.targetValue),
          currentValue: num(kr.currentValue),
          unit: kr.unit.trim() ? kr.unit.trim() : null,
          autoSource: kr.autoSource ? kr.autoSource : null,
        }));
      const result = await createObjective({
        scope,
        title,
        description: description.trim() ? description.trim() : null,
        consultantId: scope === "CONSULTANT" ? consultantId : null,
        projectId: scope === "PROJECT" ? projectId : null,
        referenceKey:
          scope === "AREA" || scope === "COMPANY" ? referenceKey : null,
        periodStart,
        periodEnd,
        keyResults: payloadKrs,
      });
      if (result.ok) {
        close();
        notify("success", "Objetivo criado como rascunho. Ative para acompanhar.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  const scopeLinkValid =
    (scope === "CONSULTANT" && consultantId.length > 0) ||
    (scope === "PROJECT" && projectId.length > 0) ||
    ((scope === "AREA" || scope === "COMPANY") &&
      referenceKey.trim().length > 0);

  const canSubmit =
    !pending &&
    title.trim().length >= 3 &&
    periodStart.length > 0 &&
    periodEnd.length > 0 &&
    periodStart < periodEnd &&
    scopeLinkValid;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Novo objetivo"
      description="Defina o escopo, o período e os Key Results. O objetivo nasce como rascunho."
      className="max-w-2xl"
      footer={
        <>
          <ActionButton variant="secondary" onClick={close} disabled={pending}>
            Cancelar
          </ActionButton>
          <ActionButton onClick={submit} disabled={!canSubmit}>
            Criar objetivo
          </ActionButton>
        </>
      }
    >
      <div className="space-y-5">
        <EnumSelect
          label="Escopo"
          value={scope}
          options={objectiveScopeLabels}
          onChange={(v) => (v ? changeScope(v) : undefined)}
        />

        {scope === "CONSULTANT" ? (
          <EnumSelect
            label="Consultor"
            value={consultantId}
            includeEmpty
            emptyLabel="Selecione um consultor"
            options={Object.fromEntries(
              consultants.map((c) => [c.id, `${c.name} · ${c.seniority}`]),
            )}
            onChange={setConsultantId}
          />
        ) : null}

        {scope === "PROJECT" ? (
          <EnumSelect
            label="Projeto"
            value={projectId}
            includeEmpty
            emptyLabel="Selecione um projeto"
            options={Object.fromEntries(projects.map((p) => [p.id, p.name]))}
            onChange={setProjectId}
          />
        ) : null}

        {scope === "AREA" || scope === "COMPANY" ? (
          <TextField
            label={scope === "AREA" ? "Área" : "Empresa / referência"}
            value={referenceKey}
            placeholder={scope === "AREA" ? "Ex.: Engenharia" : "Ex.: Jump Label"}
            onChange={setReferenceKey}
          />
        ) : null}

        <TextField
          label="Título do objetivo"
          value={title}
          placeholder="Ex.: Elevar a entrega faturável do time"
          onChange={setTitle}
        />

        <TextAreaField
          label="Descrição (opcional)"
          value={description}
          placeholder="Contexto e racional do objetivo"
          onChange={setDescription}
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

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-strong">Key Results</h3>
          <ActionButton
            size="sm"
            variant="secondary"
            icon={Plus}
            onClick={addKr}
          >
            Adicionar KR
          </ActionButton>
        </div>

        {keyResults.length === 0 ? (
          <p className="text-sm text-medium">
            Nenhum Key Result ainda. Adicione ao menos um para medir o objetivo.
            Você pode criar o objetivo sem KRs e adicioná-los depois.
          </p>
        ) : (
          <ul className="space-y-4">
            {keyResults.map((kr, index) => (
              <KeyResultDraftEditor
                key={index}
                draft={kr}
                scope={scope}
                onChange={(patch) => patchKr(index, patch)}
                onRemove={() => removeKr(index)}
              />
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
