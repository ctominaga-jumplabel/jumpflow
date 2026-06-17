-- Despesas por NF: tipo de lancamento (categoria) e agrupamento por NF/lote.
-- Migracao puramente aditiva: novo enum ExpenseCategory, duas colunas nullable
-- em Expense e um indice. Nenhuma coluna existente e alterada/removida, entao e
-- segura para os dados atuais (linhas existentes ficam com category/groupId NULL).

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('MILEAGE_REIMBURSEMENT', 'AIR_TICKET', 'BUS_TICKET', 'CERTIFICATION', 'ACCOUNTING', 'RIDE_SHARE', 'COURSES_TRAINING', 'LODGING', 'POSTAGE', 'MEALS', 'PERIPHERALS', 'TOLL', 'PARKING');

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "category" "ExpenseCategory";
ALTER TABLE "Expense" ADD COLUMN "groupId" TEXT;

-- CreateIndex
CREATE INDEX "Expense_consultantId_groupId_idx" ON "Expense"("consultantId", "groupId");
