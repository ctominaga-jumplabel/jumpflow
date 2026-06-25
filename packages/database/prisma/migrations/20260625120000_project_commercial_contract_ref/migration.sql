-- ADR 0002 Fase 1: referência do contrato comercial no projeto.
-- Aditivo: coluna nullable. Ausência => alerta COMMERCIAL_CONTRACT_MISSING.
-- Aplicar com `npm run db:deploy` ANTES de mergear na main.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "commercialContractRef" TEXT;
