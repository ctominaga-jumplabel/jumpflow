"use client";

import { useTransition } from "react";
import {
  BotMessageSquare,
  CheckCircle2,
  Hourglass,
  Power,
  Timer,
  Users,
} from "lucide-react";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ActionButton } from "@/components/ui/ActionButton";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { formatHours } from "@/lib/format";
import type { AutoApprovalOverview } from "@/lib/db/automation";
import { runAutoApprovalNow } from "@/app/app/automacoes/aprovacao-automatica/actions";

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
 * Tela admin/observabilidade do motor de aprovação automática. A configuração
 * das regras é feita POR PROJETO (aba Aprovação no cadastro do projeto); aqui só
 * observamos: config efetiva, quantas regras existem, as últimas aprovações
 * automáticas e os lançamentos enviados ainda pendentes (com o motivo estimado).
 * Única mutação: "Executar agora" (dispara o job sob demanda).
 */
export function AutoApprovalView({ overview }: AutoApprovalViewProps) {
  const { config, projectRuleCount, consultantRuleCount, recentAutoApprovals, pending } =
    overview;
  const { feedback, notify } = useFeedback();
  const [isRunning, startRun] = useTransition();

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
          icon={Hourglass}
          label="Atraso mínimo"
          value={`${config.approvalDelayMinutes} min`}
          hint="Após o envio"
        />
        <MetricCard
          icon={Timer}
          label="Projetos com regra"
          value={String(projectRuleCount)}
          hint="Regra por projeto configurada"
        />
        <MetricCard
          icon={Users}
          label="Regras por consultor"
          value={String(consultantRuleCount)}
          hint="Modo exclusivo (vínculo)"
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
          As regras de aprovação automática são configuradas por projeto (aba
          Aprovação no cadastro do projeto). A automação também roda por
          agendamento (Vercel Cron); use este botão para um disparo manual.
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
