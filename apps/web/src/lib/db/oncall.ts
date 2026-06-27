/**
 * Data layer for Sobreaviso (on-call). Queries + pure helpers; authorization,
 * storage and audit live in the server actions (/app/sobreaviso/actions.ts).
 */
import { prisma } from "@jumpflow/database";
import { timeEntryEffectiveHours } from "@/lib/timesheet/effective-hours";
import { toIsoDate } from "@/lib/timesheet/week";

export type OnCallStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface OnCallAttachmentMeta {
  fileName: string;
  contentType: string;
  size: number;
}

export interface OnCallEntryRow {
  id: string;
  consultantId: string;
  consultantName: string;
  projectId: string | null;
  projectName: string | null;
  date: string; // ISO yyyy-mm-dd
  hours: number;
  multiplier: number;
  /** hours x multiplier — the remunerated equivalent. */
  effectiveHours: number;
  status: OnCallStatus;
  note: string | null;
  attachment: OnCallAttachmentMeta | null;
}

const num = (v: unknown): number => Number(v ?? 0);

/**
 * Remunerated-equivalent hours for an on-call entry.
 *
 * @deprecated Sobreaviso is migrating into TimeEntry (melhoria #2). Use
 * {@link timeEntryEffectiveHours} from `@/lib/timesheet/effective-hours`
 * directly. This thin alias keeps the on-call data layer working during the
 * transition and shares the exact same rounding rule.
 */
export function onCallEffectiveHours(hours: number, multiplier: number): number {
  return timeEntryEffectiveHours(hours, multiplier);
}

export interface ListOnCallOptions {
  /** Restrict to one consultant (their own view). Omit for the manager view. */
  consultantId?: string;
  status?: OnCallStatus;
}

export async function listOnCallEntries(
  options: ListOnCallOptions = {},
): Promise<OnCallEntryRow[]> {
  const rows = await prisma.onCallEntry.findMany({
    where: {
      ...(options.consultantId ? { consultantId: options.consultantId } : {}),
      ...(options.status ? { status: options.status } : {}),
    },
    orderBy: { date: "desc" },
    select: {
      id: true,
      consultantId: true,
      consultant: { select: { name: true } },
      projectId: true,
      project: { select: { name: true } },
      date: true,
      hours: true,
      multiplier: true,
      status: true,
      note: true,
      attachment: {
        select: { fileName: true, contentType: true, size: true },
      },
    },
  });
  return rows.map((r) => {
    const hours = num(r.hours);
    const multiplier = num(r.multiplier);
    return {
      id: r.id,
      consultantId: r.consultantId,
      consultantName: r.consultant.name,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      date: toIsoDate(r.date),
      hours,
      multiplier,
      effectiveHours: onCallEffectiveHours(hours, multiplier),
      status: r.status as OnCallStatus,
      note: r.note,
      attachment: r.attachment
        ? {
            fileName: r.attachment.fileName,
            contentType: r.attachment.contentType,
            size: r.attachment.size,
          }
        : null,
    };
  });
}

/** Active projects for the on-call form selector. */
export async function listOnCallProjects(): Promise<
  Array<{ id: string; name: string }>
> {
  return prisma.project.findMany({
    where: { status: { in: ["ACTIVE", "PROPOSAL", "PAUSED"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
