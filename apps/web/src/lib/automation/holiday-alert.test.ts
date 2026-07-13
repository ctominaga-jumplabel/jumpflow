import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------
interface HolidayRow {
  date: Date;
  name: string;
  scope: "NATIONAL" | "STATE" | "CITY";
  region: string | null;
}

interface Recipient {
  key: string;
  name: string | null;
  address: string;
  channel: "EMAIL";
}

const h = vi.hoisted(() => {
  const store = {
    /** All holidays in the calendar; findMany applies the date window. */
    holidays: [] as Array<{
      date: Date;
      name: string;
      scope: string;
      region: string | null;
    }>,
    /** Active PROJECT-scoped rules for HOLIDAY_UPCOMING. */
    projectRules: [] as Array<{ scopeId: string | null }>,
    /** Recipients returned per scope: "GLOBAL" or "PROJECT:<id>". */
    recipientsByScope: new Map<string, Recipient[]>(),
    /** Engine-style idempotency store, keyed by `${dedupeKey}:${recipientKey}`. */
    sentRefs: new Set<string>(),
    /** Captured emit calls (scope + dedupeKey + context). */
    emitCalls: [] as Array<{
      scope: { type: string; id?: string };
      dedupeKey: string;
      context: unknown;
    }>,
    /** Fragments actually "delivered" (recipient + subject). */
    delivered: [] as Array<{ recipientKey: string; subject: string }>,
    /** Last `where` passed to holiday.findMany (to assert the window). */
    lastWhere: null as { date: { gte: Date; lte: Date } } | null,
  };

  const prismaMock = {
    holiday: {
      findMany: async ({ where }: { where: { date: { gte: Date; lte: Date } } }) => {
        store.lastWhere = where;
        const gte = where.date.gte.getTime();
        const lte = where.date.lte.getTime();
        return store.holidays
          .filter((row) => {
            const t = row.date.getTime();
            return t >= gte && t <= lte;
          })
          .sort((a, b) => a.date.getTime() - b.date.getTime());
      },
    },
    notificationRule: {
      findMany: async () => store.projectRules,
    },
  };

  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: { JsonNull: "__JsonNull__" },
}));

// Mock the engine: simulate its recipient resolution + AutomationEmailLog
// idempotency (dedupe by referenceKey = dedupeKey + recipient). The event is
// constant (HOLIDAY_UPCOMING) so the dedupeKey/recipient pair is the ref.
vi.mock("./notifications/emit", () => ({
  emitNotification: async (input: {
    scope: { type: string; id?: string };
    dedupeKey: string;
    context: unknown;
    buildFragment: (recipient: Recipient) => { title: string } | null;
  }) => {
    h.store.emitCalls.push({
      scope: input.scope,
      dedupeKey: input.dedupeKey,
      context: input.context,
    });
    const scopeKey =
      input.scope.type === "GLOBAL"
        ? "GLOBAL"
        : `PROJECT:${input.scope.id}`;
    const recipients = h.store.recipientsByScope.get(scopeKey) ?? [];
    let sent = 0;
    let skipped = 0;
    for (const recipient of recipients) {
      const ref = `${input.dedupeKey}:${recipient.key}`;
      if (h.store.sentRefs.has(ref)) {
        skipped += 1;
        continue;
      }
      const fragment = input.buildFragment(recipient);
      if (!fragment) {
        skipped += 1;
        continue;
      }
      h.store.sentRefs.add(ref);
      h.store.delivered.push({
        recipientKey: recipient.key,
        subject: fragment.title,
      });
      sent += 1;
    }
    return { sent, skipped, failed: 0 };
  },
}));

import { groupHolidaysByDate, runHolidayAlert } from "./holiday-alert";

function holiday(
  isoDate: string,
  name: string,
  scope: HolidayRow["scope"] = "NATIONAL",
  region: string | null = null,
) {
  return { date: new Date(`${isoDate}T00:00:00Z`), name, scope, region };
}

function recipient(key: string, name: string | null = key): Recipient {
  return { key, name, address: key, channel: "EMAIL" };
}

// ---------------------------------------------------------------------------
// groupHolidaysByDate — pure
// ---------------------------------------------------------------------------
describe("groupHolidaysByDate", () => {
  it("groups multiple holidays that share the same date into one entry", () => {
    const groups = groupHolidaysByDate([
      holiday("2026-11-20", "Consciência Negra (SP)", "STATE", "SP"),
      holiday("2026-11-20", "Consciência Negra (Nacional)", "NATIONAL"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].isoDate).toBe("2026-11-20");
    expect(groups[0].lines).toHaveLength(2);
    expect(groups[0].lines.map((l) => l.name)).toEqual([
      "Consciência Negra (SP)",
      "Consciência Negra (Nacional)",
    ]);
    // dateLabel is pt-BR, scope labels resolved (region wins, else Nacional).
    expect(groups[0].lines[0].dateLabel).toBe("20/11/2026");
    expect(groups[0].lines[0].scopeLabel).toBe("SP");
    expect(groups[0].lines[1].scopeLabel).toBe("Nacional");
  });

  it("keeps distinct dates as separate entries in ascending date order", () => {
    const groups = groupHolidaysByDate([
      holiday("2026-12-25", "Natal"),
      holiday("2026-09-07", "Independência"),
      holiday("2026-11-15", "Proclamação da República"),
    ]);
    expect(groups.map((g) => g.isoDate)).toEqual([
      "2026-09-07",
      "2026-11-15",
      "2026-12-25",
    ]);
    expect(groups.every((g) => g.lines.length === 1)).toBe(true);
  });

  it("resolves default scope labels for STATE/CITY without a region", () => {
    const groups = groupHolidaysByDate([
      holiday("2026-07-09", "Revolução Constitucionalista", "STATE"),
      holiday("2026-01-25", "Aniversário de São Paulo", "CITY"),
    ]);
    const byDate = Object.fromEntries(
      groups.map((g) => [g.isoDate, g.lines[0].scopeLabel]),
    );
    expect(byDate["2026-07-09"]).toBe("Estadual");
    expect(byDate["2026-01-25"]).toBe("Municipal");
  });

  it("returns an empty list for no holidays", () => {
    expect(groupHolidaysByDate([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// runHolidayAlert — runner (prisma + emitNotification mocked)
// ---------------------------------------------------------------------------
const NOW = new Date("2026-09-01T09:00:00Z");

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.holidays = [];
  h.store.projectRules = [];
  h.store.recipientsByScope = new Map([["GLOBAL", [recipient("people@x.com")]]]);
  h.store.sentRefs = new Set();
  h.store.emitCalls = [];
  h.store.delivered = [];
  h.store.lastWhere = null;
});

afterEach(() => vi.unstubAllEnvs());

describe("runHolidayAlert", () => {
  it("selects only holidays inside the daysAhead window and skips those outside", async () => {
    h.store.holidays = [
      holiday("2026-09-03", "Dentro"), // now + 2 days → in
      holiday("2026-09-07", "Borda"), // now + 6 days → last day in window, in
      holiday("2026-09-08", "Fora"), // now + 7 days → just outside (8th day)
      holiday("2026-09-20", "Fora"), // now + 19 days → out
    ];

    const result = await runHolidayAlert({ now: NOW });

    // Window is exactly 7 calendar days including today: [today, today + 6].
    expect(h.store.lastWhere?.date.gte.toISOString()).toBe(
      "2026-09-01T00:00:00.000Z",
    );
    expect(h.store.lastWhere?.date.lte.toISOString()).toBe(
      "2026-09-07T00:00:00.000Z",
    );

    // Two distinct in-window dates → two GLOBAL emits, dedupeKey = ISO date.
    expect(result.holidayDates).toBe(2);
    expect(result.daysAhead).toBe(7);
    expect(result.sent).toBe(2);
    expect(h.store.emitCalls.map((c) => c.dedupeKey)).toEqual([
      "2026-09-03",
      "2026-09-07",
    ]);
    // The out-of-window holiday never reached the engine.
    expect(h.store.delivered.map((d) => d.subject).join(" ")).not.toContain(
      "Fora",
    );
  });

  it("honours a custom daysAhead window", async () => {
    h.store.holidays = [
      holiday("2026-09-03", "Dentro"), // now + 2 days → last day of a 3-day window
      holiday("2026-09-04", "Fora do 3 dias"), // now + 3 days → outside
    ];
    const result = await runHolidayAlert({ now: NOW, daysAhead: 3 });
    // 3 calendar days including today: [today, today + 2] → 2026-09-03.
    expect(h.store.lastWhere?.date.lte.toISOString()).toBe(
      "2026-09-03T00:00:00.000Z",
    );
    expect(result.daysAhead).toBe(3);
    expect(result.holidayDates).toBe(1);
    expect(result.sent).toBe(1);
  });

  it("is idempotent: a second run for the same date does not resend (dedupeKey per date)", async () => {
    h.store.holidays = [holiday("2026-09-03", "Independência")];

    const first = await runHolidayAlert({ now: NOW });
    expect(first.sent).toBe(1);
    expect(h.store.delivered).toHaveLength(1);

    const second = await runHolidayAlert({ now: NOW });
    expect(second.sent).toBe(0);
    expect(second.skipped).toBe(1);
    // No new delivery on the re-run.
    expect(h.store.delivered).toHaveLength(1);
  });

  it("emits GLOBAL + PROJECT scopes without double-mailing a shared recipient", async () => {
    h.store.holidays = [holiday("2026-09-03", "Independência")];
    h.store.projectRules = [{ scopeId: "proj-1" }];
    h.store.recipientsByScope = new Map([
      ["GLOBAL", [recipient("people@x.com")]],
      // Project recipients include the same person reached by GLOBAL + a new PM.
      ["PROJECT:proj-1", [recipient("people@x.com"), recipient("pm@x.com")]],
    ]);

    const result = await runHolidayAlert({ now: NOW });

    // Two emits (one GLOBAL, one PROJECT) sharing the same dedupeKey.
    expect(h.store.emitCalls.map((c) => c.scope.type)).toEqual([
      "GLOBAL",
      "PROJECT",
    ]);
    expect(h.store.emitCalls[1].scope.id).toBe("proj-1");

    // people@x.com reached once (skipped on the PROJECT emit), pm@x.com once.
    const recipients = h.store.delivered.map((d) => d.recipientKey).sort();
    expect(recipients).toEqual(["people@x.com", "pm@x.com"]);
    expect(result.sent).toBe(2);
    expect(result.skipped).toBe(1); // people@x.com deduped on PROJECT emit
  });

  it("does nothing when there are no holidays in the window", async () => {
    h.store.holidays = [holiday("2026-12-25", "Natal")]; // far outside window
    const result = await runHolidayAlert({ now: NOW });
    expect(result).toEqual({
      holidayDates: 0,
      daysAhead: 7,
      sent: 0,
      skipped: 0,
      failed: 0,
    });
    expect(h.store.emitCalls).toHaveLength(0);
  });

  it("no-ops without throwing when the database is not configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    h.store.holidays = [holiday("2026-09-03", "Independência")];
    const result = await runHolidayAlert({ now: NOW });
    expect(result).toEqual({
      holidayDates: 0,
      daysAhead: 7,
      sent: 0,
      skipped: 0,
      failed: 0,
    });
    expect(h.store.emitCalls).toHaveLength(0);
  });
});
