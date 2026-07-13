-- Additive enum values for the email/notification engine.
-- Five ad-hoc transactional emails become configurable NotificationEvents, and
-- a new recipient type resolves to the recipient inherent to the event (the
-- invitee, the consultant, the report list) instead of a role/contact.
--
-- ALTER TYPE ... ADD VALUE is additive and idempotent (IF NOT EXISTS), so it is
-- safe to re-run and cannot break existing rows.

ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'MISSING_TIMESHEET_REPORT';
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'ACCESS_INVITE';
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'PRE_INVOICE_ISSUED';
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'NFSE_ISSUED';
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'PAYMENT_FORECAST';

ALTER TYPE "NotificationRecipientType" ADD VALUE IF NOT EXISTS 'EVENT_TARGET';
