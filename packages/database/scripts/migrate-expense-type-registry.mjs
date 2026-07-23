// Deploy script for migration 20260722150000_expense_type_registry.
//
// Item 12: os tipos de despesa viram gerenciáveis (cadastro na tela Política de
// Reembolso). O enum `ExpenseCategory` vira a tabela `ExpenseType`; as colunas
// `Expense.category` e `ReimbursementPolicyRule.category` viram TEXT (mesmos
// códigos). Os 13 tipos nativos são semeados como `system=true`.
//
// WHY THIS SCRIPT: o migrate engine do Prisma TRAVA no pooler do Supabase, então
// aplicamos cada statement via PrismaClient.$executeRawUnsafe e registramos a
// migração manualmente em `_prisma_migrations` (mesmo padrão de
// migrate-oncall-into-timeentry / RBAC / notification / operation-closing).
//
// SAFE TO RE-RUN: todos os statements são idempotentes (IF NOT EXISTS, ON
// CONFLICT DO NOTHING, guardas DO $$ que checam o data_type / a existência do
// enum antes de alterar/dropar). Nenhum dado é perdido: os valores do enum já
// são exatamente os códigos, então `::text` os preserva.
//
// Uso (a partir da raiz do repo, com DIRECT_URL no ambiente):
//   node --env-file=.env packages/database/scripts/migrate-expense-type-registry.mjs           (dry run)
//   node --env-file=.env packages/database/scripts/migrate-expense-type-registry.mjs --apply   (aplica)

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_NAME = "20260722150000_expense_type_registry";
const MIGRATION_SQL_PATH = join(
  __dirname,
  "..",
  "prisma",
  "migrations",
  MIGRATION_NAME,
  "migration.sql",
);

const APPLY = process.argv.includes("--apply");

// O migrate engine trava no pooler, mas $executeRawUnsafe roda pela conexão
// DIRECT_URL (session pooler). Apontamos o client explicitamente para ela.
const DB_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!DB_URL) {
  console.error(
    "[abort] DIRECT_URL (ou DATABASE_URL) ausente. Rode com --env-file=.env a partir da raiz.",
  );
  process.exit(1);
}
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });

const EXPENSE_TYPES = [
  ["etype-mileage", "MILEAGE_REIMBURSEMENT", "Reembolso Quilometragem", 0],
  ["etype-air-ticket", "AIR_TICKET", "Passagem Aérea", 1],
  ["etype-bus-ticket", "BUS_TICKET", "Passagem Rodoviária", 2],
  ["etype-certification", "CERTIFICATION", "Certificação", 3],
  ["etype-accounting", "ACCOUNTING", "Accountech/Contabilidade", 4],
  ["etype-ride-share", "RIDE_SHARE", "Transporte/Uber", 5],
  ["etype-courses", "COURSES_TRAINING", "Cursos / Capacitação", 6],
  ["etype-lodging", "LODGING", "Hospedagem", 7],
  ["etype-postage", "POSTAGE", "Correio", 8],
  ["etype-meals", "MEALS", "Alimentação", 9],
  ["etype-peripherals", "PERIPHERALS", "Periféricos", 10],
  ["etype-toll", "TOLL", "Pedágio", 11],
  ["etype-parking", "PARKING", "Estacionamento", 12],
];

// Statements idempotentes, na ordem de execução. Em lock-step com migration.sql.
const STATEMENTS = [
  // 1. Tabela de registro
  `CREATE TABLE IF NOT EXISTS "ExpenseType" (
     "id" TEXT NOT NULL,
     "code" TEXT NOT NULL,
     "label" TEXT NOT NULL,
     "active" BOOLEAN NOT NULL DEFAULT true,
     "system" BOOLEAN NOT NULL DEFAULT false,
     "sortOrder" INTEGER NOT NULL DEFAULT 0,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "ExpenseType_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseType_code_key" ON "ExpenseType"("code")`,
  `CREATE INDEX IF NOT EXISTS "ExpenseType_active_sortOrder_idx" ON "ExpenseType"("active", "sortOrder")`,

  // 2. Semear os 13 nativos (system=true). ON CONFLICT no code preserva edições.
  `INSERT INTO "ExpenseType" ("id","code","label","active","system","sortOrder","createdAt","updatedAt")
   VALUES ${EXPENSE_TYPES.map(
     ([id, code, label, sort]) =>
       `('${id}','${code}','${label.replace(/'/g, "''")}',true,true,${sort},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
   ).join(",\n          ")}
   ON CONFLICT ("code") DO NOTHING`,

  // 3. Converter Expense.category (enum -> text) só se ainda for USER-DEFINED.
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'Expense' AND column_name = 'category'
         AND data_type = 'USER-DEFINED'
     ) THEN
       ALTER TABLE "Expense" ALTER COLUMN "category" TYPE TEXT USING "category"::text;
     END IF;
   END $$`,

  // 4. Idem para ReimbursementPolicyRule.category.
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'ReimbursementPolicyRule' AND column_name = 'category'
         AND data_type = 'USER-DEFINED'
     ) THEN
       ALTER TABLE "ReimbursementPolicyRule" ALTER COLUMN "category" TYPE TEXT USING "category"::text;
     END IF;
   END $$`,

  // 5. Dropar o enum agora sem uso (guardado: só se ainda existir).
  `DO $$
   BEGIN
     IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExpenseCategory') THEN
       DROP TYPE "ExpenseCategory";
     END IF;
   END $$`,
];

function checksumOf(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function alreadyRegistered() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL`,
    MIGRATION_NAME,
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function registerMigration() {
  const checksum = checksumOf(MIGRATION_SQL_PATH);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations"
       ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
     VALUES (gen_random_uuid()::text, $1, now(), $2, NULL, NULL, now(), $3)
     ON CONFLICT ("id") DO NOTHING`,
    checksum,
    MIGRATION_NAME,
    STATEMENTS.length,
  );
}

async function report(label) {
  const typeCount = await safe(
    `SELECT count(*)::int AS n FROM "ExpenseType"`,
    { n: 0 },
  );
  const systemCount = await safe(
    `SELECT count(*)::int AS n FROM "ExpenseType" WHERE "system" = true`,
    { n: 0 },
  );
  const [expenseCol] = await prisma.$queryRawUnsafe(
    `SELECT data_type FROM information_schema.columns
      WHERE table_name = 'Expense' AND column_name = 'category'`,
  );
  const [ruleCol] = await prisma.$queryRawUnsafe(
    `SELECT data_type FROM information_schema.columns
      WHERE table_name = 'ReimbursementPolicyRule' AND column_name = 'category'`,
  );
  const [enumRow] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM pg_type WHERE typname = 'ExpenseCategory'`,
  );
  // Depende de ExpenseType (ausente no "before"): guardado por safe().
  const orphanExpenses = await safe(
    `SELECT count(*)::int AS n FROM "Expense" e
      WHERE e."category" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "ExpenseType" t WHERE t."code" = e."category")`,
    { n: "(ExpenseType ausente)" },
  );

  console.log(`\n[${label}]`);
  console.table({
    expenseTypeRows: typeCount.n,
    systemTypeRows: systemCount.n,
    "Expense.category type": expenseCol?.data_type ?? "(missing)",
    "PolicyRule.category type": ruleCol?.data_type ?? "(missing)",
    enumExpenseCategoryExists: enumRow.n > 0,
    expensesWithUnknownCategoryCode: orphanExpenses.n,
  });
}

async function safe(sql, fallback) {
  try {
    const [row] = await prisma.$queryRawUnsafe(sql);
    return row ?? fallback;
  } catch (e) {
    const code = e?.meta?.code ?? e?.code;
    if (code === "42P01" || code === "42703") return fallback;
    throw e;
  }
}

async function main() {
  console.log(
    `Migration ${MIGRATION_NAME} — ${APPLY ? "APPLY" : "DRY RUN (no --apply)"}`,
  );
  const registered = await alreadyRegistered();
  if (registered) console.log("[info] já registrada em _prisma_migrations.");

  await report("before");

  if (!APPLY) {
    console.log("\nDry run completo. Re-rode com --apply para executar.");
    return;
  }

  console.log("\nAplicando statements...");
  for (let i = 0; i < STATEMENTS.length; i += 1) {
    process.stdout.write(`  [${i + 1}/${STATEMENTS.length}] ... `);
    await prisma.$executeRawUnsafe(STATEMENTS[i]);
    console.log("ok");
  }

  if (!registered) {
    await registerMigration();
    console.log("[info] registrada em _prisma_migrations.");
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
