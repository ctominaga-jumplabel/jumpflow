"use client";

import { Plus, Trash2 } from "lucide-react";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { formatMonth } from "@/lib/format";
import {
  formatDeadlineShort,
  type BusinessCalendar,
  type Competence,
  type SlaDateRule,
} from "@/lib/sla/business-days";
import { buildInvoiceWindows } from "@/lib/sla/invoice-windows";
import { SLA_MAX_INVOICE_TIERS, SLA_MAX_MONTH_OFFSET } from "@/lib/sla/schemas";
import type { SlaConfig, SlaInvoiceTierConfig } from "@/lib/sla/types";
import { focusRing, focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

const inputCls = cn(
  "rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink",
  focusRingInput,
);
const btnGhost = cn(
  "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-medium hover:bg-surface-muted disabled:opacity-60",
  focusRing,
);

export const MONTH_OFFSET_LABEL: Record<number, string> = {
  0: "do mês de competência",
  1: "do mês seguinte",
  2: "de 2 meses depois",
};

function toInt(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : Number.NaN;
}

/** Editor de uma regra de data: "[5] [dia útil] [do mês seguinte]". */
export function SlaDateRuleInput({
  rule,
  onChange,
  label,
  minMonthOffset = 0,
}: {
  rule: SlaDateRule;
  onChange: (rule: SlaDateRule) => void;
  label: string;
  minMonthOffset?: number;
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-1.5">
      <legend className="sr-only">{label}</legend>
      <input
        type="number"
        min={1}
        max={rule.kind === "FIXED_DAY" ? 31 : 23}
        inputMode="numeric"
        aria-label={`${label}: número`}
        className={cn(inputCls, "w-16")}
        value={Number.isNaN(rule.value) ? "" : rule.value}
        onChange={(e) => onChange({ ...rule, value: toInt(e.target.value) })}
      />
      <select
        aria-label={`${label}: tipo`}
        className={inputCls}
        value={rule.kind}
        onChange={(e) => onChange({ ...rule, kind: e.target.value as SlaDateRule["kind"] })}
      >
        <option value="BUSINESS_DAY">º dia útil</option>
        <option value="FIXED_DAY">dia fixo (calendário)</option>
      </select>
      <select
        aria-label={`${label}: mês`}
        className={inputCls}
        value={rule.monthOffset}
        onChange={(e) => onChange({ ...rule, monthOffset: toInt(e.target.value) })}
      >
        {Array.from({ length: SLA_MAX_MONTH_OFFSET + 1 - minMonthOffset }, (_, i) => i + minMonthOffset).map(
          (offset) => (
            <option key={offset} value={offset}>
              {MONTH_OFFSET_LABEL[offset]}
            </option>
          ),
        )}
      </select>
    </fieldset>
  );
}

const NEW_TIER: SlaInvoiceTierConfig = {
  label: "Janela 2",
  receipt: { kind: "FIXED_DAY", value: 25, monthOffset: 1 },
  payment: { kind: "FIXED_DAY", value: 30, monthOffset: 1 },
  sortOrder: 0,
  active: true,
};

/**
 * Janelas de envio da NF (SLA de Pagamento): "se a NF chegar até X, o
 * pagamento sai até Y". A janela padrão vem das etapas Envio da NF /
 * Pagamento acima; aqui o Financeiro cadastra as janelas seguintes. Prévia das
 * datas reais (com feriados) para as próximas competências.
 */
export function SlaInvoiceTiersEditor({
  config,
  onChange,
  calendar,
  competences,
}: {
  config: SlaConfig;
  onChange: (tiers: SlaInvoiceTierConfig[]) => void;
  calendar: BusinessCalendar;
  competences: Competence[];
}) {
  const tiers = config.invoiceTiers;
  const update = (index: number, patch: Partial<SlaInvoiceTierConfig>) =>
    onChange(tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  const remove = (index: number) => onChange(tiers.filter((_, i) => i !== index));
  const add = () =>
    onChange([...tiers, { ...NEW_TIER, label: `Janela ${tiers.length + 2}`, sortOrder: tiers.length }]);

  let preview: Array<{ competence: Competence; windows: ReturnType<typeof buildInvoiceWindows> }> = [];
  try {
    preview = competences.map((competence) => ({
      competence,
      windows: buildInvoiceWindows(config, competence, calendar),
    }));
  } catch {
    // Valores invalidos durante a digitacao: a validacao do formulario avisa.
    preview = [];
  }

  return (
    <SectionPanel
      title="Janelas de envio da NF"
      description="Se o consultor enviar a NF até a data de envio, o pagamento sai até a data de pagamento da janela. A janela padrão segue as etapas “Envio da NF” e “Pagamento” acima; cadastre aqui as janelas seguintes (ex.: NF até dia 25 → pagamento dia 30)."
    >
      <div className="space-y-4 px-5 py-4">
        {tiers.length === 0 ? (
          <p className="text-sm text-medium">
            Nenhuma janela adicional: NF fora da janela padrão fica sem data de pagamento definida
            pelo SLA.
          </p>
        ) : (
          <ul className="space-y-3">
            {tiers.map((tier, index) => (
              <li
                key={index}
                className={cn(
                  "grid gap-3 rounded-md border border-border p-3 lg:grid-cols-[minmax(10rem,14rem)_1fr_1fr_auto]",
                  !tier.active && "opacity-60",
                )}
              >
                <label className="grid gap-1 text-xs font-medium text-medium">
                  Nome
                  <input
                    className={inputCls}
                    value={tier.label}
                    maxLength={60}
                    onChange={(e) => update(index, { label: e.target.value })}
                  />
                </label>
                <div className="grid gap-1 text-xs font-medium text-medium">
                  NF enviada até
                  <SlaDateRuleInput
                    label={`Envio da NF em ${tier.label}`}
                    rule={tier.receipt}
                    onChange={(receipt) => update(index, { receipt })}
                  />
                </div>
                <div className="grid gap-1 text-xs font-medium text-medium">
                  Pagamento até
                  <SlaDateRuleInput
                    label={`Pagamento em ${tier.label}`}
                    rule={tier.payment}
                    onChange={(payment) => update(index, { payment })}
                  />
                </div>
                <div className="flex items-end gap-3">
                  <label className="flex items-center gap-1.5 text-sm text-medium">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-border"
                      checked={tier.active}
                      onChange={(e) => update(index, { active: e.target.checked })}
                    />
                    Ativa
                  </label>
                  <button
                    type="button"
                    className={cn(btnGhost, "px-2")}
                    aria-label={`Remover ${tier.label}`}
                    onClick={() => remove(index)}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className={btnGhost}
          disabled={tiers.length >= SLA_MAX_INVOICE_TIERS}
          onClick={add}
        >
          <Plus aria-hidden="true" className="size-4" />
          Adicionar janela
        </button>

        {preview.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Prévia das janelas de envio da NF</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-soft">
                  <th scope="col" className="py-2 pr-3">Competência</th>
                  <th scope="col" className="px-3 py-2">Janela</th>
                  <th scope="col" className="px-3 py-2">NF até</th>
                  <th scope="col" className="px-3 py-2">Pagamento até</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.flatMap(({ competence, windows }) =>
                  windows.map((w) => (
                    <tr key={`${competence.year}-${competence.month}-${w.index}`}>
                      <td className="py-1.5 pr-3 text-xs capitalize text-medium">
                        {w.index === 1 ? formatMonth(competence.month, competence.year) : ""}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-medium">
                        {w.index}. {w.label}
                      </td>
                      <td className="px-3 py-1.5 text-xs tabular-nums text-medium">
                        {formatDeadlineShort(w.receiptDeadline)}
                      </td>
                      <td className="px-3 py-1.5 text-xs font-semibold tabular-nums text-strong">
                        {formatDeadlineShort(w.paymentDate)}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </SectionPanel>
  );
}
