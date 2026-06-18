"use client";

import { useMemo, useState } from "react";
import { Plus, Save, Send, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ActionButton } from "@/components/ui/ActionButton";
import { ExpenseAttachmentField } from "./ExpenseAttachmentField";
import { cn } from "@/lib/utils";
import { focusRingInput } from "@/lib/styles";
import {
  EXPENSE_CATEGORIES,
  expenseCategoryLabels,
  type Expense,
  type ExpenseAttachmentMeta,
  type ExpenseCategory,
} from "@/lib/expenses/types";

export interface ExpenseFormProject {
  id: string;
  name: string;
  clientName: string;
}

export type ExpenseSubmitMode = "DRAFT" | "SUBMITTED";

/** Values an EDIT produces (attachment travels separately as a File). */
export interface ExpenseFormValue {
  projectId: string;
  date: string;
  amount: number;
  description: string;
  invoiceNumber?: string;
  category?: ExpenseCategory;
}

/** One item of a CREATE batch (its receipt travels as a File). */
export interface ExpenseBatchItem {
  date: string;
  amount: number;
  category: ExpenseCategory;
  file: File | null;
}

/** A CREATE batch: one NF/header with several items. */
export interface ExpenseBatchValue {
  projectId: string;
  description: string;
  invoiceNumber?: string;
  items: ExpenseBatchItem[];
}

export interface ExpenseFormProps {
  open: boolean;
  onClose: () => void;
  projects: ExpenseFormProject[];
  consultantName: string;
  /** Pre-filled date (yyyy-mm-dd) so the form is deterministic/testable. */
  defaultDate: string;
  /** When present, the form edits this single expense instead of creating. */
  initial?: Expense | null;
  /** Storage not configured (db mode): attachment input shows a warning. */
  attachmentUnavailable?: boolean;
  /** Disable buttons while a server action is in flight. */
  busy?: boolean;
  /** Edit submit (single expense). */
  onSubmit: (
    value: ExpenseFormValue,
    mode: ExpenseSubmitMode,
    file: File | null,
  ) => void;
  /** Create submit (one NF, several items). */
  onSubmitBatch: (value: ExpenseBatchValue, mode: ExpenseSubmitMode) => void;
}

const inputClass = (invalid: boolean) =>
  cn(
    "w-full rounded-md border bg-surface px-3 py-2 text-sm text-strong placeholder:text-soft",
    focusRingInput,
    invalid ? "border-danger" : "border-border",
  );

const labelClass = "mb-1 block text-xs font-semibold text-medium";

interface ItemState {
  key: string;
  date: string;
  amount: string;
  category: ExpenseCategory | "";
  attachment: ExpenseAttachmentMeta | null;
  file: File | null;
}

function emptyItem(date: string, seq: number): ItemState {
  return {
    key: `item-${seq}`,
    date,
    amount: "",
    category: "",
    attachment: null,
    file: null,
  };
}

const parseAmount = (raw: string) => Number(raw.replace(",", "."));
const amountInvalid = (raw: string) => {
  const v = parseAmount(raw);
  return !raw || Number.isNaN(v) || v <= 0;
};

/**
 * Expense form (modal). CREATE: one NF/header (projeto, descrição, nota) com
 * vários itens, cada um com data, valor, tipo e anexo. EDIT: uma despesa única
 * (mesmos campos + tipo). O servidor revalida tudo com Zod.
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
  onSubmitBatch,
}: ExpenseFormProps) {
  const isEdit = initial != null;

  // Header fields (shared).
  const [projectId, setProjectId] = useState("");
  const [description, setDescription] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");

  // Edit-only single-item fields.
  const [date, setDate] = useState(defaultDate);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory | "">("");
  const [attachment, setAttachment] = useState<ExpenseAttachmentMeta | null>(
    null,
  );
  const [file, setFile] = useState<File | null>(null);

  // Create-only item list.
  const [items, setItems] = useState<ItemState[]>([emptyItem(defaultDate, 0)]);
  const [itemSeq, setItemSeq] = useState(1);

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
      setDescription(initial?.description ?? "");
      setInvoiceNumber(initial?.invoiceNumber ?? "");
      setDate(initial?.date ?? defaultDate);
      setAmount(initial ? String(initial.amount).replace(".", ",") : "");
      setCategory(initial?.category ?? "");
      setAttachment(initial?.attachment ?? null);
      setFile(null);
      setItems([emptyItem(defaultDate, 0)]);
      setItemSeq(1);
      setShowErrors(false);
      setLastSubmitMode("DRAFT");
    }
  }

  const selectedProject = projects.find((p) => p.id === projectId);

  const headerErrors = {
    projectId: !projectId,
    description: description.trim().length === 0,
  };

  const editErrors = useMemo(
    () => ({
      date: !date,
      amount: amountInvalid(amount),
      category: category === "",
    }),
    [date, amount, category],
  );

  function addItem() {
    setItems((prev) => [...prev, emptyItem(defaultDate, itemSeq)]);
    setItemSeq((n) => n + 1);
  }

  function removeItem(key: string) {
    setItems((prev) =>
      prev.length > 1 ? prev.filter((it) => it.key !== key) : prev,
    );
  }

  function updateItem(key: string, patch: Partial<ItemState>) {
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, ...patch } : it)),
    );
  }

  function itemHasErrors(it: ItemState): boolean {
    return !it.date || amountInvalid(it.amount) || it.category === "";
  }

  function handleSubmitEdit(mode: ExpenseSubmitMode) {
    setLastSubmitMode(mode);
    const missingReceipt = mode === "SUBMITTED" && attachment === null;
    const hasErrors =
      headerErrors.projectId ||
      headerErrors.description ||
      editErrors.date ||
      editErrors.amount ||
      editErrors.category;
    if (hasErrors || missingReceipt) {
      setShowErrors(true);
      return;
    }
    onSubmit(
      {
        projectId,
        date,
        amount: parseAmount(amount),
        description: description.trim(),
        invoiceNumber: invoiceNumber.trim() || undefined,
        category: (category || undefined) as ExpenseCategory | undefined,
      },
      mode,
      file,
    );
  }

  function handleSubmitCreate(mode: ExpenseSubmitMode) {
    setLastSubmitMode(mode);
    const anyItemErrors = items.some(itemHasErrors);
    const missingReceipt =
      mode === "SUBMITTED" && items.some((it) => it.attachment === null);
    if (headerErrors.projectId || headerErrors.description || anyItemErrors || missingReceipt) {
      setShowErrors(true);
      return;
    }
    onSubmitBatch(
      {
        projectId,
        description: description.trim(),
        invoiceNumber: invoiceNumber.trim() || undefined,
        items: items.map((it) => ({
          date: it.date,
          amount: parseAmount(it.amount),
          category: it.category as ExpenseCategory,
          file: it.file,
        })),
      },
      mode,
    );
  }

  const submit = (mode: ExpenseSubmitMode) =>
    isEdit ? handleSubmitEdit(mode) : handleSubmitCreate(mode);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar despesa" : "Nova despesa"}
      description={
        isEdit
          ? "Ajuste os dados e reenvie. Despesa reprovada volta a rascunho ao salvar."
          : "Uma descrição/NF com vários lançamentos — cada um com data, valor, tipo e comprovante."
      }
      className={isEdit ? undefined : "max-w-3xl"}
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
            onClick={() => submit("DRAFT")}
          >
            Salvar rascunho
          </ActionButton>
          <ActionButton
            variant="primary"
            size="sm"
            icon={Send}
            disabled={busy}
            onClick={() => submit("SUBMITTED")}
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
          submit("SUBMITTED");
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
            aria-invalid={showErrors && headerErrors.projectId}
            className={inputClass(showErrors && headerErrors.projectId)}
          >
            <option value="">Selecione um projeto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.clientName}
              </option>
            ))}
          </select>
          {showErrors && headerErrors.projectId ? (
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
            rows={2}
            placeholder="Descrição única do lançamento (vale para todos os itens)."
            aria-invalid={showErrors && headerErrors.description}
            className={cn(
              inputClass(showErrors && headerErrors.description),
              "resize-y",
            )}
          />
          {showErrors && headerErrors.description ? (
            <p className="mt-1 text-xs text-danger">Descreva a despesa.</p>
          ) : null}
        </div>

        {isEdit ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="expense-date" className={labelClass}>
                Data
              </label>
              <input
                id="expense-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={showErrors && editErrors.date}
                className={inputClass(showErrors && editErrors.date)}
              />
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
                aria-invalid={showErrors && editErrors.amount}
                className={inputClass(showErrors && editErrors.amount)}
              />
            </div>
            <div>
              <label htmlFor="expense-category" className={labelClass}>
                Tipo de lançamento
              </label>
              <select
                id="expense-category"
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as ExpenseCategory | "")
                }
                aria-invalid={showErrors && editErrors.category}
                className={inputClass(showErrors && editErrors.category)}
              >
                <option value="">Selecione</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {expenseCategoryLabels[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3">
              <ExpenseAttachmentField
                value={attachment}
                unavailable={attachmentUnavailable}
                persisted={file === null && initial?.attachment != null}
                onChange={(next) => {
                  setAttachment(next?.meta ?? initial?.attachment ?? null);
                  setFile(next?.file ?? null);
                }}
              />
            </div>
            {showErrors &&
            lastSubmitMode === "SUBMITTED" &&
            attachment === null ? (
              <p className="sm:col-span-3 text-xs font-medium text-danger">
                Anexe o comprovante para enviar a despesa para aprovação.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-medium">
                Lançamentos ({items.length})
              </span>
              <ActionButton
                type="button"
                variant="secondary"
                size="sm"
                icon={Plus}
                onClick={addItem}
              >
                Adicionar item
              </ActionButton>
            </div>
            {items.map((it, index) => (
              <div
                key={it.key}
                className="space-y-3 rounded-md border border-border bg-surface-muted/30 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-soft">
                    Item {index + 1}
                  </span>
                  {items.length > 1 ? (
                    <button
                      type="button"
                      aria-label={`Remover item ${index + 1}`}
                      onClick={() => removeItem(it.key)}
                      className="rounded-md p-1 text-medium hover:bg-surface"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label htmlFor={`${it.key}-date`} className={labelClass}>
                      Data
                    </label>
                    <input
                      id={`${it.key}-date`}
                      type="date"
                      value={it.date}
                      onChange={(e) => updateItem(it.key, { date: e.target.value })}
                      aria-invalid={showErrors && !it.date}
                      className={inputClass(showErrors && !it.date)}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${it.key}-amount`} className={labelClass}>
                      Valor (R$)
                    </label>
                    <input
                      id={`${it.key}-amount`}
                      type="text"
                      inputMode="decimal"
                      value={it.amount}
                      onChange={(e) =>
                        updateItem(it.key, { amount: e.target.value })
                      }
                      placeholder="0,00"
                      aria-invalid={showErrors && amountInvalid(it.amount)}
                      className={inputClass(showErrors && amountInvalid(it.amount))}
                    />
                  </div>
                  <div>
                    <label htmlFor={`${it.key}-category`} className={labelClass}>
                      Tipo de lançamento
                    </label>
                    <select
                      id={`${it.key}-category`}
                      value={it.category}
                      onChange={(e) =>
                        updateItem(it.key, {
                          category: e.target.value as ExpenseCategory | "",
                        })
                      }
                      aria-invalid={showErrors && it.category === ""}
                      className={inputClass(showErrors && it.category === "")}
                    >
                      <option value="">Selecione</option>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {expenseCategoryLabels[c]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <ExpenseAttachmentField
                  value={it.attachment}
                  unavailable={attachmentUnavailable}
                  persisted={false}
                  onChange={(next) =>
                    updateItem(it.key, {
                      attachment: next?.meta ?? null,
                      file: next?.file ?? null,
                    })
                  }
                />
              </div>
            ))}
            {showErrors &&
            lastSubmitMode === "SUBMITTED" &&
            items.some((it) => it.attachment === null) ? (
              <p className="text-xs font-medium text-danger">
                Anexe o comprovante de cada item para enviar para aprovação.
              </p>
            ) : null}
          </div>
        )}
      </form>
    </Modal>
  );
}
