"use client";

import { useMemo, useState } from "react";
import { Calculator, Plus, Save, Send, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ActionButton } from "@/components/ui/ActionButton";
import { ExpenseAttachmentField } from "./ExpenseAttachmentField";
import { cn } from "@/lib/utils";
import { focusRingInput } from "@/lib/styles";
import { formatCurrencyPrecise } from "@/lib/format";
import {
  EXPENSE_CATEGORIES,
  expenseCategoryLabels,
  type Expense,
  type ExpenseAttachmentMeta,
  type ExpenseCategory,
  type ExpenseTypeOption,
} from "@/lib/expenses/types";
import type { MileageCalcResult } from "@/app/app/despesas/actions";
import {
  evaluateExpensePolicy,
  type PolicyRuleData,
} from "@/lib/expenses/reimbursement-policy";

/** Código do tipo nativo de Reembolso Quilometragem (espelha o schema). */
const MILEAGE_CATEGORY = "MILEAGE_REIMBURSEMENT";

/** Arredonda para 2 casas (mesma escala do servidor). */
const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Callback que pede o cálculo de quilometragem ao servidor. Retorna o resultado
 * ou `null` quando falhou (a falha já é reportada pelo orquestrador). Injetado
 * pela ExpensesView para que o modo demo possa usar um stub (entrada manual).
 */
export type CalculateMileageFn = (input: {
  origin: string;
  destination: string;
  roundTrip: boolean;
}) => Promise<MileageCalcResult | null>;

/** Dados de milhagem controlados pelo formulário (origem/destino/km). */
export interface MileageValue {
  originAddress: string;
  destinationAddress: string;
  roundTrip: boolean;
  /** Total (ida + volta quando ida e volta). null = ainda não calculado. */
  distanceKm: number | null;
  distanceOutboundKm: number | null;
  distanceReturnKm: number | null;
  /** Distância informada MANUALMENTE (provedor indisponível ou falha). */
  manual: boolean;
}

export const emptyMileage: MileageValue = {
  originAddress: "",
  destinationAddress: "",
  roundTrip: false,
  distanceKm: null,
  distanceOutboundKm: null,
  distanceReturnKm: null,
  manual: false,
};

/** Milhagem incompleta = falta origem, destino ou distância válida. */
export function mileageIncomplete(v: MileageValue): boolean {
  return (
    v.originAddress.trim().length < 3 ||
    v.destinationAddress.trim().length < 3 ||
    v.distanceKm === null ||
    v.distanceKm <= 0
  );
}

/** Tipos nativos como opções — fallback quando o registro não é fornecido. */
const BUILTIN_EXPENSE_TYPES: ExpenseTypeOption[] = EXPENSE_CATEGORIES.map(
  (code) => ({ code, label: expenseCategoryLabels[code] ?? code, active: true }),
);

export interface ExpenseFormProject {
  id: string;
  name: string;
  clientName: string;
}

export type ExpenseSubmitMode = "DRAFT" | "SUBMITTED";

/** Campos de milhagem enviados ao servidor (só quando categoria = milhagem). */
export interface MileageSubmitFields {
  originAddress?: string;
  destinationAddress?: string;
  roundTrip?: boolean;
  distanceKm?: number;
  distanceOutboundKm?: number;
  distanceReturnKm?: number;
}

/** Values an EDIT produces (attachment travels separately as a File). */
export interface ExpenseFormValue extends MileageSubmitFields {
  projectId: string;
  date: string;
  amount: number;
  description: string;
  invoiceNumber?: string;
  category?: ExpenseCategory;
}

/** One item of a CREATE batch (its receipt travels as a File). */
export interface ExpenseBatchItem extends MileageSubmitFields {
  date: string;
  amount: number;
  category: ExpenseCategory;
  file: File | null;
}

/** Constrói os campos de milhagem para submit a partir do MileageValue. */
function toMileageSubmit(m: MileageValue): MileageSubmitFields {
  return {
    originAddress: m.originAddress.trim(),
    destinationAddress: m.destinationAddress.trim(),
    roundTrip: m.roundTrip,
    distanceKm: m.distanceKm ?? undefined,
    distanceOutboundKm: m.distanceOutboundKm ?? undefined,
    distanceReturnKm: m.distanceReturnKm ?? undefined,
  };
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
  /** Regras ATIVAS da Politica de Reembolso (P13): alerta bloqueante no form. */
  policyRules?: PolicyRuleData[];
  /** Tipos de despesa ATIVOS (item 12) para o dropdown. Default = nativos. */
  expenseTypes?: ExpenseTypeOption[];
  /** Mapa código→rótulo (registro) para mensagens de política. Default nativo. */
  categoryLabels?: Record<string, string>;
  /** Taxa global R$/km (Política de Reembolso) exibida no bloco de milhagem. */
  mileageRatePerKm?: number | null;
  /** Calcula a quilometragem no servidor (stub no modo demo). */
  onCalculateMileage?: CalculateMileageFn;
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

/**
 * Bloco de Reembolso Quilometragem: origem, destino, toggle ida/volta e o
 * cálculo da distância. O valor por km é a TAXA GLOBAL (Política de Reembolso),
 * só leitura para o consultor; o total = km × taxa é exibido e vira o valor da
 * despesa. Sem provedor configurado (ou em falha), a quilometragem vira entrada
 * manual — nunca inventamos a distância. Ida e volta recalcula a volta à parte
 * (destino → origem), que pode divergir do trajeto de ida.
 */
function MileageFields({
  value,
  onChange,
  ratePerKm,
  onCalculate,
  showErrors,
  idPrefix,
  busy = false,
}: {
  value: MileageValue;
  onChange: (v: MileageValue) => void;
  ratePerKm: number | null;
  onCalculate: CalculateMileageFn;
  showErrors: boolean;
  idPrefix: string;
  busy?: boolean;
}) {
  const [calculating, setCalculating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canCalc =
    value.originAddress.trim().length >= 3 &&
    value.destinationAddress.trim().length >= 3;

  async function runCalculate(roundTrip: boolean) {
    setMessage(null);
    if (!canCalc) {
      setMessage("Informe origem e destino para calcular a distância.");
      return;
    }
    setCalculating(true);
    const result = await onCalculate({
      origin: value.originAddress.trim(),
      destination: value.destinationAddress.trim(),
      roundTrip,
    });
    setCalculating(false);
    // Base carrega o roundTrip corrente (evita perder o toggle em corrida).
    const base = { ...value, roundTrip };
    if (!result) return; // falha já reportada pelo orquestrador
    if (!result.configured) {
      onChange({ ...base, manual: true });
      setMessage(
        "Cálculo automático indisponível. Informe a quilometragem manualmente.",
      );
      return;
    }
    onChange({
      ...base,
      manual: false,
      distanceKm: result.totalKm,
      distanceOutboundKm: result.outboundKm,
      distanceReturnKm: result.returnKm,
    });
  }

  function handleToggleRoundTrip(next: boolean) {
    // Recalcula ao alternar ida/volta (a volta é chamada à parte no servidor);
    // no modo manual apenas alterna o flag.
    if (!value.manual && canCalc && value.distanceKm !== null) {
      runCalculate(next);
    } else {
      onChange({ ...value, roundTrip: next });
    }
  }

  function handleManualKm(raw: string) {
    const num = Number(raw.replace(",", "."));
    onChange({
      ...value,
      manual: true,
      distanceKm: raw.trim() === "" || Number.isNaN(num) ? null : round2(num),
      distanceOutboundKm: null,
      distanceReturnKm: null,
    });
  }

  const total =
    ratePerKm !== null && value.distanceKm !== null
      ? round2(value.distanceKm * ratePerKm)
      : null;
  const missing = showErrors && mileageIncomplete(value);

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface-muted/20 p-3">
      <p className="text-xs font-semibold text-medium">Reembolso Quilometragem</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-origin`} className={labelClass}>
            Origem
          </label>
          <input
            id={`${idPrefix}-origin`}
            type="text"
            value={value.originAddress}
            onChange={(e) =>
              onChange({ ...value, originAddress: e.target.value })
            }
            placeholder="Rua, número, cidade"
            aria-invalid={showErrors && value.originAddress.trim().length < 3}
            className={inputClass(
              showErrors && value.originAddress.trim().length < 3,
            )}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-destination`} className={labelClass}>
            Destino
          </label>
          <input
            id={`${idPrefix}-destination`}
            type="text"
            value={value.destinationAddress}
            onChange={(e) =>
              onChange({ ...value, destinationAddress: e.target.value })
            }
            placeholder="Rua, número, cidade"
            aria-invalid={
              showErrors && value.destinationAddress.trim().length < 3
            }
            className={inputClass(
              showErrors && value.destinationAddress.trim().length < 3,
            )}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-medium">
          <input
            type="checkbox"
            checked={value.roundTrip}
            onChange={(e) => handleToggleRoundTrip(e.target.checked)}
            className="size-4 rounded border-border text-brand focus:ring-brand"
          />
          Ida e volta
        </label>
        <ActionButton
          type="button"
          variant="secondary"
          size="sm"
          icon={Calculator}
          disabled={busy || calculating || !canCalc}
          onClick={() => runCalculate(value.roundTrip)}
        >
          {calculating ? "Calculando…" : "Calcular distância"}
        </ActionButton>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`${idPrefix}-km`} className={labelClass}>
            Quilometragem (km)
          </label>
          {value.manual ? (
            <input
              id={`${idPrefix}-km`}
              type="text"
              inputMode="decimal"
              value={value.distanceKm === null ? "" : String(value.distanceKm)}
              onChange={(e) => handleManualKm(e.target.value)}
              placeholder="0,00"
              aria-invalid={missing}
              className={inputClass(missing)}
            />
          ) : (
            <p
              className={cn(
                "rounded-md border px-3 py-2 text-sm tabular-nums",
                missing
                  ? "border-danger text-danger"
                  : "border-border bg-surface-muted/50 text-medium",
              )}
            >
              {value.distanceKm === null
                ? "—"
                : `${value.distanceKm.toLocaleString("pt-BR")} km`}
            </p>
          )}
        </div>
        <div>
          <span className={labelClass}>Valor por km</span>
          <p className="rounded-md border border-border bg-surface-muted/50 px-3 py-2 text-sm tabular-nums text-medium">
            {ratePerKm === null ? "—" : formatCurrencyPrecise(ratePerKm)}
          </p>
        </div>
        <div>
          <span className={labelClass}>Valor total</span>
          <p className="rounded-md border border-border bg-surface-muted/50 px-3 py-2 text-sm font-semibold tabular-nums text-strong">
            {total === null ? "—" : formatCurrencyPrecise(total)}
          </p>
        </div>
      </div>

      {value.distanceOutboundKm !== null && !value.manual ? (
        <p className="text-xs text-soft">
          Ida: {value.distanceOutboundKm.toLocaleString("pt-BR")} km
          {value.roundTrip && value.distanceReturnKm !== null
            ? ` · Volta: ${value.distanceReturnKm.toLocaleString("pt-BR")} km`
            : ""}
        </p>
      ) : null}

      {ratePerKm === null ? (
        <p className="text-xs font-medium text-warning">
          Defina o valor por km na Política de Reembolso para calcular o total.
        </p>
      ) : (
        <p className="text-xs text-soft">
          O valor por km é definido pelo Financeiro na Política de Reembolso.
        </p>
      )}

      {message ? (
        <p className="text-xs font-medium text-medium">{message}</p>
      ) : null}
      {missing ? (
        <p className="text-xs font-medium text-danger">
          Informe origem, destino e a quilometragem (calcule ou digite).
        </p>
      ) : null}
    </div>
  );
}

interface ItemState {
  key: string;
  date: string;
  amount: string;
  category: ExpenseCategory | "";
  attachment: ExpenseAttachmentMeta | null;
  file: File | null;
  mileage: MileageValue;
}

function emptyItem(date: string, seq: number): ItemState {
  return {
    key: `item-${seq}`,
    date,
    amount: "",
    category: "",
    attachment: null,
    file: null,
    mileage: { ...emptyMileage },
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
  policyRules = [],
  expenseTypes = BUILTIN_EXPENSE_TYPES,
  categoryLabels = expenseCategoryLabels,
  mileageRatePerKm = null,
  onCalculateMileage,
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
  const [editMileage, setEditMileage] = useState<MileageValue>({
    ...emptyMileage,
  });

  // Cálculo indisponível sem callback (nunca deveria acontecer em db mode).
  const calcMileage: CalculateMileageFn =
    onCalculateMileage ?? (async () => null);

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
      setEditMileage(
        initial && initial.category === MILEAGE_CATEGORY
          ? {
              originAddress: initial.originAddress ?? "",
              destinationAddress: initial.destinationAddress ?? "",
              roundTrip: initial.roundTrip ?? false,
              distanceKm: initial.distanceKm ?? null,
              distanceOutboundKm: initial.distanceOutboundKm ?? null,
              distanceReturnKm: initial.distanceReturnKm ?? null,
              // Distância já persistida: trate como definida (não manual) para
              // exibir só leitura; recálculo/entrada manual continuam possíveis.
              manual: false,
            }
          : { ...emptyMileage },
      );
      setItems([emptyItem(defaultDate, 0)]);
      setItemSeq(1);
      setShowErrors(false);
      setLastSubmitMode("DRAFT");
    }
  }

  const selectedProject = projects.find((p) => p.id === projectId);

  /** Valor calculado de uma milhagem (km × taxa global), 0 se incompleto. */
  const mileageAmount = (m: MileageValue): number =>
    mileageRatePerKm !== null && m.distanceKm !== null
      ? round2(m.distanceKm * mileageRatePerKm)
      : 0;

  /** Milhagem inválida = campos incompletos OU taxa global não configurada. */
  const mileageInvalid = (m: MileageValue): boolean =>
    mileageIncomplete(m) || mileageRatePerKm === null;

  const headerErrors = {
    projectId: !projectId,
    description: description.trim().length === 0,
  };

  const editIsMileage = category === MILEAGE_CATEGORY;

  const editErrors = useMemo(
    () => ({
      date: !date,
      // Milhagem: o valor é calculado — validade = campos de milhagem + taxa.
      amount: editIsMileage
        ? mileageInvalid(editMileage)
        : amountInvalid(amount),
      category: category === "",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [date, amount, category, editIsMileage, editMileage, mileageRatePerKm],
  );

  // P13: violacoes da Politica de Reembolso (alerta bloqueante). `defaultDate`
  // e a data de hoje (resolvida no servidor) usada no calculo de prazo.
  const policyViolations = useMemo<string[]>(() => {
    if (policyRules.length === 0) return [];
    const messages: string[] = [];
    const collect = (
      cat: ExpenseCategory | undefined,
      dateStr: string,
      amountRaw: string,
    ) => {
      const value = parseAmount(amountRaw);
      if (!dateStr || Number.isNaN(value) || value <= 0) return;
      for (const v of evaluateExpensePolicy(
        { category: cat, date: dateStr, amount: value },
        policyRules,
        defaultDate,
        categoryLabels,
      )) {
        if (!messages.includes(v.message)) messages.push(v.message);
      }
    };
    if (isEdit) {
      collect(
        category || undefined,
        date,
        editIsMileage ? String(mileageAmount(editMileage)) : amount,
      );
    } else {
      for (const it of items) {
        const amt =
          it.category === MILEAGE_CATEGORY
            ? String(mileageAmount(it.mileage))
            : it.amount;
        collect(it.category || undefined, it.date, amt);
      }
    }
    return messages;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    policyRules,
    isEdit,
    category,
    date,
    amount,
    items,
    defaultDate,
    categoryLabels,
    editIsMileage,
    editMileage,
    mileageRatePerKm,
  ]);

  const hasPolicyViolation = policyViolations.length > 0;

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
    if (!it.date || it.category === "") return true;
    // Milhagem: valida os campos de milhagem no lugar do valor (calculado).
    return it.category === MILEAGE_CATEGORY
      ? mileageInvalid(it.mileage)
      : amountInvalid(it.amount);
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
    // Politica de Reembolso: rascunho e permitido, mas o envio nao (o servidor
    // tambem recusa no submit).
    const blockedByPolicy = mode === "SUBMITTED" && hasPolicyViolation;
    if (hasErrors || missingReceipt || blockedByPolicy) {
      setShowErrors(true);
      return;
    }
    onSubmit(
      {
        projectId,
        date,
        amount: editIsMileage ? mileageAmount(editMileage) : parseAmount(amount),
        description: description.trim(),
        invoiceNumber: invoiceNumber.trim() || undefined,
        category: (category || undefined) as ExpenseCategory | undefined,
        ...(editIsMileage ? toMileageSubmit(editMileage) : {}),
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
    // No fluxo de criacao o servidor reforca a politica ate no rascunho
    // (createExpenseBatch), entao bloqueia ambos os modos aqui.
    if (
      headerErrors.projectId ||
      headerErrors.description ||
      anyItemErrors ||
      missingReceipt ||
      hasPolicyViolation
    ) {
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
          amount:
            it.category === MILEAGE_CATEGORY
              ? mileageAmount(it.mileage)
              : parseAmount(it.amount),
          category: it.category as ExpenseCategory,
          file: it.file,
          ...(it.category === MILEAGE_CATEGORY
            ? toMileageSubmit(it.mileage)
            : {}),
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
            disabled={busy || (!isEdit && hasPolicyViolation)}
            onClick={() => submit("DRAFT")}
          >
            Salvar rascunho
          </ActionButton>
          <ActionButton
            variant="primary"
            size="sm"
            icon={Send}
            disabled={busy || hasPolicyViolation}
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

        {hasPolicyViolation ? (
          <div
            role="alert"
            className="space-y-1 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-medium text-danger"
          >
            <p className="font-semibold">
              Lançamento fora da Política de Reembolso:
            </p>
            <ul className="list-disc space-y-0.5 pl-4">
              {policyViolations.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
            <p className="font-normal">
              Ajuste o valor, a data ou o tipo para prosseguir.
            </p>
          </div>
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
              {editIsMileage ? (
                <p
                  className="rounded-md border border-border bg-surface-muted/50 px-3 py-2 text-sm font-semibold tabular-nums text-strong"
                  aria-label="Valor total calculado"
                >
                  {formatCurrencyPrecise(mileageAmount(editMileage))}
                </p>
              ) : (
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
              )}
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
                {category && !expenseTypes.some((t) => t.code === category) ? (
                  // Preserva o tipo atual (inativo/legado) ao editar.
                  <option value={category}>
                    {categoryLabels[category] ?? category}
                  </option>
                ) : null}
                {expenseTypes.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            {editIsMileage ? (
              <div className="sm:col-span-3">
                <MileageFields
                  value={editMileage}
                  onChange={setEditMileage}
                  ratePerKm={mileageRatePerKm}
                  onCalculate={calcMileage}
                  showErrors={showErrors}
                  idPrefix="edit-mileage"
                  busy={busy}
                />
              </div>
            ) : null}
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
                    {it.category === MILEAGE_CATEGORY ? (
                      <p
                        className="rounded-md border border-border bg-surface-muted/50 px-3 py-2 text-sm font-semibold tabular-nums text-strong"
                        aria-label="Valor total calculado"
                      >
                        {formatCurrencyPrecise(mileageAmount(it.mileage))}
                      </p>
                    ) : (
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
                        className={inputClass(
                          showErrors && amountInvalid(it.amount),
                        )}
                      />
                    )}
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
                      {expenseTypes.map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {it.category === MILEAGE_CATEGORY ? (
                    <div className="sm:col-span-3">
                      <MileageFields
                        value={it.mileage}
                        onChange={(m) => updateItem(it.key, { mileage: m })}
                        ratePerKm={mileageRatePerKm}
                        onCalculate={calcMileage}
                        showErrors={showErrors}
                        idPrefix={`${it.key}-mileage`}
                        busy={busy}
                      />
                    </div>
                  ) : null}
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

        <p className="rounded-md border border-border bg-surface-muted/40 px-3 py-2 text-xs text-soft">
          O comprovante é <strong>obrigatório para enviar para aprovação</strong>
          . Você pode salvar como rascunho sem anexo e adicioná-lo depois.
        </p>
        {(isEdit
          ? editIsMileage
          : items.some((it) => it.category === MILEAGE_CATEGORY)) ? (
          <p className="rounded-md border border-border bg-surface-muted/40 px-3 py-2 text-xs text-soft">
            Reembolso Quilometragem: anexe o{" "}
            <strong>aval do gestor</strong> autorizando o reembolso como
            comprovante.
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
