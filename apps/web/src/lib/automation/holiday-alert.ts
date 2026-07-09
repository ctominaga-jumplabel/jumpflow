/**
 * Holiday alert (Onda A/2).
 *
 * Scans the Holiday calendar for holidays falling within the next N days and
 * emits a HOLIDAY_UPCOMING notification through the engine. Recipients/channel
 * come from NotificationRule (configure at /app/admin/notificacoes).
 *
 * Scope:
 *   - GLOBAL rules receive every alert (e.g. ROLE PEOPLE).
 *   - PROJECT rules (scope=PROJECT + scopeId) let a specific project get its own
 *     holiday alert ("notificação por projeto"). We reuse the engine's existing
 *     scope filter — no new mechanism: we emit once GLOBAL and once per project
 *     that has an active PROJECT-scoped rule for the event.
 *
 * Idempotency: holidays sharing the same calendar date are grouped into ONE
 * alert, keyed by the ISO date (dedupeKey). The engine's AutomationEmailLog
 * referenceKey becomes `HOLIDAY_UPCOMING:<ISO date>:<recipient>`, so the same
 * date never notifies the same recipient twice — safe to run daily. Grouping by
 * date also means multiple holidays on one day (e.g. a national + a municipal)
 * land in a single email instead of colliding on the dedupeKey.
 *
 * The runner is best-effort and never throws (emit swallows).
 */
import { prisma } from "@jumpflow/database";
import { isDatabaseConfigured } from "@/lib/db/config";
import { formatDate } from "@/lib/format";
import {
  buildFeriadoProximoEmail,
  type FeriadoProximoLine,
} from "./email/templates";
import { emitNotification } from "./notifications/emit";

/** Default look-ahead window in days. */
export const DEFAULT_HOLIDAY_DAYS_AHEAD = 7;

export interface RunHolidayAlertInput {
  /** Days ahead to look for upcoming holidays (default 7). */
  daysAhead?: number;
  /** Reference "today" (UTC). Defaults to now — injectable for tests. */
  now?: Date;
}

export interface RunHolidayAlertResult {
  /** Distinct holiday dates that fell inside the window. */
  holidayDates: number;
  daysAhead: number;
  sent: number;
  skipped: number;
  failed: number;
}

interface HolidayRow {
  date: Date;
  name: string;
  scope: "NATIONAL" | "STATE" | "CITY";
  region: string | null;
}

/** Human-readable coverage label for the email table. */
function scopeLabel(row: HolidayRow): string {
  if (row.scope === "NATIONAL") return "Nacional";
  if (row.region) return row.region;
  return row.scope === "STATE" ? "Estadual" : "Municipal";
}

/**
 * Group holidays by their ISO calendar date (YYYY-MM-DD, UTC). Pure — no I/O.
 * Preserves ascending date order for stable, scannable emails.
 */
export function groupHolidaysByDate(
  rows: HolidayRow[],
): Array<{ isoDate: string; lines: FeriadoProximoLine[] }> {
  const byDate = new Map<string, FeriadoProximoLine[]>();
  for (const row of rows) {
    const isoDate = row.date.toISOString().slice(0, 10);
    const line: FeriadoProximoLine = {
      dateLabel: formatDate(isoDate),
      name: row.name,
      scopeLabel: scopeLabel(row),
    };
    const list = byDate.get(isoDate);
    if (list) list.push(line);
    else byDate.set(isoDate, [line]);
  }
  return Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([isoDate, lines]) => ({ isoDate, lines }));
}

export async function runHolidayAlert(
  input: RunHolidayAlertInput = {},
): Promise<RunHolidayAlertResult> {
  const daysAhead = input.daysAhead ?? DEFAULT_HOLIDAY_DAYS_AHEAD;
  const empty: RunHolidayAlertResult = {
    holidayDates: 0,
    daysAhead,
    sent: 0,
    skipped: 0,
    failed: 0,
  };
  if (!isDatabaseConfigured()) return empty;

  const now = input.now ?? new Date();
  // Date-only window at UTC midnight to match @db.Date semantics.
  // The window is exactly `daysAhead` calendar days INCLUDING today, matching
  // the email copy "próximos N dias": for daysAhead=7 it spans [today, today+6]
  // (7 days). Today is included so a holiday landing today still notifies.
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + daysAhead - 1);

  const holidays = (await prisma.holiday.findMany({
    where: { date: { gte: today, lte: end } },
    select: { date: true, name: true, scope: true, region: true },
    orderBy: { date: "asc" },
  })) as HolidayRow[];

  if (holidays.length === 0) return empty;

  const groups = groupHolidaysByDate(holidays);

  // Projects with an active PROJECT-scoped rule for this event → emit per project
  // so the engine's scope filter delivers to that project's recipients too.
  const projectRules = await prisma.notificationRule.findMany({
    where: {
      event: "HOLIDAY_UPCOMING",
      scope: "PROJECT",
      active: true,
      scopeId: { not: null },
    },
    select: { scopeId: true },
  });
  const projectIds = Array.from(
    new Set(
      projectRules
        .map((r) => r.scopeId)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const group of groups) {
    const buildFragment = (
      recipient: Parameters<
        Parameters<typeof emitNotification>[0]["buildFragment"]
      >[0],
    ) => {
      const built = buildFeriadoProximoEmail({
        recipientName: recipient.name ?? "equipe",
        holidays: group.lines,
        daysAhead,
      });
      const summary = group.lines
        .map((l) => `${l.name} (${l.dateLabel})`)
        .join(", ");
      return {
        recipient,
        title: built.subject,
        prebuilt: built,
        teamsText: `Feriado próximo: ${summary}`,
      };
    };

    // GLOBAL rules (always match). dedupeKey = ISO date → one alert per date.
    const globalResult = await emitNotification({
      event: "HOLIDAY_UPCOMING",
      scope: { type: "GLOBAL" },
      context: {},
      dedupeKey: group.isoDate,
      buildFragment,
    });
    sent += globalResult.sent;
    skipped += globalResult.skipped;
    failed += globalResult.failed;

    // PROJECT-scoped rules: same dedupeKey → recipients already reached by the
    // GLOBAL emit are skipped by the engine (idempotent), no duplicate mail.
    for (const projectId of projectIds) {
      const projectResult = await emitNotification({
        event: "HOLIDAY_UPCOMING",
        scope: { type: "PROJECT", id: projectId },
        context: { projectId },
        dedupeKey: group.isoDate,
        buildFragment,
      });
      sent += projectResult.sent;
      skipped += projectResult.skipped;
      failed += projectResult.failed;
    }
  }

  return { holidayDates: groups.length, daysAhead, sent, skipped, failed };
}
