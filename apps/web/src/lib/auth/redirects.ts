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

export function safeAppPath(value: string | string[] | undefined): string {
  if (typeof value === "string" && APP_PATH.test(value)) return value;
  return DEFAULT_APP_PATH;
}
