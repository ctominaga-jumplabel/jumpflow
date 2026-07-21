/**
 * NathaliaSignals — real operational inputs the app computes and injects.
 *
 * This module is pure data (no clock/DOM/network). The host application is
 * responsible for computing these numbers (hours logged, pending approvals,
 * late activities, productivity delta) and passing them to the provider; the
 * ProactiveEngine then turns the relevant signal into a single gentle nudge.
 *
 * Keep this side-effect free so the store, types and engine can import it
 * without breaking the package's portability contract.
 */
export interface NathaliaSignals {
  hours?: { loggedToday: number; expectedToday: number; missingThisWeek?: number };
  approvals?: { pending: number };
  projects?: { lateActivities: number };
  reports?: { productivityDeltaPct?: number };
}

/** Neutral signals payload — nothing to surface. */
export const EMPTY_SIGNALS: NathaliaSignals = {};
