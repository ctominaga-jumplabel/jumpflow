-- Aprovacao automatica: flag `active` nas regras (projeto e consultor) para
-- permitir Inativar/Reativar sem perder a configuracao. Aditivo e seguro:
-- coluna NOT NULL com default true (regras existentes seguem ativas).

-- AlterTable
ALTER TABLE "ProjectAutoApprovalRule" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ConsultantAutoApprovalRule" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
