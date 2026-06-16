-- Fase G: novo valor de enum para o log de e-mail de pre-fatura ao cliente.
-- Postgres so permite adicionar valores a um enum (ALTER TYPE ... ADD VALUE);
-- a ordem reflete a evolucao historica. APPLY do usuario (rodar a migration).
ALTER TYPE "AutomationEmailType" ADD VALUE IF NOT EXISTS 'PRE_INVOICE';
