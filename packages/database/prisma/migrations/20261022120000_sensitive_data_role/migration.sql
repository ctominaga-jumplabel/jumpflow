-- Grupo "Dados Sensíveis" (parte 1/2): novo valor do enum RoleName.
-- Fica numa migration própria porque o Postgres não permite USAR um valor de
-- enum recém-adicionado na mesma transação em que ele foi criado.
ALTER TYPE "RoleName" ADD VALUE IF NOT EXISTS 'SENSITIVE_DATA';
