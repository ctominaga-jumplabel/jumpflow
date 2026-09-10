import { CalendarOff, CircleAlert, CircleCheck, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatHours } from "@/lib/format";
import type { TimesheetWeek } from "@/lib/timesheet/types";

type BannerTone = "success" | "warning" | "neutral" | "info";

const toneStyles: Record<BannerTone, string> = {
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  neutral: "border-border bg-surface-muted text-medium",
  info: "border-brand/30 bg-brand-soft text-brand-dark",
};

const toneIcons: Record<BannerTone, LucideIcon> = {
  success: CircleCheck,
  warning: CircleAlert,
  neutral: CalendarOff,
  info: Info,
};

export interface DayStatusBannerProps {
  week: TimesheetWeek;
  /**
   * Hoje, em ISO `yyyy-mm-dd`, resolvido no SERVIDOR. Vem de fora de propósito:
   * calcular `new Date()` aqui divergiria entre o HTML do servidor (UTC) e o do
   * cliente (fuso local), e a virada de dia produziria hidratação inconsistente
   * justamente na tela onde a data importa. Ausente (demo) ⇒ banner neutro.
   */
  todayIso?: string;
  /** Nome do feriado de hoje, quando houver. */
  holidayName?: string;
  className?: string;
}

/**
 * Estado do dia em uma frase, no topo da tela de Horas.
 *
 * A tela clássica responde "como está a semana"; esta linha responde "e hoje?",
 * que é a pergunta que o consultor traz ao abrir o sistema. Não é decoração:
 * quando hoje é um dia útil sem lançamento, é o único aviso da tela — a grade
 * apenas mostra uma coluna vazia, que se lê como "ainda não cheguei lá".
 */
export function DayStatusBanner({
  week,
  todayIso,
  holidayName,
  className,
}: DayStatusBannerProps) {
  const dayIndex = todayIso
    ? week.days.findIndex((day) => day.date === todayIso)
    : -1;

  let tone: BannerTone = "neutral";
  let message: string;

  if (dayIndex < 0) {
    tone = "info";
    message = todayIso
      ? "Hoje está fora da semana exibida — a grade abaixo é de outro período."
      : "Semana de demonstração: nada aqui é persistido.";
  } else {
    const hours = week.rows.reduce(
      (sum, row) => sum + (row.hours[dayIndex] ?? 0),
      0,
    );
    const projects = new Set(
      week.rows
        .filter((row) => (row.hours[dayIndex] ?? 0) > 0)
        .map((row) => row.projectId),
    ).size;

    if (hours > 0) {
      tone = "success";
      message = `Hoje já tem ${formatHours(hours)} lançadas em ${projects} ${
        projects === 1 ? "projeto" : "projetos"
      }.`;
    } else if (holidayName) {
      tone = "neutral";
      message = `Hoje é feriado: ${holidayName}.`;
    } else if (week.days[dayIndex]?.weekend) {
      tone = "neutral";
      message = "Hoje é fim de semana — sem lançamento previsto.";
    } else {
      tone = "warning";
      message = "Hoje ainda não tem lançamento.";
    }
  }

  const Icon = toneIcons[tone];

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-[var(--radius-panel)] border px-4 py-3 text-sm font-medium",
        toneStyles[tone],
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
