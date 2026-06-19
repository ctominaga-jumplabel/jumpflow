import type { RoleName } from "@/lib/auth/roles";
import type {
  EvaluationCycleStatus,
  EvaluationRelationship,
  EvaluationResult,
} from "./types";

/**
 * Pure RBAC + LGPD visibility logic for Avaliação de Desempenho (EP16).
 *
 * No I/O. The DB read layer (`lib/db/evaluations.ts`) builds its Prisma `where`
 * and gates result access from these helpers, so per-row visibility and the
 * peer-anonymity rule are enforced in the server, never only in the UI. This is
 * the single source of truth for "who configures cycles", "who answers which
 * response", and "who sees which result" — unit tested directly
 * (docs/backlog-talentos.md §2 matrix, §3 LGPD and DP-05).
 */

// ── Quem configura ciclos (US16.01, §2) ─────────────────────────────────────

/**
 * Roles that may CREATE/CONFIGURE evaluation cycles and transition status.
 * Apenas ADMIN/PEOPLE (matriz §2, linha "Ciclos de avaliação (config)").
 */
export const EVALUATION_MANAGE_ROLES: RoleName[] = ["ADMIN", "PEOPLE"];

/**
 * Roles that may READ the management surface (`/app/avaliacoes`): a gestão de
 * ciclos e os resultados consolidados. CONSULTANT também alcança a rota para
 * ver o PRÓPRIO resultado e responder as próprias avaliações; o escopo REAL por
 * linha é aplicado pelas funções de read, não pela rota.
 */
export const EVALUATION_READ_ROLES: RoleName[] = [
  "ADMIN",
  "PEOPLE",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "CONSULTANT",
];

function intersects(roles: readonly RoleName[], allowed: readonly RoleName[]) {
  return roles.some((r) => allowed.includes(r));
}

export function canManageCycles(roles: readonly RoleName[]): boolean {
  return intersects(roles, EVALUATION_MANAGE_ROLES);
}

// ── Identidade do espectador ────────────────────────────────────────────────

export interface EvaluationViewer {
  roles: readonly RoleName[];
  /** Real persisted User id (FK usado por raterUserId / project.managerUserId). */
  userId: string | null;
  /** Consultant id vinculado, quando o espectador tem perfil de consultor. */
  consultantId: string | null;
}

// ── Escopo de leitura de RESULTADO (US16.04, §2) ────────────────────────────

/**
 * Escopo que descreve exatamente quais avaliações o espectador pode ver o
 * resultado. O DB layer traduz em Prisma `where`.
 *
 * - `all`: ADMIN/PEOPLE veem todos os resultados.
 * - `manager`: AREA_MANAGER/PROJECT_MANAGER veem o resultado dos consultores do
 *   seu time/projeto (resolvido por alocação → project.managerUserId).
 * - `subject`: CONSULTANT vê só o PRÓPRIO resultado.
 * - `none`: sem universo → vazio (nunca vaza dados de outro time).
 */
export type EvaluationResultScope =
  | { kind: "all" }
  | { kind: "manager"; managerUserId: string }
  | { kind: "subject"; subjectConsultantId: string }
  | { kind: "none" };

/**
 * Resolve o escopo de leitura de resultado. O papel mais forte vence (broad →
 * narrow), consistente com Competências/Feedback.
 */
export function resolveResultScope(
  viewer: EvaluationViewer,
): EvaluationResultScope {
  const { roles, userId, consultantId } = viewer;
  if (intersects(roles, EVALUATION_MANAGE_ROLES)) {
    return { kind: "all" };
  }
  if (intersects(roles, ["AREA_MANAGER", "PROJECT_MANAGER"]) && userId) {
    // AREA_MANAGER, no MVP, é resolvido via projetos gerenciados
    // (Project.managerUserId), mesmo critério da matriz/gap e do feedback.
    return { kind: "manager", managerUserId: userId };
  }
  if (roles.includes("CONSULTANT") && consultantId) {
    return { kind: "subject", subjectConsultantId: consultantId };
  }
  return { kind: "none" };
}

// ── Visibilidade do RESULTADO por estado do ciclo (DP-05) ───────────────────

/**
 * O consultor (sujeito) só vê o próprio resultado consolidado APÓS o ciclo
 * fechar (LGPD §3 / US16.04). Gestão (ADMIN/PEOPLE) e gestores do time podem
 * acompanhar antes do fechamento. Pura: o caller informa se o espectador é o
 * próprio sujeito e se é gestão.
 */
export function canViewResult(params: {
  cycleStatus: EvaluationCycleStatus;
  isSubject: boolean;
  isManagementOrManager: boolean;
}): boolean {
  if (params.isManagementOrManager) return true;
  if (params.isSubject) return params.cycleStatus === "CLOSED";
  return false;
}

/**
 * Mínimo de avaliadores por relacionamento para revelar a média daquele grupo
 * (anonimato de peer — DP-05). PEER exige pelo menos 2 respostas para não
 * permitir des-anonimizar um par único; SELF/MANAGER são naturalmente
 * identificáveis e não precisam de mínimo, então a média consolidada sempre
 * pode ser exibida ao sujeito. Esta função decide se a CONTAGEM por
 * relacionamento PEER pode ser exibida sem risco — a média consolidada do radar
 * já mistura todos os relacionamentos e não identifica ninguém.
 */
export const PEER_MIN_FOR_DISCLOSURE = 2;

export function peerGroupIsDisclosable(peerCount: number): boolean {
  return peerCount === 0 || peerCount >= PEER_MIN_FOR_DISCLOSURE;
}

/**
 * Redação (LGPD/DP-05) do resultado conforme o espectador, ANTES de ele sair do
 * servidor. Pura e testável: o caller (read layer) informa se o espectador é o
 * próprio sujeito e quantos pares submeteram.
 *
 * Para o SUJEITO, quando o grupo de pares NÃO é divulgável
 * (`!peerGroupIsDisclosable(peerCount)`, i.e. exatamente 1 par), suprime:
 *   - a chave `PEER` de `raterCountByRelationship` (um único par poderia ser
 *     des-anonimizado por exclusão); e
 *   - o `sampleCount` de cada eixo do radar (a contagem de notas por skill,
 *     combinada com os outros relacionamentos, também permitiria deduzir o par).
 *
 * Para escopos de gestão (all/manager), o resultado segue completo — quem
 * configura/acompanha o ciclo precisa da contagem real. A média consolidada do
 * radar nunca é alterada: ela já mistura todos os relacionamentos e não
 * identifica ninguém.
 */
export function redactResultForViewer(
  result: EvaluationResult,
  params: { isSubject: boolean; peerCount: number },
): EvaluationResult {
  if (!params.isSubject) return result;
  if (peerGroupIsDisclosable(params.peerCount)) return result;

  const raterCountByRelationship: Partial<
    Record<EvaluationRelationship, number>
  > = {};
  for (const [rel, count] of Object.entries(result.raterCountByRelationship)) {
    if (rel === "PEER") continue;
    raterCountByRelationship[rel as EvaluationRelationship] = count;
  }

  return {
    ...result,
    raterCountByRelationship,
    radar: result.radar.map((axis) => ({ ...axis, sampleCount: 0 })),
  };
}

// ── Quem responde uma RESPONSE específica (US16.03) ─────────────────────────

/**
 * Whether a viewer may VIEW/ANSWER a specific EvaluationResponse.
 *
 * Regra (LGPD §3): cada avaliador só vê/responde a PRÓPRIA resposta; ninguém vê
 * a resposta de outro avaliador enquanto o ciclo não fecha (anonimato de pares).
 * A atribuição é por `raterUserId`. O avaliador-cliente (relationship CLIENT)
 * acessa apenas o próprio formulário do convite (mesmo critério: raterUserId).
 *
 * Pura: o caller passa o raterUserId da resposta. Não há exceção de "gestão
 * responde por outro" — gestão configura o ciclo, não preenche por terceiros.
 */
export function canAnswerResponse(
  viewer: Pick<EvaluationViewer, "userId">,
  responseRaterUserId: string | null,
): boolean {
  return (
    viewer.userId !== null &&
    responseRaterUserId !== null &&
    viewer.userId === responseRaterUserId
  );
}

/**
 * Uma resposta só pode ser editada/submetida com o ciclo OPEN (US16.03).
 */
export function responseIsEditable(cycleStatus: EvaluationCycleStatus): boolean {
  return cycleStatus === "OPEN";
}

// ── Transição de status do ciclo (US16.01) ──────────────────────────────────

/**
 * Transições válidas: DRAFT → OPEN → CLOSED. Nunca retrocede de CLOSED nem
 * pula etapas. Pura para teste direto e reuso pelo server action.
 */
export function isValidCycleTransition(
  from: EvaluationCycleStatus,
  to: EvaluationCycleStatus,
): boolean {
  if (from === "DRAFT") return to === "OPEN";
  if (from === "OPEN") return to === "CLOSED";
  return false;
}
