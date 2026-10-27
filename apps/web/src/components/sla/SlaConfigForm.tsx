"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { saveSlaConfigAction } from "@/app/app/sla/actions";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { formatMonth } from "@/lib/format";
import {
  formatDeadlineShort,
  slaCalendarFromHolidays,
  type Competence,
  type SlaHolidayInput,
} from "@/lib/sla/business-days";
import {
  previewDeadlines,
  slaConfigUpdateSchema,
  stageOrderWarnings,
  SLA_MAX_BUSINESS_DAYS,
  SLA_MAX_WARNING_DAYS,
} from "@/lib/sla/schemas";
import {
  SLA_ANCHOR_LABEL,
  SLA_AREA_LABEL,
  SLA_PROCESS_LABEL,
  SLA_PROCESSES,
  type SlaConfig,
  type SlaStageConfig,
} from "@/lib/sla/types";
import { focusRing, focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

const inputCls = cn(
  "rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink",
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

function toInt(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : Number.NaN;
}

function anchorHint(stage: SlaStageConfig): string {
  if (stage.anchor === "COMPETENCE_MONTH_END") {
    return stage.businessDays === 0
      ? "último dia útil do mês"
      : `${stage.businessDays}º dia útil do mês seguinte`;
  }
  return stage.businessDays === 0
    ? "no dia do pagamento"
    : `${stage.businessDays} dia(s) útil(eis) antes do pagamento`;
}

/**
 * Configuracao do SLA (ADMIN/FINANCE): dia de pagamento, feriados estaduais e,
 * por etapa, nome / dias uteis / aviso / ativa. Previa ao vivo dos prazos das
 * proximas 3 competencias com o calendario de feriados real e avisos de ordem.
 * A validacao do navegador espelha o Zod do servidor (a action revalida).
 */
export function SlaConfigForm({
  initial,
  holidays,
  previewFrom,
}: {
  initial: SlaConfig;
  holidays: SlaHolidayInput[];
  previewFrom: Competence;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<SlaConfig>(initial);
  const [pending, startTransition] = useTransition();
  const { feedback, notify } = useFeedback();

  const calendar = useMemo(
    () => slaCalendarFromHolidays(holidays, config.settings.considerStateHolidays),
    [holidays, config.settings.considerStateHolidays],
  );

  const payload = {
    settings: config.settings,
    stages: config.stages.map((s) => ({
      process: s.process,
      stageKey: s.stageKey,
      label: s.label,
      businessDays: s.businessDays,
      warningBusinessDays: s.warningBusinessDays,
      active: s.active,
    })),
  };
  const validation = slaConfigUpdateSchema.safeParse(payload);
  const validationError = validation.success ? null : (validation.error.issues[0]?.message ?? "Configuração inválida.");

  const preview = useMemo(
    () => (validation.success ? previewDeadlines(config, previewFrom, 3, calendar) : []),
    [validation.success, config, previewFrom, calendar],
  );
  const warnings = useMemo(
    () =>
      validation.success
        ? stageOrderWarnings(config, preview.map((p) => p.competence), calendar)
        : [],
    [validation.success, config, preview, calendar],
  );
  const dirty = JSON.stringify(config) !== JSON.stringify(initial);

  function updateStage(stage: SlaStageConfig, patch: Partial<SlaStageConfig>) {
    setConfig((prev) => ({
      ...prev,
      stages: prev.stages.map((s) =>
        s.process === stage.process && s.stageKey === stage.stageKey ? { ...s, ...patch } : s,
      ),
    }));
  }

  function save() {
    if (!validation.success) {
      notify("warning", validationError ?? "Configuração inválida.");
      return;
    }
    startTransition(async () => {
      const result = await saveSlaConfigAction(payload);
      if (!result.ok) {
        notify("warning", result.message);
        return;
      }
      notify(
        result.data.warnings.length ? "info" : "success",
        result.data.warnings.length
          ? `Configuração salva, com ${result.data.warnings.length} aviso(s) de ordem dos prazos.`
          : "Configuração de SLA salva.",
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <FeedbackBanner message={feedback} />

      <SectionPanel
        title="Parâmetros gerais"
        description="Valem para todos os prazos. Alterações são auditadas."
      >
        <div className="flex flex-wrap items-end gap-6 px-5 py-4">
          <label className="grid gap-1 text-xs font-medium text-medium">
            Dia de pagamento (mês seguinte à competência)
            <input
              type="number"
              min={1}
              max={31}
              inputMode="numeric"
              className={cn(inputCls, "w-24")}
              value={Number.isNaN(config.settings.paymentDay) ? "" : config.settings.paymentDay}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  settings: { ...prev.settings, paymentDay: toInt(e.target.value) },
                }))
              }
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-medium">
            <input
              type="checkbox"
              className="size-4 rounded border-border"
              checked={config.settings.considerStateHolidays}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  settings: { ...prev.settings, considerStateHolidays: e.target.checked },
                }))
              }
            />
            Considerar feriados estaduais no cálculo de dias úteis
          </label>
          <p className="max-w-md text-xs text-soft">
            Se o dia de pagamento cair em fim de semana ou feriado, o pagamento é antecipado para o
            dia útil anterior. Feriados nacionais sempre contam; municipais e folgas de cliente não.
          </p>
        </div>
      </SectionPanel>

      {SLA_PROCESSES.map((process) => {
        const stages = config.stages
          .filter((s) => s.process === process)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        return (
          <SectionPanel
            key={process}
            title={SLA_PROCESS_LABEL[process]}
            description="Dias úteis contados a partir da âncora da etapa. Aviso = quantos dias úteis antes do prazo a etapa entra em risco (lembretes “faltam N dias”)."
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Etapas de {SLA_PROCESS_LABEL[process]}</caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-soft">
                    <th scope="col" className="px-5 py-3">Etapa</th>
                    <th scope="col" className="px-3 py-3">Área · âncora</th>
                    <th scope="col" className="px-3 py-3">Dias úteis</th>
                    <th scope="col" className="px-3 py-3">Aviso</th>
                    <th scope="col" className="px-3 py-3">Ativa</th>
                    {preview.map((p) => (
                      <th key={`${p.competence.year}-${p.competence.month}`} scope="col" className="px-3 py-3">
                        {formatMonth(p.competence.month, p.competence.year)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stages.map((stage) => {
                    const id = `${stage.process}-${stage.stageKey}`;
                    return (
                      <tr key={id} className={cn(!stage.active && "opacity-60")}>
                        <td className="px-5 py-2">
                          <label className="sr-only" htmlFor={`${id}-label`}>
                            Nome da etapa
                          </label>
                          <input
                            id={`${id}-label`}
                            className={cn(inputCls, "w-full min-w-48")}
                            value={stage.label}
                            maxLength={80}
                            onChange={(e) => updateStage(stage, { label: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2 text-xs text-medium">
                          <p className="font-semibold">{SLA_AREA_LABEL[stage.area]}</p>
                          <p className="text-soft">
                            {SLA_ANCHOR_LABEL[stage.anchor]} — {anchorHint(stage)}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            max={SLA_MAX_BUSINESS_DAYS}
                            inputMode="numeric"
                            aria-label={`Dias úteis de ${stage.label}`}
                            className={cn(inputCls, "w-20")}
                            value={Number.isNaN(stage.businessDays) ? "" : stage.businessDays}
                            onChange={(e) => updateStage(stage, { businessDays: toInt(e.target.value) })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            max={SLA_MAX_WARNING_DAYS}
                            inputMode="numeric"
                            aria-label={`Dias úteis de aviso de ${stage.label}`}
                            className={cn(inputCls, "w-20")}
                            value={Number.isNaN(stage.warningBusinessDays) ? "" : stage.warningBusinessDays}
                            onChange={(e) =>
                              updateStage(stage, { warningBusinessDays: toInt(e.target.value) })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label={`Etapa ${stage.label} ativa`}
                            className="size-4 rounded border-border"
                            checked={stage.active}
                            onChange={(e) => updateStage(stage, { active: e.target.checked })}
                          />
                        </td>
                        {preview.map((p) => (
                          <td
                            key={`${p.competence.year}-${p.competence.month}`}
                            className="px-3 py-2 text-xs tabular-nums text-medium"
                          >
                            {stage.active
                              ? formatDeadlineShort(p.deadlines[`${stage.process}:${stage.stageKey}`])
                              : "—"}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {process === "HOURS_TO_PAYMENT" && preview.length > 0 ? (
                    <tr className="bg-surface-muted/50">
                      <td className="px-5 py-2 text-xs font-semibold text-medium" colSpan={5}>
                        Data de pagamento (dia {config.settings.paymentDay}, ajustada)
                      </td>
                      {preview.map((p) => (
                        <td
                          key={`${p.competence.year}-${p.competence.month}`}
                          className="px-3 py-2 text-xs font-semibold tabular-nums text-strong"
                        >
                          {formatDeadlineShort(p.paymentDate)}
                        </td>
                      ))}
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </SectionPanel>
        );
      })}

      {validationError ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {validationError}
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <div
          role="status"
          className="rounded-[var(--radius-card)] border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning"
        >
          <p className="flex items-center gap-1.5 font-semibold">
            <TriangleAlert aria-hidden="true" className="size-4" />
            Avisos de ordem dos prazos (não impedem salvar)
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          className={btnGhost}
          disabled={!dirty || pending}
          onClick={() => setConfig(initial)}
        >
          Descartar alterações
        </button>
        <button type="button" className={btnPrimary} disabled={!dirty || pending || !!validationError} onClick={save}>
          {pending ? "Salvando…" : "Salvar configuração"}
        </button>
      </div>
    </div>
  );
}
