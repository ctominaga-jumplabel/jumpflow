"use client";

import { useMemo, useState } from "react";
import { Save, Send } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ActionButton } from "@/components/ui/ActionButton";
import { ExpenseAttachmentField } from "./ExpenseAttachmentField";
import { cn } from "@/lib/utils";
import { focusRingInput } from "@/lib/styles";
import type {
  ExpenseAttachment,
  NewExpenseInput,
} from "@/lib/mock-data/expenses";

export interface ExpenseFormProject {
  id: string;
  name: string;
  clientName: string;
}

export type ExpenseSubmitMode = "DRAFT" | "SUBMITTED";

export interface ExpenseFormProps {
  open: boolean;
  onClose: () => void;
  projects: ExpenseFormProject[];
  consultantName: string;
  /** Pre-filled date (yyyy-mm-dd) so the form is deterministic/testable. */
  defaultDate: string;
  onSubmit: (input: NewExpenseInput, mode: ExpenseSubmitMode) => void;
}

const inputClass = (invalid: boolean) =>
  cn(
    "w-full rounded-md border bg-surface px-3 py-2 text-sm text-strong placeholder:text-soft",
    focusRingInput,
    invalid ? "border-danger" : "border-border",
  );

const labelClass = "mb-1 block text-xs font-semibold text-medium";

/**
 * New-expense form (modal). Validates the minimum fields (project, date, amount
 * > 0, description) before allowing save/submit. Save keeps a DRAFT; submit
 * sends for approval — both mutate local state in the MVP (no persistence yet).
 */
export function ExpenseForm({
  open,
  onClose,
  projects,
  consultantName,
  defaultDate,
  onSubmit,
}: ExpenseFormProps) {
  const [projectId, setProjectId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [attachment, setAttachment] = useState<ExpenseAttachment | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const selectedProject = projects.find((p) => p.id === projectId);
  const amountValue = Number(amount.replace(",", "."));

  const errors = useMemo(() => {
    return {
      projectId: !projectId,
      date: !date,
      amount: !amount || Number.isNaN(amountValue) || amountValue <= 0,
      description: description.trim().length === 0,
    };
  }, [projectId, date, amount, amountValue, description]);

  const hasErrors = Object.values(errors).some(Boolean);

  function reset() {
    setProjectId("");
    setDate(defaultDate);
    setAmount("");
    setDescription("");
    setInvoiceNumber("");
    setAttachment(null);
    setShowErrors(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit(mode: ExpenseSubmitMode) {
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    onSubmit(
      {
        projectId,
        date,
        amount: amountValue,
        description: description.trim(),
        invoiceNumber: invoiceNumber.trim() || undefined,
        attachment: attachment ?? undefined,
      },
      mode,
    );
    reset();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nova despesa"
      description="Vincule a despesa a um projeto e anexe o comprovante."
      footer={
        <>
          <ActionButton variant="secondary" size="sm" onClick={handleClose}>
            Cancelar
          </ActionButton>
          <ActionButton
            variant="secondary"
            size="sm"
            icon={Save}
            onClick={() => handleSubmit("DRAFT")}
          >
            Salvar rascunho
          </ActionButton>
          <ActionButton
            variant="primary"
            size="sm"
            icon={Send}
            onClick={() => handleSubmit("SUBMITTED")}
          >
            Enviar para aprovação
          </ActionButton>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit("SUBMITTED");
        }}
      >
        <div>
          <label htmlFor="expense-project" className={labelClass}>
            Projeto
          </label>
          <select
            id="expense-project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-invalid={showErrors && errors.projectId}
            className={inputClass(showErrors && errors.projectId)}
          >
            <option value="">Selecione um projeto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.clientName}
              </option>
            ))}
          </select>
          {showErrors && errors.projectId ? (
            <p className="mt-1 text-xs text-danger">Selecione um projeto.</p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className={labelClass}>Cliente</span>
            <p className="rounded-md border border-border bg-surface-muted/50 px-3 py-2 text-sm text-medium">
              {selectedProject ? selectedProject.clientName : "—"}
            </p>
          </div>
          <div>
            <span className={labelClass}>Consultor</span>
            <p className="rounded-md border border-border bg-surface-muted/50 px-3 py-2 text-sm text-medium">
              {consultantName}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="expense-date" className={labelClass}>
              Data
            </label>
            <input
              id="expense-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={showErrors && errors.date}
              className={inputClass(showErrors && errors.date)}
            />
            {showErrors && errors.date ? (
              <p className="mt-1 text-xs text-danger">Informe a data.</p>
            ) : null}
          </div>
          <div>
            <label htmlFor="expense-amount" className={labelClass}>
              Valor (R$)
            </label>
            <input
              id="expense-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              aria-invalid={showErrors && errors.amount}
              className={inputClass(showErrors && errors.amount)}
            />
            {showErrors && errors.amount ? (
              <p className="mt-1 text-xs text-danger">
                Valor deve ser maior que zero.
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <label htmlFor="expense-invoice" className={labelClass}>
            Número da nota fiscal{" "}
            <span className="font-normal text-soft">(opcional)</span>
          </label>
          <input
            id="expense-invoice"
            type="text"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="NF-00000"
            className={inputClass(false)}
          />
        </div>

        <div>
          <label htmlFor="expense-description" className={labelClass}>
            Descrição
          </label>
          <textarea
            id="expense-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Detalhe o gasto e o motivo."
            aria-invalid={showErrors && errors.description}
            className={cn(inputClass(showErrors && errors.description), "resize-y")}
          />
          {showErrors && errors.description ? (
            <p className="mt-1 text-xs text-danger">Descreva a despesa.</p>
          ) : null}
        </div>

        <ExpenseAttachmentField value={attachment} onChange={setAttachment} />
      </form>
    </Modal>
  );
}
