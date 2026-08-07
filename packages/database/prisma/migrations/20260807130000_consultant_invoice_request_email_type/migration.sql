-- Melhoria #1: novo valor de enum para o log do e-mail que pede a NF ao
-- consultor PJ (um por ConsultantPayment; referenceKey = paymentId).
-- Postgres so permite adicionar valores a um enum (ALTER TYPE ... ADD VALUE);
-- a ordem reflete a evolucao historica. APPLY do usuario (rodar a migration).
ALTER TYPE "AutomationEmailType" ADD VALUE IF NOT EXISTS 'CONSULTANT_INVOICE_REQUEST';
