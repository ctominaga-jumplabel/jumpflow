// Surgical prod apply for two NEW permission codes (does NOT touch existing cells):
//   - CONSULTORES_REMUNERACAO  (child of CONSULTORES)  -> Remuneração do consultor
//   - RELATORIOS_CONSULTORES   (child of RELATORIOS)   -> Filtro por consultor
//
// Both seeded to Financeiro + People/DP (ADMIN full control; CONSULTANT denied).
// Idempotent: upserts only these two Permission rows and their RolePermission
// cells, so any manual matrix customization on OTHER codes is preserved. This is
// the intended way to apply to prod (the full `npm run db:seed` re-asserts the
// baseline for EVERY code and would clobber manual matrix edits).
//
// Run from packages/database/ with the direct (session-pooler) connection:
//   DATABASE_URL=$DIRECT_URL node scripts/apply-consultant-comp-report-perms.mjs
// Add --apply to write; without it, runs a read-only dry run.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// ADMIN is full-control implicitly; CONSULTANT is denied on any non-allowlisted
// code (these two are not in the consultant allow-list). So the roles that get
// the grant are Financeiro + People.
const GRANT_ROLES = ["ADMIN", "AREA_MANAGER", "FINANCE", "PEOPLE"];

const CODES = [
  {
    code: "CONSULTORES_REMUNERACAO",
    name: "Remuneração do consultor",
    module: "Pessoas",
    parent: "CONSULTORES",
    sort: 60,
    view: GRANT_ROLES,
    create: GRANT_ROLES,
    edit: GRANT_ROLES,
    del: GRANT_ROLES,
  },
  {
    code: "RELATORIOS_CONSULTORES",
    name: "Filtro por consultor",
    module: "Relatórios",
    parent: "RELATORIOS",
    sort: 101,
    view: GRANT_ROLES,
    create: [],
    edit: [],
    del: [],
  },
];

const has = (set, key) => key === "ADMIN" || (set ?? []).includes(key);

async function main() {
  console.log(`[perms] mode: ${APPLY ? "APPLY (write)" : "DRY RUN (read-only)"}`);

  // Resolve parents + roles up front.
  const roles = await prisma.role.findMany({ where: { isSystem: true } });
  const roleByKey = new Map(roles.map((r) => [r.key, r.id]));

  for (const c of CODES) {
    const parent = c.parent
      ? await prisma.permission.findUnique({ where: { code: c.parent } })
      : null;
    if (c.parent && !parent) {
      throw new Error(`Parent code ${c.parent} not found for ${c.code}`);
    }

    if (!APPLY) {
      const existing = await prisma.permission.findUnique({
        where: { code: c.code },
      });
      console.log(
        `[perms] ${c.code}: ${existing ? "exists" : "MISSING"} -> would upsert (parent=${c.parent ?? "-"}, sort=${c.sort})`,
      );
      for (const key of roleByKey.keys()) {
        console.log(
          `        ${key}: view=${has(c.view, key)} create=${has(c.create, key)} edit=${has(c.edit, key)} delete=${has(c.del, key)}`,
        );
      }
      continue;
    }

    const perm = await prisma.permission.upsert({
      where: { code: c.code },
      update: {
        name: c.name,
        module: c.module,
        sortOrder: c.sort,
        active: true,
        parentId: parent?.id ?? null,
      },
      create: {
        code: c.code,
        name: c.name,
        module: c.module,
        sortOrder: c.sort,
        parentId: parent?.id ?? null,
      },
    });

    for (const [key, roleId] of roleByKey) {
      const data = {
        canView: has(c.view, key),
        canCreate: has(c.create, key),
        canEdit: has(c.edit, key),
        canDelete: has(c.del, key),
      };
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: perm.id } },
        update: data,
        create: { roleId, permissionId: perm.id, ...data },
      });
    }
    console.log(`[perms] ${c.code}: upserted + ${roleByKey.size} cells.`);
  }

  console.log("[perms] done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
