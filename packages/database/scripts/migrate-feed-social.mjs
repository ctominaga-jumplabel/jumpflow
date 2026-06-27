// Deploy script for migration 20260626130000_feed_social.
//
// Melhoria #5 (FATIA 1): Feed social interno — schema base (posts, comentarios,
// reacoes, anexos de post), sem telas.
//
// WHY THIS SCRIPT EXISTS: the Prisma migrate engine HANGS on the Supabase
// connection pooler, so we cannot `prisma migrate deploy` against prod. We apply
// each statement via PrismaClient.$executeRawUnsafe and then register the
// migration manually in `_prisma_migrations` (same pattern as the RBAC,
// notification, operation-closing and oncall-into-timeentry migrations).
//
// SAFE TO RE-RUN: every statement is idempotent (CREATE TYPE guarded by a DO
// block, CREATE TABLE/INDEX IF NOT EXISTS, FK/CHECK guarded by pg_constraint
// lookups). Re-running adds nothing.
//
// CANONICAL SQL: prisma/migrations/20260626130000_feed_social/migration.sql is
// the source of truth (and what the sha256 checksum verifies). The STATEMENTS
// below are the idempotent equivalent applied one-by-one through the pooler.
//
// Usage (NEVER against prod in this step):
//   node packages/database/scripts/migrate-feed-social.mjs            (dry run)
//   node packages/database/scripts/migrate-feed-social.mjs --apply    (execute)
//
// Requires DATABASE_URL / DIRECT_URL in the environment (root .env must be
// loaded manually on this machine — see MEMORY db-migration-not-applied).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_NAME = "20260626130000_feed_social";
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
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FeedVisibility') THEN
       CREATE TYPE "FeedVisibility" AS ENUM ('PUBLIC_INTERNAL', 'AREA');
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FeedContentStatus') THEN
       CREATE TYPE "FeedContentStatus" AS ENUM ('VISIBLE', 'DELETED_BY_AUTHOR', 'REMOVED_BY_MODERATION');
     END IF;
   END $$`,

  // --- 2. Tables ------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS "FeedPost" (
     "id" TEXT NOT NULL,
     "authorUserId" TEXT,
     "body" TEXT NOT NULL,
     "visibility" "FeedVisibility" NOT NULL DEFAULT 'PUBLIC_INTERNAL',
     "areaScope" TEXT,
     "status" "FeedContentStatus" NOT NULL DEFAULT 'VISIBLE',
     "pinned" BOOLEAN NOT NULL DEFAULT false,
     "removedByUserId" TEXT,
     "removedAt" TIMESTAMP(3),
     "removalReason" TEXT,
     "editedAt" TIMESTAMP(3),
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL,
     CONSTRAINT "FeedPost_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE TABLE IF NOT EXISTS "FeedComment" (
     "id" TEXT NOT NULL,
     "postId" TEXT NOT NULL,
     "authorUserId" TEXT,
     "body" TEXT NOT NULL,
     "status" "FeedContentStatus" NOT NULL DEFAULT 'VISIBLE',
     "removedByUserId" TEXT,
     "removedAt" TIMESTAMP(3),
     "removalReason" TEXT,
     "editedAt" TIMESTAMP(3),
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL,
     CONSTRAINT "FeedComment_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE TABLE IF NOT EXISTS "FeedReaction" (
     "id" TEXT NOT NULL,
     "emoji" TEXT NOT NULL,
     "userId" TEXT NOT NULL,
     "postId" TEXT,
     "commentId" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "FeedReaction_pkey" PRIMARY KEY ("id")
   )`,
  // CHECK XOR added separately so it stays idempotent on re-run.
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'FeedReaction_target_xor'
     ) THEN
       ALTER TABLE "FeedReaction"
         ADD CONSTRAINT "FeedReaction_target_xor"
         CHECK (("postId" IS NOT NULL) <> ("commentId" IS NOT NULL));
     END IF;
   END $$`,
  `CREATE TABLE IF NOT EXISTS "FeedPostAttachment" (
     "id" TEXT NOT NULL,
     "postId" TEXT NOT NULL,
     "fileName" TEXT NOT NULL,
     "contentType" TEXT NOT NULL,
     "size" INTEGER NOT NULL,
     "storageBucket" TEXT NOT NULL,
     "storageKey" TEXT NOT NULL,
     "uploadedByUserId" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "FeedPostAttachment_pkey" PRIMARY KEY ("id")
   )`,

  // --- 3. Indexes -----------------------------------------------------------
  `CREATE INDEX IF NOT EXISTS "FeedPost_status_pinned_createdAt_idx" ON "FeedPost"("status", "pinned", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "FeedPost_visibility_areaScope_createdAt_idx" ON "FeedPost"("visibility", "areaScope", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "FeedPost_authorUserId_idx" ON "FeedPost"("authorUserId")`,
  `CREATE INDEX IF NOT EXISTS "FeedComment_postId_status_createdAt_idx" ON "FeedComment"("postId", "status", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "FeedComment_authorUserId_idx" ON "FeedComment"("authorUserId")`,
  `CREATE INDEX IF NOT EXISTS "FeedReaction_postId_idx" ON "FeedReaction"("postId")`,
  `CREATE INDEX IF NOT EXISTS "FeedReaction_commentId_idx" ON "FeedReaction"("commentId")`,
  `CREATE INDEX IF NOT EXISTS "FeedReaction_userId_idx" ON "FeedReaction"("userId")`,
  // Partial unique indexes for reaction idempotency (one user + emoji per
  // post and per comment). Partial because the opposite target column is NULL;
  // @@unique in Prisma cannot express the WHERE, so they live only here.
  `CREATE UNIQUE INDEX IF NOT EXISTS "FeedReaction_user_emoji_post_key" ON "FeedReaction"("userId", "emoji", "postId") WHERE "postId" IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FeedReaction_user_emoji_comment_key" ON "FeedReaction"("userId", "emoji", "commentId") WHERE "commentId" IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS "FeedPostAttachment_postId_idx" ON "FeedPostAttachment"("postId")`,
  `CREATE INDEX IF NOT EXISTS "FeedPostAttachment_uploadedByUserId_idx" ON "FeedPostAttachment"("uploadedByUserId")`,

  // --- 4. Foreign keys ------------------------------------------------------
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FeedPost_authorUserId_fkey') THEN
       ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_authorUserId_fkey"
         FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FeedComment_postId_fkey') THEN
       ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_postId_fkey"
         FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FeedComment_authorUserId_fkey') THEN
       ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_authorUserId_fkey"
         FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FeedReaction_userId_fkey') THEN
       ALTER TABLE "FeedReaction" ADD CONSTRAINT "FeedReaction_userId_fkey"
         FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FeedReaction_postId_fkey') THEN
       ALTER TABLE "FeedReaction" ADD CONSTRAINT "FeedReaction_postId_fkey"
         FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FeedReaction_commentId_fkey') THEN
       ALTER TABLE "FeedReaction" ADD CONSTRAINT "FeedReaction_commentId_fkey"
         FOREIGN KEY ("commentId") REFERENCES "FeedComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FeedPostAttachment_postId_fkey') THEN
       ALTER TABLE "FeedPostAttachment" ADD CONSTRAINT "FeedPostAttachment_postId_fkey"
         FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
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
    `SELECT to_regclass($1) AS reg`,
    `public."${name}"`,
  );
  return Array.isArray(rows) && rows[0] && rows[0].reg !== null;
}

async function report(label) {
  const tables = ["FeedPost", "FeedComment", "FeedReaction", "FeedPostAttachment"];
  const present = {};
  for (const t of tables) {
    present[t] = await tableExists(t);
  }
  console.log(`\n[${label}] feed tables present`);
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
