/**
 * Redirect-target safety. Only internal operational paths are allowed, which
 * prevents open redirects from a crafted `callbackUrl`. Pure and testable.
 */
const APP_PATH = /^\/app(\/|$)/;

export function safeAppPath(value: string | string[] | undefined): string {
  if (typeof value === "string" && APP_PATH.test(value)) return value;
  return "/app/dashboard";
}
