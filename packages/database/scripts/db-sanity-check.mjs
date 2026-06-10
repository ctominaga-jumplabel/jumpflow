// One-off sanity check: counts rows in the operational tables so we can
// confirm the migrations materialized and inspect seed state. Read-only.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const [roles, users, clients, projects, allocations, consultants, timeEntries, periods, automationConfig, expenses, expenseApprovals, expenseAttachments] =
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
    prisma.expense.count(),
    prisma.approval.count({ where: { entityType: "EXPENSE" } }),
    prisma.expenseAttachment.count(),
  ]);

console.log(
  JSON.stringify(
    { roles, users, clients, projects, allocations, consultants, timeEntries, periods, automationConfig, expenses, expenseApprovals, expenseAttachments },
    null,
    2,
  ),
);

await prisma.$disconnect();
