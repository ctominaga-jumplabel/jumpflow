"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/actions/result";
import { requireRole } from "@/lib/auth/guards";
import { COCKPIT_ROLES } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  getConsultantCalendar,
  type CockpitCalendar,
} from "@/lib/operacao/cockpit";

const calendarInputSchema = z.object({
  projectId: z.string().min(1),
  consultantId: z.string().min(1),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
});

/**
 * Read-only calendar of a consultant's month on a project (proposta item
 * 1.1.1.1). Loaded ON DEMAND by the cockpit drawer (never bulk-loaded up front).
 * Same server gate as the cockpit page (`COCKPIT_ROLES`); pure read, so no
 * mutation/audit. Delegates the day-by-day shaping to `getConsultantCalendar`
 * (which reuses the holiday lookup / pure helpers — no reimplemented holidays).
 */
export async function loadConsultantCalendar(input: {
  projectId: string;
  consultantId: string;
  month: number;
  year: number;
}): Promise<ActionResult<CockpitCalendar>> {
  try {
    await requireRole(COCKPIT_ROLES);
    if (!isDatabaseConfigured()) {
      return {
        ok: false,
        error: "NO_DATABASE",
        message: "Banco de dados não configurado.",
      };
    }
    const parsed = calendarInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: "INVALID_INPUT",
        message: "Dados inválidos para o calendário.",
      };
    }
    const data = await getConsultantCalendar(parsed.data);
    if (!data) {
      return {
        ok: false,
        error: "NOT_FOUND",
        message: "Projeto ou consultor não encontrado.",
      };
    }
    return { ok: true, data };
  } catch (error) {
    // Never swallow framework control-flow (redirect from requireRole).
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_")
    ) {
      throw error;
    }
    console.error("[cockpit] calendar action error", error);
    return {
      ok: false,
      error: "UNEXPECTED",
      message: "Não foi possível carregar o calendário.",
    };
  }
}
