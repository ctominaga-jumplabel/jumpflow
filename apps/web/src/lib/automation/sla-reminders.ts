/**
 * Lembretes de SLA do fluxo de horas (item 5).
 *
 * Executado 1x por dia util (cron externo chamando /api/jobs/sla-reminders).
 * Para as competencias "abertas" — as {@link SLA_REMINDER_LOOKBACK_MONTHS}
 * anteriores (prazos de aprovacao, fechamento, liberacao DP, NF e pagamento; as
 * mais antigas so geram escalonamento de atraso enquanto houver pendencia) e o
 * mes CORRENTE (lancamento ate o ultimo dia util) — avalia cada etapa ativa e,
 * havendo itens pendentes:
 *   - etapa EM RISCO (faltam <= warningBusinessDays dias uteis, inclusive "vence
 *     hoje") -> SLA_DEADLINE_APPROACHING ("faltam 3/2/1 dias");
 *   - etapa ATRASADA -> SLA_OVERDUE (escalonamento diario ate concluir).
 * Etapas concluidas, sem itens ou ainda folgadas nao geram nada.
 *
 * Idempotencia: dedupeKey = `<competencia>:<processo>:<etapa>:<dia>`; o motor
 * (emit.ts) grava AutomationEmailLog com referenceKey
 * `<evento>:<dedupeKey>:<destinatario>` e pula quem ja recebeu (SENT). Rodar o
 * job N vezes no mesmo dia envia no maximo 1 lembrete por etapa/competencia/
 * destinatario; no dia seguinte o lembrete se repete (e a cobranca diaria).
 * Etapas compartilhadas pelos dois processos (lancamento, aprovacao,
 * fechamento) com o mesmo prazo sao notificadas uma unica vez.
 *
 * Regras de destinatario ficam em /app/admin/notificacoes (seed: ROLE
 * AREA_MANAGER + PEOPLE + FINANCE). Fins de semana/feriados: nao envia.
 */
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  evaluateCompetence,
  loadSlaCalendar,
  loadSlaConfig,
} from "@/lib/db/sla";
import { formatMonth } from "@/lib/format";
import {
  competenceKey,
  competenceOf,
  formatDeadlineShort,
  isBusinessDay,
  isoDateInSaoPaulo,
  shiftCompetence,
  type Competence,
  type IsoDate,
} from "@/lib/sla/business-days";
import { SLA_PAYMENT_STAGES, type SlaStageEvaluation } from "@/lib/sla/evaluate";
import {
  SLA_AREA_LABEL,
  SLA_PROCESS_LABEL,
  SLA_PROCESSES,
  type SlaProcessKey,
} from "@/lib/sla/types";
import {
  button,
  callout,
  dataTable,
  keyValueList,
  paragraph,
  type EmailBlock,
} from "./email/layout";
import { emitNotification } from "./notifications/emit";

/** Maximo de linhas da tabela de pendencias no e-mail. */
export const SLA_REMINDER_MAX_ROWS = 40;

export type SlaReminderEvent = "SLA_DEADLINE_APPROACHING" | "SLA_OVERDUE";

export interface SlaReminderCandidate {
  event: SlaReminderEvent;
  process: SlaProcessKey;
  competence: Competence;
  stage: SlaStageEvaluation;
  dedupeKey: string;
}

/** Quantas competencias anteriores ao mes corrente o job ainda cobra. */
export const SLA_REMINDER_LOOKBACK_MONTHS = 3;

/**
 * Competencias acompanhadas pelo job, da mais antiga para a corrente. As
 * antigas so produzem SLA_OVERDUE (todos os prazos ja venceram), entao uma
 * pendencia esquecida continua escalando por ate 3 meses.
 */
export function openCompetences(today: IsoDate): Competence[] {
  const current = competenceOf(today);
  return Array.from({ length: SLA_REMINDER_LOOKBACK_MONTHS + 1 }, (_, i) =>
    shiftCompetence(current, i - SLA_REMINDER_LOOKBACK_MONTHS),
  );
}

/** Decide quais etapas notificar (puro). */
export function selectReminderCandidates(input: {
  competence: Competence;
  today: IsoDate;
  evaluations: Record<SlaProcessKey, { stages: SlaStageEvaluation[] }>;
  /** Chaves `${competencia}:${etapa}:${prazo}` ja notificadas nesta execucao. */
  seen?: Set<string>;
}): SlaReminderCandidate[] {
  const seen = input.seen ?? new Set<string>();
  const out: SlaReminderCandidate[] = [];
  const ck = competenceKey(input.competence);
  for (const process of SLA_PROCESSES) {
    for (const stage of input.evaluations[process].stages) {
      const pending = stage.counts.PENDING_OK + stage.counts.AT_RISK + stage.counts.OVERDUE;
      if (pending === 0) continue;
      let event: SlaReminderEvent | null = null;
      if (stage.status === "OVERDUE") event = "SLA_OVERDUE";
      else if (stage.status === "AT_RISK") event = "SLA_DEADLINE_APPROACHING";
      if (!event) continue;
      const shared = `${ck}:${stage.stage.stageKey}:${stage.deadline}`;
      if (seen.has(shared)) continue;
      seen.add(shared);
      out.push({
        event,
        process,
        competence: input.competence,
        stage,
        dedupeKey: `${ck}:${process}:${stage.stage.stageKey}:${input.today}`,
      });
    }
  }
  return out;
}

export function reminderTitle(c: SlaReminderCandidate): string {
  const label = c.stage.stage.label;
  const when = formatDeadlineShort(c.stage.deadline);
  if (c.event === "SLA_OVERDUE") {
    const n = c.stage.businessDaysOverdue ?? 1;
    return `SLA atrasado: ${label} — ${n} dia${n === 1 ? "" : "s"} út${n === 1 ? "il" : "eis"} (prazo ${when})`;
  }
  const n = c.stage.businessDaysRemaining ?? 0;
  if (n === 0) return `SLA vence hoje: ${label} (${when})`;
  return `SLA: ${label} — falta${n === 1 ? "" : "m"} ${n} dia${n === 1 ? "" : "s"} út${n === 1 ? "il" : "eis"} (prazo ${when})`;
}

export function buildReminderBlocks(c: SlaReminderCandidate, appUrl?: string): EmailBlock[] {
  const pending = c.stage.items.filter(
    (i) => i.status === "OVERDUE" || i.status === "AT_RISK" || i.status === "PENDING_OK",
  );
  // Etapas de pagamento: os destinatarios (ex.: gestores de area) podem nao ter
  // acesso a Pagamentos — o e-mail leva so contagens, sem nome/contrato.
  const redacted = SLA_PAYMENT_STAGES.has(c.stage.stage.stageKey);
  const rows = pending
    .slice(0, SLA_REMINDER_MAX_ROWS)
    .map((i) => [i.label, i.sublabel ?? "—", i.responsible ?? "—", i.detail ?? "Pendente"]);
  const blocks: EmailBlock[] = [
    callout(
      c.event === "SLA_OVERDUE"
        ? `Etapa com prazo vencido e ${pending.length} pendência(s). Priorize a regularização.`
        : `Prazo se aproximando com ${pending.length} pendência(s).`,
      c.event === "SLA_OVERDUE" ? "error" : "warning",
    ),
    keyValueList([
      { label: "Processo", value: SLA_PROCESS_LABEL[c.process] },
      { label: "Competência", value: formatMonth(c.competence.month, c.competence.year) },
      { label: "Área responsável", value: SLA_AREA_LABEL[c.stage.stage.area] },
      { label: "Prazo", value: formatDeadlineShort(c.stage.deadline) },
      { label: "Concluído", value: `${c.stage.done} de ${c.stage.total}` },
    ]),
    redacted
      ? keyValueList([
          { label: "Atrasados", value: String(c.stage.counts.OVERDUE) },
          { label: "Em risco", value: String(c.stage.counts.AT_RISK) },
          { label: "No prazo", value: String(c.stage.counts.PENDING_OK) },
        ])
      : dataTable(["Item", "Contexto", "Responsável", "Pendência"], rows),
  ];
  if (redacted) {
    blocks.push(paragraph("Os pagamentos pendentes estão listados na tela de Pagamentos."));
  } else if (pending.length > SLA_REMINDER_MAX_ROWS) {
    blocks.push(paragraph(`… e mais ${pending.length - SLA_REMINDER_MAX_ROWS} item(ns) na tela de SLA.`));
  }
  if (appUrl) {
    blocks.push(button("Abrir acompanhamento de SLA", `${appUrl}/app/sla?m=${competenceKey(c.competence)}`));
  }
  return blocks;
}

export interface RunSlaRemindersResult {
  skipped: boolean;
  reason?: "no-database" | "non-business-day";
  today: IsoDate;
  competences: string[];
  approaching: number;
  overdue: number;
  sent: number;
  skippedRecipients: number;
  failed: number;
}

export async function runSlaReminders(input: {
  now?: Date;
  appUrl?: string;
} = {}): Promise<RunSlaRemindersResult> {
  const now = input.now ?? new Date();
  const today = isoDateInSaoPaulo(now);
  const competences = openCompetences(today);
  const base: RunSlaRemindersResult = {
    skipped: false,
    today,
    competences: competences.map(competenceKey),
    approaching: 0,
    overdue: 0,
    sent: 0,
    skippedRecipients: 0,
    failed: 0,
  };
  if (!isDatabaseConfigured()) return { ...base, skipped: true, reason: "no-database" };

  const config = await loadSlaConfig();
  const { calendar } = await loadSlaCalendar(
    competences[0],
    competences[competences.length - 1],
    config.settings.considerStateHolidays,
  );
  if (!isBusinessDay(today, calendar)) {
    return { ...base, skipped: true, reason: "non-business-day" };
  }

  const result = { ...base };
  const seen = new Set<string>();
  for (const competence of competences) {
    const evaluations = await evaluateCompetence({ competence, config, calendar, today });
    const candidates = selectReminderCandidates({ competence, today, evaluations, seen });
    for (const candidate of candidates) {
      if (candidate.event === "SLA_OVERDUE") result.overdue += 1;
      else result.approaching += 1;
      const title = reminderTitle(candidate);
      const blocks = buildReminderBlocks(candidate, input.appUrl);
      const emitted = await emitNotification({
        event: candidate.event,
        scope: { type: "GLOBAL" },
        context: {},
        dedupeKey: candidate.dedupeKey,
        buildFragment: (recipient) => ({
          recipient,
          title,
          blocks,
          teamsText: title,
          teamsFacts: [
            { name: "Competência", value: formatMonth(competence.month, competence.year) },
            { name: "Área", value: SLA_AREA_LABEL[candidate.stage.stage.area] },
            { name: "Pendências", value: String(candidate.stage.total - candidate.stage.done) },
          ],
          teamsLink: input.appUrl
            ? { label: "Abrir SLA", url: `${input.appUrl}/app/sla?m=${competenceKey(competence)}` }
            : undefined,
        }),
      });
      result.sent += emitted.sent;
      result.skippedRecipients += emitted.skipped;
      result.failed += emitted.failed;
    }
  }
  return result;
}
