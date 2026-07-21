/**
 * Runtime activity gate for Nathal.IA.
 *
 * Product code outside the assistant tree (e.g. the timesheet view) may fire
 * cues like {@link voiceNathaliaCue}/{@link celebrateNathalia} at real
 * interaction moments. Those play audio / mutate global state directly, so they
 * must NOT run when Nathal.IA is globally disabled — otherwise a recorded voice
 * clip could play while the assistant is supposed to be off.
 *
 * `NathaliaProvider` sets this active on mount. The provider only mounts when
 * the server-side `NATHALIA_ENABLED` master switch is on, so `isNathaliaActive()`
 * doubles as a single client-side source of truth for "is the assistant live?".
 * Seams should guard their cue calls with it.
 */
let active = false;

export function setNathaliaActive(value: boolean): void {
  active = value;
}

export function isNathaliaActive(): boolean {
  return active;
}
