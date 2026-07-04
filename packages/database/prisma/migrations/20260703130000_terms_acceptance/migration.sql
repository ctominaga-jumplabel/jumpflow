-- Gate de Termos de Uso (EP-M08). Aditivo e seguro: nova tabela, sem tocar em
-- estrutura existente. Um registro por versao de Termos aceita por usuario;
-- unico por (userId, termsVersion) para idempotencia (reaceitar nao duplica).
-- FK para User com ON DELETE CASCADE: remover o usuario apaga seus aceites.
--
-- IMPORTANTE: o motor de migrate do Prisma TRAVA no pooler do Supabase; esta
-- migration deve ser aplicada pelo OPS via o mecanismo usado no repo
-- (PrismaClient.$executeRawUnsafe + registro manual em _prisma_migrations com
-- sha256). Este migration.sql e a fonte canonica.

-- CreateTable
CREATE TABLE "TermsAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TermsAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TermsAcceptance_userId_idx" ON "TermsAcceptance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TermsAcceptance_userId_termsVersion_key" ON "TermsAcceptance"("userId", "termsVersion");

-- AddForeignKey
ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
