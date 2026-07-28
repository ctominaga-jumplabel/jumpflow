import type { ErrorCode } from "@/lib/actions/result";

/**
 * Internal typed failure for the Horas server actions; converted to an
 * ActionResult at the action boundary (`toFailure` in horas/actions.ts).
 *
 * Extracted from actions.ts so central guards that live outside the action file
 * (e.g. `assertCompetenceBillingOpen` in `billing-lock.ts`) throw the SAME class
 * the boundary recognizes via `instanceof` — the guards never leak to the client.
 */
export class ActionError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}
