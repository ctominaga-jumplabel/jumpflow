"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ListChecks, Unlock } from "lucide-react";

import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { focusRing, focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { fecharApuracao } from "@/app/app/financeiro/actions";
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
  LIBERADO: { label: "Liberado", tone: "success" },
  PENDENTE: { label: "Pendente", tone: "warning" },
  SEM_LANCAMENTO: { label: "Sem lançamento", tone: "neutral" },
};

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
}: PendingClosingsViewProps) {
  const router = useRouter();
  const { feedback, notify, clear } = useFeedback();
  const [isPending, startTransition] = useTransition();

  // Override otimista: projectIds liberados nesta sessão. Deriva o status
  // efetivo sem sincronizar props em efeito (props do refresh confirmam).
  const [released, setReleased] = useState<Set<string>>(new Set());

  // Modal de liberação: projeto alvo + justificativa OBRIGATÓRIA.
  const [target, setTarget] = useState<PendingClosingRow | null>(null);
  const [obs, setObs] = useState("");
  const [obsError, setObsError] = useState<string | null>(null);

  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    const lo = Math.min(year, now) - 2;
    const hi = Math.max(year, now) + 1;
    const out: number[] = [];
    for (let y = lo; y <= hi; y += 1) out.push(y);
    return out;
  }, [year]);

  function effectiveStatus(row: PendingClosingRow): PendingClosingStatus {
    return released.has(row.projectId) ? "LIBERADO" : row.status;
  }

  function openLiberar(row: PendingClosingRow) {
    setTarget(row);
    setObs("");
    setObsError(null);
    clear();
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

  return (
    <div className="space-y-5">
      {/* Filtro de competência (mês/ano) + resumo de pendentes. */}
      <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_var(--color-ink)] sm:flex-row sm:items-end sm:justify-between">
        <form
          method="get"
          action="/app/financeiro/pendentes"
          className="flex flex-wrap items-end gap-3"
        >
          <div>
            <label
              htmlFor="pc-month"
              className="mb-1 block text-xs font-semibold text-medium"
            >
              Mês
            </label>
            <select
              id="pc-month"
              name="month"
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
              name="year"
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

      {rows.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Nenhum projeto ativo na competência"
          description={`Não há projetos ativos para liberar em ${competenceLabel}. Ajuste a competência acima.`}
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
              {rows.map((row) => {
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
    </div>
  );
}
