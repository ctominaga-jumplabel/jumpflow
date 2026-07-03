-- EP-M09 — Navegação restrita do Consultor (data migration, idempotente).
--
-- O banco de prod já foi semeado com o CONSULTANT vendo várias telas de
-- Talentos/Desenvolvimento. Esta migração de DADOS zera can_view/create/edit/
-- delete do papel CONSULTANT para TODA funcionalidade FORA do allow-list de 6
-- codes. É a contrapartida em prod da mudança no seed (seedRolePermissions),
-- que já nasce restrito para bancos novos.
--
-- NÃO cria linhas novas nem remove permissões de outros papéis. Só faz UPDATE
-- das células RolePermission já existentes do CONSULTANT. Rodar de novo é no-op
-- (as células já ficam todas false). Não altera edições manuais dos 6 codes
-- permitidos.
--
-- Allow-list (CONSULTANT PODE ver): FEED, HORAS, DESPESAS, SKILLS,
-- UNIVERSIDADE, CERTIFICADOS. O launcher "Início" (/app) não tem code e
-- permanece sempre visível.
--
-- IMPORTANTE (mesma nota das outras migrações deste repo): o motor de migrate
-- do Prisma TRAVA no pooler do Supabase. Aplicar via PrismaClient
-- $executeRawUnsafe (ou psql pela DIRECT_URL / session pooler) e registrar
-- manualmente em _prisma_migrations com o sha256 deste arquivo. Este
-- migration.sql é a fonte canônica.

UPDATE "RolePermission" AS rp
SET
  "canView"   = false,
  "canCreate" = false,
  "canEdit"   = false,
  "canDelete" = false
FROM "Role" AS r, "Permission" AS p
WHERE rp."roleId" = r.id
  AND rp."permissionId" = p.id
  AND r."key" = 'CONSULTANT'
  AND p."code" NOT IN (
    'FEED',
    'HORAS',
    'DESPESAS',
    'SKILLS',
    'UNIVERSIDADE',
    'CERTIFICADOS'
  );
