-- Persiste o tipo de oportunidade de origem no CRM-Jumplabel em Project.
-- Aditivo e seguro: novo enum + nova coluna nullable (projetos manuais/existentes
-- ficam com opportunityType = NULL). Nenhuma linha existente e afetada.
-- Aplicar com `npm run db:deploy` ANTES de mergear na main (gate de deploy).

-- CreateEnum
CREATE TYPE "ProjectOpportunityType" AS ENUM ('PROJECT', 'ALLOCATION', 'SQUAD', 'LICENSING', 'BPO', 'SUPPORT', 'OTHER');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "opportunityType" "ProjectOpportunityType";
