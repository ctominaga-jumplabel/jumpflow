import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Testes de action do fluxo de ausência (Onda D/ausência-backend), com um mock
 * de Prisma em memória (mesmo espírito de horas/actions.test.ts). O mock honra
 * apenas as where/select-shapes que as actions realmente emitem.
 */

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

interface AllocRec {
  id: string;
  consultantId: string;
  projectId: string;
  status: string;
  startDate: Date;
  endDate: Date | null;
  allocationPercent: number;
  hoursPerDay: number | null;
}
interface TimeOffRec {
  id: string;
  consultantId: string;
  kind: string;
  startDate: Date;
  endDate: Date;
  status: string;
  note: string | null;
  paid: boolean;
  requestedByUserId: string | null;
  requestedAt: Date | null;
  approvedByUserId: string | null;
  decidedAt: Date | null;
  decisionComment: string | null;
  vacationId: string | null;
  workingDays: number | null;
}
interface EntryRec {
  id: string;
  periodId: string;
  consultantId: string;
  projectId: string;
  allocationId: string | null;
  timeOffId: string | null;
  date: Date;
  hours: number;
  multiplier: number;
  activityType: string;
  description: string | null;
  billable: boolean;
  status: string;
  submittedAt: Date | null;
}

const h = vi.hoisted(() => {
  const store = {
    users: [] as { id: string; name: string; email: string }[],
    consultants: [] as {
      id: string;
      userId: string | null;
      email: string;
      name: string;
    }[],
    projects: [] as { id: string; status: string; billDuringVacation: boolean }[],
    allocations: [] as AllocRec[],
    periods: [] as {
      id: string;
      consultantId: string;
      startDate: Date;
      endDate: Date;
      status: string;
    }[],
    entries: [] as EntryRec[],
    timeOffs: [] as TimeOffRec[],
    vacations: [] as {
      id: string;
      consultantId: string;
      balanceDays: number;
      takenDays: number;
      accrualPeriodStart: Date;
      accrualPeriodEnd: Date;
    }[],
    approvals: [] as Where[],
    audits: [] as Where[],
    holidays: [] as { date: Date; name: string; projectIds: string[] }[],
    currentUser: {
      id: "u-people",
      name: "People",
      email: "people@x.com",
      roles: ["PEOPLE"] as string[],
    },
    seq: 0,
  };
  const nextId = (p: string) => `${p}-${++store.seq}`;
  const day = (d: Date) =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

  // Aplica um patch honrando os operadores {increment}/{decrement} do Prisma.
  function applyOps(rec: Record<string, unknown>, data: Where) {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === "object" && ("increment" in v || "decrement" in v)) {
        const cur = Number(rec[k] ?? 0);
        rec[k] =
          "increment" in v
            ? cur + Number((v as Where).increment)
            : cur - Number((v as Where).decrement);
      } else {
        rec[k] = v;
      }
    }
  }

  function allocMatches(a: AllocRec, where: Where): boolean {
    if (where.consultantId && a.consultantId !== where.consultantId) return false;
    if (where.projectId && a.projectId !== where.projectId) return false;
    if (where.status && a.status !== where.status) return false;
    if (where.startDate?.lte && a.startDate.getTime() > where.startDate.lte.getTime())
      return false;
    if (where.OR) {
      // OR:[{endDate:null},{endDate:{gte}}]
      const gte = where.OR.find((o: Where) => o.endDate?.gte)?.endDate?.gte;
      const ok =
        a.endDate === null || (gte && a.endDate.getTime() >= gte.getTime());
      if (!ok) return false;
    }
    if (where.project?.status?.not) {
      const proj = store.projects.find((p) => p.id === a.projectId);
      if (proj && proj.status === where.project.status.not) return false;
    }
    return true;
  }

  const model = {
    user: {
      findUnique: async ({ where }: { where: Where }) => {
        const u = where.id
          ? store.users.find((x) => x.id === where.id)
          : store.users.find((x) => x.email === where.email);
        return u ? { ...u } : null;
      },
    },
    consultant: {
      findUnique: async ({ where }: { where: Where }) => {
        const c = where.userId
          ? store.consultants.find((x) => x.userId === where.userId)
          : store.consultants.find((x) => x.email === where.email);
        return c ? { ...c } : null;
      },
    },
    holiday: {
      findMany: async () =>
        store.holidays.map((x) => ({
          date: x.date,
          name: x.name,
          projects: x.projectIds.map((projectId) => ({ projectId })),
        })),
    },
    allocation: {
      findMany: async ({ where, select }: { where: Where; select?: Where }) => {
        const rows = store.allocations.filter((a) => allocMatches(a, where));
        return rows.map((a) => {
          if (select?.timesheetDefault !== undefined) {
            const proj = store.projects.find((p) => p.id === a.projectId)!;
            return {
              id: a.id,
              projectId: a.projectId,
              allocationPercent: a.allocationPercent,
              startDate: a.startDate,
              endDate: a.endDate,
              timesheetDefault:
                a.hoursPerDay != null ? { hoursPerDay: a.hoursPerDay } : null,
              project: {
                billingConfig: { billDuringVacation: proj.billDuringVacation },
              },
            };
          }
          return { projectId: a.projectId };
        });
      },
      findFirst: async ({ where }: { where: Where }) => {
        const a = store.allocations.find(
          (x) =>
            allocMatches(x, where) &&
            (!where.startDate?.lte ||
              x.startDate.getTime() <= where.startDate.lte.getTime()),
        );
        return a ? { ...a } : null;
      },
    },
    timeEntry: {
      findMany: async ({ where }: { where: Where }) => {
        return store.entries
          .filter((e) => {
            if (where.consultantId && e.consultantId !== where.consultantId)
              return false;
            if (where.activityType && e.activityType !== where.activityType)
              return false;
            if (where.date?.gte && e.date.getTime() < where.date.gte.getTime())
              return false;
            if (where.date?.lte && e.date.getTime() > where.date.lte.getTime())
              return false;
            return true;
          })
          .map((e) => ({ ...e }));
      },
      findFirst: async ({ where }: { where: Where }) => {
        const e = store.entries.find((x) => {
          if (where.consultantId && x.consultantId !== where.consultantId)
            return false;
          if (where.projectId && x.projectId !== where.projectId) return false;
          if (where.activityType && x.activityType !== where.activityType)
            return false;
          if (where.date instanceof Date && x.date.getTime() !== where.date.getTime())
            return false;
          return true;
        });
        return e ? { ...e } : null;
      },
      create: async ({ data }: { data: Where }) => {
        const rec: EntryRec = {
          id: nextId("entry"),
          periodId: data.periodId,
          consultantId: data.consultantId,
          projectId: data.projectId,
          allocationId: data.allocationId ?? null,
          timeOffId: data.timeOffId ?? null,
          date: data.date,
          hours: Number(data.hours),
          multiplier: Number(data.multiplier ?? 1),
          activityType: data.activityType,
          description: data.description ?? null,
          billable: data.billable ?? true,
          status: data.status ?? "DRAFT",
          submittedAt: data.submittedAt ?? null,
        };
        store.entries.push(rec);
        return { ...rec };
      },
      deleteMany: async ({ where }: { where: Where }) => {
        const ids: string[] = where.id?.in ?? [];
        const before = store.entries.length;
        store.entries = store.entries.filter((e) => !ids.includes(e.id));
        return { count: before - store.entries.length };
      },
    },
    consultantTimeOff: {
      create: async ({ data }: { data: Where }) => {
        const rec: TimeOffRec = {
          id: nextId("timeoff"),
          consultantId: data.consultantId,
          kind: data.kind,
          startDate: data.startDate,
          endDate: data.endDate,
          status: data.status,
          note: data.note ?? null,
          paid: data.paid,
          requestedByUserId: data.requestedByUserId ?? null,
          requestedAt: data.requestedAt ?? null,
          approvedByUserId: data.approvedByUserId ?? null,
          decidedAt: data.decidedAt ?? null,
          decisionComment: data.decisionComment ?? null,
          vacationId: data.vacationId ?? null,
          workingDays: data.workingDays ?? null,
        };
        store.timeOffs.push(rec);
        return { ...rec };
      },
      findUnique: async ({ where, include }: { where: Where; include?: Where }) => {
        const t = store.timeOffs.find((x) => x.id === where.id);
        if (!t) return null;
        const out: Where = { ...t };
        if (include?.consultant) {
          const c = store.consultants.find((x) => x.id === t.consultantId)!;
          out.consultant = { userId: c.userId, email: c.email, id: c.id };
        }
        if (include?.vacation) {
          const v = t.vacationId
            ? store.vacations.find((x) => x.id === t.vacationId)
            : null;
          out.vacation = v
            ? { id: v.id, balanceDays: v.balanceDays, takenDays: v.takenDays }
            : null;
        }
        if (include?.generatedEntries) {
          out.generatedEntries = store.entries
            .filter((e) => e.timeOffId === t.id)
            .map((e) => {
              const period = store.periods.find((p) => p.id === e.periodId)!;
              return {
                id: e.id,
                periodId: e.periodId,
                period: { status: period.status },
              };
            });
        }
        return out;
      },
      findFirst: async ({ where }: { where: Where }) => {
        const t = store.timeOffs.find((x) => {
          if (where.consultantId && x.consultantId !== where.consultantId)
            return false;
          if (where.status && x.status !== where.status) return false;
          if (where.startDate?.lte && x.startDate.getTime() > where.startDate.lte.getTime())
            return false;
          if (where.endDate?.gte && x.endDate.getTime() < where.endDate.gte.getTime())
            return false;
          return true;
        });
        return t ? { id: t.id, kind: t.kind } : null;
      },
      updateMany: async ({ where, data }: { where: Where; data: Where }) => {
        let count = 0;
        for (const t of store.timeOffs) {
          if (t.id !== where.id) continue;
          if (typeof where.status === "string" && t.status !== where.status)
            continue;
          if (where.status?.in && !where.status.in.includes(t.status)) continue;
          Object.assign(t, data);
          count += 1;
        }
        return { count };
      },
      findMany: async ({ where }: { where: Where }) => {
        return store.timeOffs
          .filter((t) => {
            if (where.consultantId && t.consultantId !== where.consultantId)
              return false;
            if (where.status?.in && !where.status.in.includes(t.status))
              return false;
            if (where.startDate?.lte && t.startDate.getTime() > where.startDate.lte.getTime())
              return false;
            if (where.endDate?.gte && t.endDate.getTime() < where.endDate.gte.getTime())
              return false;
            if (where.id?.not && t.id === where.id.not) return false;
            return true;
          })
          .map((t) => ({ ...t }));
      },
    },
    consultantVacation: {
      findMany: async ({ where }: { where: Where }) => {
        let rows = store.vacations.filter((v) => {
          if (where.consultantId && v.consultantId !== where.consultantId)
            return false;
          if (where.balanceDays?.gt !== undefined && !(v.balanceDays > where.balanceDays.gt))
            return false;
          return true;
        });
        rows = [...rows].sort(
          (a, b) => b.accrualPeriodStart.getTime() - a.accrualPeriodStart.getTime(),
        );
        return rows.map((v) => ({ ...v }));
      },
      updateMany: async ({ where, data }: { where: Where; data: Where }) => {
        let count = 0;
        for (const v of store.vacations) {
          if (v.id !== where.id) continue;
          if (
            where.balanceDays?.gte !== undefined &&
            !(v.balanceDays >= where.balanceDays.gte)
          ) {
            continue;
          }
          applyOps(v as unknown as Record<string, unknown>, data);
          count += 1;
        }
        return { count };
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const v = store.vacations.find((x) => x.id === where.id)!;
        applyOps(v as unknown as Record<string, unknown>, data);
        return { ...v };
      },
    },
    timesheetPeriod: {
      findUnique: async ({ where, include }: { where: Where; include?: Where }) => {
        let p;
        if (where.id) p = store.periods.find((x) => x.id === where.id);
        else {
          const k = where.consultantId_startDate_endDate;
          p = store.periods.find(
            (x) =>
              x.consultantId === k.consultantId &&
              x.startDate.getTime() === k.startDate.getTime() &&
              x.endDate.getTime() === k.endDate.getTime(),
          );
        }
        if (!p) return null;
        const out: Where = { ...p };
        if (include?.entries) {
          out.entries = store.entries
            .filter((e) => e.periodId === p!.id)
            .map((e) => ({ status: e.status }));
        }
        return out;
      },
      upsert: async ({ where, create }: { where: Where; create: Where }) => {
        const k = where.consultantId_startDate_endDate;
        let p = store.periods.find(
          (x) =>
            x.consultantId === k.consultantId &&
            x.startDate.getTime() === k.startDate.getTime() &&
            x.endDate.getTime() === k.endDate.getTime(),
        );
        if (!p) {
          p = {
            id: nextId("period"),
            consultantId: create.consultantId,
            startDate: create.startDate,
            endDate: create.endDate,
            status: create.status ?? "DRAFT",
          };
          store.periods.push(p);
        }
        return { ...p };
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const p = store.periods.find((x) => x.id === where.id)!;
        Object.assign(p, data);
        return { ...p };
      },
    },
    approval: {
      create: async ({ data }: { data: Where }) => {
        const rec = { id: nextId("appr"), ...data };
        store.approvals.push(rec);
        return rec;
      },
      deleteMany: async ({ where }: { where: Where }) => {
        const ids: string[] = where.entityId?.in ?? [];
        const before = store.approvals.length;
        store.approvals = store.approvals.filter(
          (a) => !(a.entityType === where.entityType && ids.includes(a.entityId)),
        );
        return { count: before - store.approvals.length };
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Where }) => {
        store.audits.push(data);
        return { id: nextId("audit"), ...data };
      },
    },
    project: {
      findUnique: async ({ where }: { where: Where }) => {
        const p = store.projects.find((x) => x.id === where.id);
        return p ? { ...p } : null;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(model),
  };

  return { store, model, day };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.model,
  Prisma: {
    Decimal: class {
      value: number;
      constructor(v: number) {
        this.value = v;
      }
      valueOf() {
        return this.value;
      }
      toString() {
        return String(this.value);
      }
    },
  },
}));
vi.mock("@/lib/db/config", () => ({ isDatabaseConfigured: () => true }));
vi.mock("@/lib/auth/dev", () => ({ isDevAuthEnabled: () => false }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/guards", () => ({
  requireUser: async () => h.store.currentUser,
  requireRole: async (roles: string | string[]) => {
    const list = Array.isArray(roles) ? roles : [roles];
    if (!h.store.currentUser.roles.some((r) => list.includes(r))) {
      throw { digest: "NEXT_REDIRECT" };
    }
    return h.store.currentUser;
  },
  hasRole: (user: { roles: string[] }, roles: string | string[]) => {
    const list = Array.isArray(roles) ? roles : [roles];
    return user.roles.some((r) => list.includes(r));
  },
}));

import {
  cancelTimeOff,
  decideTimeOff,
  requestTimeOff,
} from "./actions";
import { createTimeEntry } from "../horas/actions";

function seedBase() {
  const s = h.store;
  s.users.length = 0;
  s.consultants.length = 0;
  s.projects.length = 0;
  s.allocations.length = 0;
  s.periods.length = 0;
  s.entries.length = 0;
  s.timeOffs.length = 0;
  s.vacations.length = 0;
  s.approvals.length = 0;
  s.audits.length = 0;
  s.holidays.length = 0;
  s.seq = 0;

  s.users.push({ id: "u-consultant", name: "Consultor", email: "c@x.com" });
  s.users.push({ id: "u-people", name: "People", email: "people@x.com" });
  s.consultants.push({
    id: "c1",
    userId: "u-consultant",
    email: "c@x.com",
    name: "Consultor",
  });
  s.projects.push({ id: "p1", status: "ACTIVE", billDuringVacation: true });
  s.allocations.push({
    id: "a1",
    consultantId: "c1",
    projectId: "p1",
    status: "ACTIVE",
    startDate: utc("2026-01-01"),
    endDate: null,
    allocationPercent: 100,
    hoursPerDay: 8,
  });
  s.vacations.push({
    id: "v1",
    consultantId: "c1",
    balanceDays: 30,
    takenDays: 0,
    // Período aquisitivo vigente (janela ampla p/ cobrir "hoje" real do runner).
    accrualPeriodStart: utc("2020-01-01"),
    accrualPeriodEnd: utc("2100-12-31"),
  });
}

function asConsultant() {
  h.store.currentUser = {
    id: "u-consultant",
    name: "Consultor",
    email: "c@x.com",
    roles: ["CONSULTANT"],
  };
}
function asPeople() {
  h.store.currentUser = {
    id: "u-people",
    name: "People",
    email: "people@x.com",
    roles: ["PEOPLE"],
  };
}

// Semana Mon-Fri 06..10 jul 2026 (sem feriado): 3 dias 06,07,08.
const RANGE = { startDate: "2026-07-06", endDate: "2026-07-08" };

describe("requestTimeOff", () => {
  beforeEach(seedBase);

  it("cria REQUESTED com paid derivado, workingDays e VÍNCULO de saldo resolvido no servidor (C3)", async () => {
    asConsultant();
    const res = await requestTimeOff({ kind: "VACATION", ...RANGE });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.workingDays).toBe(3);
    expect(res.data.vacationLinked).toBe(true);
    const to = h.store.timeOffs[0];
    expect(to.status).toBe("REQUESTED");
    expect(to.paid).toBe(true);
    expect(to.requestedByUserId).toBe("u-consultant");
    // O servidor vinculou a ConsultantVacation própria, sem depender da UI.
    expect(to.vacationId).toBe("v1");
  });

  it("A2: vacationId alheio no payload é IGNORADO (resolve sempre o próprio)", async () => {
    // Saldo de OUTRO consultor — jamais deve ser vinculado.
    h.store.consultants.push({
      id: "c2",
      userId: "u-other",
      email: "o@x.com",
      name: "Outro",
    });
    h.store.vacations.push({
      id: "v-alien",
      consultantId: "c2",
      balanceDays: 30,
      takenDays: 0,
      accrualPeriodStart: utc("2020-01-01"),
      accrualPeriodEnd: utc("2100-12-31"),
    });
    asConsultant();
    const res = await requestTimeOff({
      kind: "VACATION",
      ...RANGE,
      // Chave extra maliciosa; Zod (não-strict) descarta e o servidor ignora.
      vacationId: "v-alien",
    } as unknown as Parameters<typeof requestTimeOff>[0]);
    expect(res.ok).toBe(true);
    expect(h.store.timeOffs[0].vacationId).toBe("v1"); // o próprio, nunca v-alien
  });

  it("C3: férias sem ConsultantVacation com saldo segue SEM vínculo (aviso)", async () => {
    h.store.vacations[0].balanceDays = 0; // sem saldo vinculável
    asConsultant();
    const res = await requestTimeOff({ kind: "VACATION", ...RANGE });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.vacationLinked).toBe(false);
    expect(h.store.timeOffs[0].vacationId).toBeNull();
  });

  it("A1: recusa solicitar sobre intervalo já solicitado/confirmado (sobreposição)", async () => {
    asConsultant();
    const first = await requestTimeOff({ kind: "VACATION", ...RANGE });
    expect(first.ok).toBe(true);
    const dup = await requestTimeOff({
      kind: "LEAVE",
      startDate: "2026-07-07",
      endDate: "2026-07-09",
    });
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.error).toBe("TIME_OFF_CONFLICT");
    expect(h.store.timeOffs).toHaveLength(1);
  });

  it("recusa intervalo invertido", async () => {
    asConsultant();
    const res = await requestTimeOff({
      kind: "VACATION",
      startDate: "2026-07-10",
      endDate: "2026-07-06",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("INVALID_INPUT");
  });
});

describe("decideTimeOff — aprovação materializa + debita ledger", () => {
  beforeEach(seedBase);

  async function requestAsConsultant(kind: "VACATION" | "LEAVE" | "OTHER") {
    asConsultant();
    // Sem vacationId no payload: o servidor resolve o saldo (C3).
    const r = await requestTimeOff({ kind, ...RANGE });
    if (!r.ok) throw new Error("request failed");
    return r.data.id;
  }

  it("aprova, gera 1 TimeEntry APPROVED por dia útil e debita o saldo", async () => {
    const id = await requestAsConsultant("VACATION");
    asPeople();
    const res = await decideTimeOff({ id, approve: true });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.generatedEntries).toBe(3);
    const entries = h.store.entries;
    expect(entries).toHaveLength(3);
    for (const e of entries) {
      expect(e.status).toBe("APPROVED");
      expect(e.timeOffId).toBe(id);
      expect(e.activityType).toBe("VACATION");
      expect(e.hours).toBe(8);
      expect(e.billable).toBe(true); // billDuringVacation = true
      expect(e.multiplier).toBe(1);
    }
    const v = h.store.vacations[0];
    expect(v.balanceDays).toBe(27);
    expect(v.takenDays).toBe(3);
    expect(h.store.timeOffs[0].status).toBe("CONFIRMED");
  });

  it("billable segue billDuringVacation=false do projeto", async () => {
    h.store.projects[0].billDuringVacation = false;
    const id = await requestAsConsultant("VACATION");
    asPeople();
    await decideTimeOff({ id, approve: true });
    expect(h.store.entries.every((e) => e.billable === false)).toBe(true);
  });

  it("paid=false (OTHER) NÃO gera lançamento", async () => {
    const id = await requestAsConsultant("OTHER");
    expect(h.store.timeOffs[0].paid).toBe(false);
    asPeople();
    const res = await decideTimeOff({ id, approve: true });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.generatedEntries).toBe(0);
    expect(h.store.entries).toHaveLength(0);
  });

  it("fallback 8h quando a alocação não tem TimesheetDefault", async () => {
    h.store.allocations[0].hoursPerDay = null;
    const id = await requestAsConsultant("VACATION");
    asPeople();
    await decideTimeOff({ id, approve: true });
    expect(h.store.entries).toHaveLength(3);
    expect(h.store.entries.every((e) => e.hours === 8)).toBe(true);
  });

  it("idempotência: segunda decisão retorna ALREADY_DECIDED e não duplica", async () => {
    const id = await requestAsConsultant("VACATION");
    asPeople();
    await decideTimeOff({ id, approve: true });
    const again = await decideTimeOff({ id, approve: true });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error).toBe("ALREADY_DECIDED");
    expect(h.store.entries).toHaveLength(3);
  });

  it("bloqueia aprovação com conflito de DIA ÚTIL já apontado", async () => {
    const id = await requestAsConsultant("VACATION");
    // Lançamento WORKDAY existente em 2026-07-07 (dentro do intervalo).
    h.store.periods.push({
      id: "per-x",
      consultantId: "c1",
      startDate: utc("2026-07-06"),
      endDate: utc("2026-07-12"),
      status: "DRAFT",
    });
    h.store.entries.push({
      id: "e-work",
      periodId: "per-x",
      consultantId: "c1",
      projectId: "p1",
      allocationId: "a1",
      timeOffId: null,
      date: utc("2026-07-07"),
      hours: 8,
      multiplier: 1,
      activityType: "WORKDAY",
      description: null,
      billable: true,
      status: "SUBMITTED",
      submittedAt: new Date(),
    });
    asPeople();
    const res = await decideTimeOff({ id, approve: true });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("WORKDAY_CONFLICT");
    // Não confirmou nem materializou (a entry WORKDAY continua sozinha).
    expect(h.store.timeOffs[0].status).toBe("REQUESTED");
    expect(h.store.entries.filter((e) => e.timeOffId)).toHaveLength(0);
  });

  it("bloqueia aprovação por saldo de férias insuficiente", async () => {
    h.store.vacations[0].balanceDays = 2; // pede 3, tem 2
    const id = await requestAsConsultant("VACATION");
    asPeople();
    const res = await decideTimeOff({ id, approve: true });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("INSUFFICIENT_BALANCE");
    expect(h.store.entries).toHaveLength(0);
  });

  it("M1: débito atômico consome exatamente o saldo e nunca fica negativo", async () => {
    h.store.vacations[0].balanceDays = 3; // igual aos 3 dias úteis
    const id = await requestAsConsultant("VACATION");
    asPeople();
    const res = await decideTimeOff({ id, approve: true });
    expect(res.ok).toBe(true);
    expect(h.store.vacations[0].balanceDays).toBe(0);
    expect(h.store.vacations[0].takenDays).toBe(3);
  });

  it("A1: bloqueia aprovação com ausência CONFIRMED sobreposta", async () => {
    // Uma ausência já confirmada cobrindo 07..09.
    h.store.timeOffs.push({
      id: "to-confirmed",
      consultantId: "c1",
      kind: "VACATION",
      startDate: utc("2026-07-07"),
      endDate: utc("2026-07-09"),
      status: "CONFIRMED",
      note: null,
      paid: true,
      requestedByUserId: null,
      requestedAt: null,
      approvedByUserId: null,
      decidedAt: null,
      decisionComment: null,
      vacationId: null,
      workingDays: 3,
    });
    // Uma solicitação REQUESTED sobreposta (inserida direto, simulando pré-C3).
    h.store.timeOffs.push({
      id: "to-pending",
      consultantId: "c1",
      kind: "LEAVE",
      startDate: utc("2026-07-06"),
      endDate: utc("2026-07-08"),
      status: "REQUESTED",
      note: null,
      paid: true,
      requestedByUserId: "u-consultant",
      requestedAt: new Date(),
      approvedByUserId: null,
      decidedAt: null,
      decisionComment: null,
      vacationId: null,
      workingDays: 3,
    });
    asPeople();
    const res = await decideTimeOff({ id: "to-pending", approve: true });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("TIME_OFF_CONFLICT");
    expect(h.store.entries).toHaveLength(0);
    expect(h.store.timeOffs.find((t) => t.id === "to-pending")!.status).toBe(
      "REQUESTED",
    );
  });

  it("reprovação exige comentário e grava REJECTED", async () => {
    const id = await requestAsConsultant("VACATION");
    asPeople();
    const missing = await decideTimeOff({ id, approve: false });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toBe("COMMENT_REQUIRED");

    const ok = await decideTimeOff({ id, approve: false, comment: "Sem cobertura" });
    expect(ok.ok).toBe(true);
    expect(h.store.timeOffs[0].status).toBe("REJECTED");
    expect(h.store.entries).toHaveLength(0);
  });
});

describe("cancelTimeOff — reverte materialização e estorna ledger", () => {
  beforeEach(seedBase);

  it("cancela CONFIRMED: apaga entries geradas e estorna o saldo", async () => {
    asConsultant();
    const r = await requestTimeOff({ kind: "VACATION", ...RANGE });
    if (!r.ok) throw new Error("request failed");
    asPeople();
    await decideTimeOff({ id: r.data.id, approve: true });
    expect(h.store.vacations[0].balanceDays).toBe(27);

    const res = await cancelTimeOff({ id: r.data.id, comment: "erro" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.revertedEntries).toBe(3);
    expect(h.store.entries).toHaveLength(0);
    expect(h.store.vacations[0].balanceDays).toBe(30);
    expect(h.store.vacations[0].takenDays).toBe(0);
    expect(h.store.timeOffs[0].status).toBe("CANCELLED");
  });
});

describe("guarda server-side em Horas", () => {
  beforeEach(seedBase);

  it("recusa lançar WORKDAY em data coberta por ausência CONFIRMED", async () => {
    // Ausência confirmada cobrindo 06..08.
    h.store.timeOffs.push({
      id: "to-c",
      consultantId: "c1",
      kind: "VACATION",
      startDate: utc("2026-07-06"),
      endDate: utc("2026-07-08"),
      status: "CONFIRMED",
      note: null,
      paid: true,
      requestedByUserId: null,
      requestedAt: null,
      approvedByUserId: null,
      decidedAt: null,
      decisionComment: null,
      vacationId: null,
      workingDays: 3,
    });
    asConsultant();
    const res = await createTimeEntry({
      projectId: "p1",
      date: "2026-07-07",
      activityType: "WORKDAY",
      description: "trabalho",
      startTime: "09:00",
      endTime: "17:00",
      breakStart: null,
      breakEnd: null,
      billable: true,
      multiplier: 1,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("TIME_OFF_CONFLICT");
    expect(h.store.entries).toHaveLength(0);
  });
});
