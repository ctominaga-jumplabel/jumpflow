CREATE TYPE "BillingChargeType" AS ENUM ('HOURLY', 'MONTHLY', 'CONSULTANT_HOURLY', 'FIXED');
CREATE TYPE "BillingRoundingRule" AS ENUM ('NONE', 'NEAREST_15_MINUTES', 'NEAREST_30_MINUTES', 'NEAREST_HOUR', 'CEIL_15_MINUTES', 'CEIL_30_MINUTES', 'CEIL_HOUR');
CREATE TYPE "InvoiceKind" AS ENUM ('SERVICE', 'PRODUCT');
CREATE TYPE "RevenueClosingStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'READY_TO_CLOSE', 'CLOSED', 'INVOICED', 'CANCELLED');
CREATE TYPE "ConsultantContractType" AS ENUM ('CLT', 'PJ', 'CLT_FLEX');
CREATE TYPE "BankAccountKind" AS ENUM ('CLT', 'PJ', 'PRIMARY');
CREATE TYPE "BenefitType" AS ENUM ('MEAL_VOUCHER', 'FOOD_VOUCHER', 'TRANSPORTATION_VOUCHER', 'BENEFIT_CARD', 'OTHER');
CREATE TYPE "ConsultantPaymentStatus" AS ENUM ('OPEN', 'WAITING_FOR_INVOICE', 'INVOICE_RECEIVED', 'INVOICE_VALIDATED', 'APPROVED_FOR_PAYMENT', 'SENT_TO_BANK', 'PROCESSED', 'PAID', 'CANCELLED');
CREATE TYPE "FiscalDocumentStatus" AS ENUM ('DRAFT', 'REQUESTED', 'ISSUED', 'FAILED', 'CANCELLED');
CREATE TYPE "FiscalDocumentKind" AS ENUM ('NFSE', 'PRODUCT_INVOICE');
CREATE TYPE "IntegrationProviderKind" AS ENUM ('CNPJ', 'CEP', 'ENTRA_ID', 'SAO_PAULO_NFSE', 'EMAIL', 'STORAGE', 'BANK', 'ERP');
CREATE TYPE "IntegrationEventStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'RETRYING');

CREATE TABLE "BillingType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chargeType" "BillingChargeType" NOT NULL,
    "roundingRule" "BillingRoundingRule" NOT NULL DEFAULT 'NONE',
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingType_name_key" ON "BillingType"("name");

ALTER TABLE "Client"
ADD COLUMN "logoUrl" TEXT,
ADD COLUMN "billingTypeId" TEXT,
ADD COLUMN "defaultHourlyRate" DECIMAL(12,2),
ADD COLUMN "monthlyFee" DECIMAL(12,2),
ADD COLUMN "hourLimit" DECIMAL(10,2),
ADD COLUMN "roundingRule" "BillingRoundingRule" NOT NULL DEFAULT 'NONE',
ADD COLUMN "billingDay" INTEGER,
ADD COLUMN "dueDay" INTEGER,
ADD COLUMN "invoiceKind" "InvoiceKind" NOT NULL DEFAULT 'SERVICE',
ADD COLUMN "municipality" TEXT,
ADD COLUMN "issRate" DECIMAL(5,2),
ADD COLUMN "taxRules" JSONB;

CREATE INDEX "Client_billingTypeId_idx" ON "Client"("billingTypeId");

ALTER TABLE "Client"
ADD CONSTRAINT "Client_billingTypeId_fkey"
FOREIGN KEY ("billingTypeId") REFERENCES "BillingType"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ConsultantPersonalInfo" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "cpf" TEXT,
    "birthDate" TIMESTAMP(3),
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantPersonalInfo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsultantPersonalInfo_consultantId_key" ON "ConsultantPersonalInfo"("consultantId");

ALTER TABLE "ConsultantPersonalInfo"
ADD CONSTRAINT "ConsultantPersonalInfo_consultantId_fkey"
FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ConsultantCompanyInfo" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "cnpj" TEXT,
    "legalName" TEXT,
    "tradeName" TEXT,
    "municipalRegistration" TEXT,
    "taxRegime" TEXT,
    "providerSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantCompanyInfo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsultantCompanyInfo_consultantId_key" ON "ConsultantCompanyInfo"("consultantId");

ALTER TABLE "ConsultantCompanyInfo"
ADD CONSTRAINT "ConsultantCompanyInfo_consultantId_fkey"
FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ConsultantAddress" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "postalCode" TEXT,
    "street" TEXT,
    "district" TEXT,
    "city" TEXT,
    "state" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "providerSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantAddress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsultantAddress_consultantId_key" ON "ConsultantAddress"("consultantId");

ALTER TABLE "ConsultantAddress"
ADD CONSTRAINT "ConsultantAddress_consultantId_fkey"
FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ConsultantBankAccount" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "kind" "BankAccountKind" NOT NULL DEFAULT 'PRIMARY',
    "bankCode" TEXT,
    "bankName" TEXT,
    "agency" TEXT,
    "accountNumber" TEXT,
    "accountDigit" TEXT,
    "pixKey" TEXT,
    "holderDocument" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantBankAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsultantBankAccount_consultantId_idx" ON "ConsultantBankAccount"("consultantId");

ALTER TABLE "ConsultantBankAccount"
ADD CONSTRAINT "ConsultantBankAccount_consultantId_fkey"
FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ConsultantCompensation" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "contractType" "ConsultantContractType" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "hourlyRate" DECIMAL(12,2),
    "cltAmount" DECIMAL(12,2),
    "pjAmount" DECIMAL(12,2),
    "benefitCardAmount" DECIMAL(12,2),
    "discountRules" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantCompensation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsultantCompensation_consultantId_startsAt_idx" ON "ConsultantCompensation"("consultantId", "startsAt");

ALTER TABLE "ConsultantCompensation"
ADD CONSTRAINT "ConsultantCompensation_consultantId_fkey"
FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ConsultantBenefit" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "type" "BenefitType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantBenefit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsultantBenefit_consultantId_startsAt_idx" ON "ConsultantBenefit"("consultantId", "startsAt");

ALTER TABLE "ConsultantBenefit"
ADD CONSTRAINT "ConsultantBenefit_consultantId_fkey"
FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProjectSaleRate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "consultantId" TEXT,
    "allocationId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "hourlyRate" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSaleRate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectSaleRate_projectId_startsAt_idx" ON "ProjectSaleRate"("projectId", "startsAt");
CREATE INDEX "ProjectSaleRate_consultantId_idx" ON "ProjectSaleRate"("consultantId");
CREATE INDEX "ProjectSaleRate_allocationId_idx" ON "ProjectSaleRate"("allocationId");

ALTER TABLE "ProjectSaleRate"
ADD CONSTRAINT "ProjectSaleRate_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectSaleRate"
ADD CONSTRAINT "ProjectSaleRate_consultantId_fkey"
FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProjectSaleRate"
ADD CONSTRAINT "ProjectSaleRate_allocationId_fkey"
FOREIGN KEY ("allocationId") REFERENCES "Allocation"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ConsultantAllocationCostRate" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "hourlyCost" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantAllocationCostRate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsultantAllocationCostRate_consultantId_startsAt_idx" ON "ConsultantAllocationCostRate"("consultantId", "startsAt");
CREATE INDEX "ConsultantAllocationCostRate_allocationId_startsAt_idx" ON "ConsultantAllocationCostRate"("allocationId", "startsAt");

ALTER TABLE "ConsultantAllocationCostRate"
ADD CONSTRAINT "ConsultantAllocationCostRate_consultantId_fkey"
FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsultantAllocationCostRate"
ADD CONSTRAINT "ConsultantAllocationCostRate_allocationId_fkey"
FOREIGN KEY ("allocationId") REFERENCES "Allocation"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RevenueClosing" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "RevenueClosingStatus" NOT NULL DEFAULT 'OPEN',
    "totalHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "adjustmentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "closedByUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueClosing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RevenueClosing_clientId_projectId_month_year_key" ON "RevenueClosing"("clientId", "projectId", "month", "year");
CREATE UNIQUE INDEX "RevenueClosing_clientId_month_year_client_level_key" ON "RevenueClosing"("clientId", "month", "year") WHERE "projectId" IS NULL;
CREATE INDEX "RevenueClosing_clientId_idx" ON "RevenueClosing"("clientId");
CREATE INDEX "RevenueClosing_projectId_idx" ON "RevenueClosing"("projectId");
CREATE INDEX "RevenueClosing_status_idx" ON "RevenueClosing"("status");

ALTER TABLE "RevenueClosing"
ADD CONSTRAINT "RevenueClosing_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RevenueClosing"
ADD CONSTRAINT "RevenueClosing_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RevenueClosing"
ADD CONSTRAINT "RevenueClosing_closedByUserId_fkey"
FOREIGN KEY ("closedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RevenueClosingLine" (
    "id" TEXT NOT NULL,
    "revenueClosingId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "timeEntryId" TEXT,
    "description" TEXT,
    "hours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "unitRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueClosingLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RevenueClosingLine_revenueClosingId_idx" ON "RevenueClosingLine"("revenueClosingId");
CREATE INDEX "RevenueClosingLine_projectId_idx" ON "RevenueClosingLine"("projectId");
CREATE INDEX "RevenueClosingLine_timeEntryId_idx" ON "RevenueClosingLine"("timeEntryId");

ALTER TABLE "RevenueClosingLine"
ADD CONSTRAINT "RevenueClosingLine_revenueClosingId_fkey"
FOREIGN KEY ("revenueClosingId") REFERENCES "RevenueClosing"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RevenueClosingLine"
ADD CONSTRAINT "RevenueClosingLine_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RevenueClosingLine"
ADD CONSTRAINT "RevenueClosingLine_timeEntryId_fkey"
FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "FiscalDocument" (
    "id" TEXT NOT NULL,
    "kind" "FiscalDocumentKind" NOT NULL DEFAULT 'NFSE',
    "status" "FiscalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "clientId" TEXT NOT NULL,
    "revenueClosingId" TEXT,
    "provider" "IntegrationProviderKind" NOT NULL DEFAULT 'SAO_PAULO_NFSE',
    "invoiceNumber" TEXT,
    "protocol" TEXT,
    "xmlStorageBucket" TEXT,
    "xmlStorageKey" TEXT,
    "pdfStorageBucket" TEXT,
    "pdfStorageKey" TEXT,
    "errorMessage" TEXT,
    "validatedByUserId" TEXT,
    "issuedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FiscalDocument_clientId_idx" ON "FiscalDocument"("clientId");
CREATE INDEX "FiscalDocument_revenueClosingId_idx" ON "FiscalDocument"("revenueClosingId");
CREATE INDEX "FiscalDocument_status_idx" ON "FiscalDocument"("status");
CREATE INDEX "FiscalDocument_invoiceNumber_idx" ON "FiscalDocument"("invoiceNumber");
CREATE UNIQUE INDEX "FiscalDocument_provider_invoiceNumber_key" ON "FiscalDocument"("provider", "invoiceNumber");

ALTER TABLE "FiscalDocument"
ADD CONSTRAINT "FiscalDocument_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FiscalDocument"
ADD CONSTRAINT "FiscalDocument_revenueClosingId_fkey"
FOREIGN KEY ("revenueClosingId") REFERENCES "RevenueClosing"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FiscalDocument"
ADD CONSTRAINT "FiscalDocument_validatedByUserId_fkey"
FOREIGN KEY ("validatedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ConsultantPaymentForecast" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT,
    "closingMonth" INTEGER NOT NULL,
    "closingYear" INTEGER NOT NULL,
    "responseDeadlineAt" TIMESTAMP(3) NOT NULL,
    "expectedPaymentAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantPaymentForecast_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsultantPaymentForecast_consultantId_idx" ON "ConsultantPaymentForecast"("consultantId");
CREATE INDEX "ConsultantPaymentForecast_closingYear_closingMonth_idx" ON "ConsultantPaymentForecast"("closingYear", "closingMonth");

ALTER TABLE "ConsultantPaymentForecast"
ADD CONSTRAINT "ConsultantPaymentForecast_consultantId_fkey"
FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConsultantPaymentForecast"
ADD CONSTRAINT "ConsultantPaymentForecast_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ConsultantPayment" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "forecastId" TEXT,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "contractType" "ConsultantContractType" NOT NULL,
    "status" "ConsultantPaymentStatus" NOT NULL DEFAULT 'OPEN',
    "cltNetAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pjAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "benefitAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expectedPaymentAt" TIMESTAMP(3),
    "confirmedPaidAt" TIMESTAMP(3),
    "invoiceReceivedAt" TIMESTAMP(3),
    "invoiceValidatedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsultantPayment_consultantId_month_year_key" ON "ConsultantPayment"("consultantId", "month", "year");
CREATE INDEX "ConsultantPayment_forecastId_idx" ON "ConsultantPayment"("forecastId");
CREATE INDEX "ConsultantPayment_status_idx" ON "ConsultantPayment"("status");
CREATE INDEX "ConsultantPayment_year_month_idx" ON "ConsultantPayment"("year", "month");

ALTER TABLE "ConsultantPayment"
ADD CONSTRAINT "ConsultantPayment_consultantId_fkey"
FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsultantPayment"
ADD CONSTRAINT "ConsultantPayment_forecastId_fkey"
FOREIGN KEY ("forecastId") REFERENCES "ConsultantPaymentForecast"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConsultantPayment"
ADD CONSTRAINT "ConsultantPayment_approvedByUserId_fkey"
FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ConsultantPaymentLine" (
    "id" TEXT NOT NULL,
    "consultantPaymentId" TEXT NOT NULL,
    "projectId" TEXT,
    "allocationId" TEXT,
    "timeEntryId" TEXT,
    "description" TEXT NOT NULL,
    "hours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "unitRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultantPaymentLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsultantPaymentLine_consultantPaymentId_idx" ON "ConsultantPaymentLine"("consultantPaymentId");
CREATE INDEX "ConsultantPaymentLine_projectId_idx" ON "ConsultantPaymentLine"("projectId");
CREATE INDEX "ConsultantPaymentLine_allocationId_idx" ON "ConsultantPaymentLine"("allocationId");
CREATE INDEX "ConsultantPaymentLine_timeEntryId_idx" ON "ConsultantPaymentLine"("timeEntryId");

ALTER TABLE "ConsultantPaymentLine"
ADD CONSTRAINT "ConsultantPaymentLine_consultantPaymentId_fkey"
FOREIGN KEY ("consultantPaymentId") REFERENCES "ConsultantPayment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConsultantPaymentLine"
ADD CONSTRAINT "ConsultantPaymentLine_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConsultantPaymentLine"
ADD CONSTRAINT "ConsultantPaymentLine_allocationId_fkey"
FOREIGN KEY ("allocationId") REFERENCES "Allocation"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConsultantPaymentLine"
ADD CONSTRAINT "ConsultantPaymentLine_timeEntryId_fkey"
FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "IntegrationEvent" (
    "id" TEXT NOT NULL,
    "provider" "IntegrationProviderKind" NOT NULL,
    "operation" TEXT NOT NULL,
    "status" "IntegrationEventStatus" NOT NULL DEFAULT 'PENDING',
    "entityType" TEXT,
    "entityId" TEXT,
    "idempotencyKey" TEXT,
    "requestMeta" JSONB,
    "responseMeta" JSONB,
    "error" TEXT,
    "attemptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationEvent_provider_idempotencyKey_key" ON "IntegrationEvent"("provider", "idempotencyKey");
CREATE INDEX "IntegrationEvent_provider_status_idx" ON "IntegrationEvent"("provider", "status");
CREATE INDEX "IntegrationEvent_entityType_entityId_idx" ON "IntegrationEvent"("entityType", "entityId");
CREATE INDEX "IntegrationEvent_createdAt_idx" ON "IntegrationEvent"("createdAt");
