/**
 * Pure resolution for the per-project consultant rate (M2). A
 * `ConsultantProjectRate` gives a consultant a differentiated valor/hora on ONE
 * project, effective-dated. When an entry's date falls inside an active window,
 * this rate overrides the consultant's agreed `hourlyRate` — used both as COST
 * (margin/tracking) and as the PAYMENT rate.
 *
 * No I/O: callers preload the rows (per consultant/project) and resolve by date.
 * `startsAt`/`endsAt` are date-only; the window is inclusive on both ends
 * (`startsAt <= date <= endsAt`, or open-ended when `endsAt` is null). When more
 * than one window matches, the latest `startsAt` wins (most recent supersedes).
 */

export interface ProjectRateWindow {
  startsAt: Date;
  endsAt: Date | null;
  hourlyRate: number;
}

/** Resolve the active per-project hourly rate for `date`, or null if none. */
export function resolveProjectRate(
  windows: ReadonlyArray<ProjectRateWindow>,
  date: Date,
): number | null {
  let best: ProjectRateWindow | null = null;
  for (const window of windows) {
    const afterStart = window.startsAt.getTime() <= date.getTime();
    const beforeEnd =
      window.endsAt === null || date.getTime() <= window.endsAt.getTime();
    if (afterStart && beforeEnd) {
      if (!best || window.startsAt.getTime() > best.startsAt.getTime()) {
        best = window;
      }
    }
  }
  return best ? best.hourlyRate : null;
}

/** Stable key for a consultant+project rate lookup map. */
export function projectRateKey(consultantId: string, projectId: string): string {
  return `${consultantId}::${projectId}`;
}
