-- Client.contactEmail: contact e-mail used to send the pre-invoice (Fase G).
--
-- Adds an OPTIONAL (nullable) e-mail column to Client. Existing rows are left
-- with NULL — no backfill — so the change is non-destructive and safe to apply
-- on the production database. The e-mail format is validated in the application
-- layer (Zod), not by a database constraint, consistent with the other text
-- fields on Client.
--
-- This file was generated manually because `prisma migrate dev` in this
-- environment targets the production Supabase database and the network is
-- restricted. The DDL mirrors Prisma's generated output exactly. The user must
-- apply it with `npm run db:deploy` (prisma migrate deploy) from an environment
-- with database access.

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "contactEmail" TEXT;
