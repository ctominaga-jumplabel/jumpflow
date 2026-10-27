-- Fluxo de Horas: governança + SLA (parte 1/2) — SÓ novos valores de enum.
--
-- Fica numa migration própria porque o Postgres não permite USAR um valor de
-- enum recém-adicionado (ALTER TYPE ... ADD VALUE) na mesma transação em que
-- ele foi criado; a parte 2 (20261027120000_fluxo_horas_governanca_sla) insere
-- NotificationRule com estes eventos. Aditivo e idempotente (IF NOT EXISTS).

-- NotificationEvent
-- CONSULTANT_INVOICE_REQUEST: correção — payments.ts já consulta a regra deste
-- evento (resolveEventDelivery), mas o valor não existia no enum.
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'CONSULTANT_INVOICE_REQUEST';
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'PAYMENT_RELEASED_BY_PEOPLE';
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'SLA_DEADLINE_APPROACHING';
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'SLA_OVERDUE';

-- ConsultantPaymentStatus: DP/People libera o pagamento antes de o Financeiro
-- solicitar a NF (OPEN -> PEOPLE_RELEASED -> WAITING_FOR_INVOICE).
ALTER TYPE "ConsultantPaymentStatus" ADD VALUE IF NOT EXISTS 'PEOPLE_RELEASED' BEFORE 'WAITING_FOR_INVOICE';
