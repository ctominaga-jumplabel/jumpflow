// Deploy script for migration 20260627120000_checkpoint_intelligence.
//
// Melhoria #4 (FATIA 1): Checkpoint/1-on-1 + entidades para a IA extrair
// Skills/Oportunidades/Cases — schema base (Checkpoint, Opportunity, Case),
// sem telas nem codigo de app.
//
// WHY THIS SCRIPT EXISTS: the Prisma migrate engine HANGS on the Supabase
// connection pooler, so we cannot `prisma migrate deploy` against prod. We apply
// each statement via PrismaClient.$executeRawUnsafe and then register the
// migration manually in `_prisma_migrations` (same pattern as the RBAC,
// notification, operation-closing, oncall-into-timeentry and feed-social
// migrations).
//
// SAFE TO RE-RUN: every statement is idempotent (CREATE TYPE guarded by a DO
// block, CREATE TABLE/INDEX IF NOT EXISTS, FK guarded by pg_constraint lookups).
// Re-running adds nothing. The "before" report TOLERATES tables/columns that do
// not exist yet (catches 42P01 undefined_table / 42703 undefined_column) so a
// dry run on a fresh DB never crashes.
//
// CANONICAL SQL: prisma/migrations/20260627120000_checkpoint_intelligence/
// migration.sql is the source of truth (and what the sha256 checksum verifies).
// The STATEMENTS below are the idempotent equivalent applied one-by-one through
// the pooler.
//
// Usage (NEVER against prod in this step):
//   node packages/database/scripts/migrate-checkpoint-intelligence.mjs            (dry run)
//   node packages/database/scripts/migrate-checkpoint-intelligence.mjs --apply    (execute)
//
// Requires DATABASE_URL / DIRECT_URL in the environment (root .env must be
// loaded manually on this machine — see MEMORY db-migration-not-applied).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_NAME = "20260627120000_checkpoint_intelligence";
const MIGRATION_SQL_PATH = join(
  __dirname,
  "..",
  "prisma",
  "migrations",
  MIGRATION_NAME,
  "migration.sql",
);

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

// Idempotent statements, in dependency order: enums -> tables -> indexes ->
// foreign keys. $executeRawUnsafe runs one statement at a time, so each DO $$
// ... $$ block is sent whole.
const STATEMENTS = [
  // --- 1. Enums -------------------------------------------------------------
  // TranscriptionStatus is REUSED (already exists from the Feedback voice
  // increment) — it is intentionally NOT created here.
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CheckpointType') THEN
       CREATE TYPE "CheckpointType" AS ENUM ('ONE_ON_ONE', 'CHECKPOINT');
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CheckpointStatus') THEN
       CREATE TYPE "CheckpointStatus" AS ENUM ('DRAFT', 'RECORDED', 'EXTRACTED', 'ARCHIVED');
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CheckpointVisibility') THEN
       CREATE TYPE "CheckpointVisibility" AS ENUM ('PRIVATE', 'SHARED');
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CheckpointExtractionStatus') THEN
       CREATE TYPE "CheckpointExtractionStatus" AS ENUM ('NONE', 'PENDING', 'DONE', 'FAILED');
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CheckpointInsightStatus') THEN
       CREATE TYPE "CheckpointInsightStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DISMISSED');
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OpportunityKind') THEN
       CREATE TYPE "OpportunityKind" AS ENUM ('EXPANSION', 'UPSELL', 'RISK', 'REFERRAL', 'RENEWAL');
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OpportunityPriority') THEN
       CREATE TYPE "OpportunityPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CaseStage') THEN
       CREATE TYPE "CaseStage" AS ENUM ('DRAFT_INSIGHT', 'APPROVED', 'PUBLISHABLE');
     END IF;
   END $$`,

  // --- 2. Tables ------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS "Checkpoint" (
     "id" TEXT NOT NULL,
     "consultantId" TEXT NOT NULL,
     "managerUserId" TEXT,
     "relatedProjectId" TEXT,
     "type" "CheckpointType" NOT NULL,
     "occurredAt" TIMESTAMP(3) NOT NULL,
     "weekStart" TIMESTAMP(3),
     "weekEnd" TIMESTAMP(3),
     "title" TEXT,
     "notes" TEXT,
     "audioStorageKey" TEXT,
     "transcription" TEXT,
     "transcriptionStatus" "TranscriptionStatus" NOT NULL DEFAULT 'NONE',
     "extractionStatus" "CheckpointExtractionStatus" NOT NULL DEFAULT 'NONE',
     "extractedAt" TIMESTAMP(3),
     "status" "CheckpointStatus" NOT NULL DEFAULT 'DRAFT',
     "visibility" "CheckpointVisibility" NOT NULL DEFAULT 'PRIVATE',
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL,
     CONSTRAINT "Checkpoint_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE TABLE IF NOT EXISTS "Opportunity" (
     "id" TEXT NOT NULL,
     "sourceCheckpointId" TEXT,
     "consultantId" TEXT,
     "relatedClientId" TEXT,
     "relatedProjectId" TEXT,
     "kind" "OpportunityKind" NOT NULL,
     "title" TEXT NOT NULL,
     "description" TEXT,
     "priority" "OpportunityPriority" NOT NULL DEFAULT 'MEDIUM',
     "sourceQuote" TEXT,
     "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
     "status" "CheckpointInsightStatus" NOT NULL DEFAULT 'PENDING',
     "decidedByUserId" TEXT,
     "decidedAt" TIMESTAMP(3),
     "ownerUserId" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL,
     CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE TABLE IF NOT EXISTS "Case" (
     "id" TEXT NOT NULL,
     "sourceCheckpointId" TEXT,
     "consultantId" TEXT,
     "relatedClientId" TEXT,
     "relatedProjectId" TEXT,
     "title" TEXT NOT NULL,
     "summary" TEXT,
     "outcome" TEXT,
     "stage" "CaseStage" NOT NULL DEFAULT 'DRAFT_INSIGHT',
     "clientConsentState" TEXT,
     "sourceQuote" TEXT,
     "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
     "status" "CheckpointInsightStatus" NOT NULL DEFAULT 'PENDING',
     "decidedByUserId" TEXT,
     "decidedAt" TIMESTAMP(3),
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL,
     CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
   )`,

  // --- 3. Indexes -----------------------------------------------------------
  `CREATE INDEX IF NOT EXISTS "Checkpoint_consultantId_idx" ON "Checkpoint"("consultantId")`,
  `CREATE INDEX IF NOT EXISTS "Checkpoint_consultantId_occurredAt_idx" ON "Checkpoint"("consultantId", "occurredAt")`,
  `CREATE INDEX IF NOT EXISTS "Checkpoint_managerUserId_idx" ON "Checkpoint"("managerUserId")`,
  `CREATE INDEX IF NOT EXISTS "Checkpoint_status_idx" ON "Checkpoint"("status")`,
  `CREATE INDEX IF NOT EXISTS "Checkpoint_extractionStatus_idx" ON "Checkpoint"("extractionStatus")`,
  `CREATE INDEX IF NOT EXISTS "Opportunity_sourceCheckpointId_idx" ON "Opportunity"("sourceCheckpointId")`,
  `CREATE INDEX IF NOT EXISTS "Opportunity_relatedClientId_idx" ON "Opportunity"("relatedClientId")`,
  `CREATE INDEX IF NOT EXISTS "Opportunity_status_idx" ON "Opportunity"("status")`,
  `CREATE INDEX IF NOT EXISTS "Case_sourceCheckpointId_idx" ON "Case"("sourceCheckpointId")`,
  `CREATE INDEX IF NOT EXISTS "Case_relatedClientId_idx" ON "Case"("relatedClientId")`,
  `CREATE INDEX IF NOT EXISTS "Case_status_idx" ON "Case"("status")`,
  `CREATE INDEX IF NOT EXISTS "Case_stage_idx" ON "Case"("stage")`,

  // --- 4. Foreign keys ------------------------------------------------------
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Checkpoint_consultantId_fkey') THEN
       ALTER TABLE "Checkpoint" ADD CONSTRAINT "Checkpoint_consultantId_fkey"
         FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Checkpoint_managerUserId_fkey') THEN
       ALTER TABLE "Checkpoint" ADD CONSTRAINT "Checkpoint_managerUserId_fkey"
         FOREIGN KEY ("managerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Checkpoint_relatedProjectId_fkey') THEN
       ALTER TABLE "Checkpoint" ADD CONSTRAINT "Checkpoint_relatedProjectId_fkey"
         FOREIGN KEY ("relatedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Opportunity_sourceCheckpointId_fkey') THEN
       ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_sourceCheckpointId_fkey"
         FOREIGN KEY ("sourceCheckpointId") REFERENCES "Checkpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Opportunity_consultantId_fkey') THEN
       ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_consultantId_fkey"
         FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Opportunity_relatedClientId_fkey') THEN
       ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_relatedClientId_fkey"
         FOREIGN KEY ("relatedClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Opportunity_relatedProjectId_fkey') THEN
       ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_relatedProjectId_fkey"
         FOREIGN KEY ("relatedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Opportunity_decidedByUserId_fkey') THEN
       ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_decidedByUserId_fkey"
         FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Opportunity_ownerUserId_fkey') THEN
       ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_ownerUserId_fkey"
         FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Case_sourceCheckpointId_fkey') THEN
       ALTER TABLE "Case" ADD CONSTRAINT "Case_sourceCheckpointId_fkey"
         FOREIGN KEY ("sourceCheckpointId") REFERENCES "Checkpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Case_consultantId_fkey') THEN
       ALTER TABLE "Case" ADD CONSTRAINT "Case_consultantId_fkey"
         FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Case_relatedClientId_fkey') THEN
       ALTER TABLE "Case" ADD CONSTRAINT "Case_relatedClientId_fkey"
         FOREIGN KEY ("relatedClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Case_relatedProjectId_fkey') THEN
       ALTER TABLE "Case" ADD CONSTRAINT "Case_relatedProjectId_fkey"
         FOREIGN KEY ("relatedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Case_decidedByUserId_fkey') THEN
       ALTER TABLE "Case" ADD CONSTRAINT "Case_decidedByUserId_fkey"
         FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$`,
];

function checksumOf(path) {
  // Prisma stores a sha256 hex digest of the migration.sql in
  // _prisma_migrations.checksum.
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

// Run a SELECT that may reference a not-yet-existing table/column and tolerate
// it: 42P01 = undefined_table, 42703 = undefined_column. Returns null instead of
// throwing so the "before" report works on a fresh DB.
async function safeQueryRow(sql, ...params) {
  try {
    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    return Array.isArray(rows) ? (rows[0] ?? null) : null;
  } catch (err) {
    const code = err?.code ?? err?.meta?.code;
    if (code === "42P01" || code === "42703") return null;
    throw err;
  }
}

async function alreadyRegistered() {
  const row = await safeQueryRow(
    `SELECT 1 AS ok FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL`,
    MIGRATION_NAME,
  );
  return row !== null;
}

async function tableExists(name) {
  // Cast regclass to text: Prisma does not deserialize the regclass OID type.
  const row = await safeQueryRow(
    `SELECT to_regclass($1)::text AS reg`,
    `public."${name}"`,
  );
  return row != null && row.reg !== null;
}

async function report(label) {
  const tables = ["Checkpoint", "Opportunity", "Case"];
  const present = {};
  for (const t of tables) {
    present[t] = await tableExists(t);
  }
  console.log(`\n[${label}] checkpoint intelligence tables present`);
  console.table(present);
}

async function registerMigration() {
  // Manual insert into _prisma_migrations so `prisma migrate status` sees this
  // migration as applied (the migrate engine could not run it on the pooler).
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

async function main() {
  console.log(
    `Migration ${MIGRATION_NAME} — ${APPLY ? "APPLY" : "DRY RUN (no --apply)"}`,
  );
  console.log(`[info] migration.sql sha256 = ${checksumOf(MIGRATION_SQL_PATH)}`);

  const registered = await alreadyRegistered();
  if (registered) {
    console.log("[info] migration already registered in _prisma_migrations.");
  }

  await report("before");

  if (!APPLY) {
    console.log(
      `\nDry run complete (${STATEMENTS.length} statements ready). ` +
        "Re-run with --apply to execute. (Do NOT run against prod in this step.)",
    );
    return;
  }

  console.log("\nApplying statements...");
  for (let i = 0; i < STATEMENTS.length; i += 1) {
    const sql = STATEMENTS[i];
    process.stdout.write(`  [${i + 1}/${STATEMENTS.length}] ... `);
    await prisma.$executeRawUnsafe(sql);
    console.log("ok");
  }

  if (!registered) {
    await registerMigration();
    console.log("[info] registered migration in _prisma_migrations.");
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
