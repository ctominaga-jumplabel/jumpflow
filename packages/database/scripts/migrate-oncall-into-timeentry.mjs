// Deploy script for migration 20260626120000_oncall_into_timeentry.
//
// Melhoria #2 (FUNDACAO): Sobreaviso vira Atividade na tela de Horas.
//
// WHY THIS SCRIPT EXISTS: the Prisma migrate engine HANGS on the Supabase
// connection pooler, so we cannot `prisma migrate deploy` against prod. We
// apply each statement via PrismaClient.$executeRawUnsafe and then register the
// migration manually in `_prisma_migrations` (same pattern used for the RBAC,
// notification and operation-closing migrations).
//
// SAFE TO RE-RUN: every statement is idempotent (IF NOT EXISTS, ON CONFLICT DO
// NOTHING, deterministic ids mig-ocp-* / mig-oc-* / mig-ocatt-*).
//
// SCOPE GUARDS (product decisions, already validated):
//   * Only OnCallEntry WITH a project is migrated; orphans (projectId IS NULL)
//     stay in the legacy table and are listed in the orphan report at the end.
//   * Consultant is always paid the equivalent (hours x multiplier); multiplier
//     is copied verbatim.
//   * Billing respects the per-entry `billable` flag; migrated ON_CALL defaults
//     to billable = false (confirm with finance before the revenue/payment step).
//   * Migrated status is SUBMITTED (ON_CALL always requires human approval;
//     re-approval happens later in the UI, not here).
//
// Usage (NEVER against prod in this step):
//   node packages/database/scripts/migrate-oncall-into-timeentry.mjs --apply
// Without --apply it runs read-only checks and the orphan report only (dry run).
//
// Requires DATABASE_URL / DIRECT_URL in the environment (root .env must be
// loaded manually on this machine — see MEMORY db-migration-not-applied).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_NAME = "20260626120000_oncall_into_timeentry";
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

// Idempotent statements, in execution order. Kept in lock-step with
// migration.sql (DDL -> periods -> entries -> attachments). $executeRawUnsafe
// runs one statement at a time, so DO $$ ... $$ blocks are sent whole.
const STATEMENTS = [
  // --- 1. DDL ---------------------------------------------------------------
  `ALTER TABLE "TimeEntry"
     ADD COLUMN IF NOT EXISTS "multiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.00`,
  `CREATE TABLE IF NOT EXISTS "TimeEntryAttachment" (
     "id" TEXT NOT NULL,
     "timeEntryId" TEXT NOT NULL,
     "fileName" TEXT NOT NULL,
     "contentType" TEXT NOT NULL,
     "size" INTEGER NOT NULL,
     "storageBucket" TEXT NOT NULL,
     "storageKey" TEXT NOT NULL,
     "uploadedByUserId" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "TimeEntryAttachment_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "TimeEntryAttachment_timeEntryId_key"
     ON "TimeEntryAttachment"("timeEntryId")`,
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'TimeEntryAttachment_timeEntryId_fkey'
     ) THEN
       ALTER TABLE "TimeEntryAttachment"
         ADD CONSTRAINT "TimeEntryAttachment_timeEntryId_fkey"
         FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id")
         ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
   END $$`,

  // --- 2. Ensure TimesheetPeriod for each (consultant, ISO week) ------------
  `INSERT INTO "TimesheetPeriod" ("id", "consultantId", "startDate", "endDate", "status", "createdAt", "updatedAt")
   SELECT
     'mig-ocp-' || oc."consultantId" || '-' || to_char(wk.week_start, 'YYYYMMDD') AS id,
     oc."consultantId",
     wk.week_start,
     wk.week_start + INTERVAL '6 days',
     'DRAFT',
     CURRENT_TIMESTAMP,
     CURRENT_TIMESTAMP
   FROM "OnCallEntry" oc
   CROSS JOIN LATERAL (
     SELECT date_trunc('week', (oc."date" AT TIME ZONE 'UTC'))::date::timestamp AS week_start
   ) wk
   WHERE oc."projectId" IS NOT NULL
   GROUP BY oc."consultantId", wk.week_start
   ON CONFLICT ("consultantId", "startDate", "endDate") DO NOTHING`,

  // --- 3. Migrate OnCallEntry WITH project -> TimeEntry (ON_CALL) -----------
  `INSERT INTO "TimeEntry" (
     "id", "periodId", "consultantId", "projectId", "allocationId",
     "date", "hours", "multiplier", "activityType", "description",
     "billable", "status", "submittedAt", "createdAt", "updatedAt"
   )
   SELECT
     'mig-oc-' || oc."id" AS id,
     tp."id" AS "periodId",
     oc."consultantId",
     oc."projectId",
     NULL AS "allocationId",
     oc."date",
     oc."hours",
     oc."multiplier",
     'ON_CALL' AS "activityType",
     oc."note" AS "description",
     false AS "billable",
     'SUBMITTED' AS "status",
     oc."createdAt" AS "submittedAt",
     oc."createdAt",
     CURRENT_TIMESTAMP
   FROM "OnCallEntry" oc
   CROSS JOIN LATERAL (
     SELECT date_trunc('week', (oc."date" AT TIME ZONE 'UTC'))::date::timestamp AS week_start
   ) wk
   JOIN "TimesheetPeriod" tp
     ON tp."consultantId" = oc."consultantId"
    AND tp."startDate" = wk.week_start
   WHERE oc."projectId" IS NOT NULL
   ON CONFLICT ("id") DO NOTHING`,

  // --- 4. Migrate attachments (only for migrated entries) -------------------
  `INSERT INTO "TimeEntryAttachment" (
     "id", "timeEntryId", "fileName", "contentType", "size",
     "storageBucket", "storageKey", "uploadedByUserId", "createdAt"
   )
   SELECT
     'mig-ocatt-' || att."id" AS id,
     'mig-oc-' || att."onCallEntryId" AS "timeEntryId",
     att."fileName",
     att."contentType",
     att."size",
     att."storageBucket",
     att."storageKey",
     att."uploadedByUserId",
     att."createdAt"
   FROM "OnCallAttachment" att
   JOIN "OnCallEntry" oc ON oc."id" = att."onCallEntryId"
   WHERE oc."projectId" IS NOT NULL
   ON CONFLICT ("id") DO NOTHING`,
];

function checksumOf(path) {
  // Prisma stores a sha256 hex digest of the migration.sql in
  // _prisma_migrations.checksum.
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function alreadyRegistered() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL`,
    MIGRATION_NAME,
  );
  return Array.isArray(rows) && rows.length > 0;
}

// M1: TimeEntry.hours is Decimal(5,2) (max 999.99) while OnCallEntry.hours is
// Decimal(6,2) (max 9999.99). A source row with hours >= 1000 would overflow the
// INSERT (numeric field overflow) and abort the whole migration mid-flight. We
// detect this in the dry run and refuse to apply.
const MAX_TIMEENTRY_HOURS = 999.99;

/**
 * Returns the offending rows (hours > 999.99) among OnCallEntry WITH a project.
 * Empty array means safe to apply.
 */
async function overflowRisks() {
  return prisma.$queryRawUnsafe(
    `SELECT oc."id", oc."consultantId", oc."date", oc."hours"
       FROM "OnCallEntry" oc
      WHERE oc."projectId" IS NOT NULL
        AND oc."hours" > ${MAX_TIMEENTRY_HOURS}
      ORDER BY oc."hours" DESC`,
  );
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

async function report(label) {
  const [withProject] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM "OnCallEntry" WHERE "projectId" IS NOT NULL`,
  );
  const [orphans] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM "OnCallEntry" WHERE "projectId" IS NULL`,
  );
  const [migratedEntries] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM "TimeEntry" WHERE "id" LIKE 'mig-oc-%'`,
  );
  const [migratedAtt] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM "TimeEntryAttachment" WHERE "id" LIKE 'mig-ocatt-%'`,
  );
  const [onCallSum] = await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(round("hours" * "multiplier", 2)), 0)::float8 AS s
       FROM "OnCallEntry" WHERE "projectId" IS NOT NULL`,
  );
  const [entrySum] = await prisma.$queryRawUnsafe(
    `SELECT COALESCE(SUM(round("hours" * "multiplier", 2)), 0)::float8 AS s
       FROM "TimeEntry" WHERE "id" LIKE 'mig-oc-%'`,
  );
  // M2: OnCallEntry WITH a project that produced NO TimeEntry. After a successful
  // apply this MUST be 0; any positive count means rows were silently dropped
  // (e.g. a week/period mismatch) and is distinct from project-less orphans.
  const [unexpectedlyDiscarded] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n
       FROM "OnCallEntry" oc
      WHERE oc."projectId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "TimeEntry" te WHERE te."id" = 'mig-oc-' || oc."id"
        )`,
  );

  console.log(`\n[${label}] counts`);
  console.table({
    onCallWithProject: withProject.n,
    onCallOrphans: orphans.n,
    migratedTimeEntries: migratedEntries.n,
    migratedAttachments: migratedAtt.n,
  });
  console.log(
    `[${label}] effectiveHours sum  source(OnCall w/project)=${onCallSum.s}  ` +
      `dest(migrated TimeEntry)=${entrySum.s}  ` +
      `${onCallSum.s === entrySum.s ? "MATCH" : "MISMATCH"}`,
  );
  const discarded = unexpectedlyDiscarded.n;
  console.log(
    `[${label}] OnCall w/project NOT migrated (unexpectedly discarded, ` +
      `expected 0 after apply): ${discarded}` +
      (label === "after" && discarded > 0
        ? "  <-- INVESTIGATE: silent drop (week/period mismatch), NOT project-less orphans"
        : ""),
  );
}

async function orphanReport() {
  // OnCallAttachment is a separate table (1:1 by onCallEntryId), so we LEFT JOIN
  // it to flag which orphans also carry an attachment that will NOT be migrated.
  const rows = await prisma.$queryRawUnsafe(
    `SELECT oc."id", oc."consultantId", c."name" AS "consultantName",
            oc."date", oc."hours", oc."multiplier", oc."status",
            (att."id" IS NOT NULL) AS "hasAttachment"
       FROM "OnCallEntry" oc
       LEFT JOIN "Consultant" c ON c."id" = oc."consultantId"
       LEFT JOIN "OnCallAttachment" att ON att."onCallEntryId" = oc."id"
      WHERE oc."projectId" IS NULL
      ORDER BY oc."date" DESC`,
  );

  console.log(
    `\n[orphan report] OnCallEntry WITHOUT project (NOT migrated): ${rows.length}`,
  );
  if (rows.length > 0) {
    console.table(
      rows.map((r) => ({
        id: r.id,
        consultant: r.consultantName ?? r.consultantId,
        date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
        hours: String(r.hours),
        multiplier: String(r.multiplier),
        status: r.status,
        hasAttachment: r.hasAttachment,
      })),
    );
    console.log(
      "[orphan report] These stay in the legacy OnCallEntry table and require a " +
        "manual decision (assign a project then re-run, or leave as legacy).",
    );
  }
}

async function main() {
  console.log(
    `Migration ${MIGRATION_NAME} — ${APPLY ? "APPLY" : "DRY RUN (no --apply)"}`,
  );

  const registered = await alreadyRegistered();
  if (registered) {
    console.log("[info] migration already registered in _prisma_migrations.");
  }

  await report("before");
  await orphanReport();

  // M1 precondition: refuse to migrate if any source row would overflow
  // TimeEntry.hours Decimal(5,2). Checked in BOTH dry run and apply.
  const overflow = await overflowRisks();
  if (overflow.length > 0) {
    console.error(
      `\n[ABORT - M1] ${overflow.length} OnCallEntry com projeto tem hours > ` +
        `${MAX_TIMEENTRY_HOURS}, que estouraria TimeEntry.hours Decimal(5,2):`,
    );
    console.table(
      overflow.map((r) => ({
        id: r.id,
        consultantId: r.consultantId,
        date:
          r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
        hours: String(r.hours),
      })),
    );
    console.error(
      "[ABORT - M1] Resolva esses lancamentos (corrigir/dividir as horas) antes " +
        "de migrar. Nada foi aplicado.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `\n[M1] OK: nenhum OnCallEntry com projeto excede ${MAX_TIMEENTRY_HOURS}h.`,
  );

  if (!APPLY) {
    console.log(
      "\nDry run complete. Re-run with --apply to execute. " +
        "(Do NOT run against prod in this foundation step.)",
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
  await orphanReport();
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
