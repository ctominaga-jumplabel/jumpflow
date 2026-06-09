-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('ADMIN', 'CONSULTANT', 'PROJECT_MANAGER', 'AREA_MANAGER', 'FINANCE', 'PEOPLE', 'SALES');

-- CreateEnum
CREATE TYPE "ConsultantStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ON_LEAVE');

-- CreateEnum
CREATE TYPE "Seniority" AS ENUM ('INTERN', 'JUNIOR', 'MID_LEVEL', 'SENIOR', 'SPECIALIST', 'PRINCIPAL');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SkillStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PROPOSAL', 'ACTIVE', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('ACTIVE', 'PLANNED', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TimesheetPeriodStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('BASIC', 'INTERMEDIATE', 'ADVANCED', 'SPECIALIST');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('PENDING', 'VALIDATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovableEntityType" AS ENUM ('TIME_ENTRY', 'CONSULTANT_SKILL', 'CERTIFICATE');

-- CreateEnum
CREATE TYPE "MonthlyClosingStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" "RoleName" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "Consultant" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "jobTitle" TEXT,
    "seniority" "Seniority" NOT NULL,
    "area" TEXT,
    "status" "ConsultantStatus" NOT NULL DEFAULT 'ACTIVE',
    "hourlyCost" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consultant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PROPOSAL',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "managerUserId" TEXT,
    "billingHourlyRate" DECIMAL(12,2),
    "budgetHours" DECIMAL(10,2),
    "costCenter" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "allocationPercent" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" "AllocationStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimesheetPeriod" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "TimesheetPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimesheetPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "allocationId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,
    "activityType" TEXT NOT NULL,
    "description" TEXT,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "status" "TimeEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "entityType" "ApprovableEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "approverUserId" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "status" "SkillStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultantSkill" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "level" "SkillLevel" NOT NULL,
    "yearsExperience" DECIMAL(4,1),
    "lastUsedAt" TIMESTAMP(3),
    "validationStatus" "ValidationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "credentialId" TEXT,
    "credentialUrl" TEXT,
    "fileUrl" TEXT,
    "status" "ValidationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyClosing" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "MonthlyClosingStatus" NOT NULL DEFAULT 'OPEN',
    "totalHours" DECIMAL(10,2) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "closedByUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyClosing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Consultant_userId_key" ON "Consultant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Consultant_email_key" ON "Consultant"("email");

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE INDEX "Project_managerUserId_idx" ON "Project"("managerUserId");

-- CreateIndex
CREATE INDEX "Allocation_consultantId_idx" ON "Allocation"("consultantId");

-- CreateIndex
CREATE INDEX "Allocation_projectId_idx" ON "Allocation"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "TimesheetPeriod_consultantId_startDate_endDate_key" ON "TimesheetPeriod"("consultantId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "TimeEntry_periodId_idx" ON "TimeEntry"("periodId");

-- CreateIndex
CREATE INDEX "TimeEntry_consultantId_idx" ON "TimeEntry"("consultantId");

-- CreateIndex
CREATE INDEX "TimeEntry_projectId_idx" ON "TimeEntry"("projectId");

-- CreateIndex
CREATE INDEX "TimeEntry_allocationId_idx" ON "TimeEntry"("allocationId");

-- CreateIndex
CREATE INDEX "Approval_entityType_entityId_idx" ON "Approval"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Approval_approverUserId_idx" ON "Approval"("approverUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_name_category_key" ON "Skill"("name", "category");

-- CreateIndex
CREATE INDEX "ConsultantSkill_skillId_idx" ON "ConsultantSkill"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultantSkill_consultantId_skillId_key" ON "ConsultantSkill"("consultantId", "skillId");

-- CreateIndex
CREATE INDEX "Certificate_consultantId_idx" ON "Certificate"("consultantId");

-- CreateIndex
CREATE INDEX "MonthlyClosing_clientId_idx" ON "MonthlyClosing"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyClosing_projectId_month_year_key" ON "MonthlyClosing"("projectId", "month", "year");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_idx" ON "AuditEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultant" ADD CONSTRAINT "Consultant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetPeriod" ADD CONSTRAINT "TimesheetPeriod_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "TimesheetPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "Allocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantSkill" ADD CONSTRAINT "ConsultantSkill_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantSkill" ADD CONSTRAINT "ConsultantSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyClosing" ADD CONSTRAINT "MonthlyClosing_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyClosing" ADD CONSTRAINT "MonthlyClosing_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

