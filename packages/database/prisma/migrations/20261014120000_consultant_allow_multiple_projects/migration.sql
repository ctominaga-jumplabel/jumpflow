-- Flag por consultor: permite lancar horas em mais de um projeto no mesmo dia.
-- Aditivo e seguro: coluna NOT NULL com default false (consultor de projeto
-- unico).

-- AlterTable
ALTER TABLE "Consultant" ADD COLUMN "allowMultipleProjects" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: quem ja tem mais de uma alocacao ATIVA continua podendo lancar em
-- varios projetos (nao bloqueia a operacao atual). Os demais ficam false.
UPDATE "Consultant" c
  SET "allowMultipleProjects" = true
  WHERE (
    SELECT COUNT(DISTINCT a."projectId")
    FROM "Allocation" a
    WHERE a."consultantId" = c."id" AND a."status" = 'ACTIVE'
  ) > 1;
