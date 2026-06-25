"use client";

import type { ProjectBillingConfigInput } from "@/lib/projects/schemas";
import { cn } from "@/lib/utils";
import {
  CheckboxField,
  EnumSelect,
  NumberField,
  fieldClass,
} from "./fields";
import {
  adjustmentLabels,
  billingRoundingLabels,
  overageLabels,
  overtimeAppliesToLabels,
  periodicityLabels,
} from "./labels";

/**
 * Formulário do motor de cobrança parametrizável (ProjectBillingConfig),
 * editado pelo Financeiro. Todos os campos são opcionais: cada tipo de cobrança
 * usa apenas os que fazem sentido — o cabeçalho lembra o modelo do projeto.
 * Quando `readOnly`, todos os controles ficam desabilitados (visão de contexto).
 */
export function BillingConfigPanel({
  chargeType,
  value,
  readOnly = false,
  onChange,
}: {
  chargeType?: string;
  value: ProjectBillingConfigInput;
  readOnly?: boolean;
  onChange: (value: ProjectBillingConfigInput) => void;
}) {
  function groupTitle(text: string) {
    return (
      <p className="md:col-span-2 text-xs font-semibold uppercase tracking-wide text-soft">
        {text}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-medium">
        Modelo de cálculo do projeto:{" "}
        <span className="font-semibold text-strong">{chargeType ?? "não definido"}</span>.
        Preencha apenas os parâmetros usados por este modelo.
      </p>
      <form className="grid gap-4 md:grid-cols-2">
        {groupTitle("Periodicidade e datas")}
        <EnumSelect
          label="Periodicidade"
          value={value.periodicity}
          options={periodicityLabels}
          disabled={readOnly}
          onChange={(periodicity) => onChange({ ...value, periodicity })}
        />
        <NumberField
          label="Dia de fechamento"
          value={value.closingDay}
          disabled={readOnly}
          onChange={(closingDay) => onChange({ ...value, closingDay })}
        />
        <NumberField
          label="Dia de vencimento"
          value={value.dueDay}
          disabled={readOnly}
          onChange={(dueDay) => onChange({ ...value, dueDay })}
        />

        {groupTitle("Cálculo e excedentes")}
        <EnumSelect
          label="Arredondamento"
          value={value.roundingRule}
          options={billingRoundingLabels}
          disabled={readOnly}
          onChange={(roundingRule) => onChange({ ...value, roundingRule })}
        />
        <NumberField
          label="Valor fixo / mensalidade (R$)"
          value={value.fixedAmount}
          disabled={readOnly}
          onChange={(fixedAmount) => onChange({ ...value, fixedAmount })}
        />
        <NumberField
          label="Horas inclusas (franquia)"
          value={value.includedHours}
          disabled={readOnly}
          onChange={(includedHours) => onChange({ ...value, includedHours })}
        />
        <NumberField
          label="Valor hora excedente (R$)"
          value={value.overageRate}
          disabled={readOnly}
          onChange={(overageRate) => onChange({ ...value, overageRate })}
        />
        <EnumSelect
          label="Tratamento de excedentes"
          value={value.overageTreatment}
          options={overageLabels}
          disabled={readOnly}
          onChange={(overageTreatment) =>
            onChange({ ...value, overageTreatment })
          }
        />
        <NumberField
          label="Valor por consultor alocado (R$)"
          value={value.perConsultantAmount}
          disabled={readOnly}
          onChange={(perConsultantAmount) =>
            onChange({ ...value, perConsultantAmount })
          }
        />

        {groupTitle("Reembolsos, descontos e multas")}
        <CheckboxField
          label="Despesas reembolsáveis"
          checked={value.reimbursableExpenses}
          disabled={readOnly}
          onChange={(reimbursableExpenses) =>
            onChange({ ...value, reimbursableExpenses })
          }
        />
        <NumberField
          label="Markup sobre reembolso (%)"
          value={value.reimbursableMarkupPct}
          disabled={readOnly}
          onChange={(reimbursableMarkupPct) =>
            onChange({ ...value, reimbursableMarkupPct })
          }
        />
        <NumberField
          label="Desconto (%)"
          value={value.discountPct}
          disabled={readOnly}
          onChange={(discountPct) => onChange({ ...value, discountPct })}
        />
        <NumberField
          label="Multa (%)"
          value={value.penaltyPct}
          disabled={readOnly}
          onChange={(penaltyPct) => onChange({ ...value, penaltyPct })}
        />

        {groupTitle("Reajuste e impostos")}
        <EnumSelect
          label="Índice de reajuste"
          value={value.adjustmentIndex}
          options={adjustmentLabels}
          hint="IPCA/IGP-M/CDI ficam registrados; apenas o percentual fixo é aplicado automaticamente."
          disabled={readOnly}
          onChange={(adjustmentIndex) => onChange({ ...value, adjustmentIndex })}
        />
        <NumberField
          label="Percentual de reajuste (%)"
          value={value.adjustmentPct}
          disabled={readOnly}
          onChange={(adjustmentPct) => onChange({ ...value, adjustmentPct })}
        />
        <CheckboxField
          label="Reter ISS"
          checked={value.withholdIss}
          disabled={readOnly}
          onChange={(withholdIss) => onChange({ ...value, withholdIss })}
        />
        <NumberField
          label="Retenção de impostos (%)"
          value={value.withholdingPct}
          disabled={readOnly}
          onChange={(withholdingPct) => onChange({ ...value, withholdingPct })}
        />

        {groupTitle("Hora extra e férias")}
        <EnumSelect
          label="Cobrar hora extra para"
          value={value.overtimeAppliesTo}
          options={overtimeAppliesToLabels}
          disabled={readOnly}
          onChange={(overtimeAppliesTo) =>
            onChange({ ...value, overtimeAppliesTo })
          }
        />
        <NumberField
          label="% sobre a hora extra"
          value={value.overtimeBillingPct}
          disabled={readOnly}
          onChange={(overtimeBillingPct) =>
            onChange({ ...value, overtimeBillingPct })
          }
        />
        <NumberField
          label="Limite de HE antes do excedente (h)"
          value={value.overtimeExcessHours}
          disabled={readOnly}
          onChange={(overtimeExcessHours) =>
            onChange({ ...value, overtimeExcessHours })
          }
        />
        <NumberField
          label="Valor por hora extra excedente (R$)"
          value={value.overtimeExcessRate}
          disabled={readOnly}
          onChange={(overtimeExcessRate) =>
            onChange({ ...value, overtimeExcessRate })
          }
        />
        <div className="md:col-span-2">
          <CheckboxField
            label="Cobrar o cliente durante as férias do consultor"
            checked={value.billDuringVacation}
            disabled={readOnly}
            onChange={(billDuringVacation) =>
              onChange({ ...value, billDuringVacation })
            }
          />
        </div>

        {groupTitle("Aprovação e observações")}
        <div className="md:col-span-2">
          <CheckboxField
            label="Exigir aprovação antes da emissão da nota"
            checked={value.requireApproval}
            disabled={readOnly}
            onChange={(requireApproval) =>
              onChange({ ...value, requireApproval })
            }
          />
        </div>
        <label className="md:col-span-2 space-y-1 text-sm font-medium text-medium">
          Observações
          <textarea
            value={value.notes ?? ""}
            disabled={readOnly}
            onChange={(event) => onChange({ ...value, notes: event.target.value })}
            className={cn(fieldClass(), "min-h-20 py-2")}
          />
        </label>
      </form>
    </div>
  );
}
