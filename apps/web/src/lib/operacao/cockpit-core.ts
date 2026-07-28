/**
 * Núcleo PURO do "Cockpit do Gestor de Área" (proposta §3, §4, Fase 2 item 2d).
 *
 * Sem Prisma, sem `Date.now()`/`new Date()` sem argumento, sem I/O: recebe a
 * competência (mês/ano) e os dados já carregados (feriados aplicáveis ao projeto,
 * lançamentos do consultor no mês) e devolve as métricas por consultor. Assim é
 * determinístico e testável isoladamente (a Fase 5 escreve os testes; a fina
 * camada de banco em `cockpit.ts` monta os dados e delega o cálculo aqui).
 *
 * Convenção de data: ISO `yyyy-mm-dd` (date-only, UTC), coerente com
 * `TimeEntry.date`/`Holiday.date` (@db.Date à meia-noite UTC) e com
 * `lib/timesheet/week#toIsoDate`. NÃO reimplementamos cálculo de feriado — a
 * camada de banco resolve o conjunto de feriados aplicáveis via os helpers de
 * `lib/timesheet/holidays` / `lib/db/timesheet` e passa o `Set` pronto para cá.
 */

/** Competência (mês 1-based, ano) — sempre explícita, nunca derivada do relógio. */
export interface CockpitCompetence {
  /** 1 = janeiro … 12 = dezembro. */
  month: number;
  year: number;
}

/**
 * Um dia em que o consultor lançou algo no projeto/competência. Uma linha por
 * `TimeEntry` (pode haver mais de uma no mesmo dia). `date` é ISO `yyyy-mm-dd`;
 * `status` é o código bruto de `TimeEntryStatus`
 * (DRAFT/SUBMITTED/APPROVED/REJECTED/CLOSED).
 */
export interface CockpitEntryDay {
  date: string;
  status: string;
}

/** Métricas por consultor numa competência (proposta item 1.1.1). */
export interface ConsultantMetrics {
  /**
   * Dias ÚTEIS do mês (excluindo sábado, domingo e feriados aplicáveis ao
   * projeto) SEM nenhum `TimeEntry` naquele dia.
   */
  diasSemLancamento: number;
  /** Nº de dias distintos com pelo menos um `TimeEntry.status = SUBMITTED`. */
  diasPendentes: number;
}

/** "Pendente de aprovação" = SUBMITTED (não existe status "PENDING"). */
const PENDING_STATUS = "SUBMITTED";

/**
 * Fim de semana (sábado/domingo) a partir de um ISO `yyyy-mm-dd`, avaliado em
 * UTC para bater com a convenção date-only (nunca depende do fuso do runtime).
 */
export function isWeekend(isoDate: string): boolean {
  const day = new Date(`${isoDate}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6; // 0 = domingo, 6 = sábado
}

/**
 * Dias ÚTEIS de uma competência: todo dia do mês que NÃO é fim de semana e NÃO
 * está no conjunto de feriados aplicáveis (`holidayIsoDates`, já resolvido pela
 * camada de banco — global ∪ vinculados ao projeto). Puro/determinístico: o
 * último dia sai de `Date.UTC(year, month, 0)` com argumentos explícitos. Saída
 * em ISO `yyyy-mm-dd`, ordem crescente.
 */
export function businessDaysOfMonth(
  competence: CockpitCompetence,
  holidayIsoDates: ReadonlySet<string>,
): string[] {
  const { month, year } = competence;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  const out: string[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    const iso = `${year}-${mm}-${String(day).padStart(2, "0")}`;
    if (isWeekend(iso)) continue;
    if (holidayIsoDates.has(iso)) continue;
    out.push(iso);
  }
  return out;
}

/**
 * Métricas de UM consultor na competência (proposta item 1.1.1), a partir dos
 * dados já carregados. Puro:
 * - `diasSemLancamento` = dias úteis (via {@link businessDaysOfMonth}) que NÃO
 *   têm nenhum lançamento (qualquer status conta como "lançou naquele dia").
 * - `diasPendentes` = dias distintos com ao menos um lançamento `SUBMITTED`.
 *
 * Lançamentos fora de dias úteis (fim de semana/feriado) não afetam
 * `diasSemLancamento` (a base já os exclui), mas contam para `diasPendentes` se
 * estiverem SUBMITTED — pendência de aprovação existe em qualquer dia.
 */
export function computeConsultantMetrics(
  competence: CockpitCompetence,
  holidayIsoDates: ReadonlySet<string>,
  entries: ReadonlyArray<CockpitEntryDay>,
): ConsultantMetrics {
  const businessDays = businessDaysOfMonth(competence, holidayIsoDates);
  const daysWithEntry = new Set(entries.map((e) => e.date));
  const diasSemLancamento = businessDays.filter(
    (iso) => !daysWithEntry.has(iso),
  ).length;

  const pendingDays = new Set(
    entries.filter((e) => e.status === PENDING_STATUS).map((e) => e.date),
  );

  return { diasSemLancamento, diasPendentes: pendingDays.size };
}

/** Fase de um projeto no cockpit (proposta §2 abas Ativos/Histórico). */
export type CockpitProjectPhase = "ATIVO" | "HISTORICO";

/**
 * Classifica o projeto cruzando os DOIS eixos independentes de liberação
 * (proposta item 1.1.4): "HISTORICO" só quando o Financeiro (RevenueClosing
 * CLOSED/INVOICED) E o DP (OperationClosing CLOSED) já liberaram a competência;
 * caso contrário "ATIVO" (ainda falta pelo menos uma ponta). Puro.
 */
export function classifyProjectPhase(
  financeiroLiberado: boolean,
  dpLiberado: boolean,
): CockpitProjectPhase {
  return financeiroLiberado && dpLiberado ? "HISTORICO" : "ATIVO";
}
