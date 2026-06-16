-- AllocationSkill: per-allocation skill tag.
--
-- This table records which catalog Skill a consultant is using ON A SPECIFIC
-- PROJECT ALLOCATION. It is intentionally isolated from ConsultantSkill (the
-- consultant's own validated skill profile): no FK, trigger or shared row links
-- the two. ConsultantSkill is NOT touched by this migration.
--
-- FKs:
--   allocationId -> Allocation(id)  ON DELETE CASCADE  (tags die with the allocation)
--   skillId      -> Skill(id)       ON DELETE RESTRICT (a tagged catalog skill
--                                    cannot be deleted while still referenced)
--
-- Uniqueness: a skill can be tagged at most once per allocation
-- (allocationId, skillId).
--
-- This file was generated manually because `prisma migrate dev` in this
-- environment targets the production Supabase database and the network is
-- restricted. The DDL mirrors Prisma's generated output exactly. The user must
-- apply it with `npm run db:deploy` (prisma migrate deploy) from an environment
-- with database access. No data is migrated; the table starts empty.

-- CreateTable
CREATE TABLE "AllocationSkill" (
    "id" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "level" "SkillLevel",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllocationSkill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AllocationSkill_allocationId_idx" ON "AllocationSkill"("allocationId");

-- CreateIndex
CREATE INDEX "AllocationSkill_skillId_idx" ON "AllocationSkill"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "AllocationSkill_allocationId_skillId_key" ON "AllocationSkill"("allocationId", "skillId");

-- AddForeignKey
ALTER TABLE "AllocationSkill"
ADD CONSTRAINT "AllocationSkill_allocationId_fkey"
FOREIGN KEY ("allocationId") REFERENCES "Allocation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationSkill"
ADD CONSTRAINT "AllocationSkill_skillId_fkey"
FOREIGN KEY ("skillId") REFERENCES "Skill"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
