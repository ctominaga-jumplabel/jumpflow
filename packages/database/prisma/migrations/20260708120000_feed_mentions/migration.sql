-- Feed social interno (Melhoria #5) — MENCOES (@usuario). Aditivo e seguro:
-- nova tabela FeedMention + novo valor no enum NotificationEvent. Nao toca nada
-- existente.
--
-- FeedMention espelha FeedReaction: XOR `(postId IS NOT NULL) <> (commentId IS
-- NOT NULL)` (mencao aponta para um post OU um comentario) + indices unicos
-- PARCIAIS (um usuario mencionado no maximo uma vez por post e por comentario).
-- O @@unique do Prisma nao expressa o WHERE parcial, entao vive so aqui no SQL.
-- onDelete Cascade em todas as FKs: a mencao some com o usuario/post/comentario.
--
-- IMPORTANTE: o motor de migrate do Prisma TRAVA no pooler do Supabase, entao
-- esta migration e aplicada via PrismaClient.$executeRawUnsafe pelo script
-- packages/database/scripts/migrate-feed-mentions.mjs (dry-run por padrao,
-- --apply para executar, registro manual em _prisma_migrations com sha256).
-- Este migration.sql e a fonte canonica (e o que o sha256 verifica).

-- AlterEnum: novo evento para notificar o usuario mencionado.
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'FEED_MENTIONED';

-- CreateTable
CREATE TABLE "FeedMention" (
    "id" TEXT NOT NULL,
    "mentionedUserId" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedMention_pkey" PRIMARY KEY ("id"),
    -- XOR: a mencao aponta para um post OU um comentario, nunca os dois nem nenhum.
    CONSTRAINT "FeedMention_target_xor" CHECK (("postId" IS NOT NULL) <> ("commentId" IS NOT NULL))
);

-- CreateIndex
CREATE INDEX "FeedMention_postId_idx" ON "FeedMention"("postId");

-- CreateIndex
CREATE INDEX "FeedMention_commentId_idx" ON "FeedMention"("commentId");

-- CreateIndex
CREATE INDEX "FeedMention_mentionedUserId_idx" ON "FeedMention"("mentionedUserId");

-- Idempotencia da mencao (indices unicos PARCIAIS): um usuario e mencionado no
-- maximo uma vez por post e uma vez por comentario. Parciais (WHERE ... IS NOT
-- NULL) porque a coluna alvo oposta e nula.
-- CreateIndex
CREATE UNIQUE INDEX "FeedMention_user_post_key" ON "FeedMention"("mentionedUserId", "postId") WHERE "postId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "FeedMention_user_comment_key" ON "FeedMention"("mentionedUserId", "commentId") WHERE "commentId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "FeedMention" ADD CONSTRAINT "FeedMention_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedMention" ADD CONSTRAINT "FeedMention_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedMention" ADD CONSTRAINT "FeedMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "FeedComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
