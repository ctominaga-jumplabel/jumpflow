"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calculator,
  CheckCircle2,
  Clock,
  DollarSign,
  Info,
  Receipt,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing, focusRingInput } from "@/lib/styles";
import { formatCurrencyPrecise } from "@/lib/format";
import { ActionButton } from "@/components/ui/ActionButton";
import { ExportExcelButton } from "@/components/ui/ExportExcelButton";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { BillingSignals } from "./BillingSignals";
import type {
  ApuracaoConsultantRow,
  CompetenceSendResult,
  EnviarApuracaoResult,
} from "@/lib/financial/receivables-journey-core";
import {
  enviarApuracao,
  marcarApuracaoFaturada,
} from "@/app/app/financeiro/actions";

/** Horas decimais efetivas → "HH:MM" (ex.: 2.5 → "02:30"). */
function toHHMM(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Iniciais para o avatar do alocado (até duas letras). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** "MM/AAAA" a partir de mês/ano. */
function competenceLabel(month: number, year: number): string {
  return `${String(month).padStart(2, "0")}/${year}`;
}

/** Estado inicial (hidratado do servidor) do fechamento/envio deste projeto. */
export interface ApuracaoProjectInitialState {
  /** Há competência(s) `CLOSED` → "Enviar" já nasce habilitado. */
  anyClosed: boolean;
  /** Todas as competências `CLOSED` já foram enviadas → "Apuração Enviada". */
  allSent: boolean;
  /** Competências já enviadas (para o reenvio EXPLÍCITO por competência). */
  sentCompetences: Array<{ month: number; year: number }>;
}

/** View-model de um projeto na tela de Apuração (montado no server). */
export interface ApuracaoProjectView {
  projectId: string;
  projectName: string;
  clientName: string;
  /** Resolvido no server (project → clientId); null quando indisponível. */
  clientId: string | null;
  consultants: ApuracaoConsultantRow[];
  totalHours: number;
  totalAmount: number | null;
  /** Σ horas faturáveis sem valor de venda (subfaturamento; review #3). */
  unratedBillableHours: number;
  /** Cobrança não-horária: valor pode divergir do fechamento (review #3). */
  nonHourlyBilling: boolean;
  /** Estado hidratado do servidor (review MÉDIO #2). */
  initialState: ApuracaoProjectInitialState;
  /** `.xlsx` de Apuração escopado a este projeto (rota gated). */
  exportHref: string;
}

export interface ApuracaoViewProps {
  projects: ApuracaoProjectView[];
  includeFinancials: boolean;
  /** Ex.: "01/07/2026 até 31/07/2026" ou "Período não definido". */
  periodLabel: string;
  /** ISO from/to do recorte; ausentes desabilitam o envio. */
  from?: string;
  to?: string;
  /** FINANCIAL_ROLES: pode ENVIAR a apuração. Gate real é server. */
  canSend: boolean;
  /** Volta para a aba Contas a Receber preservando os filtros. */
  backHref: string;
}

/**
 * Tela de Apuração (Contas a Receber). Multi-projeto EMPILHADO: cada projeto é um
 * card com cabeçalho (Período/Cliente/Projeto), Resumo dos alocados, totais,
 * sinais de subfaturamento/cobrança não-horária, Observações e o ENVIO:
 *
 *   Enviar Apuração (FINANCIAL_ROLES) — `enviarApuracao`, desabilitado até a
 *   competência estar `CLOSED` (o fechamento/liberação é passo separado do
 *   Gerente de Área, agora em "Pendentes de Fechamento"); reenvio explícito por
 *   competência com confirmação.
 *
 * O estado de fechamento/envio é HIDRATADO do servidor no carregamento (um
 * projeto já liberado nasce com "Enviar" habilitado; um já enviado nasce como
 * "Apuração Enviada"), sem exigir clique (§0.6).
 */
export function ApuracaoView({
  projects,
  includeFinancials,
  periodLabel,
  from,
  to,
  canSend,
  backHref,
}: ApuracaoViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={backHref}
          aria-label="Voltar para Contas a Receber"
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-md border-2 border-ink bg-surface text-strong shadow-[2px_2px_0_0_var(--color-ink)] transition-transform hover:-translate-y-px",
            focusRing,
          )}
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
        </Link>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-soft">
            Contas a Receber
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-strong">
            Apuração
          </h1>
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title="Nada a apurar no recorte"
          description="Ajuste o período, o cliente ou os projetos e gere a apuração novamente."
          action={
            <Link
              href={backHref}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-2 rounded-md border-2 border-ink bg-surface px-4 text-sm font-semibold text-strong shadow-[3px_3px_0_0_var(--color-ink)]",
                focusRing,
              )}
            >
              Voltar para Contas a Receber
            </Link>
          }
        />
      ) : (
        projects.map((project) => (
          <ApuracaoProjectCard
            key={project.projectId}
            project={project}
            includeFinancials={includeFinancials}
            periodLabel={periodLabel}
            from={from}
            to={to}
            canSend={canSend}
            backHref={backHref}
          />
        ))
      )}
    </div>
  );
}

interface ApuracaoProjectCardProps {
  project: ApuracaoProjectView;
  includeFinancials: boolean;
  periodLabel: string;
  from?: string;
  to?: string;
  canSend: boolean;
  backHref: string;
}

/** Mapeia o resultado do envio em uma mensagem honesta (tom + texto). */
function summarizeSend(
  result: EnviarApuracaoResult,
): { tone: "success" | "warning"; text: string } {
  const problem = result.competences.find(
    (c: CompetenceSendResult) =>
      c.status !== "SENT" && c.status !== "ALREADY_SENT",
  );
  if (!problem) {
    return { tone: "success", text: "Apuração enviada." };
  }
  switch (problem.status) {
    case "NO_CONTACT_EMAIL":
      return {
        tone: "warning",
        text: "Cliente sem e-mail de cobrança. Cadastre ao menos um e-mail do cliente antes de enviar a apuração.",
      };
    case "SKIPPED_OFF":
      return {
        tone: "warning",
        text: "A regra de notificação de pré-fatura está desligada. Ligue-a em Configurações › Notificações para enviar.",
      };
    case "NOT_CLOSED":
      return {
        tone: "warning",
        text:
          problem.message ??
          "Aguardando fechamento pelo Gerente de Área antes de enviar.",
      };
    default:
      return {
        tone: "warning",
        text: problem.message ?? "Não foi possível enviar a apuração.",
      };
  }
}

const SEND_STATUS_LABEL: Record<CompetenceSendResult["status"], string> = {
  SENT: "Enviado",
  ALREADY_SENT: "Já enviado",
  NOT_CLOSED: "Aguardando fechamento",
  NO_CONTACT_EMAIL: "Sem e-mail de cobrança",
  SKIPPED_OFF: "Notificação desligada",
  ERROR: "Erro",
};

function isGoodSend(status: CompetenceSendResult["status"]): boolean {
  return status === "SENT" || status === "ALREADY_SENT";
}

/** Chips por competência refletindo o resultado da última ação (fechar/enviar). */
function CompetenceResultChips({
  results,
}: {
  results: Array<{
    month: number;
    year: number;
    label: string;
    good: boolean;
  }>;
}) {
  if (results.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {results.map((r) => (
        <li
          key={`${r.year}-${r.month}`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
            r.good
              ? "border-success/30 bg-success-soft text-success"
              : "border-warning/30 bg-warning-soft text-warning",
          )}
        >
          <span className="tabular-nums">
            {competenceLabel(r.month, r.year)}
          </span>
          <span>· {r.label}</span>
        </li>
      ))}
    </ul>
  );
}

function ApuracaoProjectCard({
  project,
  includeFinancials,
  periodLabel,
  from,
  to,
  canSend,
  backHref,
}: ApuracaoProjectCardProps) {
  const { feedback, notify, clear } = useFeedback();
  const [isPending, startTransition] = useTransition();

  // Observações do ENVIO (opcional; a auditoria do envio registra).
  const [observacoes, setObservacoes] = useState("");
  const [obsError, setObsError] = useState<string | null>(null);

  // Estados hidratados do servidor (review MÉDIO #2): habilitam Enviar / marcam
  // "Apuração Enviada" sem exigir clique. O fechamento (CLOSED) agora acontece em
  // "Pendentes de Fechamento" (Gerente de Área), então aqui `closed` é só leitura.
  const [closed] = useState(project.initialState.anyClosed);
  const [alreadySent, setAlreadySent] = useState(project.initialState.allSent);
  const [success, setSuccess] = useState(false);
  // Faturamento manual (Status de Faturamento): marcado nesta sessão para dar
  // feedback imediato (a fonte é o servidor no próximo carregamento).
  const [invoiced, setInvoiced] = useState(false);

  // ENVIAR: confirmação de reenvio + resultado por competência.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sendResults, setSendResults] = useState<CompetenceSendResult[]>([]);
  // Competências (mês/ano) já enviadas que precisam de confirmação para reenvio
  // EXPLÍCITO por competência. Semeadas do estado hidratado do servidor.
  const [pendingResend, setPendingResend] = useState<
    Array<{ month: number; year: number }>
  >(project.initialState.sentCompetences);

  const hasPeriod = Boolean(from && to && project.clientId);

  function doSend(resendCompetences?: Array<{ month: number; year: number }>) {
    if (!from || !to || !project.clientId) {
      notify(
        "warning",
        "Defina data inicial e final no filtro para enviar a apuração.",
      );
      return;
    }
    clear();
    setObsError(null);
    startTransition(async () => {
      const result = await enviarApuracao({
        projectId: project.projectId,
        from,
        to,
        observacoes: observacoes.trim() || undefined,
        ...(resendCompetences && resendCompetences.length > 0
          ? { resendCompetences }
          : {}),
      });

      if (!result.ok) {
        if (result.error === "INVALID_INPUT") {
          setObsError(result.message);
        }
        notify("warning", result.message);
        return;
      }

      const data = result.data;
      setSendResults(data.competences);

      // Já enviado sem confirmação → guarda as competências e pede confirmação.
      if (data.needsConfirmResend) {
        setPendingResend(
          data.competences
            .filter((c) => c.status === "ALREADY_SENT")
            .map((c) => ({ month: c.month, year: c.year })),
        );
        setAlreadySent(true);
        setConfirmOpen(true);
        return;
      }
      if (data.allSent) {
        setAlreadySent(true);
        setSuccess(true);
        return;
      }
      // Envio parcial/degradado: feedback honesto por status (NOT_CLOSED é
      // pendência de fechamento, não erro).
      const summary = summarizeSend(data);
      notify(summary.tone, summary.text);
    });
  }

  function handlePrimaryClick() {
    // Já enviado → confirma reenvio direto das competências já enviadas.
    if (alreadySent) {
      setConfirmOpen(true);
      return;
    }
    doSend();
  }

  function doMarcarFaturado() {
    if (!from || !to || !project.clientId) {
      notify(
        "warning",
        "Defina data inicial e final no filtro para marcar como faturado.",
      );
      return;
    }
    clear();
    startTransition(async () => {
      const result = await marcarApuracaoFaturada({
        projectId: project.projectId,
        from,
        to,
      });
      if (!result.ok) {
        notify("warning", result.message);
        return;
      }
      if (result.data.allDone) {
        setInvoiced(true);
        notify("success", "Faturamento marcado. O projeto sai dos pendentes.");
        return;
      }
      const problem = result.data.competences.find(
        (c) =>
          c.status !== "INVOICED" &&
          c.status !== "ALREADY_INVOICED" &&
          c.status !== "NOT_FOUND",
      );
      notify(
        "warning",
        problem?.message ??
          "Não foi possível marcar o faturamento de todas as competências.",
      );
    });
  }

  if (success) {
    return (
      <section className="rounded-[var(--radius-card)] border-2 border-ink bg-surface p-8 shadow-[4px_4px_0_0_var(--color-ink)]">
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <span className="grid size-16 place-items-center rounded-full border-2 border-ink bg-success-soft text-success shadow-[3px_3px_0_0_var(--color-ink)]">
            <CheckCircle2 aria-hidden="true" className="size-9" />
          </span>
          <h2 className="mt-5 text-xl font-semibold text-strong">
            Apuração enviada com sucesso!
          </h2>
          <dl className="mt-4 space-y-1.5 text-sm text-medium">
            <div className="flex justify-center gap-2">
              <dt className="font-semibold text-strong">Período:</dt>
              <dd>{periodLabel}</dd>
            </div>
            <div className="flex justify-center gap-2">
              <dt className="font-semibold text-strong">Cliente:</dt>
              <dd>{project.clientName}</dd>
            </div>
            <div className="flex justify-center gap-2">
              <dt className="font-semibold text-strong">Projeto:</dt>
              <dd>{project.projectName}</dd>
            </div>
          </dl>
          <Link
            href={backHref}
            className={cn(
              "mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md border-2 border-ink bg-surface px-5 text-sm font-semibold text-strong shadow-[3px_3px_0_0_var(--color-ink)] transition-[transform,box-shadow] duration-150 hover:-translate-x-px hover:-translate-y-px hover:shadow-[4px_4px_0_0_var(--color-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_var(--color-ink)]",
              focusRing,
            )}
          >
            Voltar para Contas a Receber
          </Link>
        </div>
      </section>
    );
  }

  const sendDisabled = isPending || !hasPeriod || (!closed && !alreadySent);
  // "Aguardando fechamento": só faz sentido quando há período e ainda não fechou.
  const showWaitingClose = canSend && hasPeriod && !closed && !alreadySent;

  return (
    <section className="space-y-5 rounded-[var(--radius-card)] border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_var(--color-ink)]">
      {/* Cabeçalho: Período / Cliente / Projeto */}
      <div className="grid gap-4 rounded-md border border-border bg-surface-muted p-4 sm:grid-cols-3">
        <HeaderField label="Período" value={periodLabel} />
        <HeaderField label="Cliente" value={project.clientName} />
        <HeaderField label="Projeto" value={project.projectName} />
      </div>

      {/* Sinais discretos: subfaturamento / cobrança não-horária (review #3) */}
      <BillingSignals
        unratedBillableHours={project.unratedBillableHours}
        hasNonHourlyBilling={project.nonHourlyBilling}
      />

      {/* Resumo dos alocados */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-strong">
          Resumo dos alocados
        </h2>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-left text-xs font-semibold text-medium">
                <th className="px-4 py-2.5">Alocado</th>
                <th className="px-4 py-2.5">Total de Horas</th>
                <th className="px-4 py-2.5">Valor / Hora (Venda)</th>
                <th className="px-4 py-2.5">Valor Total</th>
              </tr>
            </thead>
            <tbody>
              {project.consultants.map((consultant) => (
                <tr
                  key={consultant.consultantId}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-ink bg-brand-soft text-xs font-semibold text-brand-dark">
                        {initialsOf(consultant.consultantName)}
                      </span>
                      <span className="truncate font-medium text-strong">
                        {consultant.consultantName}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-strong">
                    {toHHMM(consultant.totalHours)}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-medium">
                    {includeFinancials && consultant.saleRate != null
                      ? formatCurrencyPrecise(consultant.saleRate)
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums font-medium text-strong">
                    {includeFinancials && consultant.totalAmount != null
                      ? formatCurrencyPrecise(consultant.totalAmount)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totais */}
      <div className="grid gap-4 sm:grid-cols-2">
        <TotalCard
          icon={Clock}
          label="Total de horas do período"
          value={toHHMM(project.totalHours)}
        />
        <TotalCard
          icon={DollarSign}
          label="Total a faturar"
          value={
            includeFinancials && project.totalAmount != null
              ? formatCurrencyPrecise(project.totalAmount)
              : "—"
          }
        />
      </div>

      {/* Observações do envio */}
      <div>
        <label className="block text-sm font-medium text-medium">
          Observações (opcional)
          <textarea
            value={observacoes}
            onChange={(e) => {
              setObservacoes(e.target.value);
              if (obsError) setObsError(null);
            }}
            rows={3}
            placeholder="Adicione observações sobre esta apuração..."
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
            O envio exige que o fechamento já esteja liberado pelo Gerente de
            Área. As observações seguem registradas na auditoria do envio.
          </p>
        )}
      </div>

      <FeedbackBanner message={feedback} />

      {/* Resultado por competência do último envio. */}
      {sendResults.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-soft">
            Envio por competência
          </p>
          <CompetenceResultChips
            results={sendResults.map((c) => ({
              month: c.month,
              year: c.year,
              label: SEND_STATUS_LABEL[c.status],
              good: isGoodSend(c.status),
            }))}
          />
        </div>
      ) : null}

      {!hasPeriod ? (
        <p className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
          <Info aria-hidden="true" className="size-4 shrink-0" />
          Defina data inicial e final no filtro de Contas a Receber para enviar
          esta apuração.
        </p>
      ) : showWaitingClose ? (
        <p className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
          <Info aria-hidden="true" className="size-4 shrink-0" />
          Aguardando fechamento pelo Gerente de Área. O envio habilita quando o
          faturamento estiver liberado.
        </p>
      ) : null}

      {/* Ações */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ExportExcelButton
          href={project.exportHref}
          label="Exportar Excel"
          className="h-10 px-4 text-sm"
        />
        {canSend ? (
          <ActionButton
            variant={alreadySent ? "success" : "primary"}
            icon={alreadySent ? CheckCircle2 : Send}
            onClick={handlePrimaryClick}
            disabled={sendDisabled}
          >
            {alreadySent ? "Apuração Enviada" : "Enviar Apuração"}
          </ActionButton>
        ) : null}
        {canSend ? (
          <ActionButton
            variant={invoiced ? "success" : "secondary"}
            icon={invoiced ? CheckCircle2 : Receipt}
            onClick={doMarcarFaturado}
            disabled={isPending || !hasPeriod || !closed || invoiced}
          >
            {invoiced ? "Faturado" : "Marcar como Faturado"}
          </ActionButton>
        ) : null}
      </div>

      {/* Modal REENVIO: confirmação. */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Apuração já enviada"
        description="Deseja enviar novamente a apuração deste projeto ao cliente?"
        footer={
          <>
            <ActionButton
              variant="secondary"
              size="sm"
              onClick={() => setConfirmOpen(false)}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              variant="primary"
              size="sm"
              disabled={isPending}
              onClick={() => {
                setConfirmOpen(false);
                doSend(pendingResend);
              }}
            >
              Enviar novamente
            </ActionButton>
          </>
        }
      >
        <p className="text-sm text-medium">
          Esta apuração já foi enviada ao e-mail de cobrança do cliente. Um novo
          envio dispara outro e-mail com a pré-fatura.
        </p>
      </Modal>
    </section>
  );
}

function HeaderField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-soft">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium text-strong">{value}</p>
    </div>
  );
}

function TotalCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-surface-muted p-4 text-center">
      <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-medium">
        <Icon aria-hidden="true" className="size-4" />
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-strong">
        {value}
      </p>
    </div>
  );
}
