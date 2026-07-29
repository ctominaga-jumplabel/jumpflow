"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  Lock,
  Unlock,
  Users,
} from "lucide-react";

import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { FinanceTabs } from "@/components/financial/FinanceTabs";
import { Modal } from "@/components/ui/Modal";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { focusRing, focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { pendingAlert } from "@/lib/operations/closing";
import type {
  CockpitCalendar,
  CockpitConsultantRow,
  CockpitProjectRow,
} from "@/lib/operacao/cockpit";
import { fecharApuracao } from "@/app/app/financeiro/actions";
import { closeOperation } from "@/app/app/operacao/fechamento/actions";
import { setProjectDailyEntryRequired } from "@/app/app/projetos/actions";
import { loadConsultantCalendar } from "@/app/app/operacao/cockpit/actions";
import { CockpitCalendarGrid } from "./CockpitCalendarGrid";

const MONTH_LABELS = [
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

/** Horas em pt-BR, sem casas decimais supérfluas (ex.: 8 → "8", 7.5 → "7,5"). */
function formatHours(hours: number): string {
  return hours.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/** Primeiro e último dia ISO da competência (janela passada ao fecharApuracao). */
function competenceRange(month: number, year: number): { from: string; to: string } {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

interface CalendarTarget {
  projectId: string;
  projectName: string;
  consultant: CockpitConsultantRow;
}

export interface CockpitViewProps {
  month: number;
  year: number;
  monthLabel: string;
  projects: CockpitProjectRow[];
  /** ADMIN/AREA_MANAGER: pode liberar o Financeiro (gate real no servidor). */
  canManageFinance: boolean;
  /** ADMIN/AREA_MANAGER/PROJECT_MANAGER: pode liberar o DP (gate no servidor). */
  canManageDp: boolean;
  /** Pode alternar a obrigatoriedade de lançamento diário (mesmo escopo do DP). */
  canToggleFlag: boolean;
}

/**
 * Cockpit do Gestor de Área (Fase 4b). Ponto único por competência: abas
 * Ativos/Histórico, accordion por projeto com chips Fin/DP, toggle da
 * obrigatoriedade diária, linhas de consultor com dias sem lançamento/pendentes,
 * drawer de calendário e as duas liberações (Financeiro via modal de
 * justificativa; DP com bloqueio explícito enquanto houver horas não aprovadas).
 */
export function CockpitView({
  month,
  year,
  monthLabel,
  projects,
  canManageFinance,
  canManageDp,
  canToggleFlag,
}: CockpitViewProps) {
  const router = useRouter();
  const { feedback, notify, clear } = useFeedback();
  const [isPending, startTransition] = useTransition();

  // Overrides otimistas de liberação nesta sessão; o refresh reconfirma pelo
  // servidor (e reparticiona Ativos↔Histórico).
  const [releasedFinance, setReleasedFinance] = useState<Set<string>>(new Set());
  const [releasedDp, setReleasedDp] = useState<Set<string>>(new Set());

  // Modal "Liberar Financeiro": projeto alvo + justificativa OBRIGATÓRIA.
  const [financeTarget, setFinanceTarget] = useState<CockpitProjectRow | null>(
    null,
  );
  const [obs, setObs] = useState("");
  const [obsError, setObsError] = useState<string | null>(null);

  // Drawer de calendário (carregado sob demanda).
  const [calTarget, setCalTarget] = useState<CalendarTarget | null>(null);
  const [calData, setCalData] = useState<CockpitCalendar | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);

  const finOf = (row: CockpitProjectRow) =>
    row.financeiroLiberado || releasedFinance.has(row.projectId);
  const dpOf = (row: CockpitProjectRow) =>
    row.dpLiberado || releasedDp.has(row.projectId);

  // Reparticiona respeitando os overrides otimistas: um projeto liberado nos
  // dois eixos migra para Histórico imediatamente (antes do refresh chegar).
  const { ativos, historico } = useMemo(() => {
    const a: CockpitProjectRow[] = [];
    const h: CockpitProjectRow[] = [];
    for (const row of projects) {
      if (finOf(row) && dpOf(row)) h.push(row);
      else a.push(row);
    }
    return { ativos: a, historico: h };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, releasedFinance, releasedDp]);

  function openFinance(row: CockpitProjectRow) {
    clear();
    setObs("");
    setObsError(null);
    setFinanceTarget(row);
  }

  function confirmFinance() {
    if (!financeTarget) return;
    const justificativa = obs.trim();
    if (justificativa.length === 0) {
      setObsError("Informe uma justificativa para liberar o faturamento.");
      return;
    }
    setObsError(null);
    const row = financeTarget;
    const { from, to } = competenceRange(month, year);
    startTransition(async () => {
      const result = await fecharApuracao({
        projectId: row.projectId,
        from,
        to,
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
      const liberou =
        result.data.allClosed ||
        result.data.competences.some(
          (c) => c.status === "CLOSED" || c.status === "ALREADY_CLOSED",
        );
      if (!liberou) {
        setFinanceTarget(null);
        notify(
          "warning",
          "Sem valor a faturar na competência — nada foi liberado.",
        );
        return;
      }
      setReleasedFinance((prev) => new Set(prev).add(row.projectId));
      setFinanceTarget(null);
      notify("success", `Financeiro de "${row.projectName}" liberado.`);
      router.refresh();
    });
  }

  function releaseDp(row: CockpitProjectRow) {
    clear();
    startTransition(async () => {
      const result = await closeOperation({
        projectId: row.projectId,
        month,
        year,
      });
      if (!result.ok) {
        notify("warning", result.message);
        return;
      }
      setReleasedDp((prev) => new Set(prev).add(row.projectId));
      notify("success", `DP de "${row.projectName}" liberado. DP notificado.`);
      router.refresh();
    });
  }

  function openCalendar(projectId: string, projectName: string, consultant: CockpitConsultantRow) {
    setCalTarget({ projectId, projectName, consultant });
    setCalData(null);
    setCalError(null);
    setCalLoading(true);
    startTransition(async () => {
      const result = await loadConsultantCalendar({
        projectId,
        consultantId: consultant.consultantId,
        month,
        year,
      });
      setCalLoading(false);
      if (result.ok) setCalData(result.data);
      else setCalError(result.message);
    });
  }

  function dismissCalendar() {
    setCalTarget(null);
    setCalData(null);
    setCalError(null);
  }

  function renderList(rows: CockpitProjectRow[], emptyLabel: string) {
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={CalendarDays}
          title={emptyLabel}
          description={`Competência ${monthLabel}. Ajuste o mês/ano acima para ver outros períodos.`}
        />
      );
    }
    return (
      <div className="space-y-3">
        {rows.map((row) => (
          <ProjectAccordion
            key={row.projectId}
            row={row}
            financeiroLiberado={finOf(row)}
            dpLiberado={dpOf(row)}
            canManageFinance={canManageFinance}
            canManageDp={canManageDp}
            canToggleFlag={canToggleFlag}
            isPending={isPending}
            onOpenFinance={() => openFinance(row)}
            onReleaseDp={() => releaseDp(row)}
            onOpenCalendar={(consultant) =>
              openCalendar(row.projectId, row.projectName, consultant)
            }
            onFlagResult={(tone, text) => notify(tone, text)}
            onFlagToggled={() => router.refresh()}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <CompetenceSelector month={month} year={year} />

      <FeedbackBanner message={feedback} />

      <FinanceTabs
        ariaLabel="Fases do cockpit"
        tabs={[
          {
            id: "ativos",
            label: `Ativos (${ativos.length})`,
            content: renderList(
              ativos,
              "Nenhum projeto ativo nesta competência",
            ),
          },
          {
            id: "historico",
            label: `Histórico (${historico.length})`,
            content: renderList(
              historico,
              "Nenhum projeto concluído nesta competência",
            ),
          },
        ]}
      />

      {/* Modal LIBERAR FINANCEIRO: justificativa OBRIGATÓRIA (fecharApuracao). */}
      <Modal
        open={financeTarget != null}
        onClose={() => setFinanceTarget(null)}
        title="Liberar Financeiro"
        description={
          financeTarget
            ? `${financeTarget.projectName} · ${financeTarget.clientName} — ${monthLabel}`
            : undefined
        }
        footer={
          <>
            <ActionButton
              variant="secondary"
              size="sm"
              onClick={() => setFinanceTarget(null)}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              variant="primary"
              size="sm"
              icon={Unlock}
              disabled={isPending}
              onClick={confirmFinance}
            >
              Liberar Financeiro
            </ActionButton>
          </>
        }
      >
        <label className="block text-sm font-medium text-medium">
          Justificativa (obrigatória)
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
            Leva a competência para CLOSED, congela o lançamento das horas e
            libera o envio da apuração pelo Financeiro. Fica registrada na
            auditoria.
          </p>
        )}
      </Modal>

      {/* Drawer de calendário do consultor (carregado sob demanda). */}
      <Modal
        open={calTarget != null}
        onClose={dismissCalendar}
        title={
          calTarget
            ? `Calendário — ${calTarget.consultant.consultantName}`
            : "Calendário"
        }
        description={
          calTarget
            ? `${calTarget.projectName} · ${monthLabel}`
            : undefined
        }
        className="max-w-2xl"
      >
        {calLoading ? (
          <div
            className="flex items-center justify-center gap-2 py-10 text-sm text-soft"
            role="status"
            aria-live="polite"
          >
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Carregando calendário…
          </div>
        ) : calError ? (
          <p className="py-8 text-center text-sm text-danger" role="alert">
            {calError}
          </p>
        ) : calData ? (
          <CockpitCalendarGrid calendar={calData} />
        ) : null}
      </Modal>
    </div>
  );
}

/** Seletor de competência (mês/ano) que navega por querystring (?mes=&ano=). */
function CompetenceSelector({ month, year }: { month: number; year: number }) {
  const router = useRouter();
  const [m, setM] = useState(month);
  const [y, setY] = useState(year);

  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    const lo = Math.min(year, now) - 2;
    const hi = Math.max(year, now) + 1;
    const out: number[] = [];
    for (let yy = lo; yy <= hi; yy += 1) out.push(yy);
    return out;
  }, [year]);

  function apply() {
    const params = new URLSearchParams();
    params.set("mes", String(m));
    params.set("ano", String(y));
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_var(--color-ink)] sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="cockpit-mes"
            className="mb-1 block text-xs font-semibold text-medium"
          >
            Mês
          </label>
          <select
            id="cockpit-mes"
            value={String(m)}
            onChange={(e) => setM(Number(e.target.value))}
            className={cn(
              "h-9 w-40 rounded-md border border-border bg-surface px-3 text-sm text-strong",
              focusRing,
            )}
          >
            {MONTH_LABELS.map((label, index) => (
              <option key={label} value={String(index + 1)}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="cockpit-ano"
            className="mb-1 block text-xs font-semibold text-medium"
          >
            Ano
          </label>
          <select
            id="cockpit-ano"
            value={String(y)}
            onChange={(e) => setY(Number(e.target.value))}
            className={cn(
              "h-9 w-28 rounded-md border border-border bg-surface px-3 text-sm text-strong",
              focusRing,
            )}
          >
            {yearOptions.map((yy) => (
              <option key={yy} value={String(yy)}>
                {yy}
              </option>
            ))}
          </select>
        </div>
        <ActionButton variant="primary" size="sm" onClick={apply}>
          Aplicar
        </ActionButton>
      </div>
    </div>
  );
}

interface ProjectAccordionProps {
  row: CockpitProjectRow;
  financeiroLiberado: boolean;
  dpLiberado: boolean;
  canManageFinance: boolean;
  canManageDp: boolean;
  canToggleFlag: boolean;
  isPending: boolean;
  onOpenFinance: () => void;
  onReleaseDp: () => void;
  onOpenCalendar: (consultant: CockpitConsultantRow) => void;
  onFlagResult: (tone: "success" | "warning", text: string) => void;
  /** Chamado após uma alternância bem-sucedida da flag (para revalidar o gate DP). */
  onFlagToggled: () => void;
}

function ProjectAccordion({
  row,
  financeiroLiberado,
  dpLiberado,
  canManageFinance,
  canManageDp,
  canToggleFlag,
  isPending,
  onOpenFinance,
  onReleaseDp,
  onOpenCalendar,
  onFlagResult,
  onFlagToggled,
}: ProjectAccordionProps) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const blockedReason = row.readiness.canClose ? null : pendingAlert(row.readiness);
  const bodyId = `cockpit-project-${row.projectId}`;

  return (
    <div className="rounded-[var(--radius-card)] border-2 border-ink bg-surface shadow-[4px_4px_0_0_var(--color-ink)]">
      {/* Cabeçalho do projeto. */}
      <div className="flex flex-wrap items-center gap-3 border-b-2 border-ink px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
          className={cn(
            "group -mx-1 flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-surface-muted/50",
            focusRing,
          )}
        >
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0 text-soft transition-transform duration-200 group-hover:text-medium",
              open && "rotate-180",
            )}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-strong">
              {row.projectName}
            </span>
            <span className="block truncate text-xs text-soft">
              {row.clientName} · {row.consultants.length} consultor(es) ·{" "}
              {formatHours(row.totalHoras)}h lançadas
            </span>
          </span>
        </button>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <StatusChip label="Fin" full="Financeiro" done={financeiroLiberado} />
          <StatusChip label="DP" full="Departamento pessoal" done={dpLiberado} />
          <DailyEntryToggle
            projectId={row.projectId}
            initial={row.dailyEntryRequired}
            canToggle={canToggleFlag}
            onResult={onFlagResult}
            onToggled={onFlagToggled}
          />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="body"
            id={bodyId}
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-4 px-4 py-4">
          {/* Consultores com métricas. */}
          {row.consultants.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-soft">
              Nenhum consultor alocado (vigente) nesta competência.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-surface-muted text-xs uppercase tracking-wide text-soft">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Consultor</th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Horas
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Sem lançamento
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Pendentes
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Calendário
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {row.consultants.map((c) => (
                    <tr
                      key={c.consultantId}
                      className="border-t border-border transition-colors hover:bg-surface-muted/50"
                    >
                      <td className="px-3 py-2 font-medium text-strong">
                        {c.consultantName}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-medium">
                        {formatHours(c.horasLancadas)}h
                      </td>
                      <td className="px-3 py-2 text-right">
                        <MetricPill value={c.diasSemLancamento} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <MetricPill value={c.diasPendentes} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => onOpenCalendar(c)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-medium transition-colors hover:border-brand/40 hover:bg-surface-muted/60 hover:text-strong",
                            focusRing,
                          )}
                          title="Abrir o calendário do mês deste consultor"
                          aria-label={`Abrir o calendário de ${c.consultantName} no mês`}
                        >
                          <CalendarDays aria-hidden="true" className="size-4" />
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink bg-surface-muted/40 text-sm font-semibold text-strong">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatHours(row.totalHoras)}h
                    </td>
                    <td className="px-3 py-2" colSpan={3} aria-hidden="true" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Rodapé: liberações. */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <div className="flex items-center gap-1.5 text-xs text-soft">
              <Users aria-hidden="true" className="size-4" />
              {row.readiness.readyConsultants}/{row.readiness.totalConsultants}{" "}
              aprovados
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* Liberar Financeiro */}
              {financeiroLiberado ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                  Financeiro liberado
                </span>
              ) : canManageFinance ? (
                <ActionButton
                  variant="secondary"
                  size="sm"
                  icon={Unlock}
                  disabled={isPending}
                  onClick={onOpenFinance}
                >
                  Liberar Financeiro
                </ActionButton>
              ) : null}

              {/* Liberar DP */}
              {dpLiberado ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                  DP liberado
                </span>
              ) : canManageDp ? (
                <ActionButton
                  variant="primary"
                  size="sm"
                  icon={Lock}
                  disabled={isPending || blockedReason != null}
                  title={
                    blockedReason
                      ? `Bloqueado: ${blockedReason}`
                      : "Fechar o mês e notificar o DP"
                  }
                  onClick={onReleaseDp}
                >
                  Liberar DP
                </ActionButton>
              ) : null}
            </div>
          </div>
          {!dpLiberado && canManageDp && blockedReason ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
              <AlertTriangle aria-hidden="true" className="size-3.5" />
              DP bloqueado: {blockedReason}.
            </p>
          ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * Chip de status de um eixo de liberação (Fin/DP). Ícone + cor semânticos
 * (check/verde = liberado, relógio/âmbar = pendente) para leitura clara mesmo
 * sem distinção de cor; o estado completo vai no rótulo acessível.
 */
function StatusChip({
  label,
  full,
  done,
}: {
  label: string;
  full: string;
  done: boolean;
}) {
  const Icon = done ? CheckCircle2 : Clock;
  return (
    <StatusBadge tone={done ? "success" : "warning"}>
      <Icon aria-hidden="true" className="size-3.5" />
      <span>{label}</span>
      <span className="sr-only">
        {full}: {done ? "liberado" : "pendente"}
      </span>
    </StatusBadge>
  );
}

/** Pílula de contagem: destaque (warning) quando > 0. */
function MetricPill({ value }: { value: number }) {
  if (value === 0) {
    return <span className="text-sm tabular-nums text-soft">0</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-warning-soft px-2 py-0.5 text-xs font-semibold tabular-nums text-warning">
      <Clock aria-hidden="true" className="size-3.5" />
      {value}
    </span>
  );
}

/**
 * Toggle otimista da obrigatoriedade de lançamento diário (proposta item 1.2).
 * Alterna `Project.dailyEntryRequired` via action; reverte o estado local e
 * avisa se o servidor recusar. Somente leitura quando `canToggle=false`.
 */
function DailyEntryToggle({
  projectId,
  initial,
  canToggle,
  onResult,
  onToggled,
}: {
  projectId: string;
  initial: boolean;
  canToggle: boolean;
  onResult: (tone: "success" | "warning", text: string) => void;
  onToggled: () => void;
}) {
  const [required, setRequired] = useState(initial);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    if (!canToggle || isPending) return;
    const next = !required;
    setRequired(next); // otimista
    startTransition(async () => {
      const result = await setProjectDailyEntryRequired({
        projectId,
        required: next,
      });
      if (!result.ok) {
        setRequired(!next); // reverte
        onResult("warning", result.message);
        return;
      }
      setRequired(result.data.required);
      onResult(
        "success",
        result.data.required
          ? "Obrigatoriedade diária ligada."
          : "Obrigatoriedade diária desligada.",
      );
      // Revalida no servidor: o gate do "Liberar DP" depende da flag (sem
      // obrigatoriedade diária, "sem lançamento" deixa de bloquear).
      onToggled();
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={required}
      aria-label="Obrigatoriedade de lançamento diário"
      title={
        canToggle
          ? "Obrigatoriedade de lançamento diário"
          : "Obrigatoriedade de lançamento diário (sem permissão para alterar)"
      }
      disabled={!canToggle || isPending}
      onClick={toggle}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed",
        required
          ? "border-brand/30 bg-brand-soft text-brand-dark"
          : "border-border bg-surface-muted text-medium",
        focusRing,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative h-4 w-7 rounded-full transition-colors",
          required ? "bg-brand" : "bg-ink/25",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-3 rounded-full bg-white transition-all",
            required ? "left-3.5" : "left-0.5",
          )}
        />
      </span>
      Diário
    </button>
  );
}
