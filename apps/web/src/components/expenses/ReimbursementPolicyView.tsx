"use client";

import { useMemo, useState, useTransition } from "react";
import { Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { cn } from "@/lib/utils";
import { focusRingInput } from "@/lib/styles";
import { formatCurrency } from "@/lib/format";
import {
  createReimbursementPolicyRule,
  deleteReimbursementPolicyRule,
  updateReimbursementPolicyRule,
} from "@/app/app/despesas/policy-actions";
import {
  EXPENSE_CATEGORIES,
  expenseCategoryLabel,
  expenseCategoryLabels,
  type ExpenseCategory,
} from "@/lib/expenses/types";
import type { ReimbursementPolicyRuleView } from "@/lib/db/reimbursement-policy";

const labelClass = "mb-1 block text-xs font-semibold text-medium";
const inputClass = cn(
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong placeholder:text-soft",
  focusRingInput,
);
const thClass =
  "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-soft";

interface FormState {
  id: string | null;
  category: ExpenseCategory | "";
  maxAgeDays: string;
  maxAmount: string;
  active: boolean;
  notes: string;
}

const emptyForm: FormState = {
  id: null,
  category: "",
  maxAgeDays: "",
  maxAmount: "",
  active: true,
  notes: "",
};

export interface ReimbursementPolicyViewProps {
  rules: ReimbursementPolicyRuleView[];
}

/**
 * Administracao da Politica de Reembolso (Onda 3, P12). Lista as categorias do
 * enum fixo + a regra Geral; para cada uma configura prazo (dias) e/ou teto
 * (R$). O CRUD chama as server actions (RBAC + auditoria no servidor).
 */
export function ReimbursementPolicyView({
  rules,
}: ReimbursementPolicyViewProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [confirmDelete, setConfirmDelete] =
    useState<ReimbursementPolicyRuleView | null>(null);
  const { feedback, notify } = useFeedback();
  const [isPending, startTransition] = useTransition();

  const usedCategories = useMemo(
    () => new Set(rules.map((r) => r.category)),
    [rules],
  );

  function openNew() {
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(rule: ReimbursementPolicyRuleView) {
    setForm({
      id: rule.id,
      category: rule.category ?? "",
      maxAgeDays: rule.maxAgeDays === null ? "" : String(rule.maxAgeDays),
      maxAmount: rule.maxAmount === null ? "" : String(rule.maxAmount),
      active: rule.active,
      notes: rule.notes ?? "",
    });
    setFormOpen(true);
  }

  function handleSave() {
    const noLimits = !form.maxAgeDays.trim() && !form.maxAmount.trim();
    if (noLimits) {
      notify("warning", "Informe ao menos um limite (prazo ou valor).");
      return;
    }
    const payload = {
      category: form.category === "" ? null : form.category,
      maxAgeDays: form.maxAgeDays.trim()
        ? Number(form.maxAgeDays.replace(",", "."))
        : null,
      maxAmount: form.maxAmount.trim()
        ? Number(form.maxAmount.replace(",", "."))
        : null,
      active: form.active,
      notes: form.notes.trim() || undefined,
    };
    startTransition(async () => {
      const result = form.id
        ? await updateReimbursementPolicyRule({ id: form.id, ...payload })
        : await createReimbursementPolicyRule(payload);
      if (result.ok) {
        notify("success", form.id ? "Regra atualizada." : "Regra criada.");
        setFormOpen(false);
        setForm(emptyForm);
      } else {
        notify("warning", result.message);
      }
    });
  }

  function handleDelete() {
    const target = confirmDelete;
    if (!target) return;
    startTransition(async () => {
      const result = await deleteReimbursementPolicyRule({ id: target.id });
      if (result.ok) notify("success", "Regra removida.");
      else notify("warning", result.message);
      setConfirmDelete(null);
    });
  }

  // Categorias ainda sem regra (para a criacao); a Geral so pode existir uma vez.
  const availableCategories = EXPENSE_CATEGORIES.filter(
    (c) => !usedCategories.has(c) || form.category === c,
  );
  const canPickGeneral = !usedCategories.has(null) || form.category === "";

  return (
    <div className="space-y-4">
      <FeedbackBanner message={feedback} />

      <div className="flex items-start gap-2 rounded-md border border-border bg-surface-muted/40 px-3 py-2 text-xs text-medium">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-soft" />
        <span>
          As categorias sao fixas (enum do sistema). Aqui voce define os limites
          de <strong>prazo</strong> (dias para lancar) e/ou <strong>valor</strong>{" "}
          (teto por lancamento) para cada categoria, e uma regra{" "}
          <strong>Geral</strong> que vale para todas. Lancamentos que violarem a
          politica sao bloqueados.
        </span>
      </div>

      <SectionPanel
        title="Regras de reembolso"
        description="Prazo e teto por categoria de despesa, mais a regra Geral."
        action={
          <ActionButton
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={openNew}
          >
            Nova regra
          </ActionButton>
        }
      >
        {rules.length === 0 ? (
          <div className="px-5 py-10">
            <EmptyState
              icon={TriangleAlert}
              title="Nenhuma regra cadastrada"
              description="Sem regras, os lancamentos nao sao restringidos por prazo ou valor."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Regras de reembolso</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className={thClass}>
                    Categoria
                  </th>
                  <th scope="col" className={thClass}>
                    Prazo (dias)
                  </th>
                  <th scope="col" className={thClass}>
                    Teto (R$)
                  </th>
                  <th scope="col" className={thClass}>
                    Situacao
                  </th>
                  <th scope="col" className={thClass}>
                    Acoes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-surface-muted/60">
                    <td className="px-4 py-3 align-middle font-medium text-strong">
                      {rule.category === null
                        ? "Geral (todas)"
                        : expenseCategoryLabel(rule.category)}
                    </td>
                    <td className="px-4 py-3 align-middle tabular-nums text-medium">
                      {rule.maxAgeDays ?? "—"}
                    </td>
                    <td className="px-4 py-3 align-middle tabular-nums text-medium">
                      {rule.maxAmount === null
                        ? "—"
                        : formatCurrency(rule.maxAmount)}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <StatusBadge tone={rule.active ? "success" : "neutral"}>
                        {rule.active ? "Ativa" : "Inativa"}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex gap-1.5">
                        <ActionButton
                          variant="secondary"
                          size="sm"
                          icon={Pencil}
                          disabled={isPending}
                          onClick={() => openEdit(rule)}
                        >
                          Editar
                        </ActionButton>
                        <ActionButton
                          variant="secondary"
                          size="sm"
                          icon={Trash2}
                          disabled={isPending}
                          onClick={() => setConfirmDelete(rule)}
                        >
                          Remover
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionPanel>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={form.id ? "Editar regra" : "Nova regra"}
        description="Defina o escopo (categoria ou Geral) e ao menos um limite."
        footer={
          <>
            <ActionButton
              variant="secondary"
              size="sm"
              onClick={() => setFormOpen(false)}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              variant="primary"
              size="sm"
              disabled={isPending}
              onClick={handleSave}
            >
              Salvar
            </ActionButton>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="policy-category" className={labelClass}>
              Escopo
            </label>
            <select
              id="policy-category"
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  category: e.target.value as ExpenseCategory | "",
                }))
              }
              className={inputClass}
            >
              {canPickGeneral ? (
                <option value="">Geral (todas as categorias)</option>
              ) : null}
              {availableCategories.map((c) => (
                <option key={c} value={c}>
                  {expenseCategoryLabels[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="policy-age" className={labelClass}>
                Prazo maximo (dias){" "}
                <span className="font-normal text-soft">(opcional)</span>
              </label>
              <input
                id="policy-age"
                type="number"
                min={1}
                inputMode="numeric"
                value={form.maxAgeDays}
                onChange={(e) =>
                  setForm((f) => ({ ...f, maxAgeDays: e.target.value }))
                }
                placeholder="ex.: 60"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="policy-amount" className={labelClass}>
                Teto do lancamento (R$){" "}
                <span className="font-normal text-soft">(opcional)</span>
              </label>
              <input
                id="policy-amount"
                type="text"
                inputMode="decimal"
                value={form.maxAmount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, maxAmount: e.target.value }))
                }
                placeholder="ex.: 50,00"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor="policy-notes" className={labelClass}>
              Observacao{" "}
              <span className="font-normal text-soft">(opcional)</span>
            </label>
            <textarea
              id="policy-notes"
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              rows={2}
              className={cn(inputClass, "resize-y")}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-medium">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) =>
                setForm((f) => ({ ...f, active: e.target.checked }))
              }
              className="size-4 rounded border-border text-brand focus:ring-brand"
            />
            Regra ativa (aplica o bloqueio no lancamento)
          </label>
        </div>
      </Modal>

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Remover regra"
        description="A regra deixa de restringir os lancamentos."
        footer={
          <>
            <ActionButton
              variant="secondary"
              size="sm"
              onClick={() => setConfirmDelete(null)}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              variant="danger"
              size="sm"
              disabled={isPending}
              onClick={handleDelete}
            >
              Remover
            </ActionButton>
          </>
        }
      >
        {confirmDelete ? (
          <p className="text-sm text-medium">
            Remover a regra de{" "}
            <strong>
              {confirmDelete.category === null
                ? "Geral (todas)"
                : expenseCategoryLabel(confirmDelete.category)}
            </strong>
            ?
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
