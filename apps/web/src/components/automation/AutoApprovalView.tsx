"use client";

import { useState, useTransition } from "react";
import {
  BotMessageSquare,
  CalendarClock,
  CheckCircle2,
  Hourglass,
  Pause,
  Play,
  Power,
  Timer,
} from "lucide-react";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ActionButton } from "@/components/ui/ActionButton";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { formatHours } from "@/lib/format";
import {
  exceptionTypeLabelOf,
  type AutoApprovalOverview,
} from "@/lib/db/automation";
import {
  runAutoApprovalNow,
  setExceptionActive,
} from "@/app/app/automacoes/aprovacao-automatica/actions";

const thClass =
  "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-soft";
const tdClass = "px-4 py-3 text-sm text-medium align-top";
const truncCell = "block max-w-[14rem] truncate";

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatShortDate(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

export interface AutoApprovalViewProps {
  overview: AutoApprovalOverview;
}

/**
 * Admin/observability screen for the auto-approval engine. Read-mostly: shows
 * effective config, active exceptions, the latest automatic approvals and the
 * SUBMITTED entries still pending (with the engine's estimated reasons).
 *
 * Mutations available: "Executar agora" (run the job on demand) and
 * activate/deactivate an exception. All actions re-check the role on the server
 * and report honestly through a polite live region.
 */
export function AutoApprovalView({ overview }: AutoApprovalViewProps) {
  const { config, activeExceptionsCount, exceptions, recentAutoApprovals, pending } =
    overview;
  const { feedback, notify } = useFeedback();
  const [isRunning, startRun] = useTransition();
  const [pendingExceptionId, setPendingExceptionId] = useState<string | null>(
    null,
  );
  const [isToggling, startToggle] = useTransition();

  function handleRun() {
    startRun(async () => {
      const result = await runAutoApprovalNow();
      if (!result.ok) {
        notify("warning", result.message);
        return;
      }
      const r = result.data;
      if (r.skipped) {
        notify(
          "info",
          r.reason === "disabled"
            ? "Automação desativada — nada foi processado."
            : "Banco não configurado — nada foi processado.",
        );
        return;
      }
      const racedSuffix = r.raced > 0 ? ` (${r.raced} em concorrência)` : "";
      notify(
        "success",
        `${r.processed} processados, ${r.approved} aprovados, ${r.pending} pendentes${racedSuffix}.`,
      );
    });
  }

  function handleToggle(id: string, nextActive: boolean) {
    setPendingExceptionId(id);
    startToggle(async () => {
      const result = await setExceptionActive({ exceptionId: id, active: nextActive });
      setPendingExceptionId(null);
      if (!result.ok) {
        notify("warning", result.message);
        return;
      }
      notify(
        "success",
        nextActive ? "Exceção reativada." : "Exceção desativada.",
      );
    });
  }

  return (
    <div className="space-y-6">
      <FeedbackBanner message={feedback} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={Power}
          label="Aprovação automática"
          value={config.autoApprovalEnabled ? "Ativa" : "Desativada"}
          hint={config.autoApprovalEnabled ? "Motor habilitado" : "Motor pausado"}
          valueClassName={config.autoApprovalEnabled ? "text-success" : "text-warning"}
        />
        <MetricCard
          icon={Timer}
          label="Total diário exigido"
          value={formatHours(config.requiredDailyMinutes / 60)}
          hint="Regra padrão (dia útil)"
        />
        <MetricCard
          icon={Hourglass}
          label="Atraso mínimo"
          value={`${config.approvalDelayMinutes} min`}
          hint="Após o envio"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Exceções ativas"
          value={String(activeExceptionsCount)}
          hint="Pares fora da regra padrão"
        />
      </div>

      <SectionPanel
        title="Executar agora"
        description="Roda o motor de aprovação automática sob demanda. Idempotente: lançamentos já decididos não são processados de novo."
        action={
          <ActionButton
            icon={BotMessageSquare}
            onClick={handleRun}
            disabled={isRunning}
            aria-busy={isRunning}
          >
            {isRunning ? "Executando…" : "Executar agora"}
          </ActionButton>
        }
      >
        <p className="px-5 py-4 text-sm text-medium">
          A automação também roda por agendamento (Vercel Cron). Use este botão
          para um disparo manual e observar o resultado imediato.
        </p>
      </SectionPanel>

      <SectionPanel
        title="Lançamentos pendentes"
        description="Lançamentos enviados que ainda não foram aprovados pelo motor, com o motivo estimado pela avaliação atual."
      >
        {pending.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Nenhum lançamento pendente"
            description="Não há lançamentos enviados aguardando aprovação automática neste momento."
            className="border-0 shadow-none"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-ink">
                  <th scope="col" className={thClass}>Consultor</th>
                  <th scope="col" className={thClass}>Projeto</th>
                  <th scope="col" className={thClass}>Data</th>
                  <th scope="col" className={`${thClass} text-right`}>Horas</th>
                  <th scope="col" className={thClass}>Atividade</th>
                  <th scope="col" className={thClass}>Motivo estimado</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr
                    key={p.entryId}
                    className="border-b border-ink/10 transition-colors hover:bg-surface-muted/60"
                  >
                    <td className={tdClass}>
                      <span className={truncCell} title={p.consultantName}>
                        {p.consultantName}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <span className={truncCell} title={p.projectName}>
                        {p.projectName}
                      </span>
                    </td>
                    <td className={`${tdClass} whitespace-nowrap`}>
                      {formatShortDate(p.date)}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap text-right tabular-nums text-strong`}>
                      {formatHours(p.hours)}
                    </td>
                    <td className={tdClass}>
                      <span className={truncCell} title={p.activity}>
                        {p.activity}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <div className="flex flex-wrap gap-1.5">
                        {p.reasons.length === 0 ? (
                          <span className="text-soft">—</span>
                        ) : (
                          p.reasons.map((reason) => (
                            <StatusBadge key={reason} tone="warning">
                              {reason}
                            </StatusBadge>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionPanel>

      <SectionPanel
        title="Exceções de aprovação"
        description="Pares consultor × projeto com regra de exceção. Desative para que voltem à regra padrão."
      >
        {exceptions.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Nenhuma exceção cadastrada"
            description="Não há exceções de aprovação automática configuradas."
            className="border-0 shadow-none"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-ink">
                  <th scope="col" className={thClass}>Consultor</th>
                  <th scope="col" className={thClass}>Projeto</th>
                  <th scope="col" className={thClass}>Tipo</th>
                  <th scope="col" className={thClass}>Status</th>
                  <th scope="col" className={`${thClass} text-right`}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {exceptions.map((e) => {
                  const busy = isToggling && pendingExceptionId === e.id;
                  return (
                    <tr
                      key={e.id}
                      className="border-b border-ink/10 transition-colors hover:bg-surface-muted/60"
                    >
                      <td className={tdClass}>
                        <span className={truncCell} title={e.consultantName}>
                          {e.consultantName}
                        </span>
                      </td>
                      <td className={tdClass}>
                        <span className={truncCell} title={e.projectName}>
                          {e.projectName}
                        </span>
                      </td>
                      <td className={tdClass}>{exceptionTypeLabelOf(e.type)}</td>
                      <td className={tdClass}>
                        <StatusBadge tone={e.active ? "success" : "neutral"}>
                          {e.active ? "Ativa" : "Inativa"}
                        </StatusBadge>
                      </td>
                      <td className={`${tdClass} text-right`}>
                        <ActionButton
                          size="sm"
                          variant={e.active ? "secondary" : "success"}
                          icon={e.active ? Pause : Play}
                          onClick={() => handleToggle(e.id, !e.active)}
                          disabled={busy}
                          aria-busy={busy}
                          aria-label={
                            e.active
                              ? `Desativar exceção de ${e.consultantName} em ${e.projectName}`
                              : `Reativar exceção de ${e.consultantName} em ${e.projectName}`
                          }
                        >
                          {busy ? "Salvando…" : e.active ? "Desativar" : "Reativar"}
                        </ActionButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionPanel>

      <SectionPanel
        title="Últimas aprovações automáticas"
        description="Lançamentos aprovados pelo motor, com a regra aplicada."
      >
        {recentAutoApprovals.length === 0 ? (
          <EmptyState
            icon={BotMessageSquare}
            title="Nenhuma aprovação automática ainda"
            description="As aprovações geradas pelo motor aparecerão aqui."
            className="border-0 shadow-none"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-ink">
                  <th scope="col" className={`${thClass} whitespace-nowrap`}>Quando</th>
                  <th scope="col" className={thClass}>Consultor</th>
                  <th scope="col" className={thClass}>Projeto</th>
                  <th scope="col" className={thClass}>Regra</th>
                </tr>
              </thead>
              <tbody>
                {recentAutoApprovals.map((a) => (
                  <tr
                    key={a.entityId}
                    className="border-b border-ink/10 transition-colors hover:bg-surface-muted/60"
                  >
                    <td className={`${tdClass} whitespace-nowrap`}>
                      {formatDateTime(a.createdAt)}
                    </td>
                    <td className={tdClass}>
                      <span className={truncCell} title={a.consultantName ?? undefined}>
                        {a.consultantName ?? "—"}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <span className={truncCell} title={a.projectName ?? undefined}>
                        {a.projectName ?? "—"}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <StatusBadge tone="info">{a.ruleKey ?? "—"}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionPanel>
    </div>
  );
}
