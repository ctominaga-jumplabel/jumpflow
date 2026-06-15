CREATE TYPE "SkillSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DISMISSED');

CREATE TABLE "SkillSuggestion" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "skillId" TEXT,
    "suggestedName" TEXT NOT NULL,
    "suggestedCategory" TEXT,
    "suggestedLevel" "SkillLevel" NOT NULL DEFAULT 'INTERMEDIATE',
    "evidenceSummary" TEXT,
    "sourceEntryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "SkillSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SkillSuggestion_consultantId_weekStart_suggestedName_key"
ON "SkillSuggestion"("consultantId", "weekStart", "suggestedName");

CREATE INDEX "SkillSuggestion_consultantId_weekStart_idx"
ON "SkillSuggestion"("consultantId", "weekStart");

CREATE INDEX "SkillSuggestion_skillId_idx"
ON "SkillSuggestion"("skillId");

CREATE INDEX "SkillSuggestion_status_idx"
ON "SkillSuggestion"("status");

ALTER TABLE "SkillSuggestion"
ADD CONSTRAINT "SkillSuggestion_consultantId_fkey"
FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SkillSuggestion"
ADD CONSTRAINT "SkillSuggestion_skillId_fkey"
FOREIGN KEY ("skillId") REFERENCES "Skill"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
