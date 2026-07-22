-- Onda 3 (P12). Politica de Reembolso: regras/limites por categoria de despesa.
-- NAO altera o enum ExpenseCategory nem a tabela Expense (mudanca 100% aditiva).
-- `category` NULL = regra Geral (vale para todas as categorias); um valor do
-- enum = regra especifica. `maxAgeDays`/`maxAmount` opcionais (NULL desliga a
-- checagem). Dado de governanca financeira: escrita restrita por RBAC na server
-- action e alteracoes auditadas (REIMBURSEMENT_POLICY_*).
-- Aplicar com `npm run db:deploy` ANTES de mergear na main (gate de deploy).

-- CreateTable
CREATE TABLE "ReimbursementPolicyRule" (
    "id" TEXT NOT NULL,
    "category" "ExpenseCategory",
    "maxAgeDays" INTEGER,
    "maxAmount" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReimbursementPolicyRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Uma regra por categoria concreta. Postgres trata NULLs como distintos, entao
-- este indice NAO restringe a regra Geral (category IS NULL) a uma unica linha.
CREATE UNIQUE INDEX "ReimbursementPolicyRule_category_key" ON "ReimbursementPolicyRule"("category");

-- CreateIndex (manual, fora do schema Prisma)
-- Reforca "no maximo UMA regra Geral": indice unico parcial sobre as linhas com
-- category NULL. A expressao (category IS NULL) e sempre TRUE nesse subconjunto,
-- logo so uma linha pode existir. A server action tambem checa por seguranca.
CREATE UNIQUE INDEX "ReimbursementPolicyRule_general_key" ON "ReimbursementPolicyRule"((category IS NULL)) WHERE "category" IS NULL;
