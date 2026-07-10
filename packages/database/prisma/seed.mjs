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

import { randomBytes, scryptSync, createHash } from "node:crypto";

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

// Human labels (pt-BR) for the system groups. Mirrors roleLabels in
// apps/web/src/lib/auth/roles.ts.
const ROLE_LABELS = {
  ADMIN: "Administrador",
  CONSULTANT: "Consultor",
  PROJECT_MANAGER: "Gestor de Projeto",
  AREA_MANAGER: "Gestor de Área",
  FINANCE: "Financeiro",
  PEOPLE: "RH / People",
  SALES: "Comercial",
};

async function seedRoles() {
  for (const name of ROLE_NAMES) {
    // System groups: key = enum string, isSystem = true, active = true. Backfill
    // label every run so renames in ROLE_LABELS propagate.
    await prisma.role.upsert({
      where: { name },
      update: { key: name, label: ROLE_LABELS[name], isSystem: true },
      create: { name, key: name, label: ROLE_LABELS[name], isSystem: true },
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

// --- Round 5: first ADMIN bootstrap (env-driven, idempotent) ---------------
//
// Provisions the first ADMIN so the platform is usable before any UI exists.
// Reads BOOTSTRAP_ADMIN_EMAIL (required for the bootstrap to run),
// BOOTSTRAP_ADMIN_NAME (optional, defaults from the email local-part) and the
// OPTIONAL BOOTSTRAP_ADMIN_PASSWORD. No real value is committed: everything
// comes from the environment.
//
//   - With BOOTSTRAP_ADMIN_PASSWORD: hashes it with node:crypto scrypt in the
//     self-describing `scrypt$N$r$p$<saltB64url>$<hashB64url>` format
//     (auth-foundation 11.3) and sets passwordHash + emailVerifiedAt +
//     mustChangePassword=true. The plaintext password is NEVER logged.
//   - Without a password: creates a PENDING UserInvitation (ADMIN role) and
//     prints only a safe message — never the token. The plaintext token is
//     generated, only its sha256 digest is stored.
//
// Idempotent: upsert by (lowercased) email, ADMIN UserRole upserted, and a
// PENDING invitation is not duplicated if one already exists for the email.

// scrypt parameters — must mirror lib/auth/password.ts (auth-foundation 11.3).
const SCRYPT_N = 16384; // 2^14
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    // scrypt needs maxmem raised above the default for N=16384.
    maxmem: 64 * 1024 * 1024,
  });
  const saltB64 = salt.toString("base64url");
  const hashB64 = derived.toString("base64url");
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${saltB64}$${hashB64}`;
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function seedBootstrapAdmin() {
  const rawEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  if (!rawEmail || !rawEmail.trim()) {
    console.log(
      "BOOTSTRAP_ADMIN_EMAIL not set — skipping first-admin bootstrap.",
    );
    return;
  }

  const email = rawEmail.trim().toLowerCase();
  const name =
    (process.env.BOOTSTRAP_ADMIN_NAME && process.env.BOOTSTRAP_ADMIN_NAME.trim()) ||
    email.split("@")[0];
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  const adminRole = await prisma.role.findUnique({ where: { name: "ADMIN" } });
  if (!adminRole) {
    console.log("ADMIN role not found — run seedRoles first; skipping bootstrap.");
    return;
  }

  // Build the create/update payload. Never overwrite an existing passwordHash
  // when no password is provided; only set it when a password is supplied.
  const userData = {};
  if (password) {
    userData.passwordHash = hashPassword(password);
    userData.emailVerifiedAt = new Date();
    userData.mustChangePassword = true;
  }

  const adminUser = await prisma.user.upsert({
    where: { email },
    update: { name, status: "ACTIVE", ...userData },
    create: { name, email, status: "ACTIVE", ...userData },
  });

  // Guarantee the ADMIN role link (no duplicate thanks to the composite key).
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: adminRole.id },
  });

  if (password) {
    console.log(
      `Bootstrap admin ${email} provisioned with a password (must change on first login).`,
    );
    return;
  }

  // No password: ensure a PENDING invitation exists (do not duplicate).
  const existingPending = await prisma.userInvitation.findFirst({
    where: { email, status: "PENDING" },
  });
  if (existingPending) {
    console.log(
      `Bootstrap admin ${email} already has a pending invitation — not duplicating.`,
    );
    return;
  }

  const ttlHours = Number(process.env.INVITE_TOKEN_TTL_HOURS) || 72;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  await prisma.userInvitation.create({
    data: {
      email,
      name,
      tokenHash,
      status: "PENDING",
      roles: ["ADMIN"],
      expiresAt,
      // Self-invited bootstrap: the admin user we just upserted is the actor.
      invitedByUserId: adminUser.id,
    },
  });

  // SECURITY: never print the plaintext token. The admin retrieves/regenerates
  // the acceptance link through the admin UI (invitations flow).
  console.log(
    `Bootstrap invitation created for ${email}. Generate/reset the access link from the admin screen.`,
  );
}

// --- Billing types catalog (motor de regras de faturamento) ----------------
//
// The 16 charge models are the actual catalog the Financeiro screen manages:
// they are pre-registered here (idempotent upsert by stable `seed-billing-*`
// id) but stay fully editable in the UI. `chargeType` is the engine behavior
// key; `name`/`howItWorks`/`example` are the table the user provided. Rounding
// defaults to NONE ("Sem arredondamento"). Not gated by AUTH_DEV_MODE — the
// catalog is reference data, useful in every environment.

const BILLING_TYPES = [
  {
    id: "seed-billing-hourly",
    name: "Hora trabalhada",
    chargeType: "HOURLY",
    howItWorks: "Cobra pelas horas aprovadas",
    example: "160h × R$ 180/h",
  },
  {
    id: "seed-billing-monthly",
    name: "Mensalidade fixa",
    chargeType: "MONTHLY",
    howItWorks: "Valor fixo independente das horas",
    example: "R$ 25.000/mês",
  },
  {
    id: "seed-billing-hourly-plus-fixed",
    name: "Hora + Fixo",
    chargeType: "HOURLY_PLUS_FIXED",
    howItWorks: "Valor mensal + horas excedentes",
    example: "R$ 15.000 + horas extras",
  },
  {
    id: "seed-billing-hour-package",
    name: "Pacote de horas (Franquia)",
    chargeType: "HOUR_PACKAGE",
    howItWorks: "Cliente compra um banco de horas",
    example: "200h/mês, excedente cobrado à parte",
  },
  {
    id: "seed-billing-per-allocated-consultant",
    name: "Preço por consultor alocado",
    chargeType: "PER_ALLOCATED_CONSULTANT",
    howItWorks: "Valor por profissional",
    example: "5 consultores × R$ 18.000",
  },
  {
    id: "seed-billing-per-project",
    name: "Preço por projeto",
    chargeType: "PER_PROJECT",
    howItWorks: "Valor fechado pelo projeto",
    example: "Projeto ABC = R$ 300.000",
  },
  {
    id: "seed-billing-milestone",
    name: "Por entrega (Milestone)",
    chargeType: "MILESTONE",
    howItWorks: "Cobrança quando uma etapa é concluída",
    example: "Entrega da fase 1 = R$ 50.000",
  },
  {
    id: "seed-billing-per-sprint",
    name: "Por sprint",
    chargeType: "PER_SPRINT",
    howItWorks: "Muito usado em times ágeis",
    example: "R$ 40.000 por sprint",
  },
  {
    id: "seed-billing-time-and-material",
    name: "T&M (Time & Material)",
    chargeType: "TIME_AND_MATERIAL",
    howItWorks: "Horas + despesas",
    example: "Horas + viagens + hospedagem",
  },
  {
    id: "seed-billing-on-demand",
    name: "Sob demanda",
    chargeType: "ON_DEMAND",
    howItWorks: "Cada solicitação gera cobrança",
    example: "Chamado ou serviço avulso",
  },
  {
    id: "seed-billing-subscription",
    name: "Assinatura (Subscription)",
    chargeType: "SUBSCRIPTION",
    howItWorks: "Cobrança recorrente",
    example: "SaaS de R$ 5.000/mês",
  },
  {
    id: "seed-billing-pay-as-you-go",
    name: "Consumo (Pay as you go)",
    chargeType: "PAY_AS_YOU_GO",
    howItWorks: "Cobra pelo uso",
    example: "APIs, processamento, GB, usuários",
  },
  {
    id: "seed-billing-success-fee",
    name: "Sucesso (Success Fee)",
    chargeType: "SUCCESS_FEE",
    howItWorks: "Percentual sobre resultado",
    example: "10% da economia gerada",
  },
  {
    id: "seed-billing-mixed",
    name: "Misto",
    chargeType: "MIXED",
    howItWorks: "Combina vários modelos",
    example: "Fixo + hora + bônus",
  },
];

async function seedBillingTypes() {
  for (const billingType of BILLING_TYPES) {
    // Idempotent reconciliation: `name` is @unique, so a plain upsert keyed on
    // `id` throws P2002 when a row with the same NAME already exists under a
    // different id (e.g. created before the deterministic `seed-billing-*` ids).
    // Match by id OR name, then update in place (keeping the existing PK so FKs
    // stay valid) or create with the seed id when absent.
    const existing = await prisma.billingType.findFirst({
      where: { OR: [{ id: billingType.id }, { name: billingType.name }] },
    });
    const data = {
      name: billingType.name,
      chargeType: billingType.chargeType,
      howItWorks: billingType.howItWorks,
      example: billingType.example,
    };
    if (existing) {
      await prisma.billingType.update({ where: { id: existing.id }, data });
    } else {
      await prisma.billingType.create({
        data: {
          id: billingType.id,
          roundingRule: "NONE",
          active: true,
          ...data,
        },
      });
    }
  }
  console.log(`Seeded ${BILLING_TYPES.length} billing types (catalog).`);
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

// ---------------------------------------------------------------------------
// RBAC permission matrix (configurable). The catalog and the initial Role ×
// Permission grants below MIRROR the current static behavior of the app
// (route-permissions.ts role arrays + navigation requiredRoles). Seeding them
// makes the matrix the configurable source of truth WITHOUT changing day-1
// behavior. Idempotent: permissions upsert by `code`, grants by (roleId,
// permissionId). Re-running is safe; it does NOT reset admin-made edits beyond
// re-asserting the baseline for codes it owns.
// ---------------------------------------------------------------------------

const ALL_ROLES = [...ROLE_NAMES];
const FINANCIAL = ["ADMIN", "AREA_MANAGER", "FINANCE"];
const PROJECT_WRITE = ["ADMIN", "AREA_MANAGER", "PROJECT_MANAGER", "SALES"];
const SALE_RATE = ["ADMIN", "AREA_MANAGER", "FINANCE", "SALES"];
const CLIENT_ACCESS = ["ADMIN", "AREA_MANAGER", "FINANCE", "SALES"];
const COMPETENCY_READ = ["ADMIN", "PEOPLE", "AREA_MANAGER", "PROJECT_MANAGER", "SALES"];
const COMPETENCY_WRITE = ["ADMIN", "PEOPLE"];
const AVAILABILITY_READ = ["ADMIN", "PEOPLE", "AREA_MANAGER", "PROJECT_MANAGER", "SALES", "CONSULTANT"];
const TALENT_READ = ["ADMIN", "PEOPLE", "AREA_MANAGER", "PROJECT_MANAGER", "CONSULTANT"];
const TALENT_MANAGE = ["ADMIN", "PEOPLE", "AREA_MANAGER", "PROJECT_MANAGER"];
const PEOPLE_MANAGE = ["ADMIN", "PEOPLE"];
const APPROVALS = ["ADMIN", "AREA_MANAGER", "PROJECT_MANAGER", "FINANCE"];
const AUTOMATION = ["ADMIN", "AREA_MANAGER"];
const ADMIN_ONLY = ["ADMIN"];

// EP-M09: navegação restrita do Consultor. O papel CONSULTANT só pode
// ver/acessar estas 6 funcionalidades; para qualquer outro code o CONSULTANT
// fica com view/create/edit/delete = false (mesmo que apareça nos sets de
// papel acima). O launcher "Início" (/app) não tem permissionCode e permanece
// sempre visível. Isto é a fronteira: o matrix é o gate real de rota e de menu.
const CONSULTANT_ALLOWED_CODES = new Set([
  "FEED",
  "HORAS",
  "DESPESAS",
  "SKILLS",
  "UNIVERSIDADE",
  "CERTIFICADOS",
]);

// Each entry: code, name, module (display group), parent code (hierarchy),
// sortOrder and the role sets per action. ADMIN is added to every action set
// automatically (platform owner = full control), so it is omitted below.
const PERMISSION_CATALOG = [
  { code: "DASHBOARD", name: "Dashboard", module: "Operação", sort: 0, view: ALL_ROLES },

  { code: "HORAS", name: "Horas", module: "Horas", sort: 10, view: ALL_ROLES, create: ALL_ROLES, edit: ALL_ROLES, del: ["AREA_MANAGER", "PROJECT_MANAGER"] },
  { code: "HORAS_LANCAMENTOS", name: "Lançamentos", module: "Horas", parent: "HORAS", sort: 11, view: ALL_ROLES, create: ALL_ROLES, edit: ALL_ROLES, del: ALL_ROLES },
  { code: "HORAS_APROVACOES", name: "Aprovações", module: "Horas", parent: "HORAS", sort: 12, view: APPROVALS, edit: APPROVALS },
  { code: "HORAS_RELATORIOS", name: "Relatórios de horas", module: "Horas", parent: "HORAS", sort: 13, view: ALL_ROLES },

  { code: "DESPESAS", name: "Despesas", module: "Despesas", sort: 20, view: ALL_ROLES, create: ALL_ROLES, edit: ALL_ROLES, del: ["FINANCE"] },
  { code: "DESPESAS_PAGAMENTO", name: "Status de pagamento", module: "Despesas", parent: "DESPESAS", sort: 21, view: FINANCIAL, edit: FINANCIAL },

  { code: "SOBREAVISO", name: "Sobreaviso", module: "Operação", sort: 22, view: ALL_ROLES, create: ALL_ROLES, edit: APPROVALS, del: ALL_ROLES },
  // Fechamento Operacional para o DP: leitura para gestão + FINANCE/PEOPLE; a
  // marcação/reabertura (edit) é dos papéis que tocam a operação do projeto.
  { code: "OPERACAO_FECHAMENTO", name: "Fechamento Operacional", module: "Operação", sort: 24, view: ["AREA_MANAGER", "PROJECT_MANAGER", "FINANCE", "PEOPLE"], edit: ["AREA_MANAGER", "PROJECT_MANAGER"] },

  { code: "PROJETOS", name: "Projetos", module: "Projetos", sort: 30, view: ALL_ROLES, create: PROJECT_WRITE, edit: PROJECT_WRITE, del: ["AREA_MANAGER"] },
  { code: "PROJETOS_CADASTRO", name: "Cadastro", module: "Projetos", parent: "PROJETOS", sort: 31, view: ALL_ROLES, create: PROJECT_WRITE, edit: PROJECT_WRITE, del: ["AREA_MANAGER"] },
  { code: "PROJETOS_EQUIPES", name: "Equipes / Alocação", module: "Projetos", parent: "PROJETOS", sort: 32, view: ALL_ROLES, create: PROJECT_WRITE, edit: PROJECT_WRITE, del: PROJECT_WRITE },
  { code: "PROJETOS_FINANCEIRO", name: "Financeiro do projeto", module: "Projetos", parent: "PROJETOS", sort: 33, view: FINANCIAL, edit: FINANCIAL },
  { code: "PROJETOS_RELATORIOS", name: "Relatórios de projeto", module: "Projetos", parent: "PROJETOS", sort: 34, view: ALL_ROLES },

  { code: "CLIENTES", name: "Clientes", module: "Clientes", sort: 40, view: CLIENT_ACCESS, create: CLIENT_ACCESS, edit: CLIENT_ACCESS, del: ADMIN_ONLY },

  { code: "COMERCIAL", name: "Comercial", module: "Comercial", sort: 50, view: SALE_RATE, create: SALE_RATE, edit: SALE_RATE },

  { code: "CONSULTORES", name: "Consultores", module: "Pessoas", sort: 60, view: ALL_ROLES, create: PEOPLE_MANAGE.concat("AREA_MANAGER"), edit: PEOPLE_MANAGE.concat("AREA_MANAGER"), del: ADMIN_ONLY },
  { code: "SKILLS", name: "Skills", module: "Pessoas", sort: 61, view: ALL_ROLES, create: ALL_ROLES, edit: ALL_ROLES },
  { code: "COMPETENCIAS", name: "Competências", module: "Pessoas", sort: 62, view: COMPETENCY_READ, create: COMPETENCY_WRITE, edit: COMPETENCY_WRITE, del: COMPETENCY_WRITE },
  { code: "DISPONIBILIDADE", name: "Disponibilidade", module: "Pessoas", sort: 63, view: AVAILABILITY_READ },
  { code: "CERTIFICADOS", name: "Certificados", module: "Pessoas", sort: 64, view: ALL_ROLES, create: ALL_ROLES, edit: ALL_ROLES },

  // Checkpoint/1-on-1 + inteligência (Melhoria #4, fatia 1). Só GESTOR registra
  // (create/edit = TALENT_MANAGE); del = PEOPLE (ADMIN implícito). view inclui
  // CONSULTANT (TALENT_READ) porque o consultor avaliado VÊ os PRÓPRIOS
  // checkpoints SHARED — com conteúdo REDIGIDO (sem transcrição/notas crus nem
  // candidatos), enforced pelo read-scope "subject" + canViewCheckpointRaw=false.
  // Oportunidade/Case continuam INTERNOS (só gestão) + handoff manual.
  { code: "CHECKPOINT", name: "Checkpoint / 1-on-1", module: "Pessoas", sort: 65, view: TALENT_READ, create: TALENT_MANAGE, edit: TALENT_MANAGE, del: ["PEOPLE"] },
  { code: "OPPORTUNITY", name: "Oportunidades", module: "Pessoas", sort: 66, view: TALENT_MANAGE, create: TALENT_MANAGE, edit: TALENT_MANAGE, del: ["PEOPLE"] },
  { code: "CASE", name: "Cases", module: "Pessoas", sort: 67, view: TALENT_MANAGE, create: TALENT_MANAGE, edit: TALENT_MANAGE, del: ["PEOPLE"] },

  { code: "FEEDBACK", name: "Feedback contínuo", module: "Desenvolvimento", sort: 70, view: TALENT_READ, create: TALENT_MANAGE, edit: TALENT_MANAGE },
  { code: "AVALIACOES", name: "Avaliações", module: "Desenvolvimento", sort: 71, view: TALENT_READ, create: PEOPLE_MANAGE, edit: PEOPLE_MANAGE },
  { code: "PDI", name: "PDI", module: "Desenvolvimento", sort: 72, view: TALENT_READ, create: TALENT_MANAGE, edit: TALENT_MANAGE },
  { code: "CLIMA", name: "Clima / NPS", module: "Desenvolvimento", sort: 73, view: ["PEOPLE", "AREA_MANAGER", "CONSULTANT"], create: PEOPLE_MANAGE, edit: PEOPLE_MANAGE },
  { code: "METAS", name: "Metas e OKRs", module: "Desenvolvimento", sort: 74, view: TALENT_READ, create: TALENT_MANAGE, edit: TALENT_MANAGE },
  { code: "UNIVERSIDADE", name: "Universidade Jump", module: "Desenvolvimento", sort: 75, view: ALL_ROLES, create: PEOPLE_MANAGE, edit: PEOPLE_MANAGE },

  { code: "ALOCACAO_IA", name: "IA de Alocação", module: "Inteligência", sort: 80, view: PROJECT_WRITE },
  { code: "RISCO_PROJETOS", name: "Risco de Projetos", module: "Inteligência", sort: 81, view: ["AREA_MANAGER", "PROJECT_MANAGER", "FINANCE"] },
  { code: "SCORE_CONSULTOR", name: "Score do Consultor", module: "Inteligência", sort: 82, view: ["PEOPLE", "AREA_MANAGER", "FINANCE", "CONSULTANT"] },

  // Feed social interno (Melhoria #5, fatia 1). Todos os usuários ativos veem,
  // postam e editam (edição do próprio conteúdo; pin/moderação são refinados na
  // app). del = moderação: ADMIN + PEOPLE.
  { code: "FEED", name: "Feed", module: "Comunicação", sort: 85, view: ALL_ROLES, create: ALL_ROLES, edit: ALL_ROLES, del: ["PEOPLE"] },

  { code: "APROVACOES", name: "Aprovações", module: "Aprovações", sort: 90, view: APPROVALS, edit: APPROVALS },
  { code: "AUTOMACOES", name: "Automações", module: "Aprovações", sort: 91, view: AUTOMATION, edit: AUTOMATION },

  { code: "RELATORIOS", name: "Relatórios", module: "Relatórios", sort: 100, view: ALL_ROLES },

  { code: "FINANCEIRO", name: "Financeiro", module: "Financeiro", sort: 110, view: FINANCIAL, create: FINANCIAL, edit: FINANCIAL },
  { code: "FINANCEIRO_COBRANCA", name: "Cobrança de projetos", module: "Financeiro", parent: "FINANCEIRO", sort: 111, view: FINANCIAL, edit: FINANCIAL },
  { code: "FINANCEIRO_FECHAMENTO", name: "Fechamento mensal", module: "Financeiro", parent: "FINANCEIRO", sort: 112, view: FINANCIAL, edit: FINANCIAL },
  { code: "PAGAMENTOS", name: "Pagamentos", module: "Financeiro", sort: 113, view: FINANCIAL, edit: FINANCIAL },

  { code: "ADMIN_ACESSOS", name: "Acessos (usuários e convites)", module: "Administração", sort: 120, view: ADMIN_ONLY, create: ADMIN_ONLY, edit: ADMIN_ONLY, del: ADMIN_ONLY },
  { code: "CONFIGURACOES_PERMISSOES", name: "Matriz de Permissões", module: "Administração", sort: 121, view: ADMIN_ONLY, edit: ADMIN_ONLY },
  { code: "CONFIGURACOES_NOTIFICACOES", name: "Regras de Notificação", module: "Administração", sort: 122, view: ADMIN_ONLY, create: ADMIN_ONLY, edit: ADMIN_ONLY, del: ADMIN_ONLY },
  // Feriados (Onda A-ext): calendário operacional gerido por ADMIN + PEOPLE (DP).
  { code: "CONFIGURACOES_FERIADOS", name: "Feriados", module: "Administração", sort: 123, view: PEOPLE_MANAGE, create: PEOPLE_MANAGE, edit: PEOPLE_MANAGE, del: PEOPLE_MANAGE },
];

async function seedPermissions() {
  // Pass 1: upsert every permission without parents (parents resolved next).
  for (const p of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name, module: p.module, sortOrder: p.sort, active: true },
      create: { code: p.code, name: p.name, module: p.module, sortOrder: p.sort },
    });
  }
  // Pass 2: wire the hierarchy (parentId) now that all rows exist.
  const byCode = new Map(
    (await prisma.permission.findMany({ select: { id: true, code: true } })).map(
      (r) => [r.code, r.id],
    ),
  );
  for (const p of PERMISSION_CATALOG) {
    if (!p.parent) continue;
    await prisma.permission.update({
      where: { code: p.code },
      data: { parentId: byCode.get(p.parent) ?? null },
    });
  }
  console.log(`Seeded ${PERMISSION_CATALOG.length} permissions.`);
}

async function seedRolePermissions() {
  const roles = await prisma.role.findMany({ where: { isSystem: true } });
  const roleByKey = new Map(roles.map((r) => [r.key, r.id]));
  const permByCode = new Map(
    (await prisma.permission.findMany({ select: { id: true, code: true } })).map(
      (r) => [r.code, r.id],
    ),
  );

  let cells = 0;
  for (const p of PERMISSION_CATALOG) {
    const permissionId = permByCode.get(p.code);
    if (!permissionId) continue;

    // ADMIN always has full control; other roles get the action if listed.
    // EP-M09: o CONSULTANT é negado em qualquer code fora do allow-list, mesmo
    // que apareça nos sets de papel — a navegação restrita do Consultor é a
    // fronteira. ADMIN nunca é afetado.
    const has = (set, key) => {
      if (key === "ADMIN") return true;
      if (key === "CONSULTANT" && !CONSULTANT_ALLOWED_CODES.has(p.code)) {
        return false;
      }
      return (set ?? []).includes(key);
    };

    for (const key of ROLE_NAMES) {
      const roleId = roleByKey.get(key);
      if (!roleId) continue;
      const data = {
        canView: has(p.view, key),
        canCreate: has(p.create, key),
        canEdit: has(p.edit, key),
        canDelete: has(p.del, key),
      };
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: data,
        create: { roleId, permissionId, ...data },
      });
      cells += 1;
    }
  }
  console.log(`Seeded ${cells} role-permission cells.`);
}

// Default notification rules shipped with the platform. Idempotent: only
// creates a rule for an event when none exists yet, so admin edits in
// /app/admin/notificacoes are never overwritten. The Teams channel needs a
// per-environment webhook URL (a secret), so it is NOT seeded — add it via the
// admin UI as a STATIC recipient on the TEAMS channel.
// Idempotent per event: only creates a rule when the event has none yet, so
// admin edits in /app/admin/notificacoes are never overwritten.
async function ensureNotificationRule(event, recipients, label) {
  const existing = await prisma.notificationRule.findFirst({
    where: { event },
    select: { id: true },
  });
  if (existing) {
    console.log(`Notification rule ${event} already present — skipping.`);
    return;
  }
  await prisma.notificationRule.create({
    data: {
      event,
      // GLOBAL (não PROJECT): estes eventos emitem com scope PROJECT + o id do
      // projeto, mas os destinatários são por PAPEL/contato (sem scopeId por
      // projeto). Uma regra PROJECT com scopeId null NUNCA casa
      // (rule.scopeId === input.scope.id vira null === projectId), então o
      // e-mail jamais dispara. GLOBAL casa com qualquer emit — igual ao
      // PROJECT_CREATED, que funciona.
      scope: "GLOBAL",
      channel: "EMAIL",
      groupByRecipient: true,
      active: true,
      recipients: { create: recipients },
    },
  });
  console.log(`Seeded default notification rule: ${label}`);
}

async function seedNotificationDefaults() {
  // Fechamento operacional → DP/People podem seguir com folha e pagamento.
  await ensureNotificationRule(
    "OPERATION_CLOSED",
    [{ type: "ROLE", channel: "EMAIL", address: "PEOPLE", name: "DP / People" }],
    "OPERATION_CLOSED → ROLE PEOPLE (EMAIL)",
  );

  // Liberação de horas (mensal) → DP/People + Financeiro (alimenta faturamento).
  await ensureNotificationRule(
    "HOURS_RELEASED",
    [
      { type: "ROLE", channel: "EMAIL", address: "PEOPLE", name: "DP / People" },
      { type: "ROLE", channel: "EMAIL", address: "FINANCE", name: "Financeiro" },
    ],
    "HOURS_RELEASED → ROLE PEOPLE + FINANCE (EMAIL)",
  );

  // Apuração ao cliente (disparo explícito do Financeiro) → contato do cliente.
  await ensureNotificationRule(
    "CLIENT_BILLING_SUMMARY",
    [
      {
        type: "CLIENT_CONTACT",
        channel: "EMAIL",
        address: null,
        name: "Contato do cliente",
      },
    ],
    "CLIENT_BILLING_SUMMARY → CLIENT_CONTACT (EMAIL)",
  );

  // Menção no Feed (@usuário) → o próprio mencionado. Nos eventos de Feed o
  // destinatário NÃO vem de rule.recipients (é resolvido para o usuário
  // mencionado em feed-events.ts): a regra serve só como liga/desliga do evento
  // (fail-open — sem regra ativa, nada é enviado). Por isso recipients fica vazio.
  await ensureNotificationRule(
    "FEED_MENTIONED",
    [],
    "FEED_MENTIONED (toggle; destinatário = usuário mencionado)",
  );

  // Feriado próximo (Onda A/2) → DP/People planeja escalas e apontamento. Regra
  // GLOBAL por padrão; regras adicionais scope=PROJECT podem ser criadas na
  // admin para notificação por projeto (o motor casa por escopo).
  await ensureNotificationRule(
    "HOLIDAY_UPCOMING",
    [{ type: "ROLE", channel: "EMAIL", address: "PEOPLE", name: "DP / People" }],
    "HOLIDAY_UPCOMING → ROLE PEOPLE (EMAIL)",
  );
}

// Feriados nacionais brasileiros. Datas oficiais fixas + móveis (Sexta-feira
// Santa) já calculadas por ano. Consciência Negra é feriado NACIONAL desde 2024.
// Fonte de dados da Onda A (notificação de feriado + aviso ao apontar horas em
// feriado). scope = NATIONAL, region = null para todos.
const NATIONAL_HOLIDAYS = [
  // 2026
  { date: "2026-01-01", name: "Confraternização Universal" },
  { date: "2026-04-03", name: "Sexta-feira Santa" },
  { date: "2026-04-21", name: "Tiradentes" },
  { date: "2026-05-01", name: "Dia do Trabalho" },
  { date: "2026-09-07", name: "Independência do Brasil" },
  { date: "2026-10-12", name: "Nossa Senhora Aparecida" },
  { date: "2026-11-02", name: "Finados" },
  { date: "2026-11-15", name: "Proclamação da República" },
  { date: "2026-11-20", name: "Consciência Negra" },
  { date: "2026-12-25", name: "Natal" },
  // 2027
  { date: "2027-01-01", name: "Confraternização Universal" },
  { date: "2027-03-26", name: "Sexta-feira Santa" },
  { date: "2027-04-21", name: "Tiradentes" },
  { date: "2027-05-01", name: "Dia do Trabalho" },
  { date: "2027-09-07", name: "Independência do Brasil" },
  { date: "2027-10-12", name: "Nossa Senhora Aparecida" },
  { date: "2027-11-02", name: "Finados" },
  { date: "2027-11-15", name: "Proclamação da República" },
  { date: "2027-11-20", name: "Consciência Negra" },
  { date: "2027-12-25", name: "Natal" },
];

async function ensureHoliday({ date, name, scope = "NATIONAL", region = null }) {
  // `date` é uma string YYYY-MM-DD; new Date interpreta como UTC midnight, o que
  // casa com a semântica date-only de @db.Date.
  const dateValue = new Date(`${date}T00:00:00.000Z`);
  const year = dateValue.getUTCFullYear();
  // O unique composto [date, scope, region] foi removido (era falsa garantia no
  // Postgres: region NULL torna as linhas distintas). Idempotência do seed passa
  // a ser findFirst+create/update sobre (date, scope, region), espelhando a
  // colisão que a Server Action de CRUD valida. Feriados nacionais permanecem
  // GLOBAIS: nenhum vínculo em HolidayProject é criado aqui.
  const existing = await prisma.holiday.findFirst({
    where: { date: dateValue, scope, region },
    select: { id: true },
  });
  if (existing) {
    await prisma.holiday.update({
      where: { id: existing.id },
      data: { name, year },
    });
  } else {
    await prisma.holiday.create({
      data: { date: dateValue, name, scope, region, year },
    });
  }
}

async function seedHolidayDefaults() {
  for (const holiday of NATIONAL_HOLIDAYS) {
    await ensureHoliday(holiday);
  }
  console.log(`Seeded ${NATIONAL_HOLIDAYS.length} national holidays (2026–2027).`);
}

async function main() {
  await seedRoles();
  await seedPermissions();
  await seedRolePermissions();
  await seedNotificationDefaults();
  await seedHolidayDefaults();
  await seedBootstrapAdmin();
  await seedBillingTypes();
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
