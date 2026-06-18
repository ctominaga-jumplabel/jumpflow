"use client";

import { useState, useTransition } from "react";
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
import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { formatHours } from "@/lib/format";
import type { AutoApprovalOverview } from "@/lib/db/automation";
import type { ProjectItem } from "@/lib/projects/types";
import { AutoApprovalConfigPanel } from "@/components/projects/shared/AutoApprovalConfigPanel";
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

/** minutos-do-dia -> "HH:mm". */
function minutesToHHmm(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

interface RuleSummaryRow {
  key: string;
  projectName: string;
  scope: string;
  weekendEnabled: boolean;
  hoursRangeEnabled: boolean;
  minMinutes: number;
  maxMinutes: number;
}

/**
 * Lista achatada das regras cadastradas a partir dos projetos: em modo
 * exclusivo (há regras por consultor) lista uma linha por consultor; senão, uma
 * linha para a regra do projeto. Projetos sem nenhuma regra não aparecem.
 */
function buildRuleRows(projects: ProjectItem[]): RuleSummaryRow[] {
  const rows: RuleSummaryRow[] = [];
  for (const project of projects) {
    const consultantRules = project.autoApprovalConsultantRules ?? [];
    if (consultantRules.length > 0) {
      for (const rule of consultantRules) {
        rows.push({
          key: rule.id,
          projectName: project.name,
          scope: rule.consultantName,
          weekendEnabled: rule.weekendEnabled,
          hoursRangeEnabled: rule.hoursRangeEnabled,
          minMinutes: rule.minMinutes,
          maxMinutes: rule.maxMinutes,
        });
      }
    } else if (project.autoApprovalRule) {
      rows.push({
        key: project.id,
        projectName: project.name,
        scope: "Projeto (todos)",
        weekendEnabled: project.autoApprovalRule.weekendEnabled,
        hoursRangeEnabled: project.autoApprovalRule.hoursRangeEnabled,
        minMinutes: project.autoApprovalRule.minMinutes,
        maxMinutes: project.autoApprovalRule.maxMinutes,
      });
    }
  }
  return rows;
}

export interface AutoApprovalViewProps {
  overview: AutoApprovalOverview;
  /** Projetos para o hub central de regras (seletor + painel). */
  projects?: ProjectItem[];
}

/**
 * Tela admin/observabilidade do motor de aprovação automática. A configuração
 * das regras é feita POR PROJETO (aba Aprovação no cadastro do projeto); aqui só
 * observamos: config efetiva, quantas regras existem, as últimas aprovações
 * automáticas e os lançamentos enviados ainda pendentes (com o motivo estimado).
 * Única mutação: "Executar agora" (dispara o job sob demanda).
 */
export function AutoApprovalView({
  overview,
  projects = [],
}: AutoApprovalViewProps) {
  const { config, projectRuleCount, consultantRuleCount, recentAutoApprovals, pending } =
    overview;
  const { feedback, notify } = useFeedback();
  const [isRunning, startRun] = useTransition();
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    () => projects[0]?.id ?? "",
  );
  const selectedProject =
    projects.find((p) => p.id === selectedProjectId) ?? null;
  const ruleRows = buildRuleRows(projects);

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
        title="Regras cadastradas"
        description="Regras de aprovação automática por projeto e por consultor (modo exclusivo). Projetos sem regra usam o padrão (total diário)."
      >
        {ruleRows.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Nenhuma regra cadastrada"
            description="Configure abaixo (ou na aba Aprovação do projeto) a regra de fim de semana e/ou range de horas."
            className="border-0 shadow-none"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-ink">
                  <th scope="col" className={thClass}>Projeto</th>
                  <th scope="col" className={thClass}>Escopo</th>
                  <th scope="col" className={thClass}>Fim de semana</th>
                  <th scope="col" className={thClass}>Range de horas</th>
                </tr>
              </thead>
              <tbody>
                {ruleRows.map((row) => (
                  <tr
                    key={row.key}
                    className="border-b border-ink/10 transition-colors hover:bg-surface-muted/60"
                  >
                    <td className={tdClass}>
                      <span className={truncCell} title={row.projectName}>
                        {row.projectName}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <span className={truncCell} title={row.scope}>
                        {row.scope}
                      </span>
                    </td>
                    <td className={tdClass}>
                      {row.weekendEnabled ? (
                        <StatusBadge tone="success">Liberado</StatusBadge>
                      ) : (
                        <span className="text-soft">—</span>
                      )}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap`}>
                      {row.hoursRangeEnabled ? (
                        <span className="tabular-nums text-strong">
                          {minutesToHHmm(row.minMinutes)} – {minutesToHHmm(row.maxMinutes)}
                        </span>
                      ) : (
                        <span className="text-soft">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionPanel>

      <SectionPanel
        title="Regras por projeto"
        description="Configure a regra de aprovação automática (fim de semana e/ou range de horas) e vincule consultores. O mesmo cadastro está disponível na aba Aprovação de cada projeto."
      >
        {projects.length === 0 ? (
          <EmptyState
            icon={Timer}
            title="Nenhum projeto disponível"
            description="Cadastre projetos para configurar regras de aprovação automática."
            className="border-0 shadow-none"
          />
        ) : (
          <div className="space-y-4 px-5 py-4">
            <label className="block max-w-md space-y-1 text-sm font-medium text-medium">
              Projeto
              <select
                aria-label="Selecionar projeto"
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                className={cn(
                  "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm",
                  focusRingInput,
                )}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.clientName}
                  </option>
                ))}
              </select>
            </label>
            {selectedProject ? (
              <AutoApprovalConfigPanel
                key={selectedProject.id}
                project={selectedProject}
                canManageProjects
              />
            ) : null}
          </div>
        )}
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
