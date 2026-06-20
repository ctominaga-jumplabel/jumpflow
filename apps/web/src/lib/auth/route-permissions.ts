import type { AppUser } from "./types";
import type { RoleName } from "./roles";
import { FEEDBACK_READ_ROLES } from "@/lib/feedback/visibility";
import { EVALUATION_READ_ROLES } from "@/lib/evaluations/visibility";
import { DEVELOPMENT_READ_ROLES } from "@/lib/development/visibility";
import { SURVEY_READ_ROLES } from "@/lib/surveys/visibility";
import { OKR_READ_ROLES } from "@/lib/okrs/visibility";

/**
 * Pure RBAC primitives and the central route → roles map.
 * No server-only imports, so this is safe to unit test and to import on the
 * edge. Async guards (requireUser/requireRole) live in `guards.ts`.
 */

/** `"ALL"` means any authenticated user may access. */
export type RouteAccess = RoleName[] | "ALL";

/**
 * Roles allowed to see financial fields (valor hora, custo hora, budget) and
 * the Financeiro module. Single source of truth so route guards and in-page
 * field masking (e.g. Projetos) never drift apart.
 */
export const FINANCIAL_ROLES: RoleName[] = ["ADMIN", "AREA_MANAGER", "FINANCE"];

/**
 * Roles that own the operational lifecycle of a Project (criar/editar projeto,
 * status, período, gestor, alocações, skills) on the Operação surface.
 */
export const PROJECT_WRITE_ROLES: RoleName[] = [
  "ADMIN",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "SALES",
];

/**
 * Roles that own commercial sale values (ProjectSaleRate, tipo de cobrança,
 * budget) and may access the Comercial surface. Single source of truth shared
 * by the `/app/comercial` route guard and the sale-rate server actions.
 */
export const SALE_RATE_ROLES: RoleName[] = [
  "ADMIN",
  "AREA_MANAGER",
  "FINANCE",
  "SALES",
];

/**
 * Roles that may WRITE the skill catalog and competency profiles (criar/editar/
 * inativar skill, perfis e itens). PEOPLE owns talent management; ADMIN is the
 * platform owner. Single source of truth shared by the `/app/competencias`
 * server actions (catalog + profiles) and any in-page write gating.
 * See docs/backlog-talentos.md EP12/EP13.
 */
export const COMPETENCY_WRITE_ROLES: RoleName[] = ["ADMIN", "PEOPLE"];

/**
 * Roles that may READ the competency module (catálogo, perfis, matriz/gap).
 * Management + talent roles with visibility per docs/backlog-talentos.md §2.
 * The REAL per-row scope (AREA_MANAGER sees own area, PROJECT_MANAGER own
 * project, CONSULTANT own data) is applied by the read functions, not the
 * route. CONSULTANT reaches its own gap through `/app/skills`, so the
 * management surface stays scoped to the roles below.
 */
export const COMPETENCY_READ_ROLES: RoleName[] = [
  "ADMIN",
  "PEOPLE",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "SALES",
];

/**
 * Roles that may READ the Mapa de Disponibilidade (heatmap derivado de alocação
 * + férias + status). Per docs/backlog-talentos.md §2 (linha "Mapa de
 * disponibilidade"): ADMIN/PEOPLE/SALES amplo, AREA_MANAGER (sua área),
 * PROJECT_MANAGER (seu projeto), CONSULTANT (o próprio). FINANCE não participa.
 * O escopo REAL por linha é aplicado pelas funções de read, não pela rota.
 */
export const AVAILABILITY_READ_ROLES: RoleName[] = [
  "ADMIN",
  "PEOPLE",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "SALES",
  "CONSULTANT",
];

interface RouteRule {
  prefix: string;
  access: RouteAccess;
}

/**
 * Central access map for operational routes. Order matters: more specific
 * prefixes must come before the broad `/app` rule.
 *
 * NOTE: this round, the middleware only enforces authentication for `/app/*`.
 * Per-route role enforcement is applied where it matters (e.g. financeiro via
 * `requireRole`) and this map is the single source of truth as enforcement
 * expands.
 */
export const routePermissions: RouteRule[] = [
  { prefix: "/app/pagamentos", access: FINANCIAL_ROLES },
  // Cobrança de projetos (motor de regras) é um subdomínio do Financeiro, já
  // coberto pelo prefixo `/app/financeiro` abaixo.
  { prefix: "/app/financeiro", access: FINANCIAL_ROLES },
  // Comercial: valores de venda, tipo de cobrança e budget por projeto.
  { prefix: "/app/comercial", access: SALE_RATE_ROLES },
  // Competências (Talentos): catálogo de skills, perfis de competência e matriz
  // de gap. Leitura para papéis de gestão/talentos; escrita (catálogo/perfis) é
  // action-gated por COMPETENCY_WRITE_ROLES (ADMIN/PEOPLE).
  { prefix: "/app/competencias", access: COMPETENCY_READ_ROLES },
  // Mapa de Disponibilidade (Talentos, Onda 0): heatmap read-only derivado de
  // alocação + férias + status. Visível a todos os papéis exceto FINANCE; o
  // escopo por linha (área/projeto/próprio) é aplicado pela função de read.
  { prefix: "/app/disponibilidade", access: AVAILABILITY_READ_ROLES },
  // Feedback Contínuo (Talentos, Prioridade 1 — EP15): timeline + registro de
  // feedback ancorado a projeto/cliente real. Leitura para gestão + CONSULTANT
  // (este último só vê os próprios feedbacks SHARED + os que autorou — escopo
  // por linha aplicado pela função de read, LGPD §3); a escrita é action-gated
  // por FEEDBACK_WRITE_ROLES (gestores).
  { prefix: "/app/feedback", access: FEEDBACK_READ_ROLES },
  // Avaliação de Desempenho (Talentos, Prioridade 1 — EP16): ciclos 90/180/360,
  // responder avaliação, resultado (radar/gap) e evolução histórica. Leitura
  // para gestão + CONSULTANT (este último só vê o PRÓPRIO resultado, após o
  // fechamento, e responde só as próprias avaliações — escopo por linha e a
  // regra de anonimato de peer aplicados pelas funções de read/action, LGPD §3 /
  // DP-05). A config de ciclo é action-gated por EVALUATION_MANAGE_ROLES
  // (ADMIN/PEOPLE). Regra específica antes da `/app` ampla.
  { prefix: "/app/avaliacoes", access: EVALUATION_READ_ROLES },
  // PDI — Plano de Desenvolvimento Individual (Talentos, Prioridade 1 — EP17):
  // criar/gerenciar planos, gerar ações a partir do gap, acompanhar progresso.
  // Leitura para gestão + CONSULTANT (este último só vê o PRÓPRIO PDI e só
  // atualiza status/evidência das próprias ações — escopo por linha e a
  // fronteira de gestão aplicados pelas funções de read/action, LGPD §3). A
  // criação/edição de estrutura é action-gated por DEVELOPMENT_MANAGE_ROLES
  // (ADMIN/PEOPLE/AREA_MANAGER/PROJECT_MANAGER). Regra específica antes da `/app`.
  { prefix: "/app/pdi", access: DEVELOPMENT_READ_ROLES },
  // Pesquisa de Clima / NPS interno (Talentos, Prioridade 2 — EP 7.1): criar/
  // abrir/fechar pesquisas, responder convites e dashboards agregados. Leitura
  // para gestão + AREA_MANAGER (dashboards anônimos) + CONSULTANT (este último
  // só vê/responde os PRÓPRIOS convites — escopo por linha aplicado pela função
  // de read). ANONIMATO É REGRA: em pesquisa anônima a resposta nunca é ligada à
  // identidade (LGPD §3). A gestão é action-gated por SURVEY_MANAGE_ROLES
  // (ADMIN/PEOPLE). Regra específica antes da `/app` ampla.
  { prefix: "/app/clima", access: SURVEY_READ_ROLES },
  // Universidade Jump (Talentos, Prioridade 2 — EP 7.3): trilhas, cursos,
  // matrícula, progresso e gamificação derivada. O CATÁLOGO é visível a todos os
  // autenticados (consultor navega e se matricula); a CURADORIA (CRUD de trilha/
  // curso) é action-gated por UNIVERSITY_CURATE_ROLES (ADMIN/PEOPLE); a matrícula/
  // progresso é do PRÓPRIO consultor (gate por linha no servidor); o RANKING
  // agregado com nomes é visível a ADMIN/PEOPLE/AREA_MANAGER (o consultor vê só a
  // própria posição). Regra específica antes da `/app` ampla.
  { prefix: "/app/universidade", access: "ALL" },
  // Metas e OKRs (Talentos, Prioridade 2 — EP 7.2): objetivos por escopo
  // (consultor/projeto/área/empresa) e Key Results com progresso derivado.
  // Leitura para gestão + CONSULTANT (este último só vê/atualiza os PRÓPRIOS
  // OKRs de consultor — escopo por linha aplicado pelas funções de read). A
  // criação/edição de estrutura é action-gated por OKR_MANAGE_ROLES (ADMIN/
  // PEOPLE/AREA_MANAGER/PROJECT_MANAGER), com a fronteira fina por escopo/linha
  // aplicada por canManageObjective no servidor. Regra específica antes da `/app`.
  { prefix: "/app/metas", access: OKR_READ_ROLES },
  // Operational automation (auto-approval admin/observability). Management
  // only — PROJECT_MANAGER read-only access is deferred to a later round.
  { prefix: "/app/automacoes", access: ["ADMIN", "AREA_MANAGER"] },
  {
    // FINANCE participates in the expense approval chain (finance stage),
    // so it has access to the queue alongside the manager roles.
    prefix: "/app/aprovacoes",
    access: ["ADMIN", "AREA_MANAGER", "PROJECT_MANAGER", "FINANCE"],
  },
  // Despesas are open to any authenticated user (consultants log their own).
  // Payment-status changes are gated in-page by FINANCIAL_ROLES, not here.
  { prefix: "/app/despesas", access: "ALL" },
  // Relatorios are open to any authenticated user; the REAL scope (own data
  // for consultants, managed projects for PMs, broad for gestao/finance) is
  // applied by the read functions in `lib/db/reports.ts`, not by this route.
  { prefix: "/app/relatorios", access: "ALL" },
  // Access administration (invitations, roles, status). ADMIN only — must come
  // before the broad `/app` rule. The public invite-accept route lives at
  // `/convite/*`, outside `/app`, so the proxy matcher never gates it.
  {
    // Client registration includes fiscal and financial fields. The page also
    // masks financial values, but route access stays restricted to business roles.
    prefix: "/app/clientes",
    access: ["ADMIN", "AREA_MANAGER", "FINANCE", "SALES"],
  },
  // Directory is visible to authenticated users; sensitive writes are action-gated.
  { prefix: "/app/consultores", access: "ALL" },
  { prefix: "/app/admin", access: ["ADMIN"] },
  { prefix: "/app", access: "ALL" },
];

/** Resolve the access requirement for a pathname. */
export function accessForPath(pathname: string): RouteAccess {
  const rule = routePermissions.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  );
  return rule ? rule.access : "ALL";
}

/** Whether a user holds at least one of the required roles. */
export function hasRole(
  user: AppUser | null,
  roles: RoleName | RoleName[],
): boolean {
  if (!user) return false;
  const required = Array.isArray(roles) ? roles : [roles];
  if (required.length === 0) return true;
  return required.some((role) => user.roles.includes(role));
}

/** Whether a user satisfies an access requirement. */
export function canAccess(user: AppUser | null, access: RouteAccess): boolean {
  if (!user) return false;
  if (access === "ALL") return true;
  return hasRole(user, access);
}

/** Whether a user may access a given path, per the route map. */
export function canAccessPath(user: AppUser | null, pathname: string): boolean {
  return canAccess(user, accessForPath(pathname));
}
