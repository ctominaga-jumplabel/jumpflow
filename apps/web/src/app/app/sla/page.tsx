import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FinanceTabs } from "@/components/financial/FinanceTabs";
import { SlaAreaCards } from "@/components/sla/SlaAreaCards";
import { SlaBusinessCalendar } from "@/components/sla/SlaBusinessCalendar";
import { SlaConfigForm } from "@/components/sla/SlaConfigForm";
import { SlaFlowStepper } from "@/components/sla/SlaFlowStepper";
import { SlaHistoryTable } from "@/components/sla/SlaHistoryTable";
import { SlaPendingTable } from "@/components/sla/SlaPendingTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { requirePermission } from "@/lib/auth/guards";
import { FLOW_PERMISSION_CODES } from "@/lib/auth/permission-codes";
import { can } from "@/lib/auth/permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { loadSlaDashboard, resolveSlaViewerScope } from "@/lib/db/sla";
import { formatMonth } from "@/lib/format";
import {
  competenceKey,
  competenceOf,
  formatDeadlineShort,
  isoDateInSaoPaulo,
  nextCompetence,
  parseCompetenceKey,
  previousCompetence,
  resolvePaymentDate,
  slaCalendarFromHolidays,
} from "@/lib/sla/business-days";
import {
  SLA_PROCESSES,
  SLA_PROCESS_LABEL,
  SLA_PROCESS_SLUG,
  processFromSlug,
} from "@/lib/sla/types";
import { focusRing, focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "SLA do fluxo de horas" };

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SlaPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const user = await requirePermission(FLOW_PERMISSION_CODES.slaTracking, "view");
  const canEdit = await can(FLOW_PERMISSION_CODES.slaSettings, "edit");
  // Itens das etapas de pagamento (nome, contrato, NF) so para quem ve
  // Pagamentos; os demais veem apenas os agregados dessas etapas.
  const canSeePayments = await can("PAGAMENTOS", "view");
  const scope = await resolveSlaViewerScope(user, canSeePayments);

  const params = await searchParams;
  const now = new Date();
  const today = isoDateInSaoPaulo(now);
  const currentCompetence = competenceOf(today);
  // Padrao: mes anterior — e a competencia cujos prazos estao correndo.
  const competence = parseCompetenceKey(first(params.m)) ?? previousCompetence(currentCompetence);
  const process = processFromSlug(first(params.p));
  const requestedTab = first(params.tab);
  const tab = requestedTab === "configuracao" && canEdit ? "configuracao" : "acompanhamento";

  const data = await loadSlaDashboard({ competence, now, scope });
  const evaluation = data.evaluations[process];
  const calendar = slaCalendarFromHolidays(data.holidays, data.config.settings.considerStateHolidays);
  const paymentDate =
    process === "HOURS_TO_PAYMENT"
      ? resolvePaymentDate(competence, data.config.settings.paymentDay, calendar)
      : null;

  const ck = competenceKey(competence);
  const prev = competenceKey(previousCompetence(competence));
  const next = competenceKey(nextCompetence(competence));
  const href = (overrides: { m?: string; p?: string }) =>
    `/app/sla?${new URLSearchParams({
      m: overrides.m ?? ck,
      p: overrides.p ?? SLA_PROCESS_SLUG[process],
    }).toString()}`;

  const pendingTotal = evaluation.stages.reduce(
    (acc, s) => acc + s.counts.OVERDUE + s.counts.AT_RISK + s.counts.PENDING_OK,
    0,
  );
  const overdueTotal = evaluation.stages.reduce((acc, s) => acc + s.counts.OVERDUE, 0);

  const tracking = (
    <div className="space-y-6">
      {/* Competencia + processo */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <form method="get" action="/app/sla" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="p" value={SLA_PROCESS_SLUG[process]} />
          <Link
            href={href({ m: prev })}
            aria-label="Competência anterior"
            className={cn("rounded-md border border-border p-1.5 text-medium hover:bg-surface-muted", focusRing)}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Link>
          <label className="grid gap-1 text-xs font-medium text-medium">
            Competência
            <input
              type="month"
              name="m"
              defaultValue={ck}
              className={cn("rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-ink", focusRingInput)}
            />
          </label>
          <Link
            href={href({ m: next })}
            aria-label="Próxima competência"
            className={cn("rounded-md border border-border p-1.5 text-medium hover:bg-surface-muted", focusRing)}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
          <button
            type="submit"
            className={cn("rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-medium hover:bg-surface-muted", focusRing)}
          >
            Ver
          </button>
        </form>
        <nav aria-label="Processo" className="flex gap-1 rounded-lg border border-border bg-surface-muted p-1">
          {SLA_PROCESSES.map((p) => {
            const active = p === process;
            return (
              <Link
                key={p}
                href={href({ p: SLA_PROCESS_SLUG[p] })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-semibold",
                  active ? "border border-ink bg-surface text-strong shadow-[2px_2px_0_0_var(--color-ink)]" : "text-medium hover:text-strong",
                  focusRing,
                )}
              >
                {SLA_PROCESS_LABEL[p]}
              </Link>
            );
          })}
        </nav>
      </div>

      <p className="text-sm text-medium">
        Competência <strong className="capitalize">{formatMonth(competence.month, competence.year)}</strong>
        {" · "}
        {pendingTotal === 0
          ? "nenhuma pendência aberta"
          : `${pendingTotal} pendência(s) aberta(s), ${overdueTotal} atrasada(s)`}
        {paymentDate ? <> · pagamento em <strong>{formatDeadlineShort(paymentDate)}</strong></> : null}
      </p>

      {scope.managedProjectIds ? (
        <p className="rounded-md border border-border bg-surface-muted px-4 py-2 text-xs text-medium">
          Etapas operacionais filtradas aos projetos que você gerencia.
        </p>
      ) : null}

      <SectionPanel
        title="Fluxo do processo"
        description="Etapas em ordem, com área responsável, prazo em dias úteis e quanto já foi concluído."
      >
        <SlaFlowStepper stages={evaluation.stages} />
      </SectionPanel>

      <SlaAreaCards areas={evaluation.areas} />

      <SectionPanel
        title="Pendências e atrasos"
        description="Itens por etapa com o responsável e o atalho para a tela onde a ação acontece."
      >
        <SlaPendingTable stages={evaluation.stages} />
      </SectionPanel>

      <SectionPanel
        title="Calendário de dias úteis"
        description="Feriados considerados no cálculo e os prazos das etapas deste processo."
      >
        <SlaBusinessCalendar
          competence={competence}
          nextCompetence={nextCompetence(competence)}
          calendar={calendar}
          stages={evaluation.stages}
          paymentDate={paymentDate}
          today={today}
        />
      </SectionPanel>

      <SectionPanel
        title="Histórico de cumprimento"
        description="% de itens concluídos no prazo por etapa nas últimas 6 competências."
      >
        <SlaHistoryTable history={data.history[process]} />
      </SectionPanel>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operação"
        title="SLA do fluxo de horas"
        description="Acompanhe, por área, se cada etapa — do lançamento das horas ao faturamento e ao pagamento do consultor — está dentro do prazo em dias úteis."
      />
      {!isDatabaseConfigured() ? (
        <p className="rounded-md border border-border bg-surface-muted px-4 py-3 text-sm text-medium">
          Banco de dados não configurado: exibindo os prazos padrão sem itens.
        </p>
      ) : null}
      {canEdit ? (
        <FinanceTabs
          defaultTabId={tab}
          ariaLabel="Visões do SLA"
          tabs={[
            { id: "acompanhamento", label: "Acompanhamento", content: tracking },
            {
              id: "configuracao",
              label: "Configuração",
              content: (
                <SlaConfigForm
                  initial={data.config}
                  holidays={data.holidays}
                  previewFrom={currentCompetence}
                />
              ),
            },
          ]}
        />
      ) : (
        tracking
      )}
    </div>
  );
}
