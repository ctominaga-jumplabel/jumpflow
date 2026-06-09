// Idempotent database seed.
//
// - Upserts the RBAC role catalog (safe to run repeatedly).
// - When AUTH_DEV_MODE=true, also upserts a development user holding every
//   role, mirroring the in-memory DEV_USER used by the auth foundation so the
//   persisted RBAC path can be exercised locally.
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

async function main() {
  await seedRoles();
  await seedDevUser();
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
