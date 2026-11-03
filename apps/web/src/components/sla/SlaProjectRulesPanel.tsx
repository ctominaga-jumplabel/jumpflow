"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  deleteSlaProjectRuleAction,
  saveSlaProjectRuleAction,
} from "@/app/app/sla/actions";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { Modal } from "@/components/ui/Modal";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { MONTH_OFFSET_LABEL } from "@/components/sla/SlaInvoiceTiersEditor";
import { formatMonth } from "@/lib/format";
import {
  computeProjectRuleDeadline,
  computeStageDeadline,
  formatDeadlineShort,
  slaCalendarFromHolidays,
  type Competence,
  type SlaHolidayInput,
} from "@/lib/sla/business-days";
import {
  SLA_MAX_BUSINESS_DAYS,
  SLA_MAX_MONTH_OFFSET,
  SLA_MAX_WARNING_DAYS,
  slaProjectRuleSchema,
} from "@/lib/sla/schemas";
import {
  SLA_PROJECT_RULE_MODE_LABEL,
  SLA_PROJECT_RULE_STAGES,
  SLA_STAGE_SHORT_LABEL,
  type SlaConfig,
  type SlaProjectOption,
  type SlaProjectRuleConfig,
  type SlaProjectRuleStageKey,
} from "@/lib/sla/types";
import { focusRing, focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

const inputCls = cn(
  "rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink",
  focusRingInput,
);
const btnPrimary = cn(
  "inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-brand-fill px-3 py-1.5 text-sm font-bold text-white shadow-[3px_3px_0_0_var(--color-ink)] disabled:opacity-60",
  focusRing,
);
const btnGhost = cn(
  "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-medium hover:bg-surface-muted disabled:opacity-60",
  focusRing,
);

interface Draft {
  id?: string;
  projectId: string;
  stageKey: SlaProjectRuleStageKey;
  mode: SlaProjectRuleConfig["mode"];
  businessDays: number | null;
  fixedDay: number | null;
  monthOffset: number;
  warningBusinessDays: number;
  active: boolean;
  notes: string;
}

const EMPTY_DRAFT: Draft = {
  projectId: "",
  stageKey: "BILLING_RELEASE",
  mode: "FIXED_DAY",
  businessDays: 1,
  fixedDay: 25,
  monthOffset: 0,
  warningBusinessDays: 1,
  active: true,
  notes: "",
};

function toIntOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function describeProjectRule(
  rule: Pick<SlaProjectRuleConfig, "mode" | "businessDays" | "fixedDay" | "monthOffset">,
): string {
  if (rule.mode === "FIXED_DAY") {
    return `Dia ${rule.fixedDay ?? "?"} ${MONTH_OFFSET_LABEL[rule.monthOffset] ?? ""}`.trim();
  }
  const n = rule.businessDays ?? 0;
  return n === 0 ? "Último dia útil do mês" : `${n}º dia útil do mês seguinte`;
}

/**
 * SLA por projeto do processo Horas -> Faturamento: substitui o prazo global
 * da etapa (aprovação, fechamento operacional ou liberação para faturamento)
 * nos itens do projeto — em dias úteis ou travado num dia do mês. CRUD gated
 * por SLA_PROJETOS (a action revalida no servidor).
 */
export function SlaProjectRulesPanel({
  config,
  projects,
  holidays,
  previewFrom,
  canCreate,
  canEdit,
  canDelete,
}: {
  config: SlaConfig;
  projects: SlaProjectOption[];
  holidays: SlaHolidayInput[];
  previewFrom: Competence;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { feedback, notify } = useFeedback();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SlaProjectRuleConfig | null>(null);

  const calendar = useMemo(
    () => slaCalendarFromHolidays(holidays, config.settings.considerStateHolidays),
    [holidays, config.settings.considerStateHolidays],
  );
  const rules = config.projectRules;
  const globalDeadline = (stageKey: SlaProjectRuleStageKey) => {
    const stage = config.stages.find(
      (s) => s.process === "HOURS_TO_BILLING" && s.stageKey === stageKey,
    );
    return stage ? computeStageDeadline(stage, previewFrom, config.settings, calendar) : null;
  };

  const parsed = draft
    ? slaProjectRuleSchema.safeParse({ ...draft, notes: draft.notes || null })
    : null;
  const draftError = parsed && !parsed.success ? (parsed.error.issues[0]?.message ?? "Regra inválida.") : null;
  const draftPreview =
    parsed && parsed.success ? computeProjectRuleDeadline(parsed.data, previewFrom, calendar) : null;
  const usedStages = new Set(
    rules.filter((r) => r.projectId === draft?.projectId && r.id !== draft?.id).map((r) => r.stageKey),
  );

  function openEdit(rule: SlaProjectRuleConfig) {
    setDraft({
      id: rule.id,
      projectId: rule.projectId,
      stageKey: rule.stageKey,
      mode: rule.mode,
      businessDays: rule.businessDays ?? 1,
      fixedDay: rule.fixedDay ?? 25,
      monthOffset: rule.monthOffset,
      warningBusinessDays: rule.warningBusinessDays,
      active: rule.active,
      notes: rule.notes ?? "",
    });
  }

  function save() {
    if (!parsed || !parsed.success) {
      notify("warning", draftError ?? "Regra inválida.");
      return;
    }
    startTransition(async () => {
      const result = await saveSlaProjectRuleAction(parsed.data);
      if (!result.ok) {
        notify("warning", result.message);
        return;
      }
      notify("success", "SLA do projeto salvo.");
      setDraft(null);
      router.refresh();
    });
  }

  function remove(rule: SlaProjectRuleConfig) {
    startTransition(async () => {
      const result = await deleteSlaProjectRuleAction({ id: rule.id });
      if (!result.ok) {
        notify("warning", result.message);
        return;
      }
      notify("success", "SLA do projeto removido: volta a valer o prazo global.");
      setConfirmDelete(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <FeedbackBanner message={feedback} />
      <SectionPanel
        title="SLA por projeto (Horas → Faturamento)"
        description={`Prazo próprio de um projeto para aprovação, fechamento operacional ou liberação para faturamento — em dias úteis ou travado num dia do mês. Os demais projetos seguem o prazo global. Prévia para a competência ${formatMonth(previewFrom.month, previewFrom.year)}.`}
        action={
          canCreate ? (
            <button type="button" className={btnPrimary} onClick={() => setDraft({ ...EMPTY_DRAFT })}>
              <Plus aria-hidden="true" className="size-4" />
              Novo SLA de projeto
            </button>
          ) : null
        }
      >
        {rules.length === 0 ? (
          <p className="px-5 py-4 text-sm text-medium">
            Nenhum projeto com SLA próprio: todos seguem os prazos globais do faturamento.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">SLA por projeto</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-soft">
                  <th scope="col" className="px-5 py-3">Projeto</th>
                  <th scope="col" className="px-3 py-3">Etapa</th>
                  <th scope="col" className="px-3 py-3">Regra</th>
                  <th scope="col" className="px-3 py-3">Prazo (prévia)</th>
                  <th scope="col" className="px-3 py-3">Global</th>
                  <th scope="col" className="px-3 py-3">Aviso</th>
                  <th scope="col" className="px-5 py-3 text-right">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rules.map((rule) => {
                  const global = globalDeadline(rule.stageKey);
                  return (
                    <tr key={rule.id} className={cn(!rule.active && "opacity-60")}>
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-strong">{rule.projectName}</p>
                        <p className="text-xs text-soft">
                          {rule.clientName}
                          {rule.active ? "" : " · inativa"}
                        </p>
                        {rule.notes ? <p className="text-xs text-medium">{rule.notes}</p> : null}
                      </td>
                      <td className="px-3 py-2.5 text-medium">{SLA_STAGE_SHORT_LABEL[rule.stageKey]}</td>
                      <td className="px-3 py-2.5 text-medium">{describeProjectRule(rule)}</td>
                      <td className="px-3 py-2.5 font-semibold tabular-nums text-strong">
                        {formatDeadlineShort(computeProjectRuleDeadline(rule, previewFrom, calendar))}
                      </td>
                      <td className="px-3 py-2.5 text-xs tabular-nums text-soft">
                        {global ? formatDeadlineShort(global) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-medium">
                        {rule.warningBusinessDays} dia(s) útil(eis)
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex justify-end gap-1.5">
                          {canEdit ? (
                            <button
                              type="button"
                              className={cn(btnGhost, "px-2")}
                              aria-label={`Editar SLA de ${rule.projectName}`}
                              onClick={() => openEdit(rule)}
                            >
                              <Pencil aria-hidden="true" className="size-4" />
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              type="button"
                              className={cn(btnGhost, "px-2")}
                              aria-label={`Remover SLA de ${rule.projectName}`}
                              onClick={() => setConfirmDelete(rule)}
                            >
                              <Trash2 aria-hidden="true" className="size-4" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionPanel>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Editar SLA do projeto" : "Novo SLA de projeto"}
        description="Substitui o prazo global da etapa só para este projeto."
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => setDraft(null)}>
              Cancelar
            </button>
            <button type="button" className={btnPrimary} disabled={pending || !!draftError} onClick={save}>
              {pending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        }
      >
        {draft ? (
          <div className="grid gap-4">
            <label className="grid gap-1 text-xs font-medium text-medium">
              Projeto
              <SearchableSelect
                className={inputCls}
                value={draft.projectId}
                disabled={Boolean(draft.id)}
                onChange={(e) => setDraft({ ...draft, projectId: e.target.value })}
              >
                <option value="">Selecione…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.clientName}
                  </option>
                ))}
              </SearchableSelect>
            </label>
            <label className="grid gap-1 text-xs font-medium text-medium">
              Etapa
              <select
                className={inputCls}
                value={draft.stageKey}
                disabled={Boolean(draft.id)}
                onChange={(e) =>
                  setDraft({ ...draft, stageKey: e.target.value as SlaProjectRuleStageKey })
                }
              >
                {SLA_PROJECT_RULE_STAGES.map((key) => (
                  <option key={key} value={key} disabled={usedStages.has(key)}>
                    {SLA_STAGE_SHORT_LABEL[key]}
                    {usedStages.has(key) ? " (já cadastrada)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="grid gap-2">
              <legend className="text-xs font-medium text-medium">Tipo de prazo</legend>
              <div className="flex flex-wrap gap-4">
                {(["BUSINESS_DAYS", "FIXED_DAY"] as const).map((mode) => (
                  <label key={mode} className="flex items-center gap-1.5 text-sm text-medium">
                    <input
                      type="radio"
                      name="sla-project-mode"
                      checked={draft.mode === mode}
                      onChange={() => setDraft({ ...draft, mode })}
                    />
                    {SLA_PROJECT_RULE_MODE_LABEL[mode]}
                  </label>
                ))}
              </div>
            </fieldset>
            {draft.mode === "BUSINESS_DAYS" ? (
              <label className="grid gap-1 text-xs font-medium text-medium">
                Dias úteis após o fim do mês (0 = último dia útil da competência)
                <input
                  type="number"
                  min={0}
                  max={SLA_MAX_BUSINESS_DAYS}
                  inputMode="numeric"
                  className={cn(inputCls, "w-24")}
                  value={draft.businessDays ?? ""}
                  onChange={(e) => setDraft({ ...draft, businessDays: toIntOrNull(e.target.value) })}
                />
              </label>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <label className="grid gap-1 text-xs font-medium text-medium">
                  Dia do mês
                  <input
                    type="number"
                    min={1}
                    max={31}
                    inputMode="numeric"
                    className={cn(inputCls, "w-20")}
                    value={draft.fixedDay ?? ""}
                    onChange={(e) => setDraft({ ...draft, fixedDay: toIntOrNull(e.target.value) })}
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-medium">
                  Mês
                  <select
                    className={inputCls}
                    value={draft.monthOffset}
                    onChange={(e) => setDraft({ ...draft, monthOffset: Number(e.target.value) })}
                  >
                    {Array.from({ length: SLA_MAX_MONTH_OFFSET + 1 }, (_, i) => i).map((offset) => (
                      <option key={offset} value={offset}>
                        {MONTH_OFFSET_LABEL[offset]}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="w-full text-xs text-soft">
                  Se o dia cair em fim de semana ou feriado, o prazo é antecipado para o dia útil
                  anterior.
                </p>
              </div>
            )}
            <label className="grid gap-1 text-xs font-medium text-medium">
              Aviso (dias úteis antes do prazo)
              <input
                type="number"
                min={0}
                max={SLA_MAX_WARNING_DAYS}
                inputMode="numeric"
                className={cn(inputCls, "w-24")}
                value={draft.warningBusinessDays}
                onChange={(e) =>
                  setDraft({ ...draft, warningBusinessDays: toIntOrNull(e.target.value) ?? 0 })
                }
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-medium">
              Observação (opcional)
              <input
                className={inputCls}
                maxLength={200}
                value={draft.notes}
                placeholder="Ex.: cliente fecha a medição no dia 25"
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-medium">
              <input
                type="checkbox"
                className="size-4 rounded border-border"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              Regra ativa
            </label>
            {draftError ? (
              <p role="alert" className="text-sm font-semibold text-danger">
                {draftError}
              </p>
            ) : draftPreview ? (
              <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-medium">
                Prazo na competência {formatMonth(previewFrom.month, previewFrom.year)}:{" "}
                <strong className="text-strong">{formatDeadlineShort(draftPreview)}</strong>
                {(() => {
                  const global = globalDeadline(draft.stageKey);
                  return global ? <> (global: {formatDeadlineShort(global)})</> : null;
                })()}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Remover SLA do projeto?"
        description={
          confirmDelete
            ? `${confirmDelete.projectName} — ${SLA_STAGE_SHORT_LABEL[confirmDelete.stageKey]} volta a seguir o prazo global.`
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => setConfirmDelete(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={pending}
              onClick={() => confirmDelete && remove(confirmDelete)}
            >
              {pending ? "Removendo…" : "Remover"}
            </button>
          </div>
        }
      >
        <p className="text-sm text-medium">A alteração é auditada.</p>
      </Modal>
    </div>
  );
}
