/**
 * RBAC layer for Nathal.IA.
 *
 * Phase-1 posture (deliberately conservative):
 *  - No real data is read.
 *  - No financial values are exposed.
 *  - No sensitive action is executed automatically.
 *  - Nothing is approved, edited or submitted on the user's behalf.
 *  - Any future sensitive action MUST go through `canExecuteAction` and require
 *    explicit confirmation (see `nathaliaActions.ts`).
 *
 * Roles are plain strings matching the host's `RoleName` catalog
 * (ADMIN, CONSULTANT, PROJECT_MANAGER, AREA_MANAGER, FINANCE, PEOPLE, SALES).
 * The package does not import the host's RBAC to stay portable.
 */
import { nathaliaActions } from "./nathaliaActions";
import type { NathaliaActionId, NathaliaContextKey, NathaliaUser } from "./nathaliaTypes";

/** Roles allowed to discuss approvals. Mirrors the app's approval route access. */
const APPROVAL_ROLES = ["ADMIN", "AREA_MANAGER", "PROJECT_MANAGER", "FINANCE"];

/** Roles allowed to see/discuss financial topics. Mirrors `FINANCIAL_ROLES`. */
const FINANCE_ROLES = ["ADMIN", "AREA_MANAGER", "FINANCE"];

function hasAnyRole(user: NathaliaUser | null, roles: string[]): boolean {
  if (!user) return false;
  if (roles.length === 0) return true;
  return roles.some((r) => user.roles.includes(r));
}

/** Whether Nathal.IA should be available at all for this user. */
export function canUseNathalia(user: NathaliaUser | null): boolean {
  // Any authenticated user may use the assistant. The widget is only mounted in
  // the authenticated app shell, so a null user means "not ready yet".
  return Boolean(user);
}

/** Whether the user may ask Nathal.IA about their hours (everyone may). */
export function canAskAboutHours(user: NathaliaUser | null): boolean {
  return canUseNathalia(user);
}

/** Whether the user may ask about the approval flow. */
export function canAskAboutApprovals(user: NathaliaUser | null): boolean {
  return hasAnyRole(user, APPROVAL_ROLES);
}

/**
 * Whether the user may ask about finance topics. Even when true, Nathal.IA does
 * NOT reveal concrete values in this phase — it explains concepts only.
 */
export function canAskAboutFinance(user: NathaliaUser | null): boolean {
  return hasAnyRole(user, FINANCE_ROLES);
}

/** Whether a given context is allowed for the user (drives suggestion gating). */
export function canAccessContext(
  user: NathaliaUser | null,
  context: NathaliaContextKey,
): boolean {
  switch (context) {
    case "approvals":
      return canAskAboutApprovals(user);
    case "finance":
      return canAskAboutFinance(user);
    case "settings":
      return hasAnyRole(user, ["ADMIN"]);
    default:
      return canUseNathalia(user);
  }
}

/**
 * Whether Nathal.IA may *answer* about a topic/context for this user (Fase 8).
 *
 * This is the single gate the intelligence layer (FAQ + knowledge + brain) uses
 * to decide if a curated answer may surface. It is intentionally identical to
 * `canAccessContext` today, but named for intent so the brain's call sites read
 * as "may I talk about this?" and a future divergence (e.g. read-only topics a
 * user can hear about but not navigate to) has an obvious home.
 */
export function canAnswerTopic(
  user: NathaliaUser | null,
  context: NathaliaContextKey,
): boolean {
  return canAccessContext(user, context);
}

export interface ActionPermission {
  allowed: boolean;
  /** True when the action may run but needs explicit user confirmation. */
  requiresConfirmation: boolean;
  /** Reason shown to the user when blocked. */
  reason?: string;
}

/**
 * Central gate for any Nathal.IA action. In this phase only safe/navigation
 * actions exist; sensitive actions are blocked outright and, if ever enabled,
 * must require confirmation.
 */
export function canExecuteAction(
  user: NathaliaUser | null,
  action: NathaliaActionId,
): ActionPermission {
  if (!canUseNathalia(user)) {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: "Sessão não autenticada.",
    };
  }

  const def = nathaliaActions[action];
  if (!def) {
    return { allowed: false, requiresConfirmation: false, reason: "Ação desconhecida." };
  }

  if (def.sensitivity === "sensitive") {
    // No sensitive action is wired in this phase. Keep the door closed and,
    // when opened later, force confirmation.
    return {
      allowed: false,
      requiresConfirmation: true,
      reason: "Ações sensíveis ainda não estão habilitadas.",
    };
  }

  return { allowed: true, requiresConfirmation: def.requiresConfirmation };
}
