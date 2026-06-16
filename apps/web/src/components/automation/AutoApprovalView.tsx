"use client";

import { useState, useTransition } from "react";
import {
  BotMessageSquare,
  CalendarClock,
  CheckCircle2,
  Hourglass,
  Pause,
  Play,
  Plus,
  Power,
  Timer,
} from "lucide-react";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { cn } from "@/lib/utils";
import { focusRingInput } from "@/lib/styles";
import { formatHours } from "@/lib/format";
import {
  exceptionTypeLabelOf,
  type AutoApprovalOverview,
} from "@/lib/db/automation";
import {
  createAutoApprovalException,
  runAutoApprovalNow,
  setExceptionActive,
} from "@/app/app/automacoes/aprovacao-automatica/actions";

type ExceptionType = "ANY_HOURS" | "WEEKEND";

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong placeholder:text-soft " +
  focusRingInput;
const formLabelClass = "mb-1 block text-xs font-semibold text-medium";

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
  const {
    config,
    activeExceptionsCount,
    exceptions,
    recentAutoApprovals,
    pending,
    consultantOptions,
    projectOptions,
  } = overview;
  const { feedback, notify } = useFeedback();
  const [isRunning, startRun] = useTransition();
  const [pendingExceptionId, setPendingExceptionId] = useState<string | null>(
    null,
  );
  const [isToggling, startToggle] = useTransition();

  const [createOpen, setCreateOpen] = useState(false);
  const [isCreating, startCreate] = useTransition();
  const [createError, setCreateError] = useState<string | null>(null);
  const [newException, setNewException] = useState<{
    consultantId: string;
    projectId: string;
    type: ExceptionType;
    note: string;
  }>({ consultantId: "", projectId: "", type: "ANY_HOURS", note: "" });

  function openCreate() {
    setNewException({
      consultantId: consultantOptions[0]?.id ?? "",
      projectId: projectOptions[0]?.id ?? "",
      type: "ANY_HOURS",
      note: "",
    });
    setCreateError(null);
    setCreateOpen(true);
  }

  function handleCreate() {
    if (!newException.consultantId || !newException.projectId) {
      setCreateError("Selecione o consultor e o projeto.");
      return;
    }
    startCreate(async () => {
      const result = await createAutoApprovalException({
        consultantId: newException.consultantId,
        projectId: newException.projectId,
        type: newException.type,
        note: newException.note || undefined,
      });
      if (!result.ok) {
        setCreateError(result.message);
        return;
      }
      setCreateOpen(false);
      notify("success", "Exceção cadastrada.");
    });
  }

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
        action={
          <ActionButton
            size="sm"
            icon={Plus}
            onClick={openCreate}
            disabled={consultantOptions.length === 0 || projectOptions.length === 0}
          >
            Nova exceção
          </ActionButton>
        }
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

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nova exceção"
        description="Cadastre uma exceção de aprovação automática para um par consultor × projeto."
        footer={
          <>
            <ActionButton
              variant="secondary"
              size="sm"
              disabled={isCreating}
              onClick={() => setCreateOpen(false)}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              variant="primary"
              size="sm"
              icon={Plus}
              disabled={isCreating}
              aria-busy={isCreating}
              onClick={handleCreate}
            >
              {isCreating ? "Salvando…" : "Cadastrar"}
            </ActionButton>
          </>
        }
      >
        <div className="space-y-4">
          {createError ? (
            <div className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
              {createError}
            </div>
          ) : null}

          <div>
            <label htmlFor="exc-consultant" className={formLabelClass}>
              Consultor
            </label>
            <select
              id="exc-consultant"
              value={newException.consultantId}
              onChange={(event) =>
                setNewException((value) => ({
                  ...value,
                  consultantId: event.target.value,
                }))
              }
              className={inputClass}
            >
              {consultantOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="exc-project" className={formLabelClass}>
              Projeto
            </label>
            <select
              id="exc-project"
              value={newException.projectId}
              onChange={(event) =>
                setNewException((value) => ({
                  ...value,
                  projectId: event.target.value,
                }))
              }
              className={inputClass}
            >
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.clientName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="exc-type" className={formLabelClass}>
              Tipo de exceção
            </label>
            <select
              id="exc-type"
              value={newException.type}
              onChange={(event) =>
                setNewException((value) => ({
                  ...value,
                  type: event.target.value as ExceptionType,
                }))
              }
              className={inputClass}
            >
              <option value="ANY_HOURS">{exceptionTypeLabelOf("ANY_HOURS")}</option>
              <option value="WEEKEND">{exceptionTypeLabelOf("WEEKEND")}</option>
            </select>
          </div>

          <div>
            <label htmlFor="exc-note" className={formLabelClass}>
              Nota <span className="font-normal text-soft">(opcional)</span>
            </label>
            <textarea
              id="exc-note"
              value={newException.note}
              onChange={(event) =>
                setNewException((value) => ({
                  ...value,
                  note: event.target.value,
                }))
              }
              rows={2}
              className={cn(inputClass, "resize-y")}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
