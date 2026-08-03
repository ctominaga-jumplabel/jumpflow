-- Hora Extra vira linha própria de lançamento (activityType OVERTIME) com fator
-- de remuneração/cobrança configurável por projeto. NULL = usa o padrão global
-- (DEFAULT_OVERTIME_MULTIPLIER = 1.5x no código).
ALTER TABLE "Project" ADD COLUMN "overtimeMultiplier" DECIMAL(5,2);
