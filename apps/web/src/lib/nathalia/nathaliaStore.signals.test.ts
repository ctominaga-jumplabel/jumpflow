/**
 * FASE A+B Nathal.IA — Wave 3 (tests).
 *
 * Unit coverage for the new store API surface around proactive signals:
 * `presentNudge`, `dismissNudge`, the nudge-clearing behaviour of
 * `openNathalia`/`closeNathalia`, and the timer-based `celebrateNathalia`.
 *
 * The store is a module-level singleton, so `resetNathalia()` in `beforeEach`
 * is required to avoid cross-test leakage. `celebrateNathalia` is client-only
 * and timer-based: vitest fake timers validate the auto-clear.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  celebrateNathalia,
  closeNathalia,
  dismissNudge,
  getNathaliaSnapshot,
  openNathalia,
  presentNudge,
  resetNathalia,
  type ProactiveNudge,
} from "@jumpflow/character-nathalia";

const NUDGE: ProactiveNudge = {
  id: "signal:hours",
  trigger: "signal",
  message: "Faltam 2h para completar sua jornada.",
  state: "warning",
  priority: "gentle",
  ctas: [
    { label: "Lançar agora", kind: "primary", action: "navigateToHours" },
    { label: "Lembrar depois", kind: "dismiss" },
  ],
};

describe("nathaliaStore — presentNudge / dismissNudge", () => {
  beforeEach(() => {
    resetNathalia();
  });

  it("sets activeNudge + notification + notifying mode when the panel is closed", () => {
    presentNudge(NUDGE);
    const s = getNathaliaSnapshot();

    expect(s.activeNudge).toEqual(NUDGE);
    expect(s.hasNotification).toBe(true);
    expect(s.widgetMode).toBe("notifying");
    expect(s.message).toBe(NUDGE.message);
    expect(s.state).toBe(NUDGE.state);
  });

  it("is a no-op when the panel is already open (never interrupts)", () => {
    openNathalia();
    const before = getNathaliaSnapshot();
    presentNudge(NUDGE);
    const after = getNathaliaSnapshot();

    expect(after.activeNudge).toBeNull();
    expect(after).toBe(before); // no emit, same snapshot reference
  });

  it("dismissNudge clears the active nudge + notification (closed panel)", () => {
    presentNudge(NUDGE);
    dismissNudge();
    const s = getNathaliaSnapshot();

    expect(s.activeNudge).toBeNull();
    expect(s.hasNotification).toBe(false);
    expect(s.widgetMode).toBe("minimized");
  });

  it("dismissNudge keeps the widget expanded when the panel is open", () => {
    presentNudge(NUDGE);
    openNathalia(); // this clears the nudge too, but mode is now expanded
    dismissNudge();
    expect(getNathaliaSnapshot().widgetMode).toBe("expanded");
    expect(getNathaliaSnapshot().activeNudge).toBeNull();
  });
});

describe("nathaliaStore — open/close clears the active nudge", () => {
  beforeEach(() => {
    resetNathalia();
  });

  it("openNathalia clears the active nudge and the notification", () => {
    presentNudge(NUDGE);
    expect(getNathaliaSnapshot().activeNudge).toEqual(NUDGE);

    openNathalia();
    const s = getNathaliaSnapshot();
    expect(s.activeNudge).toBeNull();
    expect(s.hasNotification).toBe(false);
    expect(s.open).toBe(true);
  });

  it("closeNathalia clears the active nudge", () => {
    presentNudge(NUDGE);
    closeNathalia();
    const s = getNathaliaSnapshot();
    expect(s.activeNudge).toBeNull();
    expect(s.open).toBe(false);
    expect(s.widgetMode).toBe("minimized");
  });
});

describe("nathaliaStore — celebrateNathalia (timer-based)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetNathalia();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets celebrating=true with the celebrate visual immediately", () => {
    celebrateNathalia("Tudo aprovado!");
    const s = getNathaliaSnapshot();

    expect(s.celebrating).toBe(true);
    expect(s.state).toBe("celebrate");
    expect(s.message).toBe("Tudo aprovado!");
    // Closed panel -> notifying + a notification flag.
    expect(s.widgetMode).toBe("notifying");
    expect(s.hasNotification).toBe(true);
  });

  it("auto-clears celebrating and returns to idle after the duration", () => {
    celebrateNathalia("Boa!", 3200);
    expect(getNathaliaSnapshot().celebrating).toBe(true);

    vi.advanceTimersByTime(3200);

    const s = getNathaliaSnapshot();
    expect(s.celebrating).toBe(false);
    expect(s.state).toBe("idle");
  });

  it("retires the notification cue after celebrating with the panel closed", () => {
    // Regression: the celebration left hasNotification/notifying/message stuck on
    // the minimized widget after the confetti window ended.
    const before = getNathaliaSnapshot().message;
    celebrateNathalia("Horas enviadas! 🎉", 3200);
    expect(getNathaliaSnapshot().hasNotification).toBe(true);

    vi.advanceTimersByTime(3200);

    const s = getNathaliaSnapshot();
    expect(s.hasNotification).toBe(false);
    expect(s.widgetMode).toBe("minimized");
    expect(s.message).toBe(before);
  });

  it("does not clear before the duration elapses", () => {
    celebrateNathalia("Boa!", 3200);
    vi.advanceTimersByTime(3199);
    expect(getNathaliaSnapshot().celebrating).toBe(true);
  });

  it("keeps the widget expanded while celebrating with the panel open", () => {
    openNathalia();
    celebrateNathalia("Boa!");
    const s = getNathaliaSnapshot();
    expect(s.widgetMode).toBe("expanded");
    expect(s.hasNotification).toBe(false);
  });

  it("a second celebrate resets the pending timer (no early clear)", () => {
    celebrateNathalia("Primeira", 3200);
    vi.advanceTimersByTime(2000);
    celebrateNathalia("Segunda", 3200);
    // 2000 + 1500 = 3500 since the FIRST call, but only 1500 since the second.
    vi.advanceTimersByTime(1500);
    expect(getNathaliaSnapshot().celebrating).toBe(true);
    expect(getNathaliaSnapshot().message).toBe("Segunda");
    // Now finish the second timer.
    vi.advanceTimersByTime(1700);
    expect(getNathaliaSnapshot().celebrating).toBe(false);
  });
});
