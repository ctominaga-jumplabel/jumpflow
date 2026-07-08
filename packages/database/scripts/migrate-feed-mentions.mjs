// Deploy script for migration 20260708120000_feed_mentions.
//
// Melhoria #5 (MENCOES): tabela FeedMention (@usuario em post/comentario) + novo
// valor no enum NotificationEvent (FEED_MENTIONED) para notificar o mencionado.
//
// WHY THIS SCRIPT EXISTS: the Prisma migrate engine HANGS on the Supabase
// connection pooler, so we cannot `prisma migrate deploy` against prod. We apply
// each statement via PrismaClient.$executeRawUnsafe and then register the
// migration manually in `_prisma_migrations` (same pattern as the RBAC,
// notification, operation-closing, oncall-into-timeentry and feed-social/
// feed-notification-events migrations).
//
// SAFE TO RE-RUN: every statement is idempotent (ADD VALUE IF NOT EXISTS, CREATE
// TABLE/INDEX IF NOT EXISTS, CHECK/FK guarded by pg_constraint lookups). ADD
// VALUE cannot run inside an explicit BEGIN/COMMIT in older Postgres, so we never
// wrap these in $transaction — $executeRawUnsafe runs each in its own implicit
// transaction.
//
// CANONICAL SQL: prisma/migrations/20260708120000_feed_mentions/migration.sql is
// the source of truth (and what the sha256 checksum verifies). The STATEMENTS
// below are the idempotent equivalent applied one-by-one through the pooler.
//
// Usage (NEVER against prod in this step):
//   node packages/database/scripts/migrate-feed-mentions.mjs          (dry run)
//   node packages/database/scripts/migrate-feed-mentions.mjs --apply  (execute)
//
// Requires DATABASE_URL / DIRECT_URL in the environment (root .env must be
// loaded manually on this machine — see MEMORY db-migration-not-applied).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_NAME = "20260708120000_feed_mentions";
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

// Idempotent statements, in dependency order: enum value -> table -> check ->
// indexes -> foreign keys. $executeRawUnsafe runs one statement at a time.
const STATEMENTS = [
  // --- 1. Enum value --------------------------------------------------------
  `ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'FEED_MENTIONED'`,

  // --- 2. Table -------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS "FeedMention" (
     "id" TEXT NOT NULL,
     "mentionedUserId" TEXT NOT NULL,
     "postId" TEXT,
     "commentId" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "FeedMention_pkey" PRIMARY KEY ("id")
   )`,
  // CHECK XOR added separately so it stays idempotent on re-run.
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'FeedMention_target_xor'
     ) THEN
       ALTER TABLE "FeedMention"
         ADD CONSTRAINT "FeedMention_target_xor"
         CHECK (("postId" IS NOT NULL) <> ("commentId" IS NOT NULL));
     END IF;
   END $$`,

  // --- 3. Indexes -----------------------------------------------------------
  `CREATE INDEX IF NOT EXISTS "FeedMention_postId_idx" ON "FeedMention"("postId")`,
  `CREATE INDEX IF NOT EXISTS "FeedMention_commentId_idx" ON "FeedMention"("commentId")`,
  `CREATE INDEX IF NOT EXISTS "FeedMention_mentionedUserId_idx" ON "FeedMention"("mentionedUserId")`,
  // Partial unique indexes: one mention per user per post and per comment.
  `CREATE UNIQUE INDEX IF NOT EXISTS "FeedMention_user_post_key" ON "FeedMention"("mentionedUserId", "postId") WHERE "postId" IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FeedMention_user_comment_key" ON "FeedMention"("mentionedUserId", "commentId") WHERE "commentId" IS NOT NULL`,

  // --- 4. Foreign keys ------------------------------------------------------
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FeedMention_mentionedUserId_fkey') THEN
       ALTER TABLE "FeedMention" ADD CONSTRAINT "FeedMention_mentionedUserId_fkey"
         FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FeedMention_postId_fkey') THEN
       ALTER TABLE "FeedMention" ADD CONSTRAINT "FeedMention_postId_fkey"
         FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FeedMention_commentId_fkey') THEN
       ALTER TABLE "FeedMention" ADD CONSTRAINT "FeedMention_commentId_fkey"
         FOREIGN KEY ("commentId") REFERENCES "FeedComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
   END $$`,
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

async function tableExists(name) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT to_regclass($1)::text AS reg`,
    `public."${name}"`,
  );
  return Array.isArray(rows) && rows[0] && rows[0].reg !== null;
}

async function enumHasMentioned() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT 1
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'NotificationEvent' AND e.enumlabel = 'FEED_MENTIONED'`,
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function report(label) {
  const present = {
    FeedMention: await tableExists("FeedMention"),
    "NotificationEvent.FEED_MENTIONED": await enumHasMentioned(),
  };
  console.log(`\n[${label}] feed mentions objects present`);
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
