"use client";

import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import type { ReceivableInput } from "@/lib/projects/schemas";
import type { ReceivableStatus } from "@/lib/projects/types";
import { cn } from "@/lib/utils";
import { DateField, NumberField, fieldClass } from "./fields";

export const receivableStatusLabels: Record<ReceivableStatus, string> = {
  FORECAST: "Previsto",
  RECEIVED: "Recebido",
  CANCELLED: "Cancelado",
};

/**
 * Recebimento previsto do cliente (ProjectReceivableSchedule — lado receita).
 * Espelha o SaleRateModal: parcela com data, valor, rótulo e situação. Editado
 * por perfis comercial/financeiro (o gate vive na view e na server action).
 */
export function ReceivableModal({
  value,
  isEditing = false,
  isPending,
  onChange,
  onClose,
  onSave,
}: {
  value: ReceivableInput;
  isEditing?: boolean;
  isPending: boolean;
  onChange: (value: ReceivableInput) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? "Editar recebimento" : "Recebimento previsto"}
      description="Parcela de recebimento do cliente: data, valor e situação."
      footer={
        <>
          <ActionButton variant="secondary" onClick={onClose}>
            Cancelar
          </ActionButton>
          <ActionButton
            disabled={isPending || !value.label.trim() || !value.amount}
            onClick={onSave}
          >
            Salvar
          </ActionButton>
        </>
      }
    >
      <form className="grid gap-4 md:grid-cols-2">
        <DateField
          label="Data de vencimento"
          value={value.dueAt}
          onChange={(next) => onChange({ ...value, dueAt: next })}
        />
        <NumberField
          label="Valor"
          value={value.amount}
          onChange={(next) => onChange({ ...value, amount: next ?? 0 })}
        />
        <label className="space-y-1 text-sm font-medium text-medium">
          Rótulo
          <input
            value={value.label}
            onChange={(event) => onChange({ ...value, label: event.target.value })}
            className={fieldClass()}
          />
        </label>
        <label className="space-y-1 text-sm font-medium text-medium">
          Situação
          <select
            value={value.status}
            onChange={(event) =>
              onChange({
                ...value,
                status: event.target.value as ReceivableStatus,
              })
            }
            className={fieldClass()}
          >
            {(["FORECAST", "RECEIVED", "CANCELLED"] as ReceivableStatus[]).map(
              (item) => (
                <option key={item} value={item}>
                  {receivableStatusLabels[item]}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-medium md:col-span-2">
          Nota
          <textarea
            value={value.note ?? ""}
            onChange={(event) => onChange({ ...value, note: event.target.value })}
            className={cn(fieldClass(), "min-h-20 py-2")}
          />
        </label>
      </form>
    </Modal>
  );
}
