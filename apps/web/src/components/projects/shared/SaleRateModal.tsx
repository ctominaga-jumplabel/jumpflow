"use client";

import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import type { SaleRateInput } from "@/lib/projects/schemas";
import type { ProjectConsultantOption } from "@/lib/projects/types";
import { cn } from "@/lib/utils";
import { DateField, NumberField, fieldClass } from "./fields";

/**
 * Valor de venda (ProjectSaleRate) por escopo e vigência. Compartilhado pelo
 * detalhe 360 (Operação) e pela superfície Comercial.
 */
export function SaleRateModal({
  value,
  consultants,
  allocations,
  isPending,
  onChange,
  onClose,
  onSave,
}: {
  value: SaleRateInput;
  consultants: ProjectConsultantOption[];
  allocations: { id: string; label: string }[];
  isPending: boolean;
  onChange: (value: SaleRateInput) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Valor de venda"
      description="Valor comercial por escopo e vigência."
      footer={
        <>
          <ActionButton variant="secondary" onClick={onClose}>
            Cancelar
          </ActionButton>
          <ActionButton disabled={isPending} onClick={onSave}>
            Salvar
          </ActionButton>
        </>
      }
    >
      <form className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-medium">
          Escopo
          <select
            value={
              value.allocationId
                ? `allocation:${value.allocationId}`
                : value.consultantId
                  ? `consultant:${value.consultantId}`
                  : "project"
            }
            onChange={(event) => {
              const [kind, id] = event.target.value.split(":");
              onChange({
                ...value,
                allocationId: kind === "allocation" ? id : undefined,
                consultantId: kind === "consultant" ? id : undefined,
              });
            }}
            className={fieldClass()}
          >
            <option value="project">Projeto</option>
            {consultants.map((consultant) => (
              <option key={consultant.id} value={`consultant:${consultant.id}`}>
                {consultant.name}
              </option>
            ))}
            {allocations.map((allocation) => (
              <option key={allocation.id} value={`allocation:${allocation.id}`}>
                {allocation.label}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="Valor hora"
          value={value.hourlyRate}
          onChange={(next) => onChange({ ...value, hourlyRate: next ?? 0 })}
        />
        <DateField
          label="Inicio"
          value={value.startsAt}
          onChange={(next) => onChange({ ...value, startsAt: next })}
        />
        <DateField
          label="Fim"
          value={value.endsAt ?? ""}
          onChange={(next) => onChange({ ...value, endsAt: next || undefined })}
        />
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
