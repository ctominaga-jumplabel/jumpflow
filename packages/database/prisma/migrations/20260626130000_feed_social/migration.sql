-- Feed social interno (Melhoria #5, fatia 1). Aditivo e seguro: novos enums e
-- tabelas, sem tocar em estrutura existente. Autoria por User com onDelete
-- SetNull (preserva post/comentario quando o autor sai); soft delete por status.
--
-- IMPORTANTE: o motor de migrate do Prisma TRAVA no pooler do Supabase, entao
-- esta migration e aplicada via PrismaClient.$executeRawUnsafe pelo script
-- packages/database/scripts/migrate-feed-social.mjs (dry-run por padrao,
-- --apply para executar, registro manual em _prisma_migrations com sha256).
-- Este migration.sql e a fonte canonica (e o que o sha256 verifica).
--
-- v1 (decisoes de produto ja aprovadas):
--   * Visibilidade: so PUBLIC_INTERNAL ativa na UI; AREA fica modelado (desligado).
--   * Anexo SIM no POST (bucket privado + storageKey; URL sempre assinada).
--   * Pin: regra de app (moderadores, max 3), NAO schema.
--   * Reacao idempotente + XOR post/comentario: garantidos por CHECK + indices
--     unicos PARCIAIS abaixo (o @@unique do Prisma nao expressa o WHERE parcial).

-- CreateEnum
CREATE TYPE "FeedVisibility" AS ENUM ('PUBLIC_INTERNAL', 'AREA');

-- CreateEnum
CREATE TYPE "FeedContentStatus" AS ENUM ('VISIBLE', 'DELETED_BY_AUTHOR', 'REMOVED_BY_MODERATION');

-- CreateTable
CREATE TABLE "FeedPost" (
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
);

-- CreateTable
CREATE TABLE "FeedComment" (
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
);

-- CreateTable
CREATE TABLE "FeedReaction" (
    "id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedReaction_pkey" PRIMARY KEY ("id"),
    -- XOR: a reacao aponta para um post OU um comentario, nunca os dois nem nenhum.
    CONSTRAINT "FeedReaction_target_xor" CHECK (("postId" IS NOT NULL) <> ("commentId" IS NOT NULL))
);

-- CreateTable
CREATE TABLE "FeedPostAttachment" (
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
);

-- CreateIndex
CREATE INDEX "FeedPost_status_pinned_createdAt_idx" ON "FeedPost"("status", "pinned", "createdAt");

-- CreateIndex
CREATE INDEX "FeedPost_visibility_areaScope_createdAt_idx" ON "FeedPost"("visibility", "areaScope", "createdAt");

-- CreateIndex
CREATE INDEX "FeedPost_authorUserId_idx" ON "FeedPost"("authorUserId");

-- CreateIndex
CREATE INDEX "FeedComment_postId_status_createdAt_idx" ON "FeedComment"("postId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "FeedComment_authorUserId_idx" ON "FeedComment"("authorUserId");

-- CreateIndex
CREATE INDEX "FeedReaction_postId_idx" ON "FeedReaction"("postId");

-- CreateIndex
CREATE INDEX "FeedReaction_commentId_idx" ON "FeedReaction"("commentId");

-- CreateIndex
CREATE INDEX "FeedReaction_userId_idx" ON "FeedReaction"("userId");

-- Idempotencia de reacao (indices unicos PARCIAIS): um usuario reage com um
-- mesmo emoji no maximo uma vez por post e uma vez por comentario. Sao parciais
-- (WHERE ... IS NOT NULL) porque a coluna alvo oposta e nula; o @@unique do
-- Prisma nao expressa esse WHERE, por isso vivem so aqui no SQL.
-- CreateIndex
CREATE UNIQUE INDEX "FeedReaction_user_emoji_post_key" ON "FeedReaction"("userId", "emoji", "postId") WHERE "postId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "FeedReaction_user_emoji_comment_key" ON "FeedReaction"("userId", "emoji", "commentId") WHERE "commentId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "FeedPostAttachment_postId_idx" ON "FeedPostAttachment"("postId");

-- CreateIndex
CREATE INDEX "FeedPostAttachment_uploadedByUserId_idx" ON "FeedPostAttachment"("uploadedByUserId");

-- AddForeignKey
ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedReaction" ADD CONSTRAINT "FeedReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedReaction" ADD CONSTRAINT "FeedReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedReaction" ADD CONSTRAINT "FeedReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "FeedComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPostAttachment" ADD CONSTRAINT "FeedPostAttachment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
