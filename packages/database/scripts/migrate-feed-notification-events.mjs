// Deploy script for migration 20260626140000_feed_notification_events.
//
// Melhoria #5 (NOTIFICACOES): adiciona dois valores ao enum NotificationEvent
// (FEED_POST_REPLIED, FEED_CONTENT_REACTED) para o motor de notificacoes
// existente disparar respostas e reacoes do feed — sem canal novo.
//
// WHY THIS SCRIPT EXISTS: the Prisma migrate engine HANGS on the Supabase
// connection pooler, so we cannot `prisma migrate deploy` against prod. We apply
// each statement via PrismaClient.$executeRawUnsafe and then register the
// migration manually in `_prisma_migrations` (same pattern as the RBAC,
// notification, operation-closing, oncall-into-timeentry and feed-social
// migrations).
//
// SAFE TO RE-RUN: ALTER TYPE ... ADD VALUE IF NOT EXISTS is idempotent. Each
// statement runs in its own implicit transaction via $executeRawUnsafe (ADD
// VALUE cannot run inside an explicit BEGIN/COMMIT in older Postgres, so we
// never wrap these in $transaction).
//
// CANONICAL SQL: prisma/migrations/20260626140000_feed_notification_events/
// migration.sql is the source of truth (and what the sha256 checksum verifies).
//
// Usage (NEVER against prod in this step):
//   node packages/database/scripts/migrate-feed-notification-events.mjs          (dry run)
//   node packages/database/scripts/migrate-feed-notification-events.mjs --apply  (execute)
//
// Requires DATABASE_URL / DIRECT_URL in the environment (root .env must be
// loaded manually on this machine — see MEMORY db-migration-not-applied).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_NAME = "20260626140000_feed_notification_events";
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

// Idempotent statements. ADD VALUE IF NOT EXISTS is a no-op when present.
const STATEMENTS = [
  `ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'FEED_POST_REPLIED'`,
  `ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'FEED_CONTENT_REACTED'`,
];

const NEW_VALUES = ["FEED_POST_REPLIED", "FEED_CONTENT_REACTED"];

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

async function enumValues() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT e.enumlabel AS label
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'NotificationEvent'
      ORDER BY e.enumsortorder`,
  );
  return Array.isArray(rows) ? rows.map((r) => r.label) : [];
}

async function report(label) {
  const values = await enumValues();
  const present = {};
  for (const v of NEW_VALUES) present[v] = values.includes(v);
  console.log(`\n[${label}] NotificationEvent has new values`);
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
