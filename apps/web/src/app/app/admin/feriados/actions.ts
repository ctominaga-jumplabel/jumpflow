"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { requireRole } from "@/lib/auth/guards";
import { recordAuditEvent } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { resolveDbUser } from "@/lib/db/users";

/**
 * Server actions for the holidays admin screen (`/app/admin/feriados`).
 * Managed by ADMIN + PEOPLE; every change is audited. Feeds the holidays
 * calendar (notification "feriado próximo" + apontamento em feriado).
 */
const ROUTE = "/app/admin/feriados";
const MANAGE_ROLES = ["ADMIN", "PEOPLE"] as const;

const noDatabase = (): ActionResult<never> => ({
  ok: false,
  error: "NO_DATABASE",
  message: "Banco de dados não configurado.",
});

const scopeEnum = z.enum(["NATIONAL", "STATE", "CITY"]);

const writeSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.")
      .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00.000Z`)), {
        message: "Informe uma data válida.",
      }),
    name: z.string().trim().min(2, "Informe o nome do feriado.").max(120),
    scope: scopeEnum,
    region: z.string().trim().max(120).optional().nullable(),
    projectIds: z.array(z.string().min(1)).default([]),
  })
  .refine((v) => v.scope === "NATIONAL" || Boolean(v.region?.trim()), {
    message: "Informe a UF (estadual) ou o município (municipal).",
    path: ["region"],
  });

export type HolidayFormInput = z.infer<typeof writeSchema>;

async function manageActor() {
  const user = await requireRole([...MANAGE_ROLES]);
  const actor = await resolveDbUser(user);
  return actor;
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

export async function createHolidayAction(
  input: HolidayFormInput,
): Promise<ActionResult<{ id: string }>> {
  const actor = await manageActor();
  if (!isDatabaseConfigured()) return noDatabase();
  const parsed = writeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "INVALID_INPUT", message: firstIssue(parsed.error) };
  }
  try {
    const { findDuplicateHoliday, createHoliday } = await import(
      "@/lib/db/holidays"
    );
    const duplicate = await findDuplicateHoliday({
      date: parsed.data.date,
      scope: parsed.data.scope,
      region: parsed.data.region,
    });
    if (duplicate) {
      return {
        ok: false,
        error: "DUPLICATE_ENTRY",
        message:
          "Já existe um feriado com a mesma data, abrangência e região.",
      };
    }
    const created = await createHoliday({
      date: parsed.data.date,
      name: parsed.data.name,
      scope: parsed.data.scope,
      region: parsed.data.region,
      projectIds: parsed.data.projectIds,
    });
    await recordAuditEvent({
      actorUserId: actor?.id ?? null,
      entityType: "Holiday",
      entityId: created.id,
      action: "HOLIDAY_CREATED",
      after: {
        date: parsed.data.date,
        name: parsed.data.name,
        scope: parsed.data.scope,
        region: parsed.data.region ?? null,
        projectIds: parsed.data.projectIds,
      },
    });
    revalidatePath(ROUTE);
    return { ok: true, data: created };
  } catch (error) {
    console.error("[feriados] createHoliday failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao criar feriado." };
  }
}

const updateSchema = writeSchema.and(z.object({ id: z.string().min(1) }));

export type UpdateHolidayFormInput = z.infer<typeof updateSchema>;

export async function updateHolidayAction(
  input: UpdateHolidayFormInput,
): Promise<ActionResult<{ id: string }>> {
  const actor = await manageActor();
  if (!isDatabaseConfigured()) return noDatabase();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "INVALID_INPUT", message: firstIssue(parsed.error) };
  }
  try {
    const { findDuplicateHoliday, updateHoliday } = await import(
      "@/lib/db/holidays"
    );
    const duplicate = await findDuplicateHoliday({
      date: parsed.data.date,
      scope: parsed.data.scope,
      region: parsed.data.region,
      excludeId: parsed.data.id,
    });
    if (duplicate) {
      return {
        ok: false,
        error: "DUPLICATE_ENTRY",
        message:
          "Já existe um feriado com a mesma data, abrangência e região.",
      };
    }
    const updated = await updateHoliday(parsed.data.id, {
      date: parsed.data.date,
      name: parsed.data.name,
      scope: parsed.data.scope,
      region: parsed.data.region,
      projectIds: parsed.data.projectIds,
    });
    await recordAuditEvent({
      actorUserId: actor?.id ?? null,
      entityType: "Holiday",
      entityId: updated.id,
      action: "HOLIDAY_UPDATED",
      after: {
        date: parsed.data.date,
        name: parsed.data.name,
        scope: parsed.data.scope,
        region: parsed.data.region ?? null,
        projectIds: parsed.data.projectIds,
      },
    });
    revalidatePath(ROUTE);
    return { ok: true, data: updated };
  } catch (error) {
    console.error("[feriados] updateHoliday failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao salvar feriado." };
  }
}

const idSchema = z.object({ id: z.string().min(1) });

export async function deleteHolidayAction(
  input: z.infer<typeof idSchema>,
): Promise<ActionResult<{ id: string }>> {
  const actor = await manageActor();
  if (!isDatabaseConfigured()) return noDatabase();
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "INVALID_INPUT", message: "Dados inválidos." };
  }
  try {
    const { deleteHoliday } = await import("@/lib/db/holidays");
    await deleteHoliday(parsed.data.id);
    await recordAuditEvent({
      actorUserId: actor?.id ?? null,
      entityType: "Holiday",
      entityId: parsed.data.id,
      action: "HOLIDAY_DELETED",
    });
    revalidatePath(ROUTE);
    return { ok: true, data: parsed.data };
  } catch (error) {
    console.error("[feriados] deleteHoliday failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao remover feriado." };
  }
}
