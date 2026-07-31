"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ListChecks, Receipt, RotateCcw, Unlock } from "lucide-react";

import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { focusRing, focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  fecharApuracao,
  retornarFaturamento,
} from "@/app/app/financeiro/actions";
import type {
  CompetenceCloseResult,
  PendingClosingRow,
  PendingClosingStatus,
} from "@/lib/financial/receivables-journey-core";

/** Horas decimais efetivas → "HH:MM" (ex.: 2.5 → "02:30"). */
function toHHMM(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const STATUS_META: Record<
  PendingClosingStatus,
  { label: string; tone: StatusTone }
> = {
  FATURADO: { label: "Faturado", tone: "info" },
  LIBERADO: { label: "Liberado", tone: "success" },
  PENDENTE: { label: "Pendente", tone: "warning" },
  SEM_LANCAMENTO: { label: "Sem lançamento", tone: "neutral" },
};

/** Opções do filtro de status. `ABERTOS` = Pendente + Liberado (default). */
type StatusFilter = "ABERTOS" | "PENDENTE" | "LIBERADO" | "FATURADO" | "TODOS";

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "ABERTOS", label: "Pendentes + Liberados" },
  { value: "PENDENTE", label: "Pendente" },
  { value: "LIBERADO", label: "Liberado" },
  { value: "FATURADO", label: "Faturado" },
  { value: "TODOS", label: "Todos" },
];

/** Uma competência é boa (liberada) quando fica CLOSED ou já estava CLOSED. */
function isGoodClose(status: CompetenceCloseResult["status"]): boolean {
  return status === "CLOSED" || status === "ALREADY_CLOSED";
}

export interface PendingClosingsViewProps {
  rows: PendingClosingRow[];
  month: number;
  year: number;
  pendingCount: number;
  /** ADMIN/AREA_MANAGER: pode LIBERAR faturamento. O gate real é server-side. */
  canClose: boolean;
  /**
   * ADMIN/FINANCE (RECEIVABLES_ROLES): pode RETORNAR faturamento (Faturado →
   * Liberado). O gate real é server-side na action `retornarFaturamento`.
   */
  canRevert?: boolean;
  /**
   * Destino (GET) do formulário de competência. Default: a rota standalone
   * `/app/financeiro/pendentes` (usada pelo AREA_MANAGER). Dentro da aba
   * Pendentes do Financeiro é `/app/financeiro`, preservando `tab=pendentes`.
   */
  formAction?: string;
  /** Nome do param de mês (default `month`; na aba usa `pmonth` p/ não colidir). */
  monthParam?: string;
  /** Nome do param de ano (default `year`; na aba usa `pyear`). */
  yearParam?: string;
  /**
   * Campos ocultos extra no GET (renderizados como `<input type="hidden">`),
   * ex.: `{ tab: "pendentes" }` para reabrir a aba certa após o reload.
   */
  hiddenFields?: Record<string, string>;
}

/**
 * Fila "Pendentes de Fechamento" (Melhorias v2). Uma linha por projeto ATIVO da
 * competência selecionada, com horas lançadas e status (Liberado / Pendente /
 * Sem lançamento). O Gerente de Área (ADMIN/AREA_MANAGER) LIBERA os projetos
 * `PENDENTE` — reusando a action `fecharApuracao` (gate server-side, INALTERADO)
 * — pedindo uma justificativa curta no modal. Ao liberar, a linha vira "Liberado"
 * (otimista + `router.refresh()`) e o projeto passa a Contas a Receber.
 *
 * O FINANCE acompanha em SOMENTE LEITURA (sem `canClose`): a liberação é do
 * Gerente de Área. O filtro de competência (mês/ano) navega via GET (default =
 * mês atual, resolvido no server).
 */
export function PendingClosingsView({
  rows,
  month,
  year,
  pendingCount,
  canClose,
  canRevert = false,
  formAction = "/app/financeiro/pendentes",
  monthParam = "month",
  yearParam = "year",
  hiddenFields,
}: PendingClosingsViewProps) {
  const router = useRouter();
  const { feedback, notify, clear } = useFeedback();
  const [isPending, startTransition] = useTransition();

  // Override otimista: projectIds liberados nesta sessão. Deriva o status
  // efetivo sem sincronizar props em efeito (props do refresh confirmam).
  const [released, setReleased] = useState<Set<string>>(new Set());
  // Override otimista: projectIds cujo faturamento foi RETORNADO (Faturado →
  // Liberado) nesta sessão.
  const [reverted, setReverted] = useState<Set<string>>(new Set());
  // Filtro de status (client-side): default esconde os Faturados dos pendentes.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ABERTOS");

  // Modal de liberação: projeto alvo + justificativa OBRIGATÓRIA.
  const [target, setTarget] = useState<PendingClosingRow | null>(null);
  const [obs, setObs] = useState("");
  const [obsError, setObsError] = useState<string | null>(null);

  // Modal de RETORNO de faturamento: projeto alvo + justificativa OBRIGATÓRIA.
  const [revertTarget, setRevertTarget] = useState<PendingClosingRow | null>(
    null,
  );
  const [revertObs, setRevertObs] = useState("");
  const [revertObsError, setRevertObsError] = useState<string | null>(null);

  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    const lo = Math.min(year, now) - 2;
    const hi = Math.max(year, now) + 1;
    const out: number[] = [];
    for (let y = lo; y <= hi; y += 1) out.push(y);
    return out;
  }, [year]);

  function effectiveStatus(row: PendingClosingRow): PendingClosingStatus {
    // Otimista: retorno de faturamento tem precedência (Faturado → Liberado);
    // depois a liberação (Pendente → Liberado).
    if (reverted.has(row.projectId)) return "LIBERADO";
    if (released.has(row.projectId)) return "LIBERADO";
    return row.status;
  }

  function matchesFilter(status: PendingClosingStatus): boolean {
    switch (statusFilter) {
      case "ABERTOS":
        return status === "PENDENTE" || status === "LIBERADO";
      case "TODOS":
        return true;
      default:
        return status === statusFilter;
    }
  }

  function openLiberar(row: PendingClosingRow) {
    setTarget(row);
    setObs("");
    setObsError(null);
    clear();
  }

  function openRetornar(row: PendingClosingRow) {
    setRevertTarget(row);
    setRevertObs("");
    setRevertObsError(null);
    clear();
  }

  function confirmRetornar() {
    if (!revertTarget) return;
    const justificativa = revertObs.trim();
    if (justificativa.length === 0) {
      setRevertObsError("Informe uma justificativa para retornar o faturamento.");
      return;
    }
    setRevertObsError(null);
    clear();
    const row = revertTarget;
    startTransition(async () => {
      const result = await retornarFaturamento({
        projectId: row.projectId,
        from: row.from,
        to: row.to,
        justificativa,
      });

      if (!result.ok) {
        if (result.error === "INVALID_INPUT") {
          setRevertObsError(result.message);
          return;
        }
        notify("warning", result.message);
        return;
      }

      if (!result.data.allDone) {
        const problem = result.data.competences.find(
          (c) => c.status !== "REVERTED" && c.status !== "NOT_INVOICED",
        );
        setRevertTarget(null);
        notify(
          "warning",
          problem?.message ?? "Não foi possível retornar o faturamento.",
        );
        return;
      }

      // Otimista: a linha volta para "Liberado"; o refresh confirma.
      setReverted((prev) => {
        const next = new Set(prev);
        next.add(row.projectId);
        return next;
      });
      setRevertTarget(null);
      notify(
        "success",
        `Faturamento de "${row.projectName}" retornado para Liberado.`,
      );
      router.refresh();
    });
  }

  function confirmLiberar() {
    if (!target) return;
    const justificativa = obs.trim();
    if (justificativa.length === 0) {
      setObsError("Informe uma observação (justificativa da liberação).");
      return;
    }
    setObsError(null);
    clear();
    const row = target;
    startTransition(async () => {
      const result = await fecharApuracao({
        projectId: row.projectId,
        from: row.from,
        to: row.to,
        observacoes: justificativa,
      });

      if (!result.ok) {
        if (result.error === "INVALID_INPUT") {
          setObsError(result.message);
          return;
        }
        notify("warning", result.message);
        return;
      }

      const data = result.data;
      const liberou =
        data.allClosed || data.competences.some((c) => isGoodClose(c.status));
      if (!liberou) {
        // Fechamento sem valor a faturar (GENERATED_EMPTY / NOT_FOUND): nada foi
        // liberado — mantém a linha como está e explica.
        setTarget(null);
        notify(
          "warning",
          "Sem valor a faturar na competência — nada foi liberado.",
        );
        return;
      }

      // Otimista: a linha vira "Liberado" já; o refresh confirma pelo servidor.
      setReleased((prev) => {
        const next = new Set(prev);
        next.add(row.projectId);
        return next;
      });
      setTarget(null);
      notify(
        "success",
        `Faturamento de "${row.projectName}" liberado. Já aparece em Contas a Receber.`,
      );
      router.refresh();
    });
  }

  const competenceLabel = `${MONTH_NAMES[Math.min(Math.max(month, 1), 12) - 1]}/${year}`;
  const filteredRows = rows.filter((row) =>
    matchesFilter(effectiveStatus(row)),
  );

  return (
    <div className="space-y-5">
      {/* Filtro de competência (mês/ano) + resumo de pendentes. */}
      <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_var(--color-ink)] sm:flex-row sm:items-end sm:justify-between">
        <form
          method="get"
          action={formAction}
          className="flex flex-wrap items-end gap-3"
        >
          {hiddenFields
            ? Object.entries(hiddenFields).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))
            : null}
          <div>
            <label
              htmlFor="pc-month"
              className="mb-1 block text-xs font-semibold text-medium"
            >
              Mês
            </label>
            <select
              id="pc-month"
              name={monthParam}
              defaultValue={String(month)}
              className={cn(
                "h-9 w-40 rounded-md border border-border bg-surface px-3 text-sm text-strong",
                focusRing,
              )}
            >
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="pc-year"
              className="mb-1 block text-xs font-semibold text-medium"
            >
              Ano
            </label>
            <select
              id="pc-year"
              name={yearParam}
              defaultValue={String(year)}
              className={cn(
                "h-9 w-28 rounded-md border border-border bg-surface px-3 text-sm text-strong",
                focusRing,
              )}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <ActionButton type="submit" variant="primary" size="sm">
            Aplicar
          </ActionButton>
        </form>

        {/* Filtro de status (client-side): default esconde os Faturados. */}
        <div className="sm:self-end">
          <label
            htmlFor="pc-status"
            className="mb-1 block text-xs font-semibold text-medium"
          >
            Status
          </label>
          <select
            id="pc-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className={cn(
              "h-9 w-52 rounded-md border border-border bg-surface px-3 text-sm text-strong",
              focusRing,
            )}
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="shrink-0 rounded-md border border-border bg-surface-muted px-4 py-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-soft">
            Pendentes em {competenceLabel}
          </p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums text-strong">
            {pendingCount}
          </p>
        </div>
      </div>

      <FeedbackBanner message={feedback} />

      {!canClose ? (
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-medium">
          Você está acompanhando esta fila em modo somente leitura. A liberação do
          faturamento é feita pelo Gerente de Área.
        </p>
      ) : null}

      {filteredRows.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Nenhum projeto no recorte"
          description={`Não há projetos com este status em ${competenceLabel}. Ajuste a competência ou o filtro de status acima.`}
        />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border-2 border-ink bg-surface shadow-[4px_4px_0_0_var(--color-ink)]">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b-2 border-ink bg-surface-muted text-left text-xs font-semibold text-medium">
                <th className="px-4 py-3">Projeto</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Horas</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const status = effectiveStatus(row);
                const meta = STATUS_META[status];
                return (
                  <tr
                    key={row.projectId}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-strong">
                      {row.projectName}
                    </td>
                    <td className="px-4 py-3 text-medium">{row.clientName}</td>
                    <td className="px-4 py-3 tabular-nums text-strong">
                      {toHHMM(row.hours)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canClose && status === "PENDENTE" ? (
                        <ActionButton
                          variant="primary"
                          size="sm"
                          icon={Unlock}
                          disabled={isPending}
                          onClick={() => openLiberar(row)}
                        >
                          Liberar
                        </ActionButton>
                      ) : status === "FATURADO" ? (
                        canRevert ? (
                          <ActionButton
                            variant="secondary"
                            size="sm"
                            icon={RotateCcw}
                            disabled={isPending}
                            onClick={() => openRetornar(row)}
                          >
                            Retornar faturamento
                          </ActionButton>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-dark">
                            <Receipt aria-hidden="true" className="size-4" />
                            Faturado
                          </span>
                        )
                      ) : status === "LIBERADO" ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
                          <CheckCircle2 aria-hidden="true" className="size-4" />
                          Liberado
                        </span>
                      ) : (
                        <span className="text-soft">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal LIBERAR: justificativa OBRIGATÓRIA (fecharApuracao a exige). */}
      <Modal
        open={target != null}
        onClose={() => setTarget(null)}
        title="Liberar faturamento"
        description={
          target
            ? `${target.projectName} · ${target.clientName} — ${competenceLabel}`
            : undefined
        }
        footer={
          <>
            <ActionButton
              variant="secondary"
              size="sm"
              onClick={() => setTarget(null)}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              variant="primary"
              size="sm"
              icon={Unlock}
              disabled={isPending}
              onClick={confirmLiberar}
            >
              Liberar faturamento
            </ActionButton>
          </>
        }
      >
        <label className="block text-sm font-medium text-medium">
          Observações (obrigatório)
          <textarea
            value={obs}
            onChange={(e) => {
              setObs(e.target.value);
              if (obsError) setObsError(null);
            }}
            rows={3}
            placeholder="Justificativa da liberação do faturamento..."
            className={cn(
              "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong",
              focusRingInput,
              obsError && "border-danger",
            )}
          />
        </label>
        {obsError ? (
          <p className="mt-1 text-xs font-medium text-danger">{obsError}</p>
        ) : (
          <p className="mt-1 text-xs text-soft">
            A justificativa fica registrada na auditoria do fechamento (leva a
            competência para CLOSED e libera o envio da apuração pelo Financeiro).
          </p>
        )}
      </Modal>

      {/* Modal RETORNAR FATURAMENTO: Faturado → Liberado (justificativa). */}
      <Modal
        open={revertTarget != null}
        onClose={() => setRevertTarget(null)}
        title="Retornar faturamento"
        description={
          revertTarget
            ? `${revertTarget.projectName} · ${revertTarget.clientName} — ${competenceLabel}`
            : undefined
        }
        footer={
          <>
            <ActionButton
              variant="secondary"
              size="sm"
              onClick={() => setRevertTarget(null)}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              variant="primary"
              size="sm"
              icon={RotateCcw}
              disabled={isPending}
              onClick={confirmRetornar}
            >
              Retornar faturamento
            </ActionButton>
          </>
        }
      >
        <label className="block text-sm font-medium text-medium">
          Justificativa (obrigatório)
          <textarea
            value={revertObs}
            onChange={(e) => {
              setRevertObs(e.target.value);
              if (revertObsError) setRevertObsError(null);
            }}
            rows={3}
            placeholder="Motivo para retornar o faturamento para Liberado..."
            className={cn(
              "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong",
              focusRingInput,
              revertObsError && "border-danger",
            )}
          />
        </label>
        {revertObsError ? (
          <p className="mt-1 text-xs font-medium text-danger">
            {revertObsError}
          </p>
        ) : (
          <p className="mt-1 text-xs text-soft">
            Volta a competência de Faturado para Liberado (CLOSED). Bloqueado se
            houver NFS-e ativa — cancele a NFS-e antes. Registrado na auditoria.
          </p>
        )}
      </Modal>
    </div>
  );
}
