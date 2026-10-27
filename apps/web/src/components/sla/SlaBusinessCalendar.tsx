import { formatMonth } from "@/lib/format";
import {
  daysInMonth,
  isBusinessDay,
  isWeekend,
  isoDate,
  weekdayOf,
  type BusinessCalendar,
  type Competence,
  type IsoDate,
} from "@/lib/sla/business-days";
import type { SlaStageEvaluation } from "@/lib/sla/evaluate";
import { SLA_STAGE_SHORT_LABEL } from "@/lib/sla/types";
import { cn } from "@/lib/utils";

const WEEK_HEADERS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface Marker {
  label: string;
  tone: "deadline" | "payment";
}

function MonthGrid({
  competence,
  calendar,
  markers,
  today,
}: {
  competence: Competence;
  calendar: BusinessCalendar;
  markers: Map<IsoDate, Marker[]>;
  today: IsoDate;
}) {
  const { year, month } = competence;
  const total = daysInMonth(year, month);
  const lead = weekdayOf(isoDate(year, month, 1));
  const cells: Array<IsoDate | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => isoDate(year, month, i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks: Array<Array<IsoDate | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const businessCount = cells.filter((d) => d && isBusinessDay(d, calendar)).length;

  return (
    <div className="min-w-0">
      <p className="mb-2 flex items-baseline justify-between text-sm font-semibold text-strong">
        <span className="capitalize">{formatMonth(month, year)}</span>
        <span className="text-xs font-normal text-soft">{businessCount} dias úteis</span>
      </p>
      <table className="w-full table-fixed border-collapse text-xs">
        <caption className="sr-only">
          Calendário de dias úteis de {formatMonth(month, year)} com feriados e prazos
        </caption>
        <thead>
          <tr>
            {WEEK_HEADERS.map((h) => (
              <th key={h} scope="col" className="pb-1 text-center font-medium text-soft">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((d, di) => {
                if (!d) return <td key={di} className="p-0.5" />;
                const holiday = calendar.names.get(d);
                const isHoliday = calendar.holidays.has(d);
                const weekend = isWeekend(d);
                const marks = markers.get(d) ?? [];
                const description = [
                  holiday ? `Feriado: ${holiday}` : weekend ? "Fim de semana" : "Dia útil",
                  ...marks.map((m) => (m.tone === "payment" ? "Pagamento" : `Prazo: ${m.label}`)),
                  d === today ? "Hoje" : "",
                ]
                  .filter(Boolean)
                  .join(". ");
                return (
                  <td key={di} className="p-0.5 align-top">
                    <div
                      title={description}
                      aria-label={`${Number(d.slice(8, 10))}: ${description}`}
                      className={cn(
                        "flex min-h-14 flex-col gap-0.5 rounded-md border p-1",
                        weekend || isHoliday ? "border-transparent bg-surface-muted text-soft" : "border-border bg-surface text-strong",
                        marks.length > 0 && "border-ink",
                        d === today && "ring-2 ring-brand",
                      )}
                    >
                      <span className="font-semibold tabular-nums">{Number(d.slice(8, 10))}</span>
                      {isHoliday ? (
                        <span className="truncate text-[10px] italic" aria-hidden="true">
                          {holiday ?? "Feriado"}
                        </span>
                      ) : null}
                      {marks.map((m, i) => (
                        <span
                          key={i}
                          aria-hidden="true"
                          className={cn(
                            "truncate rounded px-1 text-[10px] font-semibold",
                            m.tone === "payment" ? "bg-success-soft text-success" : "bg-brand-soft text-brand-dark",
                          )}
                        >
                          {m.tone === "payment" ? "Pagamento" : m.label}
                        </span>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Calendario de dias uteis: mes de competencia + mes seguinte (onde vence a
 * maioria dos prazos), com feriados do calendario do SLA, prazos das etapas do
 * processo selecionado e a data de pagamento.
 */
export function SlaBusinessCalendar({
  competence,
  nextCompetence,
  calendar,
  stages,
  paymentDate,
  today,
}: {
  competence: Competence;
  nextCompetence: Competence;
  calendar: BusinessCalendar;
  stages: SlaStageEvaluation[];
  paymentDate: IsoDate | null;
  today: IsoDate;
}) {
  const markers = new Map<IsoDate, Marker[]>();
  for (const s of stages) {
    const list = markers.get(s.deadline) ?? [];
    list.push({ label: SLA_STAGE_SHORT_LABEL[s.stage.stageKey], tone: "deadline" });
    markers.set(s.deadline, list);
  }
  if (paymentDate) {
    const list = markers.get(paymentDate) ?? [];
    list.push({ label: "Pagamento", tone: "payment" });
    markers.set(paymentDate, list);
  }
  return (
    <div className="space-y-3 p-4">
      <div className="grid gap-6 lg:grid-cols-2">
        <MonthGrid competence={competence} calendar={calendar} markers={markers} today={today} />
        <MonthGrid competence={nextCompetence} calendar={calendar} markers={markers} today={today} />
      </div>
      <ul className="flex flex-wrap gap-3 text-xs text-soft" aria-label="Legenda">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-3 rounded bg-surface-muted" /> Fim de semana / feriado
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-3 rounded bg-brand-soft" /> Prazo de etapa
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-3 rounded bg-success-soft" /> Pagamento
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-3 rounded ring-2 ring-brand" /> Hoje
        </li>
      </ul>
    </div>
  );
}
