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
// - Upserts Round 3 demo expenses (one per ExpenseStatus) with their Approval
//   trail, so every approval/finance screen state can be exercised. No
//   ExpenseAttachment is seeded: storage is not configured yet and metadata
//   without a real file would be misleading.
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

// --- Round 3 demo expenses (fictional validation data) ---------------------
//
// One expense per ExpenseStatus so every queue/screen state is reachable:
// consultant launcher (DRAFT/SUBMITTED/rejected), /app/aprovacoes (SUBMITTED,
// MANAGER_APPROVED) and /app/financeiro (FINANCE_APPROVED, PAYMENT_SCHEDULED,
// PAID). Deterministic ids (`seed-exp-*`, `seed-app-exp-*`) keep upserts
// idempotent. Approvals mirror the two-stage chain: anything at
// FINANCE_APPROVED or beyond carries both the manager and the finance
// decision; FINANCE_REJECTED carries manager APPROVED + finance REJECTED.
// All dates are fixed UTC midnights in June 2026, covered by the active
// seed-alloc-* allocations.

const DEMO_EXPENSES = [
  {
    id: "seed-exp-draft",
    projectId: "seed-project-portal",
    allocationId: "seed-alloc-portal",
    date: new Date("2026-06-08T00:00:00.000Z"),
    amount: "84.50",
    description: "Estacionamento em visita ao cliente (Demo)",
    invoiceNumber: null,
    status: "DRAFT",
    submittedAt: null,
    approvals: [],
  },
  {
    id: "seed-exp-submitted",
    projectId: "seed-project-portal",
    allocationId: "seed-alloc-portal",
    date: new Date("2026-06-05T00:00:00.000Z"),
    amount: "312.40",
    description: "Transporte aplicativo para workshop no cliente (Demo)",
    invoiceNumber: "NF-2026-0605",
    status: "SUBMITTED",
    submittedAt: new Date("2026-06-05T13:00:00.000Z"),
    approvals: [],
  },
  {
    id: "seed-exp-manager-approved",
    projectId: "seed-project-dados",
    allocationId: "seed-alloc-dados",
    date: new Date("2026-06-04T00:00:00.000Z"),
    amount: "159.90",
    description: "Almoco com stakeholders do projeto (Demo)",
    invoiceNumber: "NF-2026-0604",
    status: "MANAGER_APPROVED",
    submittedAt: new Date("2026-06-04T18:30:00.000Z"),
    approvals: [
      { id: "seed-app-exp-mgr-approved-1", status: "APPROVED", comment: null },
    ],
  },
  {
    id: "seed-exp-finance-approved",
    projectId: "seed-project-dados",
    allocationId: "seed-alloc-dados",
    date: new Date("2026-06-03T00:00:00.000Z"),
    amount: "1280.00",
    description: "Passagem aerea para kickoff presencial (Demo)",
    invoiceNumber: "NF-2026-0603",
    status: "FINANCE_APPROVED",
    submittedAt: new Date("2026-06-03T14:00:00.000Z"),
    approvals: [
      { id: "seed-app-exp-fin-approved-1", status: "APPROVED", comment: null },
      { id: "seed-app-exp-fin-approved-2", status: "APPROVED", comment: null },
    ],
  },
  {
    id: "seed-exp-payment-scheduled",
    projectId: "seed-project-mobile",
    allocationId: "seed-alloc-mobile",
    date: new Date("2026-06-02T00:00:00.000Z"),
    amount: "640.75",
    description: "Hospedagem para sprint review presencial (Demo)",
    invoiceNumber: "NF-2026-0602",
    status: "PAYMENT_SCHEDULED",
    submittedAt: new Date("2026-06-02T11:00:00.000Z"),
    approvals: [
      { id: "seed-app-exp-pay-sched-1", status: "APPROVED", comment: null },
      { id: "seed-app-exp-pay-sched-2", status: "APPROVED", comment: null },
    ],
  },
  {
    id: "seed-exp-paid",
    projectId: "seed-project-mobile",
    allocationId: "seed-alloc-mobile",
    date: new Date("2026-06-01T00:00:00.000Z"),
    amount: "97.30",
    description: "Pedagio e combustivel em deslocamento (Demo)",
    invoiceNumber: "NF-2026-0601",
    status: "PAID",
    submittedAt: new Date("2026-06-01T16:45:00.000Z"),
    approvals: [
      { id: "seed-app-exp-paid-1", status: "APPROVED", comment: null },
      { id: "seed-app-exp-paid-2", status: "APPROVED", comment: null },
    ],
  },
  {
    id: "seed-exp-manager-rejected",
    projectId: "seed-project-portal",
    allocationId: "seed-alloc-portal",
    date: new Date("2026-06-06T00:00:00.000Z"),
    amount: "450.00",
    description: "Jantar de equipe sem aprovacao previa (Demo)",
    invoiceNumber: null,
    status: "MANAGER_REJECTED",
    submittedAt: new Date("2026-06-06T20:00:00.000Z"),
    approvals: [
      {
        id: "seed-app-exp-mgr-rejected-1",
        status: "REJECTED",
        comment:
          "Despesa sem aprovacao previa da gestao; reenviar com justificativa.",
      },
    ],
  },
  {
    id: "seed-exp-finance-rejected",
    projectId: "seed-project-dados",
    allocationId: "seed-alloc-dados",
    date: new Date("2026-06-07T00:00:00.000Z"),
    amount: "210.00",
    description: "Material de escritorio para o projeto (Demo)",
    invoiceNumber: "NF-2026-0607",
    status: "FINANCE_REJECTED",
    submittedAt: new Date("2026-06-07T10:15:00.000Z"),
    approvals: [
      { id: "seed-app-exp-fin-rejected-1", status: "APPROVED", comment: null },
      {
        id: "seed-app-exp-fin-rejected-2",
        status: "REJECTED",
        comment: "Nota fiscal divergente do valor lancado; corrigir e reenviar.",
      },
    ],
  },
];

async function seedDemoExpenses() {
  const user = await prisma.user.findUnique({
    where: { email: DEV_USER.email },
  });
  if (!user) {
    console.log(
      `Dev user ${DEV_USER.email} not found — skipping demo expenses seed.`,
    );
    return;
  }

  const consultant = await prisma.consultant.findUnique({
    where: { id: "seed-consultant-dev" },
  });
  if (!consultant) {
    console.log(
      "Consultant seed-consultant-dev not found — skipping demo expenses seed.",
    );
    return;
  }

  let approvalCount = 0;
  for (const demoExpense of DEMO_EXPENSES) {
    const { approvals, ...expense } = demoExpense;

    await prisma.expense.upsert({
      where: { id: expense.id },
      update: {
        projectId: expense.projectId,
        allocationId: expense.allocationId,
        date: expense.date,
        amount: expense.amount,
        description: expense.description,
        invoiceNumber: expense.invoiceNumber,
        status: expense.status,
        submittedAt: expense.submittedAt,
      },
      create: {
        ...expense,
        consultantId: consultant.id,
      },
    });

    for (const approval of approvals) {
      await prisma.approval.upsert({
        where: { id: approval.id },
        update: {
          status: approval.status,
          comment: approval.comment,
          approverUserId: user.id,
        },
        create: {
          id: approval.id,
          entityType: "EXPENSE",
          entityId: expense.id,
          approverUserId: user.id,
          status: approval.status,
          comment: approval.comment,
          isAutomatic: false,
        },
      });
      approvalCount += 1;
    }
  }
  console.log(
    `Seeded ${DEMO_EXPENSES.length} demo expenses with ${approvalCount} approvals for consultant ${consultant.id}.`,
  );
}

// --- Round 4: a second fictional consultant (no dev-user link) -------------
//
// `seed-consultant-bravo` is NOT linked to the dev user (userId stays null), so
// the dev user can DECIDE this consultant's hours/expenses WITHOUT triggering
// the SELF_APPROVAL guard (segregation of duties). It also gives the
// consolidated/report views data from more than one consultant.
//
// All ids use the `seed-c2-` prefix (and `seed-app-c2-` for approvals) so every
// upsert is idempotent and clearly separated from `seed-consultant-dev`'s data.
// Same guard as the rest of the demo seed: skips when the dev user or the seed
// projects do not exist (so it never runs against an unseeded workspace). No
// ExpenseAttachment is created (storage is not configured yet).

const BRAVO = {
  id: "seed-consultant-bravo",
  name: "Bruno Carvalho (Demo)",
  email: "bruno.carvalho.demo@jumplabel.com.br",
  jobTitle: "Consultor de Tecnologia",
  seniority: "MID_LEVEL",
  area: "Engenharia",
};

// Active allocations covering June 2026 on two existing seed projects.
const BRAVO_ALLOCATIONS = [
  {
    id: "seed-c2-alloc-portal",
    projectId: "seed-project-portal",
    role: "Desenvolvedor Back-end",
    allocationPercent: 60,
    startDate: new Date("2026-03-02T00:00:00.000Z"),
  },
  {
    id: "seed-c2-alloc-dados",
    projectId: "seed-project-dados",
    role: "Engenheiro de Dados",
    allocationPercent: 40,
    startDate: new Date("2026-04-01T00:00:00.000Z"),
  },
];

// June 2026: Jun 1 is a Monday, so the Mon-Sun UTC week is Jun 1 -> Jun 7.
// All TimeEntry.date are fixed UTC midnights inside that week, covered by the
// allocations above. The unique (consultantId, startDate, endDate) makes the
// period upsert idempotent.
const BRAVO_PERIOD = {
  id: "seed-c2-period-jun-w1",
  startDate: new Date("2026-06-01T00:00:00.000Z"),
  endDate: new Date("2026-06-07T00:00:00.000Z"),
  status: "SUBMITTED",
  submittedAt: new Date("2026-06-08T09:00:00.000Z"),
};

// Mixed statuses: APPROVED feeds the consolidated report; SUBMITTED feeds the
// manager/dev-user decision queue (now decidable without SELF_APPROVAL).
const BRAVO_TIME_ENTRIES = [
  {
    id: "seed-c2-entry-approved",
    projectId: "seed-project-portal",
    allocationId: "seed-c2-alloc-portal",
    date: new Date("2026-06-01T00:00:00.000Z"),
    hours: "8.00",
    activityType: "WORKDAY",
    description: "Implementacao de API de autenticacao (Demo)",
    billable: true,
    status: "APPROVED",
    submittedAt: new Date("2026-06-08T09:00:00.000Z"),
    approvals: [{ id: "seed-app-c2-entry-approved", status: "APPROVED", comment: null }],
  },
  {
    id: "seed-c2-entry-submitted-portal",
    projectId: "seed-project-portal",
    allocationId: "seed-c2-alloc-portal",
    date: new Date("2026-06-02T00:00:00.000Z"),
    hours: "6.50",
    activityType: "WORKDAY",
    description: "Correcao de bugs no fluxo de login (Demo)",
    billable: true,
    status: "SUBMITTED",
    submittedAt: new Date("2026-06-08T09:00:00.000Z"),
    approvals: [],
  },
  {
    id: "seed-c2-entry-submitted-dados",
    projectId: "seed-project-dados",
    allocationId: "seed-c2-alloc-dados",
    date: new Date("2026-06-03T00:00:00.000Z"),
    hours: "4.00",
    activityType: "ON_CALL",
    description: "Refinamento do pipeline de dados (Demo)",
    billable: true,
    status: "SUBMITTED",
    submittedAt: new Date("2026-06-08T09:00:00.000Z"),
    approvals: [],
  },
];

// Mixed statuses: SUBMITTED -> the dev user decides as manager (no
// SELF_APPROVAL, since bravo is not the dev user); FINANCE_APPROVED and PAID
// feed the finance/consolidated views. Approval chains mirror the two-stage
// flow used in DEMO_EXPENSES.
const BRAVO_EXPENSES = [
  {
    id: "seed-c2-exp-submitted",
    projectId: "seed-project-portal",
    allocationId: "seed-c2-alloc-portal",
    date: new Date("2026-06-02T00:00:00.000Z"),
    amount: "145.00",
    description: "Transporte para reuniao tecnica no cliente (Demo)",
    invoiceNumber: "NF-2026-C2-0602",
    status: "SUBMITTED",
    submittedAt: new Date("2026-06-08T10:00:00.000Z"),
    approvals: [],
  },
  {
    id: "seed-c2-exp-finance-approved",
    projectId: "seed-project-dados",
    allocationId: "seed-c2-alloc-dados",
    date: new Date("2026-06-03T00:00:00.000Z"),
    amount: "520.00",
    description: "Curso rapido de engenharia de dados (Demo)",
    invoiceNumber: "NF-2026-C2-0603",
    status: "FINANCE_APPROVED",
    submittedAt: new Date("2026-06-04T14:00:00.000Z"),
    approvals: [
      { id: "seed-app-c2-exp-fin-approved-1", status: "APPROVED", comment: null },
      { id: "seed-app-c2-exp-fin-approved-2", status: "APPROVED", comment: null },
    ],
  },
  {
    id: "seed-c2-exp-paid",
    projectId: "seed-project-portal",
    allocationId: "seed-c2-alloc-portal",
    date: new Date("2026-06-01T00:00:00.000Z"),
    amount: "78.90",
    description: "Pedagio em deslocamento ao cliente (Demo)",
    invoiceNumber: "NF-2026-C2-0601",
    status: "PAID",
    submittedAt: new Date("2026-06-02T16:00:00.000Z"),
    approvals: [
      { id: "seed-app-c2-exp-paid-1", status: "APPROVED", comment: null },
      { id: "seed-app-c2-exp-paid-2", status: "APPROVED", comment: null },
    ],
  },
];

async function seedSecondConsultant() {
  const user = await prisma.user.findUnique({
    where: { email: DEV_USER.email },
  });
  if (!user) {
    console.log(
      `Dev user ${DEV_USER.email} not found — skipping second consultant seed.`,
    );
    return;
  }

  // Guard: the second consultant reuses the demo projects; skip cleanly if the
  // demo workspace was not seeded (e.g. AUTH_DEV_MODE off).
  const portal = await prisma.project.findUnique({
    where: { id: "seed-project-portal" },
  });
  if (!portal) {
    console.log(
      "Project seed-project-portal not found — skipping second consultant seed.",
    );
    return;
  }

  // Consultant NOT linked to any user (userId stays null) so the dev user can
  // decide bravo's items without hitting SELF_APPROVAL.
  const bravo = await prisma.consultant.upsert({
    where: { id: BRAVO.id },
    update: {
      userId: null,
      name: BRAVO.name,
      email: BRAVO.email,
      status: "ACTIVE",
    },
    create: {
      id: BRAVO.id,
      userId: null,
      name: BRAVO.name,
      email: BRAVO.email,
      jobTitle: BRAVO.jobTitle,
      seniority: BRAVO.seniority,
      area: BRAVO.area,
      status: "ACTIVE",
    },
  });

  for (const allocation of BRAVO_ALLOCATIONS) {
    await prisma.allocation.upsert({
      where: { id: allocation.id },
      update: {
        consultantId: bravo.id,
        allocationPercent: allocation.allocationPercent,
        status: "ACTIVE",
        endDate: null,
      },
      create: {
        ...allocation,
        consultantId: bravo.id,
        endDate: null,
        status: "ACTIVE",
      },
    });
  }

  // Period required by the TimeEntry FK. Idempotent via the explicit id and the
  // unique (consultantId, startDate, endDate).
  const period = await prisma.timesheetPeriod.upsert({
    where: { id: BRAVO_PERIOD.id },
    update: {
      consultantId: bravo.id,
      status: BRAVO_PERIOD.status,
      submittedAt: BRAVO_PERIOD.submittedAt,
    },
    create: {
      id: BRAVO_PERIOD.id,
      consultantId: bravo.id,
      startDate: BRAVO_PERIOD.startDate,
      endDate: BRAVO_PERIOD.endDate,
      status: BRAVO_PERIOD.status,
      submittedAt: BRAVO_PERIOD.submittedAt,
    },
  });

  let entryApprovalCount = 0;
  for (const demoEntry of BRAVO_TIME_ENTRIES) {
    const { approvals, ...entry } = demoEntry;
    await prisma.timeEntry.upsert({
      where: { id: entry.id },
      update: {
        projectId: entry.projectId,
        allocationId: entry.allocationId,
        date: entry.date,
        hours: entry.hours,
        activityType: entry.activityType,
        description: entry.description,
        billable: entry.billable,
        status: entry.status,
        submittedAt: entry.submittedAt,
      },
      create: {
        ...entry,
        consultantId: bravo.id,
        periodId: period.id,
      },
    });

    for (const approval of approvals) {
      await prisma.approval.upsert({
        where: { id: approval.id },
        update: {
          status: approval.status,
          comment: approval.comment,
          approverUserId: user.id,
        },
        create: {
          id: approval.id,
          entityType: "TIME_ENTRY",
          entityId: entry.id,
          approverUserId: user.id,
          status: approval.status,
          comment: approval.comment,
          isAutomatic: false,
        },
      });
      entryApprovalCount += 1;
    }
  }

  let expenseApprovalCount = 0;
  for (const demoExpense of BRAVO_EXPENSES) {
    const { approvals, ...expense } = demoExpense;
    await prisma.expense.upsert({
      where: { id: expense.id },
      update: {
        projectId: expense.projectId,
        allocationId: expense.allocationId,
        date: expense.date,
        amount: expense.amount,
        description: expense.description,
        invoiceNumber: expense.invoiceNumber,
        status: expense.status,
        submittedAt: expense.submittedAt,
      },
      create: {
        ...expense,
        consultantId: bravo.id,
      },
    });

    for (const approval of approvals) {
      await prisma.approval.upsert({
        where: { id: approval.id },
        update: {
          status: approval.status,
          comment: approval.comment,
          approverUserId: user.id,
        },
        create: {
          id: approval.id,
          entityType: "EXPENSE",
          entityId: expense.id,
          approverUserId: user.id,
          status: approval.status,
          comment: approval.comment,
          isAutomatic: false,
        },
      });
      expenseApprovalCount += 1;
    }
  }

  console.log(
    `Seeded second consultant ${bravo.id} (${BRAVO_ALLOCATIONS.length} allocations, ` +
      `${BRAVO_TIME_ENTRIES.length} time entries / ${entryApprovalCount} approvals, ` +
      `${BRAVO_EXPENSES.length} expenses / ${expenseApprovalCount} approvals).`,
  );
}

async function main() {
  await seedRoles();
  await seedDevUser();
  await seedDemoWorkspace();
  await seedDemoExpenses();
  await seedSecondConsultant();
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
