import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Read-layer tests for the Horas module with a stateful in-memory Prisma mock
 * (same harness pattern as app/horas/actions.test.ts — the mock interprets the
 * exact where-shapes these queries issue). Cases follow
 * docs/horas-persistencia.md section 3.
 */

interface ConsultantRec {
  id: string;
  userId: string | null;
  email: string;
  name: string;
}
interface ProjectRec {
  id: string;
  name: string;
  status: string;
  managerUserId: string | null;
  clientId: string;
  clientName: string;
}
interface AllocationRec {
  id: string;
  consultantId: string;
  projectId: string;
  status: string;
  startDate: Date;
  endDate: Date | null;
}
interface PeriodRec {
  id: string;
  consultantId: string;
  startDate: Date;
  endDate: Date;
  status: string;
  submittedAt: Date | null;
}
interface EntryRec {
  id: string;
  periodId: string;
  consultantId: string;
  projectId: string;
  date: Date;
  hours: number;
  multiplier: number;
  activityType: string;
  description: string | null;
  billable: boolean;
  status: string;
  submittedAt: Date | null;
}
interface HolidayRec {
  date: Date;
  name: string;
  scope: string;
  region: string | null;
}
interface ApprovalRec {
  id: string;
  entityType: string;
  entityId: string;
  approverUserId: string;
  status: string;
  comment: string | null;
  isAutomatic: boolean;
  ruleKey: string | null;
  createdAt: Date;
}

// The in-memory mock interprets dynamic where-shapes; `any` would be flagged,
// so use a loose-but-lintable record type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

const h = vi.hoisted(() => {
  const store = {
    consultants: [] as ConsultantRec[],
    projects: [] as ProjectRec[],
    allocations: [] as AllocationRec[],
    periods: [] as PeriodRec[],
    entries: [] as EntryRec[],
    approvals: [] as ApprovalRec[],
    holidays: [] as HolidayRec[],
  };

  const projectOf = (projectId: string) =>
    store.projects.find((p) => p.id === projectId);

  function projectWithClient(projectId: string) {
    const project = projectOf(projectId)!;
    return {
      id: project.id,
      name: project.name,
      status: project.status,
      managerUserId: project.managerUserId,
      client: { id: project.clientId, name: project.clientName },
    };
  }

  function matchEntry(e: EntryRec, where: Where): boolean {
    if (where.id?.in && !where.id.in.includes(e.id)) return false;
    if (where.consultantId && e.consultantId !== where.consultantId) {
      return false;
    }
    if (typeof where.status === "string" && e.status !== where.status) {
      return false;
    }
    // Rodada 4.2 operational filters.
    if (where.activityType && e.activityType !== where.activityType) {
      return false;
    }
    if (typeof where.billable === "boolean" && e.billable !== where.billable) {
      return false;
    }
    if (where.projectId && e.projectId !== where.projectId) return false;
    if (where.date) {
      if (where.date.gte && e.date.getTime() < where.date.gte.getTime()) {
        return false;
      }
      if (where.date.lte && e.date.getTime() > where.date.lte.getTime()) {
        return false;
      }
    }
    if (where.project?.managerUserId) {
      const project = projectOf(e.projectId);
      if (!project || project.managerUserId !== where.project.managerUserId) {
        return false;
      }
    }
    if (where.project?.status) {
      const project = projectOf(e.projectId);
      if (!project || project.status !== where.project.status) return false;
    }
    if (where.project?.clientId) {
      const project = projectOf(e.projectId);
      if (!project || project.clientId !== where.project.clientId) return false;
    }
    return true;
  }

  function entryOut(e: EntryRec, include?: Where) {
    const out: Record<string, unknown> = { ...e };
    if (include?.project) out.project = projectWithClient(e.projectId);
    if (include?.consultant) {
      out.consultant = {
        name: store.consultants.find((c) => c.id === e.consultantId)!.name,
      };
    }
    if (include?.period) {
      const period = store.periods.find((p) => p.id === e.periodId)!;
      out.period = { id: period.id, startDate: period.startDate };
    }
    return out;
  }

  const prismaMock = {
    consultant: {
      findUnique: async ({ where }: { where: Where }) => {
        const consultant =
          where.userId !== undefined
            ? store.consultants.find((c) => c.userId === where.userId)
            : store.consultants.find((c) => c.email === where.email);
        return consultant ? { ...consultant } : null;
      },
    },
    timesheetPeriod: {
      findUnique: async ({ where }: { where: Where }) => {
        const key = where.consultantId_startDate_endDate;
        const period = store.periods.find(
          (p) =>
            p.consultantId === key.consultantId &&
            p.startDate.getTime() === key.startDate.getTime() &&
            p.endDate.getTime() === key.endDate.getTime(),
        );
        return period ? { ...period } : null;
      },
    },
    timeEntry: {
      findMany: async ({
        where,
        include,
        orderBy,
      }: {
        where: Where;
        include?: Where;
        orderBy?: Where;
      }) => {
        const list = store.entries.filter((e) => matchEntry(e, where));
        if (orderBy?.date === "asc") {
          list.sort((a, b) => a.date.getTime() - b.date.getTime());
        }
        if (orderBy?.submittedAt === "asc") {
          list.sort(
            (a, b) =>
              (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0),
          );
        }
        return list.map((e) => entryOut(e, include));
      },
    },
    allocation: {
      findMany: async ({
        where,
        include,
        select,
      }: {
        where: Where;
        include?: Where;
        select?: Where;
      }) => {
        const list = store.allocations.filter((a) => {
          if (a.consultantId !== where.consultantId) return false;
          if (where.status && a.status !== where.status) return false;
          if (
            where.startDate?.lte &&
            a.startDate.getTime() > where.startDate.lte.getTime()
          ) {
            return false;
          }
          if (where.OR) {
            const matches = (where.OR as Where[]).some((cond) => {
              if (cond.endDate === null) return a.endDate === null;
              if (cond.endDate?.gte) {
                return (
                  a.endDate !== null &&
                  a.endDate.getTime() >= cond.endDate.gte.getTime()
                );
              }
              return false;
            });
            if (!matches) return false;
          }
          if (where.project?.status?.not) {
            const project = projectOf(a.projectId);
            if (!project || project.status === where.project.status.not) {
              return false;
            }
          }
          // Exact project-status match (listAllowedProjects with a filter).
          if (typeof where.project?.status === "string") {
            const project = projectOf(a.projectId);
            if (!project || project.status !== where.project.status) {
              return false;
            }
          }
          return true;
        });
        // listAllowedProjects now uses a narrow `select`; the read still only
        // needs projectId + project label, so honor either shape.
        const wantsProject = include?.project ?? select?.project;
        return list.map((a) => ({
          ...a,
          ...(wantsProject ? { project: projectWithClient(a.projectId) } : {}),
        }));
      },
    },
    holiday: {
      findMany: async ({ where }: { where: Where }) => {
        return store.holidays.filter((holiday) => {
          if (where.scope && holiday.scope !== where.scope) return false;
          if (where.date?.gte && holiday.date.getTime() < where.date.gte.getTime()) {
            return false;
          }
          if (where.date?.lte && holiday.date.getTime() > where.date.lte.getTime()) {
            return false;
          }
          return true;
        });
      },
    },
    approval: {
      findMany: async ({
        where,
        orderBy,
        take,
      }: {
        where: Where;
        orderBy?: Where;
        take?: number;
      }) => {
        let list = store.approvals.filter((a) => {
          if (where.entityType && a.entityType !== where.entityType) {
            return false;
          }
          // The PM-scope fix narrows history BEFORE take(HISTORY_LIMIT) via
          // entityId.in; the mock must honor it or the window test is moot.
          if (where.entityId?.in && !where.entityId.in.includes(a.entityId)) {
            return false;
          }
          return true;
        });
        if (orderBy?.createdAt === "desc") {
          list = [...list].sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
          );
        }
        if (take !== undefined) list = list.slice(0, take);
        return list.map((a) => ({ ...a }));
      },
    },
  };

  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: {},
}));

import type { AppUser } from "@/lib/auth/types";
import {
  getConsultantForUser,
  getPeriodForConsultant,
  getWeekForConsultant,
  listAllowedProjects,
  listHoursApprovalItems,
} from "./timesheet";

const MONDAY = new Date("2026-06-08T00:00:00.000Z");
const SUNDAY = new Date("2026-06-14T00:00:00.000Z");

const appUser = (over: Partial<AppUser> = {}): AppUser => ({
  id: "user-1",
  name: "Ana Martins",
  email: "ana@jumplabel.com.br",
  roles: ["CONSULTANT"],
  ...over,
});

function seedPeriod(over: Partial<PeriodRec> = {}): PeriodRec {
  const period: PeriodRec = {
    id: "period-1",
    consultantId: "con-1",
    startDate: MONDAY,
    endDate: SUNDAY,
    status: "SUBMITTED",
    submittedAt: new Date("2026-06-09T10:00:00.000Z"),
    ...over,
  };
  h.store.periods.push(period);
  return period;
}

let entrySeq = 0;
function seedEntry(over: Partial<EntryRec> = {}): EntryRec {
  const entry: EntryRec = {
    id: `entry-${++entrySeq}`,
    periodId: "period-1",
    consultantId: "con-1",
    projectId: "proj-atlas",
    date: new Date("2026-06-10T00:00:00.000Z"),
    hours: 8,
    multiplier: 1,
    activityType: "DEVELOPMENT",
    description: null,
    billable: true,
    status: "SUBMITTED",
    submittedAt: new Date("2026-06-09T10:00:00.000Z"),
    ...over,
  };
  h.store.entries.push(entry);
  return entry;
}

beforeEach(() => {
  entrySeq = 0;
  h.store.consultants = [
    {
      id: "con-1",
      userId: "user-1",
      email: "ana@jumplabel.com.br",
      name: "Ana Martins",
    },
    {
      id: "con-2",
      userId: null,
      email: "bruno@jumplabel.com.br",
      name: "Bruno Lima",
    },
  ];
  h.store.projects = [
    {
      id: "proj-atlas",
      name: "Atlas",
      status: "ACTIVE",
      managerUserId: "manager-1",
      clientId: "cli-vix",
      clientName: "Vix Energia",
    },
    {
      id: "proj-orion",
      name: "Órion",
      status: "ACTIVE",
      managerUserId: "manager-2",
      clientId: "cli-banco",
      clientName: "Banco Sul",
    },
    {
      id: "proj-closed",
      name: "Zeta",
      status: "CLOSED",
      managerUserId: "manager-1",
      clientId: "cli-vix",
      clientName: "Vix Energia",
    },
  ];
  h.store.allocations = [];
  h.store.periods = [];
  h.store.entries = [];
  h.store.approvals = [];
  h.store.holidays = [];
});

describe("getConsultantForUser", () => {
  it("finds the consultant by userId (production path)", async () => {
    // Email deliberately differs to prove the userId match wins.
    const result = await getConsultantForUser(
      appUser({ id: "user-1", email: "outro@jumplabel.com.br" }),
    );
    expect(result).toMatchObject({ id: "con-1" });
  });

  it("falls back to the unique email when the session id is synthetic (dev auth only)", async () => {
    vi.stubEnv("AUTH_DEV_MODE", "true");
    const result = await getConsultantForUser(
      appUser({ id: "dev-user", email: "bruno@jumplabel.com.br" }),
    );
    expect(result).toMatchObject({ id: "con-2" });
  });

  it("does NOT fall back to email outside dev auth (userId is the gate)", async () => {
    vi.stubEnv("AUTH_DEV_MODE", "false");
    // Unlinking Consultant.userId must revoke access even if the email matches.
    const result = await getConsultantForUser(
      appUser({ id: "dev-user", email: "bruno@jumplabel.com.br" }),
    );
    expect(result).toBeNull();
  });

  it("returns null when neither userId nor email matches", async () => {
    const result = await getConsultantForUser(
      appUser({ id: "ghost", email: "ninguem@jumplabel.com.br" }),
    );
    expect(result).toBeNull();
  });
});

describe("getWeekForConsultant", () => {
  it("splits the same project+activity into one row per status", async () => {
    seedPeriod({ status: "SUBMITTED" });
    const mon = seedEntry({
      date: new Date("2026-06-08T00:00:00.000Z"),
      hours: 8,
      status: "APPROVED",
    });
    const tue = seedEntry({
      date: new Date("2026-06-09T00:00:00.000Z"),
      hours: 4,
      status: "SUBMITTED",
    });
    const sun = seedEntry({
      date: new Date("2026-06-14T00:00:00.000Z"),
      hours: 2,
      status: "DRAFT",
      submittedAt: null,
    });

    const week = await getWeekForConsultant("con-1", MONDAY);

    // Same key (proj-atlas, DEVELOPMENT) but three statuses => three rows,
    // sorted by status (APPROVED < DRAFT < SUBMITTED).
    expect(week.rows).toHaveLength(3);
    expect(week.rows.map((r) => r.status)).toEqual([
      "APPROVED",
      "DRAFT",
      "SUBMITTED",
    ]);

    const [approved, draft, submitted] = week.rows;
    expect(approved.hours).toEqual([8, 0, 0, 0, 0, 0, 0]);
    expect(approved.entryIds?.[0]).toBe(mon.id);
    expect(submitted.hours).toEqual([0, 4, 0, 0, 0, 0, 0]);
    expect(submitted.entryIds?.[1]).toBe(tue.id);
    expect(draft.hours).toEqual([0, 0, 0, 0, 0, 0, 2]);
    expect(draft.entryIds?.[6]).toBe(sun.id);

    // The week status comes from the persisted period when it exists.
    expect(week.status).toBe("SUBMITTED");
    expect(week.startDate).toBe("2026-06-08");
    expect(week.endDate).toBe("2026-06-14");
  });

  it("derives the week status from rows when no period exists", async () => {
    seedEntry({ status: "DRAFT", submittedAt: null });
    const week = await getWeekForConsultant("con-1", MONDAY);
    expect(week.rows).toHaveLength(1);
    expect(week.status).toBe("DRAFT");
  });

  it("não colapsa dois ON_CALL do mesmo projeto/status com fatores divergentes (M3)", async () => {
    seedPeriod({ status: "SUBMITTED" });
    // Mesmo projeto, atividade (ON_CALL) e status, mas fatores distintos: o grid
    // deve manter DUAS linhas para não corromper o "Equivalente" exibido.
    seedEntry({
      date: new Date("2026-06-08T00:00:00.000Z"),
      hours: 6,
      activityType: "ON_CALL",
      multiplier: 0.33,
      status: "SUBMITTED",
    });
    seedEntry({
      date: new Date("2026-06-09T00:00:00.000Z"),
      hours: 6,
      activityType: "ON_CALL",
      multiplier: 0.5,
      status: "SUBMITTED",
    });

    const week = await getWeekForConsultant("con-1", MONDAY);
    const onCallRows = week.rows.filter((r) => r.activity === "ON_CALL");
    expect(onCallRows).toHaveLength(2);
    expect(onCallRows.map((r) => r.multiplier).sort()).toEqual([0.33, 0.5]);
  });

  it("renders legacy activity codes with a readable label (compat)", async () => {
    seedEntry({ activityType: "DEVELOPMENT", status: "DRAFT" });
    const week = await getWeekForConsultant("con-1", MONDAY);
    // The row keeps the raw code; the UI maps it via activityLabelOf.
    expect(week.rows[0].activity).toBe("DEVELOPMENT");
  });
});

describe("getPeriodForConsultant", () => {
  it("clamps very long ranges to the operational overview limit", async () => {
    const period = await getPeriodForConsultant(
      "con-1",
      "2026-01-01",
      "2026-12-31",
    );

    expect(period.startDate).toBe("2026-01-01");
    expect(period.endDate).toBe("2026-04-03");
    expect(period.days).toHaveLength(93);
  });
});

describe("holiday awareness (Onda A/3, aviso não-bloqueante)", () => {
  it("annotates the matching week day with the national holiday name", async () => {
    // Sexta-feira Santa 2026 cai no intervalo Seg 08→Dom 14? Não; usar um
    // feriado dentro da semana de teste: 2026-06-10 (quarta) como feriado
    // fictício NACIONAL para validar o mapeamento por data-calendário.
    h.store.holidays.push({
      date: new Date("2026-06-10T00:00:00.000Z"),
      name: "Feriado de Teste",
      scope: "NATIONAL",
      region: null,
    });

    const week = await getWeekForConsultant("con-1", MONDAY);

    const wednesday = week.days.find((d) => d.date === "2026-06-10");
    expect(wednesday?.holidayName).toBe("Feriado de Teste");
    // Demais dias permanecem sem feriado (não-bloqueante, só sinalização).
    expect(
      week.days.filter((d) => d.holidayName !== undefined),
    ).toHaveLength(1);
  });

  it("ignores non-national holidays (regional out of scope for now)", async () => {
    h.store.holidays.push({
      date: new Date("2026-06-10T00:00:00.000Z"),
      name: "Aniversário da Cidade",
      scope: "CITY",
      region: "3550308",
    });

    const week = await getWeekForConsultant("con-1", MONDAY);

    expect(
      week.days.filter((d) => d.holidayName !== undefined),
    ).toHaveLength(0);
  });

  it("annotates the period calendar day with the holiday name", async () => {
    h.store.holidays.push({
      date: new Date("2026-06-10T00:00:00.000Z"),
      name: "Feriado de Teste",
      scope: "NATIONAL",
      region: null,
    });

    const period = await getPeriodForConsultant(
      "con-1",
      "2026-06-08",
      "2026-06-14",
    );

    const day = period.days.find((d) => d.date === "2026-06-10");
    expect(day?.holidayName).toBe("Feriado de Teste");
  });
});

describe("getWeekForConsultant — operational filters (Rodada 4.2)", () => {
  function seedMixedWeek() {
    seedEntry({
      projectId: "proj-atlas",
      activityType: "WORKDAY",
      status: "DRAFT",
      billable: true,
      date: new Date("2026-06-08T00:00:00.000Z"),
    });
    seedEntry({
      projectId: "proj-atlas",
      activityType: "ON_CALL",
      status: "SUBMITTED",
      billable: false,
      date: new Date("2026-06-09T00:00:00.000Z"),
    });
    seedEntry({
      projectId: "proj-orion",
      activityType: "WORKDAY",
      status: "APPROVED",
      billable: true,
      date: new Date("2026-06-10T00:00:00.000Z"),
    });
  }

  it("with no filter behaves like the current week (all rows)", async () => {
    seedMixedWeek();
    const week = await getWeekForConsultant("con-1", MONDAY);
    expect(week.rows).toHaveLength(3);
  });

  it("reduces by status", async () => {
    seedMixedWeek();
    const week = await getWeekForConsultant("con-1", MONDAY, {
      status: "DRAFT",
    });
    expect(week.rows.map((r) => r.status)).toEqual(["DRAFT"]);
  });

  it("reduces by activity", async () => {
    seedMixedWeek();
    const week = await getWeekForConsultant("con-1", MONDAY, {
      activity: "ON_CALL",
    });
    expect(week.rows).toHaveLength(1);
    expect(week.rows[0].activity).toBe("ON_CALL");
  });

  it("reduces by billable", async () => {
    seedMixedWeek();
    const week = await getWeekForConsultant("con-1", MONDAY, {
      billable: false,
    });
    expect(week.rows).toHaveLength(1);
    expect(week.rows[0].billable).toBe(false);
  });

  it("reduces by projectId", async () => {
    seedMixedWeek();
    const week = await getWeekForConsultant("con-1", MONDAY, {
      projectId: "proj-orion",
    });
    expect(week.rows.map((r) => r.projectId)).toEqual(["proj-orion"]);
  });

  it("reduces by project status", async () => {
    // proj-atlas + proj-orion are ACTIVE; proj-closed is CLOSED.
    seedMixedWeek();
    seedEntry({
      projectId: "proj-closed",
      activityType: "WORKDAY",
      status: "DRAFT",
      date: new Date("2026-06-11T00:00:00.000Z"),
    });
    const week = await getWeekForConsultant("con-1", MONDAY, {
      projectStatus: "CLOSED",
    });
    expect(week.rows.map((r) => r.projectId)).toEqual(["proj-closed"]);
  });

  it("orders rows by status asc/desc", async () => {
    seedMixedWeek();
    const asc = await getWeekForConsultant("con-1", MONDAY, {
      sort: "status",
      direction: "asc",
    });
    expect(asc.rows.map((r) => r.status)).toEqual([
      "APPROVED",
      "DRAFT",
      "SUBMITTED",
    ]);
    const desc = await getWeekForConsultant("con-1", MONDAY, {
      sort: "status",
      direction: "desc",
    });
    expect(desc.rows.map((r) => r.status)).toEqual([
      "SUBMITTED",
      "DRAFT",
      "APPROVED",
    ]);
  });

  it("orders rows by project name (default)", async () => {
    seedMixedWeek();
    const week = await getWeekForConsultant("con-1", MONDAY);
    // Atlas before Órion (pt-BR collation), default sort=project asc.
    expect(week.rows.map((r) => r.projectName)).toEqual([
      "Atlas",
      "Atlas",
      "Órion",
    ]);
  });

  it("orders rows by project name desc", async () => {
    seedMixedWeek();
    const week = await getWeekForConsultant("con-1", MONDAY, {
      sort: "project",
      direction: "desc",
    });
    expect(week.rows.map((r) => r.projectName)).toEqual([
      "Órion",
      "Atlas",
      "Atlas",
    ]);
  });

  it("orders rows by activity label asc/desc", async () => {
    seedMixedWeek();
    // Labels: WORKDAY="Dia Útil", ON_CALL="Sobreaviso". Two WORKDAY + one
    // ON_CALL: asc => Dia Útil (x2) before Sobreaviso.
    const asc = await getWeekForConsultant("con-1", MONDAY, {
      sort: "activity",
      direction: "asc",
    });
    expect(asc.rows.map((r) => r.activity)).toEqual([
      "WORKDAY",
      "WORKDAY",
      "ON_CALL",
    ]);
    const desc = await getWeekForConsultant("con-1", MONDAY, {
      sort: "activity",
      direction: "desc",
    });
    expect(desc.rows.map((r) => r.activity)).toEqual([
      "ON_CALL",
      "WORKDAY",
      "WORKDAY",
    ]);
  });

  it("orders rows by date (first weekday with hours) asc/desc", async () => {
    // seedMixedWeek logs Mon (WORKDAY/Atlas), Tue (ON_CALL/Atlas),
    // Wed (WORKDAY/Órion) — first-hour indices 0, 1, 2.
    seedMixedWeek();
    const asc = await getWeekForConsultant("con-1", MONDAY, {
      sort: "date",
      direction: "asc",
    });
    expect(asc.rows.map((r) => r.activity)).toEqual([
      "WORKDAY", // Mon (Atlas)
      "ON_CALL", // Tue
      "WORKDAY", // Wed (Órion)
    ]);
    expect(asc.rows.map((r) => r.projectName)).toEqual([
      "Atlas",
      "Atlas",
      "Órion",
    ]);
    const desc = await getWeekForConsultant("con-1", MONDAY, {
      sort: "date",
      direction: "desc",
    });
    expect(desc.rows.map((r) => r.projectName)).toEqual([
      "Órion", // Wed
      "Atlas", // Tue
      "Atlas", // Mon
    ]);
  });

  it("combines status + activity + billable to reduce to a single row", async () => {
    // Add a decoy that matches only some of the three predicates so the AND
    // semantics are actually exercised (not just one filter doing the work).
    seedMixedWeek();
    seedEntry({
      projectId: "proj-atlas",
      activityType: "WORKDAY",
      status: "SUBMITTED", // same activity as a target but wrong status
      billable: true,
      date: new Date("2026-06-11T00:00:00.000Z"),
    });

    const week = await getWeekForConsultant("con-1", MONDAY, {
      status: "DRAFT",
      activity: "WORKDAY",
      billable: true,
    });

    // Only the DRAFT + WORKDAY + billable Atlas row (Monday) survives.
    expect(week.rows).toHaveLength(1);
    expect(week.rows[0]).toMatchObject({
      status: "DRAFT",
      activity: "WORKDAY",
      billable: true,
      projectName: "Atlas",
    });
  });

  it("combines projectId + status (AND, not OR)", async () => {
    seedMixedWeek();
    // proj-orion has only an APPROVED row; asking for proj-orion + DRAFT must
    // yield nothing (the DRAFT rows are all on proj-atlas).
    const empty = await getWeekForConsultant("con-1", MONDAY, {
      projectId: "proj-orion",
      status: "DRAFT",
    });
    expect(empty.rows).toEqual([]);

    const orion = await getWeekForConsultant("con-1", MONDAY, {
      projectId: "proj-orion",
      status: "APPROVED",
    });
    expect(orion.rows.map((r) => r.projectId)).toEqual(["proj-orion"]);
  });

  it("includes a legacy-coded row by default but excludes it when filtering by a canonical activity (compat)", async () => {
    // A pre-4.2 entry stored as DEVELOPMENT alongside a canonical WORKDAY one.
    seedEntry({
      projectId: "proj-atlas",
      activityType: "DEVELOPMENT",
      status: "DRAFT",
      date: new Date("2026-06-08T00:00:00.000Z"),
    });
    seedEntry({
      projectId: "proj-atlas",
      activityType: "WORKDAY",
      status: "DRAFT",
      date: new Date("2026-06-09T00:00:00.000Z"),
    });

    // No activity filter: both rows show; the legacy code is preserved verbatim.
    const all = await getWeekForConsultant("con-1", MONDAY);
    expect(all.rows.map((r) => r.activity).sort()).toEqual([
      "DEVELOPMENT",
      "WORKDAY",
    ]);

    // Filtering by WORKDAY must NOT bring the DEVELOPMENT row.
    const workday = await getWeekForConsultant("con-1", MONDAY, {
      activity: "WORKDAY",
    });
    expect(workday.rows.map((r) => r.activity)).toEqual(["WORKDAY"]);
  });
});

describe("listAllowedProjects", () => {
  it("keeps only ACTIVE allocations intersecting the week on open projects", async () => {
    const alloc = (over: Partial<AllocationRec>): AllocationRec => ({
      id: `alloc-${h.store.allocations.length + 1}`,
      consultantId: "con-1",
      projectId: "proj-atlas",
      status: "ACTIVE",
      startDate: new Date("2026-01-05T00:00:00.000Z"),
      endDate: null,
      ...over,
    });
    h.store.allocations = [
      // Open-ended, covers the week => included.
      alloc({ projectId: "proj-atlas" }),
      // Ends ON the week's Monday => still intersects => included.
      alloc({ projectId: "proj-orion", endDate: MONDAY }),
      // Ended the Sunday BEFORE the week => excluded.
      alloc({
        projectId: "proj-orion",
        endDate: new Date("2026-06-07T00:00:00.000Z"),
        id: "alloc-expired",
      }),
      // Starts AFTER the week ends => excluded.
      alloc({
        projectId: "proj-orion",
        startDate: new Date("2026-06-15T00:00:00.000Z"),
        id: "alloc-future",
      }),
      // PLANNED is not ACTIVE => excluded.
      alloc({ projectId: "proj-orion", status: "PLANNED", id: "alloc-planned" }),
      // CLOSED project never shows up, even with a valid allocation.
      alloc({ projectId: "proj-closed", id: "alloc-closed-project" }),
      // Second ACTIVE allocation on the same project => deduplicated.
      alloc({ projectId: "proj-atlas", id: "alloc-atlas-2" }),
    ];

    const projects = await listAllowedProjects("con-1", MONDAY);

    expect(projects).toEqual([
      {
        id: "proj-atlas",
        name: "Atlas",
        clientId: "cli-vix",
        clientName: "Vix Energia",
      },
      {
        id: "proj-orion",
        name: "Órion",
        clientId: "cli-banco",
        clientName: "Banco Sul",
      },
    ]);
  });

  it("returns an empty list when the consultant has no allocations", async () => {
    expect(await listAllowedProjects("con-1", MONDAY)).toEqual([]);
  });

  it("narrows to a given project status when provided (Rodada 4.2)", async () => {
    const alloc = (over: Partial<AllocationRec>): AllocationRec => ({
      id: `alloc-${h.store.allocations.length + 1}`,
      consultantId: "con-1",
      projectId: "proj-atlas",
      status: "ACTIVE",
      startDate: new Date("2026-01-05T00:00:00.000Z"),
      endDate: null,
      ...over,
    });
    // Give proj-orion a non-ACTIVE status so the filter excludes it.
    h.store.projects.find((p) => p.id === "proj-orion")!.status = "PAUSED";
    h.store.allocations = [
      alloc({ projectId: "proj-atlas" }), // ACTIVE
      alloc({ projectId: "proj-orion", id: "alloc-orion" }), // PAUSED
    ];

    const active = await listAllowedProjects("con-1", MONDAY, "ACTIVE");
    expect(active.map((p) => p.id)).toEqual(["proj-atlas"]);

    const paused = await listAllowedProjects("con-1", MONDAY, "PAUSED");
    expect(paused.map((p) => p.id)).toEqual(["proj-orion"]);

    // No filter keeps the default (any non-CLOSED): both show up.
    const all = await listAllowedProjects("con-1", MONDAY);
    expect(all.map((p) => p.id).sort()).toEqual(["proj-atlas", "proj-orion"]);
  });
});

describe("listHoursApprovalItems", () => {
  function seedQueue() {
    seedPeriod({ id: "period-1", consultantId: "con-1" });
    seedPeriod({ id: "period-2", consultantId: "con-2" });
    // Two SUBMITTED entries of the same (consultant, project, period) group.
    const a1 = seedEntry({
      projectId: "proj-atlas",
      activityType: "DEVELOPMENT",
      date: new Date("2026-06-08T00:00:00.000Z"),
      hours: 8,
      submittedAt: new Date("2026-06-09T10:00:00.000Z"),
    });
    const a2 = seedEntry({
      projectId: "proj-atlas",
      activityType: "MEETING",
      date: new Date("2026-06-09T00:00:00.000Z"),
      hours: 2,
      submittedAt: new Date("2026-06-09T08:00:00.000Z"), // oldest in group
    });
    // A different consultant+project on a project managed by manager-2.
    const o1 = seedEntry({
      consultantId: "con-2",
      periodId: "period-2",
      projectId: "proj-orion",
      date: new Date("2026-06-10T00:00:00.000Z"),
      hours: 6,
      submittedAt: new Date("2026-06-10T09:00:00.000Z"),
    });
    return { a1, a2, o1 };
  }

  it("groups pending entries by consultant+project+period with summed hours", async () => {
    const { a1, a2 } = seedQueue();

    const items = await listHoursApprovalItems();
    const pending = items.filter((i) => i.status === "PENDING");
    expect(pending).toHaveLength(2);

    const atlas = pending.find((i) => i.projectName === "Atlas");
    expect(atlas).toMatchObject({
      type: "HOURS",
      source: "db",
      consultantName: "Ana Martins",
      clientName: "Vix Energia",
      hours: 10,
      status: "PENDING",
      isAutomatic: false,
      period: "Semana 24 · 08–14 jun 2026",
      // Entries are ordered by submittedAt asc, so the older MEETING entry
      // contributes its label first.
      activitySummary: "Reunião · Desenvolvimento",
      // Oldest submittedAt of the group wins.
      submittedAt: "2026-06-09T08:00:00.000Z",
    });
    expect(atlas?.entryIds).toEqual(
      expect.arrayContaining([a1.id, a2.id]),
    );
    expect(atlas?.entryIds).toHaveLength(2);
  });

  it("restricts a PROJECT_MANAGER scope to managed projects (pending + history)", async () => {
    const { a1, o1 } = seedQueue();
    // Mark both as decided so they show up in history too.
    a1.status = "APPROVED";
    o1.status = "APPROVED";
    h.store.approvals = [
      {
        id: "ap-1",
        entityType: "TIME_ENTRY",
        entityId: a1.id,
        approverUserId: "manager-1",
        status: "APPROVED",
        comment: null,
        isAutomatic: false,
        ruleKey: null,
        createdAt: new Date("2026-06-10T12:00:00.000Z"),
      },
      {
        id: "ap-2",
        entityType: "TIME_ENTRY",
        entityId: o1.id,
        approverUserId: "manager-2",
        status: "APPROVED",
        comment: null,
        isAutomatic: false,
        ruleKey: null,
        createdAt: new Date("2026-06-10T13:00:00.000Z"),
      },
    ];

    const items = await listHoursApprovalItems({ managerUserId: "manager-1" });

    // Pending: only the Atlas group (a2 is still SUBMITTED) — never Órion.
    const pending = items.filter((i) => i.status === "PENDING");
    expect(pending).toHaveLength(1);
    expect(pending[0].projectName).toBe("Atlas");

    // History: only the approval on the managed project.
    const history = items.filter((i) => i.status !== "PENDING");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      projectName: "Atlas",
      status: "APPROVED",
    });
  });

  it("keeps the PM's older decision in history even when 50+ newer approvals belong to other managers (regression: scope before HISTORY_LIMIT)", async () => {
    seedPeriod({ id: "period-1", consultantId: "con-1" });
    seedPeriod({ id: "period-2", consultantId: "con-2" });

    // The PM's only decided entry, decided BEFORE all the noise below.
    const pmEntry = seedEntry({
      projectId: "proj-atlas",
      status: "APPROVED",
      date: new Date("2026-06-08T00:00:00.000Z"),
      hours: 8,
    });
    h.store.approvals.push({
      id: "ap-pm",
      entityType: "TIME_ENTRY",
      entityId: pmEntry.id,
      approverUserId: "manager-1",
      status: "APPROVED",
      comment: null,
      isAutomatic: false,
      ruleKey: null,
      createdAt: new Date("2026-06-01T12:00:00.000Z"),
    });

    // 55 NEWER approvals (> HISTORY_LIMIT = 50), all on manager-2's project.
    // Before the fix, these filled the take(50) window ordered by createdAt
    // desc and pushed the PM's decision out before the scope filter ran.
    for (let i = 0; i < 55; i++) {
      const noise = seedEntry({
        consultantId: "con-2",
        periodId: "period-2",
        projectId: "proj-orion",
        status: "APPROVED",
        date: new Date("2026-06-10T00:00:00.000Z"),
        hours: 1,
      });
      h.store.approvals.push({
        id: `ap-noise-${i}`,
        entityType: "TIME_ENTRY",
        entityId: noise.id,
        approverUserId: "manager-2",
        status: "APPROVED",
        comment: null,
        isAutomatic: false,
        ruleKey: null,
        createdAt: new Date(Date.UTC(2026, 5, 10, 8, i)), // all newer than ap-pm
      });
    }

    const items = await listHoursApprovalItems({ managerUserId: "manager-1" });
    const history = items.filter((i) => i.status !== "PENDING");

    // The PM's own decision must survive the HISTORY_LIMIT window…
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      projectName: "Atlas",
      consultantName: "Ana Martins",
      status: "APPROVED",
      entryIds: [pmEntry.id],
    });
    // …and nothing from the other manager's project leaks in.
    expect(history.some((i) => i.projectName === "Órion")).toBe(false);
  });

  it("maps history with isAutomatic, ruleKey and rejection comment", async () => {
    seedPeriod();
    const auto = seedEntry({
      status: "APPROVED",
      date: new Date("2026-06-08T00:00:00.000Z"),
      hours: 8,
    });
    const rejected = seedEntry({
      status: "REJECTED",
      activityType: "MEETING",
      date: new Date("2026-06-09T00:00:00.000Z"),
      hours: 3,
    });
    h.store.approvals = [
      {
        id: "ap-auto",
        entityType: "TIME_ENTRY",
        entityId: auto.id,
        approverUserId: "system",
        status: "APPROVED",
        comment: null,
        isAutomatic: true,
        ruleKey: "DEFAULT_8H_WEEKDAY",
        createdAt: new Date("2026-06-10T12:00:00.000Z"),
      },
      {
        id: "ap-manual",
        entityType: "TIME_ENTRY",
        entityId: rejected.id,
        approverUserId: "manager-1",
        status: "REJECTED",
        comment: "Sem descrição da atividade.",
        isAutomatic: false,
        ruleKey: null,
        createdAt: new Date("2026-06-10T11:00:00.000Z"),
      },
    ];

    const history = (await listHoursApprovalItems()).filter(
      (i) => i.status !== "PENDING",
    );

    expect(history).toHaveLength(2);
    // Ordered by approval createdAt desc: the automatic one is newest.
    expect(history[0]).toMatchObject({
      status: "AUTO_APPROVED",
      isAutomatic: true,
      ruleKey: "DEFAULT_8H_WEEKDAY",
      hours: 8,
    });
    expect(history[1]).toMatchObject({
      status: "REJECTED",
      isAutomatic: false,
      comment: "Sem descrição da atividade.",
      hours: 3,
    });
    expect(history[1].ruleKey).toBeUndefined();
  });
});
