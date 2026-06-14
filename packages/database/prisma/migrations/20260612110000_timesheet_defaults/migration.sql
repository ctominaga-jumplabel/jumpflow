-- Weekly defaults by allocation. Additive and non-destructive: existing
-- allocations/time entries are untouched until a consultant explicitly applies
-- a default from the Horas UI.
CREATE TABLE "TimesheetDefault" (
    "id" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL DEFAULT 'WORKDAY',
    "hoursPerDay" DECIMAL(5,2) NOT NULL,
    "weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5],
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimesheetDefault_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TimesheetDefault_allocationId_key" ON "TimesheetDefault"("allocationId");

ALTER TABLE "TimesheetDefault"
ADD CONSTRAINT "TimesheetDefault_allocationId_fkey"
FOREIGN KEY ("allocationId") REFERENCES "Allocation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
