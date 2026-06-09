// Validation data for the auto-approval engine + missing-timesheet report.
// Idempotent and re-runnable: fixed ids and upserts; SUBMITTED entries are
// re-armed on every run so the jobs can be re-validated.
//
// Scenarios (all in the week 2026-06-01..2026-06-08, the default report period):
//   C1 Ana Aprovavel   -> weekday 8h, submitted 10min ago        => AUTO-APPROVE (DEFAULT)
//   C2 Bruno Atraso     -> weekday 8h, submitted just now         => PENDING (delay < 5min)
//   C3 Carla Incompleta -> weekday 6h                             => PENDING (daily total != 8h)
//   C4 Diego Duplicado  -> two identical weekday 4h entries       => PENDING (duplicate, both)
//   C5 Eva Excecao      -> weekday 10h + ANY_HOURS exception      => AUTO-APPROVE (EXCEPTION_ANY_HOURS)
//   C6 Felipe FDS       -> Saturday 6h + WEEKEND exception        => AUTO-APPROVE (EXCEPTION_WEEKEND)
//   C7 Gabi SemLanc.    -> no entries                             => appears in missing-timesheet report

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const REPORT_RECIPIENT = "christopher.tominaga@jumplabel.com.br";
const PERIOD_START = new Date("2026-06-01T00:00:00Z");
const PERIOD_END = new Date("2026-06-08T00:00:00Z");
const WORKDAY = new Date("2026-06-02T00:00:00Z"); // Tuesday
const WEEKEND = new Date("2026-06-06T00:00:00Z"); // Saturday

const approvedAnchor = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
const recentAnchor = new Date(); // now -> still inside the 5-min delay window

const CONSULTANTS = [
  { id: "val-c1", name: "Ana Aprovavel", email: "val.c1@demo.jumpflow" },
  { id: "val-c2", name: "Bruno Atraso", email: "val.c2@demo.jumpflow" },
  { id: "val-c3", name: "Carla Incompleta", email: "val.c3@demo.jumpflow" },
  { id: "val-c4", name: "Diego Duplicado", email: "val.c4@demo.jumpflow" },
  { id: "val-c5", name: "Eva Excecao", email: "val.c5@demo.jumpflow" },
  { id: "val-c6", name: "Felipe FDS", email: "val.c6@demo.jumpflow" },
  { id: "val-c7", name: "Gabi SemLancamento", email: "val.c7@demo.jumpflow" },
];

async function main() {
  // Client + project
  await prisma.client.upsert({
    where: { id: "val-client" },
    update: {},
    create: { id: "val-client", name: "Cliente Demo", status: "ACTIVE" },
  });
  await prisma.project.upsert({
    where: { id: "val-project" },
    update: { status: "ACTIVE" },
    create: {
      id: "val-project",
      clientId: "val-client",
      name: "Projeto Demo",
      status: "ACTIVE",
      startDate: PERIOD_START,
    },
  });

  // Consultants + one weekly period each
  for (const c of CONSULTANTS) {
    await prisma.consultant.upsert({
      where: { id: c.id },
      update: { name: c.name, status: "ACTIVE" },
      create: {
        id: c.id,
        name: c.name,
        email: c.email,
        seniority: "MID_LEVEL",
        area: "Engenharia",
        status: "ACTIVE",
      },
    });
    await prisma.timesheetPeriod.upsert({
      where: { id: `val-period-${c.id}` },
      update: {},
      create: {
        id: `val-period-${c.id}`,
        consultantId: c.id,
        startDate: PERIOD_START,
        endDate: PERIOD_END,
        status: "SUBMITTED",
        submittedAt: approvedAnchor,
      },
    });
  }

  // Helper to (re-)arm a SUBMITTED entry deterministically.
  const entry = (id, consultantId, over) =>
    prisma.timeEntry.upsert({
      where: { id },
      update: { status: "SUBMITTED", ...over },
      create: {
        id,
        periodId: `val-period-${consultantId}`,
        consultantId,
        projectId: "val-project",
        date: WORKDAY,
        hours: 8,
        activityType: "DEV",
        status: "SUBMITTED",
        submittedAt: approvedAnchor,
        ...over,
      },
    });

  // C1: clean weekday 8h -> approve
  await entry("val-e-c1", "val-c1", { hours: 8, submittedAt: approvedAnchor });
  // C2: 8h but submitted just now -> delay pending
  await entry("val-e-c2", "val-c2", { hours: 8, submittedAt: recentAnchor });
  // C3: 6h -> daily total mismatch
  await entry("val-e-c3", "val-c3", { hours: 6, submittedAt: approvedAnchor });
  // C4: two identical 4h entries -> duplicate (both pending)
  await entry("val-e-c4a", "val-c4", { hours: 4, submittedAt: approvedAnchor });
  await entry("val-e-c4b", "val-c4", { hours: 4, submittedAt: approvedAnchor });
  // C5: 10h weekday + ANY_HOURS exception -> approve
  await entry("val-e-c5", "val-c5", { hours: 10, submittedAt: approvedAnchor });
  // C6: Saturday 6h + WEEKEND exception -> approve
  await entry("val-e-c6", "val-c6", {
    hours: 6,
    date: WEEKEND,
    submittedAt: approvedAnchor,
  });

  // Exception lists
  await prisma.autoApprovalException.upsert({
    where: {
      consultantId_projectId_type: {
        consultantId: "val-c5",
        projectId: "val-project",
        type: "ANY_HOURS",
      },
    },
    update: { active: true },
    create: {
      consultantId: "val-c5",
      projectId: "val-project",
      type: "ANY_HOURS",
      active: true,
      note: "Validacao: permite qualquer carga",
    },
  });
  await prisma.autoApprovalException.upsert({
    where: {
      consultantId_projectId_type: {
        consultantId: "val-c6",
        projectId: "val-project",
        type: "WEEKEND",
      },
    },
    update: { active: true },
    create: {
      consultantId: "val-c6",
      projectId: "val-project",
      type: "WEEKEND",
      active: true,
      note: "Validacao: permite fim de semana",
    },
  });

  // Automation config with a report recipient (so the email job has a target).
  await prisma.automationConfig.upsert({
    where: { id: "default" },
    update: { reportRecipientEmail: REPORT_RECIPIENT, autoApprovalEnabled: true },
    create: { id: "default", reportRecipientEmail: REPORT_RECIPIENT },
  });

  const counts = {
    consultants: await prisma.consultant.count(),
    submitted: await prisma.timeEntry.count({ where: { status: "SUBMITTED" } }),
    exceptions: await prisma.autoApprovalException.count(),
  };
  console.log("Validation seed done:", JSON.stringify(counts));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("Validation seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
