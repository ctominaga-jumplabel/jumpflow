-- Consultores (Story 1): tipo de contratacao no perfil, dados pessoais/contato
-- ampliados, campos PJ de empresa e anexos de documentos.
-- Migracao puramente aditiva: novos enums, colunas nullable em tabelas
-- existentes e uma nova tabela ConsultantDocument. Nenhuma coluna existente e
-- alterada/removida, entao e segura para os dados atuais.

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'NON_BINARY', 'OTHER', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'STABLE_UNION', 'DIVORCED', 'WIDOWED', 'SEPARATED', 'OTHER');

-- CreateEnum
CREATE TYPE "ConsultantDocumentType" AS ENUM ('PROOF_OF_ADDRESS', 'RG', 'CPF', 'CTPS', 'CERTIFICATE', 'EMPLOYMENT_CONTRACT', 'ASO_ADMISSIONAL', 'SERVICE_CONTRACT', 'CNPJ_CARD', 'ARTICLES_OF_ASSOCIATION', 'NEGATIVE_CERTIFICATE', 'BANK_PROOF', 'OTHER');

-- AlterTable
ALTER TABLE "Consultant" ADD COLUMN "contractType" "ConsultantContractType";

-- AlterTable
ALTER TABLE "ConsultantPersonalInfo" ADD COLUMN "socialName" TEXT;
ALTER TABLE "ConsultantPersonalInfo" ADD COLUMN "photoStorageKey" TEXT;
ALTER TABLE "ConsultantPersonalInfo" ADD COLUMN "rg" TEXT;
ALTER TABLE "ConsultantPersonalInfo" ADD COLUMN "gender" "Gender";
ALTER TABLE "ConsultantPersonalInfo" ADD COLUMN "maritalStatus" "MaritalStatus";
ALTER TABLE "ConsultantPersonalInfo" ADD COLUMN "nationality" TEXT;
ALTER TABLE "ConsultantPersonalInfo" ADD COLUMN "personalEmail" TEXT;
ALTER TABLE "ConsultantPersonalInfo" ADD COLUMN "corporateEmail" TEXT;
ALTER TABLE "ConsultantPersonalInfo" ADD COLUMN "mobilePhone" TEXT;
ALTER TABLE "ConsultantPersonalInfo" ADD COLUMN "emergencyPhone" TEXT;
ALTER TABLE "ConsultantPersonalInfo" ADD COLUMN "emergencyContact" TEXT;

-- AlterTable
ALTER TABLE "ConsultantCompanyInfo" ADD COLUMN "stateRegistration" TEXT;
ALTER TABLE "ConsultantCompanyInfo" ADD COLUMN "cnaePrimary" TEXT;

-- CreateTable
CREATE TABLE "ConsultantDocument" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "type" "ConsultantDocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsultantDocument_consultantId_type_idx" ON "ConsultantDocument"("consultantId", "type");

-- CreateIndex
CREATE INDEX "ConsultantDocument_uploadedByUserId_idx" ON "ConsultantDocument"("uploadedByUserId");

-- AddForeignKey
ALTER TABLE "ConsultantDocument" ADD CONSTRAINT "ConsultantDocument_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantDocument" ADD CONSTRAINT "ConsultantDocument_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
