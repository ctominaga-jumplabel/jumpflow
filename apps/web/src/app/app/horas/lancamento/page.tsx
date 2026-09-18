import type { Metadata } from "next";
import Link from "next/link";
import { History, UserX } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { NewTimeEntryScreen } from "@/components/timesheet/NewTimeEntryScreen";
import { requireUser } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import { isStorageConfigured } from "@/lib/storage/provider";
import { isTranscriptionEnabled } from "@/lib/transcription/flags";
import { isTranscriptionConfigured } from "@/lib/transcription/provider";
import { EMPTY_HOLIDAY_LOOKUP } from "@/lib/timesheet/holidays";
import { EMPTY_TIME_OFF_LOOKUP } from "@/lib/timesheet/time-off";
import {
  addDays,
  buildWeekDays,
  parseWeekParam,
  toIsoDate,
  weekLabel,
} from "@/lib/timesheet/week";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Novo Lançamento de Horas" };

/** Grade de Horas (histórico) — destino do botão "Ver Histórico". */
const HISTORY_HREF = "/app/horas";

interface LancamentoPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Novo Lançamento de Horas — TELA CHEIA.
 *
 * Antes o lançamento vivia num modal sobre a grade. Ele é a ação mais repetida
 * da operação (e a home do Consultor), então ganhou rota própria com a mesma
 * moldura das demais telas: cabeçalho, largura total e um botão explícito
 * "Ver Histórico" para a grade.
 *
 * O gate de rota é o prefixo `/app/horas` na matriz de permissões (o proxy já
 * protege `/app/*`); `requireUser` continua no lugar e TODA autorização de
 * escrita é das server actions.
 */
export default async function NovoLancamentoPage({
  searchParams,
}: LancamentoPageProps) {
  const user = await requireUser();
  const params = await searchParams;

  const header = (
    <PageHeader
      eyebrow="Operação"
      title="Novo Lançamento de Horas"
      description="Aponte o dia, a semana ou — como Gestor de Área — um período inteiro para vários consultores."
      actions={
        <Link
          href={HISTORY_HREF}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-semibold text-medium transition-colors hover:bg-surface-muted hover:text-strong",
            focusRing,
          )}
        >
          <History aria-hidden="true" className="size-4" />
          Ver Histórico
        </Link>
      }
    />
  );

  if (!isDatabaseConfigured()) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={UserX}
          title="Banco de dados não configurado"
          description="O lançamento de horas exige banco de dados. Consulte a grade em Horas para o modo demonstração."
        />
      </div>
    );
  }

  // Lazy import so Prisma is never loaded on code paths without a database.
  const { getConsultantForUser, getHolidayLookup, listAllowedProjects } =
    await import("@/lib/db/timesheet");
  const { getTimeOffLookup } = await import("@/lib/db/time-off");
  const { canActOnBehalf, getOnBehalfPickerData } = await import(
    "@/lib/db/on-behalf"
  );

  const consultant = await getConsultantForUser(user);
  const canBatch = canActOnBehalf(user);

  if (!consultant && !canBatch) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={UserX}
          title="Sem vínculo de consultor"
          description="Seu usuário não está vinculado a um consultor. Contate um administrador."
        />
      </div>
    );
  }

  // Semana de referência do lançamento individual: `?semana=` (mesma convenção
  // da grade), com fallback para a semana corrente. O limite semanal do
  // consultor continua sendo do servidor — `createWeeklyTimeEntries` só aceita
  // dias de UMA semana.
  const weekStart = parseWeekParam(params.semana);
  const weekEnd = addDays(weekStart, 6);

  let personal = null;
  if (consultant) {
    const [projects, holidays, timeOff] = await Promise.all([
      listAllowedProjects(consultant.id, weekStart),
      getHolidayLookup(weekStart, weekEnd),
      getTimeOffLookup(consultant.id, weekStart, weekEnd),
    ]);
    personal = {
      weekStart: toIsoDate(weekStart),
      weekLabel: weekLabel(weekStart),
      days: buildWeekDays(weekStart),
      projects,
      holidays: holidays ?? EMPTY_HOLIDAY_LOOKUP,
      timeOff: timeOff ?? EMPTY_TIME_OFF_LOOKUP,
      attachmentsAvailable: isStorageConfigured(),
      // Degrade honesto: sem provider/credencial a gravação aconteceria e a
      // transcrição voltaria vazia — o microfone só aparece quando funciona.
      transcriptionAvailable:
        isTranscriptionEnabled() && isTranscriptionConfigured(),
    };
  }

  const batch = canBatch ? await getOnBehalfPickerData() : null;

  return (
    <div className="space-y-6">
      {header}
      <NewTimeEntryScreen
        historyHref={HISTORY_HREF}
        personal={personal}
        batch={batch}
      />
    </div>
  );
}
