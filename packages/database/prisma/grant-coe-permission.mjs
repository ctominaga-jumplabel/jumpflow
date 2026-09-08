import { PrismaClient } from "@prisma/client";

/**
 * Libera SOMENTE a permissao do COE (code `COE`) na matriz.
 *
 * POR QUE ESTE SCRIPT EXISTE, e nao `npm run db:seed`:
 * `seedRolePermissions` faz `upsert` com `update` em TODAS as celulas de TODAS
 * as permissoes do catalogo. Rodar o seed completo num banco em uso REESCREVE a
 * matriz inteira para os defaults, apagando qualquer ajuste feito pelo ADMIN em
 * /app/admin/permissoes. Para publicar um modulo novo isso e um efeito colateral
 * inaceitavel.
 *
 * Este script toca exclusivamente:
 *   - a linha `Permission` de code `COE`;
 *   - as linhas `RolePermission` dessa permissao para os papeis abaixo.
 * Nenhuma outra permissao, papel, usuario ou dado e lido para escrita.
 *
 * Idempotente: rodar de novo nao duplica nem altera mais nada.
 *
 * Uso (com DATABASE_URL/DIRECT_URL do ambiente alvo):
 *   node packages/database/prisma/grant-coe-permission.mjs
 */

const prisma = new PrismaClient();

/** Espelha PERMISSION_CATALOG em seed.mjs (entrada `COE`). */
const PERMISSION = {
  code: "COE",
  name: "COE — Centro Operacional de Excelência",
  module: "Inteligência",
  sortOrder: 83,
};

/**
 * Quem LE o COE: quem aloca (PROJECT_WRITE) mais PEOPLE, que cura o nucleo.
 * FINANCE e CONSULTANT ficam de fora. ADMIN entra por ser dono da plataforma.
 *
 * `view` apenas — as DUAS escritas do modulo (curar nucleo x propor time) tem
 * fronteiras diferentes e sao checadas por PAPEL nas server actions; um unico
 * code nao as distingue. Ver docs/coe-centro-operacional-excelencia.md §4.2.
 */
const VIEW_ROLES = [
  "ADMIN",
  "PEOPLE",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "SALES",
];

async function main() {
  const permission = await prisma.permission.upsert({
    where: { code: PERMISSION.code },
    update: {
      name: PERMISSION.name,
      module: PERMISSION.module,
      sortOrder: PERMISSION.sortOrder,
      active: true,
    },
    create: PERMISSION,
    select: { id: true, code: true },
  });
  console.log(`Permission '${permission.code}' pronta.`);

  const roles = await prisma.role.findMany({
    where: { key: { in: VIEW_ROLES } },
    select: { id: true, key: true },
  });

  const missing = VIEW_ROLES.filter((k) => !roles.some((r) => r.key === k));
  if (missing.length > 0) {
    // Nao inventamos papel: se falta um, o seed de papeis nunca rodou aqui.
    console.warn(
      `Papeis nao encontrados (ignorados): ${missing.join(", ")}. ` +
        "Rode seedRoles antes se isso for inesperado.",
    );
  }

  for (const role of roles) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: role.id, permissionId: permission.id },
      },
      // So `canView`. As escritas ficam com os guards por papel; nao concedemos
      // create/edit para nao sugerir um controle que a matriz nao exerce.
      update: { canView: true },
      create: {
        roleId: role.id,
        permissionId: permission.id,
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: false,
      },
    });
    console.log(`  ${role.key}: canView = true`);
  }

  console.log(
    `\nPronto. ${roles.length} papel(eis) com acesso de leitura ao COE. ` +
      "Nenhuma outra permissao foi tocada.",
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Falhou:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
