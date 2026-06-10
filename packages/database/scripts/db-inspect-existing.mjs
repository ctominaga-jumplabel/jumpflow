// One-off read-only inspection of pre-existing rows before extending the seed.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const [clients, projects, consultants, entries, periods, config] = await Promise.all([
  prisma.client.findMany({ select: { id: true, name: true, status: true } }),
  prisma.project.findMany({
    select: { id: true, name: true, status: true, clientId: true, managerUserId: true },
  }),
  prisma.consultant.findMany({
    select: { id: true, name: true, email: true, status: true, userId: true },
  }),
  prisma.timeEntry.findMany({
    select: { id: true, consultantId: true, projectId: true, date: true, hours: true, status: true, activityType: true },
    orderBy: { date: "asc" },
  }),
  prisma.timesheetPeriod.findMany({
    select: { id: true, consultantId: true, startDate: true, endDate: true, status: true },
  }),
  prisma.automationConfig.findFirst(),
]);

console.log(JSON.stringify({ clients, projects, consultants, entries, periods, config }, null, 2));

await prisma.$disconnect();
