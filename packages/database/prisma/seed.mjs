// Idempotent database seed.
//
// - Upserts the RBAC role catalog (safe to run repeatedly).
// - When AUTH_DEV_MODE=true, also upserts a development user holding every
//   role, mirroring the in-memory DEV_USER used by the auth foundation so the
//   persisted RBAC path can be exercised locally.
// - Upserts a fictional demo workspace (clients, projects, the dev user's
//   consultant and active allocations) so the Round 2 time-tracking flow can
//   be exercised end to end. All demo rows use deterministic `seed-` ids, so
//   re-running never duplicates data. No TimeEntry/TimesheetPeriod is seeded:
//   those are created through the UI / Server Actions.
//
// Plain ESM + the generated Prisma client — no extra TS runner dependency.
// Run with: npm run db:seed --workspace @jumpflow/database

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Must match the RoleName enum in schema.prisma and ROLE_NAMES in the web app.
const ROLE_NAMES = [
  "ADMIN",
  "CONSULTANT",
  "PROJECT_MANAGER",
  "AREA_MANAGER",
  "FINANCE",
  "PEOPLE",
  "SALES",
];

const DEV_USER = {
  name: "Ana Martins",
  email: "ana.martins@jumplabel.com.br",
};

async function seedRoles() {
  for (const name of ROLE_NAMES) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${ROLE_NAMES.length} roles.`);
}

async function seedDevUser() {
  if (process.env.AUTH_DEV_MODE !== "true") {
    console.log("AUTH_DEV_MODE != 'true' — skipping dev user seed.");
    return;
  }

  const user = await prisma.user.upsert({
    where: { email: DEV_USER.email },
    update: { name: DEV_USER.name },
    create: { name: DEV_USER.name, email: DEV_USER.email },
  });

  const roles = await prisma.role.findMany();
  for (const role of roles) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }
  console.log(
    `Seeded dev user ${DEV_USER.email} with ${roles.length} roles.`,
  );
}

// --- Round 2 demo workspace (fictional validation data) -------------------
//
// Deterministic ids with the `seed-` prefix keep every upsert idempotent and
// keep this dataset clearly separated from the `val-` automation dataset,
// which must not be touched here.

const DEMO_CLIENTS = [
  { id: "seed-client-acme", name: "Acme Corp (Demo)" },
  { id: "seed-client-globex", name: "Globex (Demo)" },
];

const DEMO_PROJECTS = [
  {
    id: "seed-project-portal",
    clientId: "seed-client-acme",
    name: "Portal do Cliente (Demo)",
    description: "Projeto ficticio de validacao do fluxo de horas.",
    startDate: new Date("2026-03-02T00:00:00.000Z"),
    endDate: null,
    billingHourlyRate: "220.00",
  },
  {
    id: "seed-project-dados",
    clientId: "seed-client-acme",
    name: "Plataforma de Dados (Demo)",
    description: "Projeto ficticio de validacao do fluxo de horas.",
    startDate: new Date("2026-04-01T00:00:00.000Z"),
    endDate: new Date("2026-12-18T00:00:00.000Z"),
    billingHourlyRate: "260.00",
  },
  {
    id: "seed-project-mobile",
    clientId: "seed-client-globex",
    name: "App Mobile (Demo)",
    description: "Projeto ficticio de validacao do fluxo de horas.",
    startDate: new Date("2026-05-04T00:00:00.000Z"),
    endDate: null,
    billingHourlyRate: "190.00",
  },
];

// allocationPercent must keep the consultant total <= 100 (50 + 30 + 20).
const DEMO_ALLOCATIONS = [
  {
    id: "seed-alloc-portal",
    projectId: "seed-project-portal",
    role: "Desenvolvedora Full Stack",
    allocationPercent: 50,
    startDate: new Date("2026-03-02T00:00:00.000Z"),
  },
  {
    id: "seed-alloc-dados",
    projectId: "seed-project-dados",
    role: "Engenheira de Dados",
    allocationPercent: 30,
    startDate: new Date("2026-04-01T00:00:00.000Z"),
  },
  {
    id: "seed-alloc-mobile",
    projectId: "seed-project-mobile",
    role: "Desenvolvedora Mobile",
    allocationPercent: 20,
    startDate: new Date("2026-05-04T00:00:00.000Z"),
  },
];

async function seedDemoWorkspace() {
  const user = await prisma.user.findUnique({
    where: { email: DEV_USER.email },
  });
  if (!user) {
    console.log(
      `Dev user ${DEV_USER.email} not found — skipping demo workspace seed.`,
    );
    return;
  }

  // Consultant linked to the dev user, required by the Round 2 strict rule
  // "consultants only log hours on projects with an active allocation".
  const consultant = await prisma.consultant.upsert({
    where: { id: "seed-consultant-dev" },
    update: { userId: user.id, name: user.name, email: user.email },
    create: {
      id: "seed-consultant-dev",
      userId: user.id,
      name: user.name,
      email: user.email,
      jobTitle: "Consultora de Tecnologia",
      seniority: "SENIOR",
      area: "Engenharia",
      status: "ACTIVE",
    },
  });

  for (const client of DEMO_CLIENTS) {
    await prisma.client.upsert({
      where: { id: client.id },
      update: { name: client.name, status: "ACTIVE" },
      create: { id: client.id, name: client.name, status: "ACTIVE" },
    });
  }
  console.log(`Seeded ${DEMO_CLIENTS.length} demo clients.`);

  for (const project of DEMO_PROJECTS) {
    await prisma.project.upsert({
      where: { id: project.id },
      update: {
        name: project.name,
        status: "ACTIVE",
        managerUserId: user.id,
      },
      create: {
        ...project,
        status: "ACTIVE",
        managerUserId: user.id,
      },
    });
  }
  console.log(
    `Seeded ${DEMO_PROJECTS.length} demo projects managed by ${user.email}.`,
  );

  for (const allocation of DEMO_ALLOCATIONS) {
    await prisma.allocation.upsert({
      where: { id: allocation.id },
      update: {
        consultantId: consultant.id,
        allocationPercent: allocation.allocationPercent,
        status: "ACTIVE",
        endDate: null,
      },
      create: {
        ...allocation,
        consultantId: consultant.id,
        endDate: null,
        status: "ACTIVE",
      },
    });
  }
  console.log(
    `Seeded ${DEMO_ALLOCATIONS.length} active demo allocations for consultant ${consultant.id}.`,
  );
}

async function main() {
  await seedRoles();
  await seedDevUser();
  await seedDemoWorkspace();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
