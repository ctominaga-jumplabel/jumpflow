// One-off sanity check: counts rows in the operational tables so we can
// confirm the migrations materialized and inspect seed state. Read-only.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const [roles, users, clients, projects, allocations, consultants, timeEntries, periods, automationConfig] =
  await Promise.all([
    prisma.role.count(),
    prisma.user.count(),
    prisma.client.count(),
    prisma.project.count(),
    prisma.allocation.count(),
    prisma.consultant.count(),
    prisma.timeEntry.count(),
    prisma.timesheetPeriod.count(),
    prisma.automationConfig.count(),
  ]);

console.log(
  JSON.stringify(
    { roles, users, clients, projects, allocations, consultants, timeEntries, periods, automationConfig },
    null,
    2,
  ),
);

await prisma.$disconnect();
