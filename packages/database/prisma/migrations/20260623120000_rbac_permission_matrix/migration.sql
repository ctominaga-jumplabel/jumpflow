-- Controle de Acesso (RBAC configuravel) — Matriz de Permissoes.
-- Migracao aditiva. Cobre:
--   1. Role: novas colunas (key, label, description, active, isSystem, updatedAt)
--      e relaxamento de `name` para NULLABLE, de modo que grupos do sistema
--      mantenham o enum RoleName e grupos dinamicos futuros tenham name = NULL
--      identificando-se por `key`. Backfill seguro das 7 linhas existentes.
--   2. Permission: catalogo de funcionalidades (modulo/submodulo) com hierarquia
--      via self-relation (parentId).
--   3. RolePermission: celula da matriz (canView/Create/Edit/Delete) por
--      (roleId, permissionId).
--
-- Nenhuma coluna existente e removida e nenhum dado e perdido. As novas tabelas
-- comecam vazias; o seed (`prisma db seed`) popula o catalogo e a matriz inicial
-- espelhando o comportamento estatico atual.
--
-- Escrito manualmente porque `prisma migrate dev` neste ambiente apontaria para
-- o banco de producao (Supabase) e a rede e restrita. Aplicar com
-- `npm run db:deploy` a partir de um ambiente com acesso ao banco, ANTES do
-- merge na main (ver docs/rbac-matriz-permissoes.md §Deploy).

-- AlterTable: Role ganha metadados e `name` passa a ser opcional.
ALTER TABLE "Role" ALTER COLUMN "name" DROP NOT NULL;
ALTER TABLE "Role" ADD COLUMN "key" TEXT;
ALTER TABLE "Role" ADD COLUMN "label" TEXT;
ALTER TABLE "Role" ADD COLUMN "description" TEXT;
ALTER TABLE "Role" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Role" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Role" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: os 7 grupos do sistema recebem `key` = string do enum RoleName.
UPDATE "Role" SET "key" = "name"::text WHERE "key" IS NULL AND "name" IS NOT NULL;

-- Apos o backfill, `key` torna-se obrigatorio e unico.
ALTER TABLE "Role" ALTER COLUMN "key" SET NOT NULL;
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");
CREATE INDEX "Permission_module_idx" ON "Permission"("module");
CREATE INDEX "Permission_parentId_idx" ON "Permission"("parentId");
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Permission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
