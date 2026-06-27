-- Feed social interno (Melhoria #5) — NOTIFICACOES.
-- Adiciona dois valores ao enum NotificationEvent para reaproveitar o motor de
-- notificacoes existente (sem canal novo): resposta a post e reacao a conteudo.
--
-- Postgres so permite ADICIONAR valores a um enum (ALTER TYPE ... ADD VALUE).
-- Aditivo e seguro: nao toca nada existente. IF NOT EXISTS torna re-rodar no-op.
--
-- IMPORTANTE: o motor de migrate do Prisma TRAVA no pooler do Supabase, entao
-- esta migration e aplicada via PrismaClient.$executeRawUnsafe pelo script
-- packages/database/scripts/migrate-feed-notification-events.mjs (dry-run por
-- padrao, --apply para executar, registro manual em _prisma_migrations com
-- sha256). Este migration.sql e a fonte canonica (e o que o sha256 verifica).
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'FEED_POST_REPLIED';
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'FEED_CONTENT_REACTED';
