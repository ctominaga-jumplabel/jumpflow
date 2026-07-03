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

/** Home do Consultor (EP-M09): o Feed é o mural de entrada. */
const CONSULTANT_HOME = "/app/feed";

/** Fallback seguro quando o Feed está desligado (flag NEXT_PUBLIC_FEATURE_FEED). */
const CONSULTANT_HOME_FALLBACK = "/app/horas";

export function safeAppPath(value: string | string[] | undefined): string {
  if (typeof value === "string" && APP_PATH.test(value)) return value;
  return DEFAULT_APP_PATH;
}

/**
 * Landing pós-login por perfil (EP-M09). O CONSULTANT cai no Feed (sua home);
 * quando a feature flag do Feed está off, cai num fallback seguro (Horas).
 * Todos os demais perfis continuam no launcher `/app`. Pura e testável — as
 * roles vêm do usuário resolvido no servidor.
 */
export function landingPathFor(roles: readonly RoleName[]): string {
  const isConsultantOnly =
    roles.length > 0 && roles.every((r) => r === "CONSULTANT");
  if (isConsultantOnly) {
    return isFeedEnabled() ? CONSULTANT_HOME : CONSULTANT_HOME_FALLBACK;
  }
  return DEFAULT_APP_PATH;
}
