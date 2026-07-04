// Deploy script para as 3 migrations do PR "melhorias-plataforma" (EP-M06/M08/M09):
//   - 20260703130000_terms_acceptance        (tabela TermsAcceptance)
//   - 20260703140000_consultant_curriculum   (bio em Consultant + ConsultantCurriculumSnapshot)
//   - 20260703120000_consultant_restricted_nav (data: restringe matriz do CONSULTANT)
//
// WHY THIS SCRIPT EXISTS: o motor de migrate do Prisma TRAVA no pooler do
// Supabase, entao nao usamos `prisma migrate deploy` contra prod. Aplicamos cada
// statement via PrismaClient.$executeRawUnsafe e registramos manualmente em
// `_prisma_migrations` (mesmo padrao de migrate-checkpoint-intelligence.mjs).
//
// SAFE TO RE-RUN: todo statement e idempotente (CREATE TABLE/INDEX IF NOT
// EXISTS, ADD COLUMN IF NOT EXISTS, FK guardada por pg_constraint, e o UPDATE de
// dados converge — reaplicar so re-zera as mesmas celulas). O "before" report
// tolera tabelas/colunas ainda inexistentes.
//
// CANONICAL SQL: cada prisma/migrations/<name>/migration.sql e a fonte de
// verdade (e o que o sha256 registrado verifica). Os STATEMENTS abaixo sao o
// equivalente idempotente aplicado um a um pelo pooler.
//
// Usage:
//   node packages/database/scripts/migrate-melhorias-plataforma.mjs           (dry run)
//   node packages/database/scripts/migrate-melhorias-plataforma.mjs --apply   (executa)
//
// Requer DATABASE_URL no ambiente (na maquina local: DATABASE_URL=$DIRECT_URL,
// o session pooler — ver MEMORY db-migration-not-applied).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "prisma", "migrations");
const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

// Cada migration: nome (= pasta) + statements idempotentes em ordem de dependencia.
const MIGRATIONS = [
  {
    name: "20260703130000_terms_acceptance",
    statements: [
      `CREATE TABLE IF NOT EXISTS "TermsAcceptance" (
         "id" TEXT NOT NULL,
         "userId" TEXT NOT NULL,
         "termsVersion" TEXT NOT NULL,
         "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "TermsAcceptance_pkey" PRIMARY KEY ("id")
       )`,
      `CREATE INDEX IF NOT EXISTS "TermsAcceptance_userId_idx" ON "TermsAcceptance"("userId")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "TermsAcceptance_userId_termsVersion_key" ON "TermsAcceptance"("userId", "termsVersion")`,
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TermsAcceptance_userId_fkey') THEN
           ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_userId_fkey"
             FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
         END IF;
       END $$`,
    ],
  },
  {
    name: "20260703140000_consultant_curriculum",
    statements: [
      `ALTER TABLE "Consultant" ADD COLUMN IF NOT EXISTS "curriculumHeadline" TEXT`,
      `ALTER TABLE "Consultant" ADD COLUMN IF NOT EXISTS "curriculumSummary" TEXT`,
      `CREATE TABLE IF NOT EXISTS "ConsultantCurriculumSnapshot" (
         "id" TEXT NOT NULL,
         "consultantId" TEXT NOT NULL,
         "content" JSONB NOT NULL,
         "generatedByUserId" TEXT,
         "pdfStorageKey" TEXT,
         "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT "ConsultantCurriculumSnapshot_pkey" PRIMARY KEY ("id")
       )`,
      `CREATE INDEX IF NOT EXISTS "ConsultantCurriculumSnapshot_consultantId_createdAt_idx" ON "ConsultantCurriculumSnapshot"("consultantId", "createdAt")`,
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConsultantCurriculumSnapshot_consultantId_fkey') THEN
           ALTER TABLE "ConsultantCurriculumSnapshot" ADD CONSTRAINT "ConsultantCurriculumSnapshot_consultantId_fkey"
             FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
         END IF;
       END $$`,
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ConsultantCurriculumSnapshot_generatedByUserId_fkey') THEN
           ALTER TABLE "ConsultantCurriculumSnapshot" ADD CONSTRAINT "ConsultantCurriculumSnapshot_generatedByUserId_fkey"
             FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
         END IF;
       END $$`,
    ],
  },
  {
    name: "20260703120000_consultant_restricted_nav",
    statements: [
      // Data migration idempotente: zera as celulas do CONSULTANT fora dos 6 codes.
      `UPDATE "RolePermission" AS rp
         SET "canView" = false, "canCreate" = false, "canEdit" = false, "canDelete" = false
       FROM "Role" AS r, "Permission" AS p
       WHERE rp."roleId" = r.id
         AND rp."permissionId" = p.id
         AND r."key" = 'CONSULTANT'
         AND p."code" NOT IN ('FEED','HORAS','DESPESAS','SKILLS','UNIVERSIDADE','CERTIFICADOS')`,
    ],
  },
];

function checksumOf(name) {
  const path = join(MIGRATIONS_DIR, name, "migration.sql");
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function safeQueryRow(sql, ...params) {
  try {
    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    return Array.isArray(rows) ? (rows[0] ?? null) : null;
  } catch (err) {
    const code = err?.code ?? err?.meta?.code;
    if (code === "42P01" || code === "42703") return null; // undefined_table / undefined_column
    throw err;
  }
}

async function alreadyRegistered(name) {
  const row = await safeQueryRow(
    `SELECT 1 AS ok FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL`,
    name,
  );
  return row !== null;
}

async function tableExists(name) {
  const row = await safeQueryRow(`SELECT to_regclass($1)::text AS reg`, `public."${name}"`);
  return row != null && row.reg !== null;
}

async function report(label) {
  const termsTable = await tableExists("TermsAcceptance");
  const snapTable = await tableExists("ConsultantCurriculumSnapshot");
  const bioCols = await safeQueryRow(
    `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='Consultant' AND column_name IN ('curriculumHeadline','curriculumSummary')`,
  );
  const consultantExtra = await safeQueryRow(
    `SELECT count(*)::int AS n FROM "RolePermission" rp
       JOIN "Role" r ON rp."roleId"=r.id JOIN "Permission" p ON rp."permissionId"=p.id
     WHERE r."key"='CONSULTANT' AND rp."canView"=true
       AND p."code" NOT IN ('FEED','HORAS','DESPESAS','SKILLS','UNIVERSIDADE','CERTIFICADOS')`,
  );
  console.log(`\n[${label}]`);
  console.table({
    TermsAcceptance_table: termsTable,
    ConsultantCurriculumSnapshot_table: snapTable,
    consultant_bio_cols: bioCols?.n ?? "n/a",
    consultant_extra_views_outside_6: consultantExtra?.n ?? "n/a",
  });
}

async function registerMigration(mig) {
  const checksum = checksumOf(mig.name);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations"
       ("id","checksum","finished_at","migration_name","logs","rolled_back_at","started_at","applied_steps_count")
     VALUES (gen_random_uuid()::text, $1, now(), $2, NULL, NULL, now(), $3)
     ON CONFLICT ("id") DO NOTHING`,
    checksum,
    mig.name,
    mig.statements.length,
  );
}

async function main() {
  console.log(`melhorias-plataforma migrations — ${APPLY ? "APPLY" : "DRY RUN (sem --apply)"}`);
  for (const mig of MIGRATIONS) {
    console.log(`  ${mig.name}  sha256=${checksumOf(mig.name).slice(0, 12)}…  registered=${await alreadyRegistered(mig.name)}`);
  }
  await report("before");

  if (!APPLY) {
    console.log("\nDry run completo. Re-rode com --apply para executar.");
    return;
  }

  for (const mig of MIGRATIONS) {
    if (await alreadyRegistered(mig.name)) {
      console.log(`\n[skip] ${mig.name} ja registrada.`);
      continue;
    }
    console.log(`\nAplicando ${mig.name} (${mig.statements.length} statements)...`);
    for (let i = 0; i < mig.statements.length; i += 1) {
      process.stdout.write(`  [${i + 1}/${mig.statements.length}] ... `);
      await prisma.$executeRawUnsafe(mig.statements[i]);
      console.log("ok");
    }
    await registerMigration(mig);
    console.log(`  registrada em _prisma_migrations.`);
  }

  await report("after");
  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
