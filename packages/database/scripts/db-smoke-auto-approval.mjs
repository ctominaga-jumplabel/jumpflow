// E2E smoke for the auto-approval engine against the real validation database.
// Creates (idempotently) one SUBMITTED 8h weekday entry for the seeded dev
// consultant, submitted >5min ago, so the /api/jobs/auto-approval run can
// approve it.
//
// SAFETY: this script WRITES to whatever DATABASE_URL points at. Mutations
// require the explicit `--write` flag AND the seeded demo consultant to exist
// (i.e. a validation database). Default mode is read-only verification.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const writeMode = process.argv.includes("--write");
const verifyOnly = !writeMode;

const ENTRY_ID = "smoke-e2e-auto-approval";
const CONSULTANT_ID = "seed-consultant-dev";
const PROJECT_ID = "seed-project-portal";
// Tuesday 2026-06-09, UTC midnight (engine groups by UTC day).
const DATE = new Date("2026-06-09T00:00:00.000Z");
const WEEK_START = new Date("2026-06-08T00:00:00.000Z");
const WEEK_END = new Date("2026-06-14T00:00:00.000Z");

if (!verifyOnly) {
  // Refuse to write into a database that is not the seeded validation one.
  const demoConsultant = await prisma.consultant.findUnique({
    where: { id: CONSULTANT_ID },
  });
  if (!demoConsultant) {
    throw new Error(
      "Demo consultant not found — refusing to write (is DATABASE_URL pointing at the validation database?).",
    );
  }
  const allocation = await prisma.allocation.findFirst({
    where: { consultantId: CONSULTANT_ID, projectId: PROJECT_ID, status: "ACTIVE" },
  });
  if (!allocation) throw new Error("Seeded active allocation not found.");

  const period = await prisma.timesheetPeriod.upsert({
    where: {
      consultantId_startDate_endDate: {
        consultantId: CONSULTANT_ID,
        startDate: WEEK_START,
        endDate: WEEK_END,
      },
    },
    update: {},
    create: {
      id: "smoke-period-2026-06-08",
      consultantId: CONSULTANT_ID,
      startDate: WEEK_START,
      endDate: WEEK_END,
      status: "SUBMITTED",
      submittedAt: new Date(Date.now() - 10 * 60 * 1000),
    },
  });

  await prisma.timeEntry.upsert({
    where: { id: ENTRY_ID },
    update: {},
    create: {
      id: ENTRY_ID,
      periodId: period.id,
      consultantId: CONSULTANT_ID,
      projectId: PROJECT_ID,
      allocationId: allocation.id,
      date: DATE,
      hours: 8,
      activityType: "DEVELOPMENT",
      description: "Smoke e2e da aprovacao automatica (dado ficticio)",
      billable: true,
      status: "SUBMITTED",
      submittedAt: new Date(Date.now() - 10 * 60 * 1000),
    },
  });
  console.log("Smoke entry ready (SUBMITTED, 8h, weekday, submitted 10min ago).");
}

const entry = await prisma.timeEntry.findUnique({
  where: { id: ENTRY_ID },
  select: { id: true, status: true, submittedAt: true },
});
const approvals = await prisma.approval.findMany({
  where: { entityType: "TIME_ENTRY", entityId: ENTRY_ID },
  select: { status: true, isAutomatic: true, ruleKey: true, approverUserId: true },
});
const audits = await prisma.auditEvent.findMany({
  where: { entityId: ENTRY_ID },
  select: { action: true, actorUserId: true },
});
console.log(JSON.stringify({ entry, approvals, audits }, null, 2));

await prisma.$disconnect();
