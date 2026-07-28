"use client";

import { Lock, Paperclip, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import {
  activityLabelOf,
  isRowEditable,
  rowTotal,
  timeEntryStatusLabels,
  type TimeEntryRow as TimeEntryRowData,
  type WeekDay,
} from "@/lib/timesheet/types";
import { formatHours } from "@/lib/format";
import {
  EMPTY_HOLIDAY_LOOKUP,
  resolveProjectHoliday,
  type HolidayLookup,
} from "@/lib/timesheet/holidays";
import {
  EMPTY_TIME_OFF_LOOKUP,
  resolveConfirmedTimeOff,
  timeOffKindShortLabel,
  type TimeOffLookup,
} from "@/lib/timesheet/time-off";
import { TimeEntryStatusBadge } from "./TimeEntryStatusBadge";

export interface TimeEntryRowProps {
  row: TimeEntryRowData;
  days: WeekDay[];
  /**
   * Project-aware holiday lookup. Uma célula só é marcada como feriado se o
   * feriado for GLOBAL ou estiver vinculado ao projeto DESTA linha.
   */
  holidays?: HolidayLookup;
  /**
   * Lookup de ausências (Onda D). Dias cobertos por ausência CONFIRMED ganham
   * um selo na célula e ficam visualmente marcados (o lançamento de Dia Útil é
   * bloqueado no form/servidor).
   */
  timeOff?: TimeOffLookup;
  /** Called to edit the row; only wired when the row is editable. */
  onEdit?: (row: TimeEntryRowData) => void;
  /**
   * Whether the current user may see the billable state (Onda B). Hidden for
   * consultores puros: o rótulo "(não faturável)" só aparece para gestão/admin/
   * finance. Default `true` mantém o comportamento antigo.
   */
  canEditBillable?: boolean;
  /**
   * Abre o anexo de um lançamento em nova aba (melhoria #2). Recebe o id do
   * TimeEntry; o parent resolve a URL assinada e faz `window.open`.
   */
  onOpenAttachment?: (entryId: string) => void;
  /**
   * Trava A (Fase 4d): a (projeto, competência) desta linha já teve o
   * faturamento liberado. Congela a edição — cadeado + tooltip, sem lápis —
   * mesmo em status editável. Tem PRECEDÊNCIA sobre a Trava B. Derivado no
   * parent como "ALGUM dia da linha travado" (a edição abre a linha inteira).
   */
  billingLocked?: boolean;
  /**
   * Trava A por DIA/coluna: `billingLockedDays[i]` indica se o dia `days[i]`
   * está em competência congelada. Numa semana que cruza a virada do mês, cada
   * coluna reflete a competência do seu próprio mês (coerente com o servidor,
   * que trava por lançamento/dia). Ausente/curto ⇒ dia tratado como aberto.
   */
  billingLockedDays?: boolean[];
  /**
   * Trava B (Fase 4d): solicitar ao Gestor de Área a reabertura de um
   * lançamento `APPROVED` (o consultor não reverte a própria aprovação). Recebe
   * o `entryId` da linha. Só é oferecido quando a linha NÃO está congelada pela
   * Trava A. Ausente em demo (sem servidor).
   */
  onRequestReopen?: (entryId: string) => void;
  /** Desabilita o botão de reabertura enquanto um pedido está em curso. */
  reopenBusy?: boolean;
}

/** Trava A: competência congelada pelo Financeiro. */
const BILLING_LOCK_MESSAGE =
  "Faturamento liberado — contate o Gestor de Área para reabrir.";
/** Trava B: lançamento aprovado, edição só após reabertura pelo gestor. */
const APPROVED_LOCK_MESSAGE =
  "Lançamento aprovado — solicite reabertura para editar.";

/**
 * One project+activity line in the weekly timesheet grid. Editable rows (DRAFT,
 * REJECTED or SUBMITTED) expose an edit affordance; approved/closed rows render
 * as read-only so they never look editable to the consultant.
 */
export function TimeEntryRow({
  row,
  days,
  holidays = EMPTY_HOLIDAY_LOOKUP,
  timeOff = EMPTY_TIME_OFF_LOOKUP,
  onEdit,
  canEditBillable = true,
  onOpenAttachment,
  billingLocked = false,
  billingLockedDays = [],
  onRequestReopen,
  reopenBusy = false,
}: TimeEntryRowProps) {
  // Trava A tem precedência: uma competência congelada nunca é editável, mesmo
  // em status editável, e não oferece "Solicitar reabertura" (só o Financeiro
  // reabre). Trava B: linhas APPROVED ficam bloqueadas mas pedem reabertura.
  const billingBlocked = billingLocked;
  const approvalBlocked = row.status === "APPROVED";
  const editable = isRowEditable(row) && Boolean(onEdit) && !billingBlocked;
  // Mensagem do cadeado (A antes de B). Ausente = linha sem trava a sinalizar.
  const lockMessage = billingBlocked
    ? BILLING_LOCK_MESSAGE
    : approvalBlocked
      ? APPROVED_LOCK_MESSAGE
      : null;
  // Primeiro entryId real da linha — alvo do pedido de reabertura (Trava B).
  const reopenEntryId = row.entryIds?.find((id): id is string => Boolean(id));
  const canRequestReopen =
    approvalBlocked &&
    !billingBlocked &&
    Boolean(onRequestReopen) &&
    Boolean(reopenEntryId);
  const total = rowTotal(row);
  // Anexos do lançamento (melhoria #2): cada dia da linha pode ter 1 anexo. O
  // link abre o arquivo em nova aba via URL assinada (resolvida no parent).
  const attachmentLinks = (row.attachments ?? [])
    .map((attachment, index) => ({
      attachment,
      entryId: row.entryIds?.[index] ?? null,
    }))
    .filter(
      (item): item is { attachment: { fileName: string }; entryId: string } =>
        Boolean(item.attachment) && Boolean(item.entryId),
    );
  // Hover tooltip mirroring PeriodOverview's day cards: total hours of the row
  // plus the readable status, so the consultant gets the same at-a-glance
  // context on the main grid without opening the entry.
  const rowTitle = `${row.projectName} · ${activityLabelOf(row.activity)} · ${formatHours(
    total,
  )} · ${timeEntryStatusLabels[row.status]}`;

  return (
    <tr title={rowTitle} className="transition-colors hover:bg-surface-muted/60">
      <td className="px-4 py-3 align-middle">
        {editable ? (
          <button
            type="button"
            onClick={() => onEdit?.(row)}
            className={cn(
              "group flex items-center gap-1.5 rounded-md text-left",
              focusRing,
            )}
            aria-label={`Editar lançamento de ${row.projectName} · ${activityLabelOf(row.activity)}`}
          >
            <span className="text-sm font-medium text-strong group-hover:text-brand">
              {row.projectName}
            </span>
            <Pencil
              aria-hidden="true"
              className="size-3.5 text-soft group-hover:text-brand"
            />
          </button>
        ) : lockMessage ? (
          <span className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-strong">
              {row.projectName}
            </span>
            {/* Cadeado semântico: Trava A (faturamento congelado) em âmbar,
                Trava B (aprovado, precisa reabertura) em neutro. Tooltip
                acessível via title + rótulo em sr-only. */}
            <span
              title={lockMessage}
              aria-label={lockMessage}
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-md border",
                billingBlocked
                  ? "border-warning/40 bg-warning-soft text-warning"
                  : "border-border bg-surface-muted text-soft",
              )}
            >
              <Lock aria-hidden="true" className="size-3" />
            </span>
          </span>
        ) : (
          <p className="text-sm font-medium text-strong">{row.projectName}</p>
        )}
        <p className="text-xs text-soft">{row.clientName}</p>
        {canRequestReopen ? (
          <button
            type="button"
            onClick={() => onRequestReopen?.(reopenEntryId as string)}
            disabled={reopenBusy}
            aria-busy={reopenBusy}
            className={cn(
              "mt-1 inline-flex items-center rounded-md text-xs font-medium text-brand transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-60",
              focusRing,
            )}
            title={APPROVED_LOCK_MESSAGE}
          >
            Solicitar reabertura
          </button>
        ) : null}
      </td>
      <td className="px-4 py-3 align-middle">
        <span className="text-sm text-medium">
          {activityLabelOf(row.activity)}
        </span>
        {canEditBillable && !row.billable ? (
          <span className="ml-2 text-xs text-soft">(não faturável)</span>
        ) : null}
        {onOpenAttachment && attachmentLinks.length > 0 ? (
          <span className="mt-1 flex flex-wrap items-center gap-2">
            {attachmentLinks.map((item) => (
              <button
                key={item.entryId}
                type="button"
                onClick={() => onOpenAttachment(item.entryId)}
                title={`Abrir anexo: ${item.attachment.fileName}`}
                aria-label={`Abrir anexo ${item.attachment.fileName} em nova aba`}
                className={cn(
                  "inline-flex max-w-[12rem] items-center gap-1 rounded-md text-xs font-medium text-brand hover:underline",
                  focusRing,
                )}
              >
                <Paperclip aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">{item.attachment.fileName}</span>
              </button>
            ))}
          </span>
        ) : null}
      </td>
      {days.map((day, index) => {
        const value = row.hours[index] ?? 0;
        // Project-aware: global OU vinculado a ESTE projeto.
        const holidayName = resolveProjectHoliday(
          holidays,
          row.projectId,
          day.date,
        );
        // Ausência CONFIRMED cobre o dia inteiro (por consultor). Marca a
        // célula com o selo do tipo e tem precedência visual sobre o feriado.
        const offInfo = resolveConfirmedTimeOff(timeOff, day.date);
        const offLabel = offInfo ? timeOffKindShortLabel(offInfo.kind) : null;
        // Trava A POR DIA: a competência DESTE dia (mês da coluna) está
        // congelada. Numa semana que cruza a virada do mês, só as colunas do
        // mês liberado ganham o cadeado — coerente com o servidor.
        const dayBillingLocked = billingLockedDays[index] ?? false;
        return (
          <td
            key={day.date}
            title={
              dayBillingLocked
                ? BILLING_LOCK_MESSAGE
                : offLabel
                  ? `${offLabel} (ausência confirmada)`
                  : holidayName
                    ? `Feriado: ${holidayName}`
                    : undefined
            }
            className={cn(
              "px-2 py-3 text-center align-middle tabular-nums",
              day.weekend && "bg-surface-muted/40",
              holidayName && !offLabel && "bg-warning-soft/40",
              offLabel && "bg-info-soft/40",
              // Cadeado de faturamento tem o mesmo tom âmbar da Trava A no
              // cabeçalho; precede a marca de fim de semana/feriado na célula.
              dayBillingLocked && "bg-warning-soft/60",
              value > 0 ? "text-strong" : "text-soft",
            )}
          >
            {value > 0 ? (
              dayBillingLocked ? (
                <span className="inline-flex items-center justify-center gap-1 text-warning">
                  {value.toLocaleString("pt-BR")}
                  <Lock aria-hidden="true" className="size-3 shrink-0" />
                  <span className="sr-only">{BILLING_LOCK_MESSAGE}</span>
                </span>
              ) : (
                value.toLocaleString("pt-BR")
              )
            ) : offLabel ? (
              <span className="text-[10px] font-medium text-brand-dark">
                {offLabel}
              </span>
            ) : (
              "–"
            )}
          </td>
        );
      })}
      <td className="px-4 py-3 text-right align-middle text-sm font-semibold tabular-nums text-strong">
        {formatHours(total)}
      </td>
      <td className="px-4 py-3 align-middle">
        <TimeEntryStatusBadge status={row.status} />
      </td>
    </tr>
  );
}
