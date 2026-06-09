import { Prisma, prisma } from "@jumpflow/database";
import { isDatabaseConfigured } from "./config";

/**
 * Audit trail helper.
 *
 * Records a sensitive change into `AuditEvent`. The architecture requires
 * auditing role/permission changes, financial fields, allocations, approvals
 * and monthly closings. This is the single low-level writer; domain flows will
 * call it as they are built — it is intentionally NOT wired into every flow yet.
 */
export interface AuditEventInput {
  /** Who performed the action (null for system/anonymous actions). */
  actorUserId?: string | null;
  /** Logical entity type, e.g. "Project", "UserRole", "MonthlyClosing". */
  entityType: string;
  /** Affected entity id. */
  entityId: string;
  /** Action verb, e.g. "ROLE_GRANTED", "HOURLY_RATE_UPDATED". */
  action: string;
  /** State before the change (JSON-serializable) — optional. */
  before?: unknown;
  /** State after the change (JSON-serializable) — optional. */
  after?: unknown;
}

/**
 * Pure builder: shape an {@link AuditEventInput} into Prisma create data.
 * Kept pure (no I/O) so it can be unit-tested without a database. `undefined`
 * before/after become `null` so the column is explicit rather than skipped.
 */
export function buildAuditEventData(
  input: AuditEventInput,
): Prisma.AuditEventUncheckedCreateInput {
  return {
    actorUserId: input.actorUserId ?? null,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    before: toJsonValue(input.before),
    after: toJsonValue(input.after),
  };
}

function toJsonValue(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

/**
 * Record an audit event. No-op (does not throw) when no database is
 * configured, so callers in the operational flow never break in dev/offline
 * setups. Errors while writing are swallowed and logged: auditing must not
 * take down the business operation that triggered it.
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  if (!isDatabaseConfigured()) return;
  try {
    await prisma.auditEvent.create({ data: buildAuditEventData(input) });
  } catch (error) {
    console.error("[audit] failed to record audit event", {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      error,
    });
  }
}
