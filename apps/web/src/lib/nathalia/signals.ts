// TODO: trocar mock-data por consultas Prisma reais.
//
// Camada ÚNICA de tradução entre os dados operacionais do JumpFlow e os sinais
// que a Nathal.IA consome (`NathaliaSignals`). Hoje lê os mocks do app; quando a
// persistência real estiver pronta, troque APENAS o corpo das funções `derive*`
// abaixo por consultas Prisma escopadas ao usuário — a assinatura pública
// (`getNathaliaSignals`) e o contrato de saída permanecem os mesmos.
//
// ATENÇÃO ao migrar para Prisma: `getNathaliaSignals` é chamado no layout raiz
// de /app. Hoje é puro (lê mocks, não lança). Ao virar I/O, envolva em try/catch
// retornando `EMPTY_SIGNALS` no erro — uma falha de consulta NÃO pode derrubar
// toda a área autenticada; a Nathal.IA apenas degrada para "sem nudge".

import type { NathaliaSignals } from "@jumpflow/character-nathalia";
import type { RoleName } from "@/lib/auth/roles";
import { hasRole } from "@/lib/auth/route-permissions";
import type { AppUser } from "@/lib/auth/types";

import { currentWeek } from "@/lib/mock-data/timesheet";
import { dayTotal, weekTotal } from "@/lib/timesheet/types";
import { approvalItems, pendingApprovals } from "@/lib/mock-data/approvals";
import { projects } from "@/lib/mock-data/projects";

/** Jornada padrão (horas/dia) quando o dado não traz a expectativa do dia. */
const DEFAULT_EXPECTED_HOURS_PER_DAY = 8;

/**
 * Papéis que participam da fila de aprovação. Espelha exatamente o route guard
 * de `/app/aprovacoes` em `route-permissions.ts` — não inventamos papéis novos.
 * O bloco `approvals` (defesa em profundidade) só é exposto a esses papéis.
 */
const APPROVER_ROLES: RoleName[] = [
  "ADMIN",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "FINANCE",
];

/** Visão mínima de usuário necessária para os sinais (id + papéis). */
type SignalsUser = Pick<AppUser, "id" | "roles">;

/** Adapta a visão mínima para o `hasRole` (que aceita `AppUser | null`). */
function asAuthUser(user: SignalsUser): AppUser {
  return { id: user.id, roles: user.roles, name: "", email: "" };
}

/**
 * Índice do dia "de hoje" dentro da semana mockada (0 = seg ... 6 = dom). Se a
 * data de hoje não cair na semana corrente do mock, usamos o último dia útil com
 * horas lançadas (e, na ausência disso, a sexta-feira) para que o sinal continue
 * coerente em demo. Com dados reais isto vira "o dia de hoje" direto.
 */
function todayIndexInWeek(): number {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const direct = currentWeek.days.findIndex((d) => d.date === todayIso);
  if (direct >= 0) return direct;

  // Fora da janela do mock: último dia útil com horas, senão a sexta (índice 4).
  for (let i = currentWeek.days.length - 1; i >= 0; i--) {
    if (!currentWeek.days[i].weekend && dayTotal(currentWeek, i) > 0) return i;
  }
  return 4;
}

/**
 * Horas: `loggedToday` (somatório do dia), `expectedToday` (jornada padrão, pois
 * o mock não carrega a expectativa por dia) e `missingThisWeek` (déficit dos dias
 * úteis já decorridos até hoje, nunca negativo).
 */
function deriveHours(): NonNullable<NathaliaSignals["hours"]> {
  const todayIndex = todayIndexInWeek();
  const loggedToday = dayTotal(currentWeek, todayIndex);
  const expectedToday = DEFAULT_EXPECTED_HOURS_PER_DAY;

  // Esperado acumulado nos dias úteis até hoje (inclusive) vs. o que foi lançado
  // na semana — um proxy seguro de "horas faltando" enquanto não há dado real.
  let expectedSoFar = 0;
  for (let i = 0; i <= todayIndex; i++) {
    if (!currentWeek.days[i].weekend) {
      expectedSoFar += DEFAULT_EXPECTED_HOURS_PER_DAY;
    }
  }
  const missingThisWeek = Math.max(0, expectedSoFar - weekTotal(currentWeek));

  return { loggedToday, expectedToday, missingThisWeek };
}

/**
 * Aprovações pendentes — só faz sentido para papéis aprovadores. Conta itens de
 * HORAS aguardando decisão manual (espelha a fila de `/app/aprovacoes`).
 */
function derivePendingApprovals(): NonNullable<NathaliaSignals["approvals"]> {
  const pending = pendingApprovals(approvalItems).filter(
    (item) => item.type === "HOURS",
  ).length;
  return { pending };
}

/**
 * Atividades atrasadas — projetos ATIVOS cuja `endDate` já passou (o mock não
 * modela tarefas individuais, então projetos ativos vencidos são o proxy seguro
 * mais próximo de "atividade atrasada").
 */
function deriveLateActivities(): NonNullable<NathaliaSignals["projects"]> {
  const today = new Date();
  const lateActivities = projects.filter((project) => {
    if (project.status !== "ACTIVE") return false;
    if (!project.endDate) return false;
    return new Date(project.endDate) < today;
  }).length;
  return { lateActivities };
}

/**
 * Calcula os sinais reais para a Nathal.IA a partir das fontes de dados atuais
 * do app, com RBAC defensivo: blocos sensíveis (`approvals`, `reports`) só são
 * incluídos para papéis autorizados. Nunca quebra na ausência de dados — campos
 * que não dá para derivar com segurança são OMITIDOS (jamais inventados).
 *
 * Ponto ÚNICO de troca mock → Prisma: ver TODO no topo do arquivo.
 */
export async function getNathaliaSignals(
  user: { id: string; roles: RoleName[] },
): Promise<NathaliaSignals> {
  const authUser = asAuthUser(user);
  const signals: NathaliaSignals = {};

  // Horas: relevante para qualquer usuário autenticado (cada um vê as próprias).
  signals.hours = deriveHours();

  // Aprovações: defesa em profundidade — só para papéis aprovadores.
  if (hasRole(authUser, APPROVER_ROLES)) {
    signals.approvals = derivePendingApprovals();
  }

  // Projetos / atividades atrasadas: contagem GLOBAL hoje, coerente com o que a
  // tela /app/projetos (rota ALL) já expõe a todos. O escopo por usuário/linha
  // só virá com a consulta Prisma futura — por isso o copy do nudge é genérico
  // ("Há N atividades atrasadas"), não "seu projeto".
  signals.projects = deriveLateActivities();

  // Relatórios / produtividade: OMITIDO de propósito. Não há fonte estruturada
  // de variação de produtividade nos mocks atuais (apenas rótulos de tendência
  // no dashboard, não números seguros). Quando existir um dado real e o usuário
  // tiver acesso financeiro/relatório (FINANCIAL_ROLES), preencha `reports` aqui.

  return signals;
}
