-- Hora extra (melhoria de lançamento de horas).
-- Project.standardHoursPerDay: horas padrão de lançamento por dia. NULL = sem
-- hora extra (consultor lança livremente, nada é considerado excedente).
ALTER TABLE "Project" ADD COLUMN "standardHoursPerDay" DECIMAL(5,2);

-- TimeEntry.overtimeHours: horas extra do dia atribuídas ao lançamento.
-- Default 0 para as linhas existentes.
ALTER TABLE "TimeEntry" ADD COLUMN "overtimeHours" DECIMAL(6,2) NOT NULL DEFAULT 0;
