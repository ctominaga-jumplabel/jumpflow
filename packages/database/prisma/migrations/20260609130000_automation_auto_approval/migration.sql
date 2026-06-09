-- CreateEnum
CREATE TYPE "AutoApprovalExceptionType" AS ENUM ('ANY_HOURS', 'WEEKEND');

-- CreateEnum
CREATE TYPE "AutomationEmailType" AS ENUM ('MISSING_TIMESHEET_REPORT');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('SENT', 'FAILED');

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Approval" ADD COLUMN     "isAutomatic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ruleKey" TEXT,
ALTER COLUMN "approverUserId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AutoApprovalException" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "AutoApprovalExceptionType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoApprovalException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "autoApprovalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "requiredDailyMinutes" INTEGER NOT NULL DEFAULT 480,
    "approvalDelayMinutes" INTEGER NOT NULL DEFAULT 5,
    "reportRecipientEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationEmailLog" (
    "id" TEXT NOT NULL,
    "type" "AutomationEmailType" NOT NULL,
    "referenceKey" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" "EmailDeliveryStatus" NOT NULL,
    "error" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationEmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutoApprovalException_projectId_idx" ON "AutoApprovalException"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoApprovalException_consultantId_projectId_type_key" ON "AutoApprovalException"("consultantId", "projectId", "type");

-- CreateIndex
CREATE INDEX "AutomationEmailLog_createdAt_idx" ON "AutomationEmailLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationEmailLog_type_referenceKey_key" ON "AutomationEmailLog"("type", "referenceKey");

-- CreateIndex
CREATE INDEX "TimeEntry_consultantId_date_status_idx" ON "TimeEntry"("consultantId", "date", "status");

-- CreateIndex
CREATE INDEX "TimeEntry_status_submittedAt_idx" ON "TimeEntry"("status", "submittedAt");

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoApprovalException" ADD CONSTRAINT "AutoApprovalException_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoApprovalException" ADD CONSTRAINT "AutoApprovalException_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

