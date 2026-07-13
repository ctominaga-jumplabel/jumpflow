-- Notificacao de feriado proximo (Onda A/2 do plano de melhorias).
-- Aditivo e seguro: estende NotificationEvent com um valor nao usado nesta
-- migration (sem conflito transacional). Consome o calendario de feriados
-- criado em 20260709120000_add_holiday.
-- Aplicar com `npm run db:deploy` ANTES de mergear na main (gate de deploy).

-- AlterEnum: evento de notificacao de feriado proximo (job agendado).
ALTER TYPE "NotificationEvent" ADD VALUE 'HOLIDAY_UPCOMING';
