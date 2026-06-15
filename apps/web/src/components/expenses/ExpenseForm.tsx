"use client";

import { useMemo, useState } from "react";
import { Save, Send } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ActionButton } from "@/components/ui/ActionButton";
import { ExpenseAttachmentField } from "./ExpenseAttachmentField";
import { cn } from "@/lib/utils";
import { focusRingInput } from "@/lib/styles";
import type { Expense, ExpenseAttachmentMeta } from "@/lib/expenses/types";

export interface ExpenseFormProject {
  id: string;
  name: string;
  clientName: string;
}

export type ExpenseSubmitMode = "DRAFT" | "SUBMITTED";

/** Values the form produces (attachment travels separately as a File). */
export interface ExpenseFormValue {
  projectId: string;
  date: string;
  amount: number;
  description: string;
  invoiceNumber?: string;
}

export interface ExpenseFormProps {
  open: boolean;
  onClose: () => void;
  projects: ExpenseFormProject[];
  consultantName: string;
  /** Pre-filled date (yyyy-mm-dd) so the form is deterministic/testable. */
  defaultDate: string;
  /** When present, the form edits this expense instead of creating one. */
  initial?: Expense | null;
  /** Storage not configured (db mode): attachment input shows a warning. */
  attachmentUnavailable?: boolean;
  /** Disable buttons while a server action is in flight. */
  busy?: boolean;
  /**
   * Save (DRAFT) or save+submit (SUBMITTED). `file` is a newly selected
   * receipt to upload (db) or keep locally (demo); null = unchanged/none.
   */
  onSubmit: (
    value: ExpenseFormValue,
    mode: ExpenseSubmitMode,
    file: File | null,
  ) => void;
}

const inputClass = (invalid: boolean) =>
  cn(
    "w-full rounded-md border bg-surface px-3 py-2 text-sm text-strong placeholder:text-soft",
    focusRingInput,
    invalid ? "border-danger" : "border-border",
  );

const labelClass = "mb-1 block text-xs font-semibold text-medium";

/**
 * Expense form (modal) for create and edit. Validates the minimum fields
 * (project, date, amount > 0, description) before allowing save/submit —
 * the server re-validates everything with Zod.
 */
export function ExpenseForm({
  open,
  onClose,
  projects,
  consultantName,
  defaultDate,
  initial = null,
  attachmentUnavailable = false,
  busy = false,
  onSubmit,
}: ExpenseFormProps) {
  const [projectId, setProjectId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [attachment, setAttachment] = useState<ExpenseAttachmentMeta | null>(
    null,
  );
  const [file, setFile] = useState<File | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [lastSubmitMode, setLastSubmitMode] =
    useState<ExpenseSubmitMode>("DRAFT");

  // Re-seed the fields whenever the modal opens for a different target
  // (render-time state adjustment — the React-recommended effect alternative).
  const formKey = open ? (initial?.id ?? "__new__") : "__closed__";
  const [prevKey, setPrevKey] = useState(formKey);
  if (formKey !== prevKey) {
    setPrevKey(formKey);
    if (open) {
      setProjectId(initial?.projectId ?? "");
      setDate(initial?.date ?? defaultDate);
      setAmount(initial ? String(initial.amount).replace(".", ",") : "");
      setDescription(initial?.description ?? "");
      setInvoiceNumber(initial?.invoiceNumber ?? "");
      setAttachment(initial?.attachment ?? null);
      setFile(null);
      setShowErrors(false);
      setLastSubmitMode("DRAFT");
    }
  }

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

  function handleSubmit(mode: ExpenseSubmitMode) {
    setLastSubmitMode(mode);
    const missingReceipt = mode === "SUBMITTED" && attachment === null;
    if (hasErrors || missingReceipt) {
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
      },
      mode,
      file,
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Editar despesa" : "Nova despesa"}
      description={
        initial
          ? "Ajuste os dados e reenvie. Despesa reprovada volta a rascunho ao salvar."
          : "Vincule a despesa a um projeto e anexe o comprovante."
      }
      footer={
        <>
          <ActionButton variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </ActionButton>
          <ActionButton
            variant="secondary"
            size="sm"
            icon={Save}
            disabled={busy}
            onClick={() => handleSubmit("DRAFT")}
          >
            Salvar rascunho
          </ActionButton>
          <ActionButton
            variant="primary"
            size="sm"
            icon={Send}
            disabled={busy}
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
        {initial?.rejectionReason ? (
          <p className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
            Justificativa da reprovação: {initial.rejectionReason}
          </p>
        ) : null}

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

        <ExpenseAttachmentField
          value={attachment}
          unavailable={attachmentUnavailable}
          // A receipt already persisted on the server cannot be "removed"
          // locally (there is no remove action in the MVP) — only replaced.
          // Clearing a freshly picked file restores the persisted one.
          persisted={file === null && initial?.attachment != null}
          onChange={(next) => {
            setAttachment(next?.meta ?? initial?.attachment ?? null);
            setFile(next?.file ?? null);
          }}
        />
        {showErrors && lastSubmitMode === "SUBMITTED" && attachment === null ? (
          <p className="text-xs font-medium text-danger">
            Anexe o comprovante para enviar a despesa para aprovação.
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
