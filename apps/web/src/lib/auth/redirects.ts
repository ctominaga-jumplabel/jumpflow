import type { RoleName } from "@/lib/auth/roles";
import { isFeedEnabled } from "@/lib/feed/flags";

/**
 * Redirect-target safety. Only internal operational paths are allowed, which
 * prevents open redirects from a crafted `callbackUrl`. Pure and testable.
 */
const APP_PATH = /^\/app(\/|$)/;

/**
 * Default post-login destination: the operational launcher at `/app`.
 * Consultants land on shortcuts by profile; the dashboard stays reachable
 * via the sidebar (docs/backlog-refinado-consultor-operacoes.md, secao 9).
 */
export const DEFAULT_APP_PATH = "/app";

/**
 * Home do Consultor: a tela cheia de Novo Lançamento de Horas. O consultor
 * entra no JumpFlow para lançar horas — a tela inicial é a própria ação, e o
 * histórico fica a um clique ("Ver Histórico" → a grade de Horas).
 */
export const CONSULTANT_HOME = "/app/horas/lancamento";

/**
 * Home do Gestor de Área: a fila de Aprovações. É o trabalho recorrente do
 * papel; a rota principal já serve a direção visual "Nova" (default).
 */
export const AREA_MANAGER_HOME = "/app/aprovacoes";

/** Mural interno (Feed), quando a flag NEXT_PUBLIC_FEATURE_FEED está ligada. */
const FEED_HOME = "/app/feed";

/** Fallback seguro quando o Feed está desligado (flag NEXT_PUBLIC_FEATURE_FEED). */
const FEED_HOME_FALLBACK = "/app/horas";

export function safeAppPath(value: string | string[] | undefined): string {
  if (typeof value === "string" && APP_PATH.test(value)) return value;
  return DEFAULT_APP_PATH;
}

/**
 * Home do Feed (mural interno) com o fallback seguro quando a flag do Feed está
 * off (Horas). É o destino dos perfis que não têm uma home própria por papel —
 * ou seja, nem ADMIN, nem Financeiro-exclusivo, nem Consultor puro, nem Gestor
 * de Área (ver `homePathFor` e `src/app/app/page.tsx`). Pura e reutilizável —
 * centraliza a decisão Feed × fallback num único ponto.
 */
export function feedHomePath(): string {
  return isFeedEnabled() ? FEED_HOME : FEED_HOME_FALLBACK;
}

/** Se TODOS os papéis do usuário são CONSULTANT (consultor puro). */
function isConsultantOnly(roles: readonly RoleName[]): boolean {
  return roles.length > 0 && roles.every((r) => r === "CONSULTANT");
}

/**
 * Tela inicial por PERFIL, em um único ponto (usada pelo `/app` e pelo landing
 * pós-login). A ordem das regras é a precedência:
 *
 *  1. Consultor puro  → Novo Lançamento de Horas (a ação que ele vem fazer);
 *  2. Gestor de Área  → Aprovações (o trabalho recorrente do papel);
 *  3. demais perfis   → `null`, ou seja, o launcher/Feed decide (`/app`).
 *
 * ADMIN e Financeiro-exclusivo NÃO são tratados aqui: eles têm home própria
 * renderizada pelo `/app` (grade de atalhos e home de 3 cards). Pura e testável.
 */
export function homePathFor(roles: readonly RoleName[]): string | null {
  if (isConsultantOnly(roles)) return CONSULTANT_HOME;
  if (roles.includes("AREA_MANAGER")) return AREA_MANAGER_HOME;
  return null;
}

/**
 * Landing pós-login por perfil. Delega a decisão a `homePathFor`; os perfis sem
 * home própria continuam no launcher `/app`, que resolve grade/Feed. Pura e
 * testável — as roles vêm do usuário resolvido no servidor.
 */
export function landingPathFor(roles: readonly RoleName[]): string {
  return homePathFor(roles) ?? DEFAULT_APP_PATH;
}
