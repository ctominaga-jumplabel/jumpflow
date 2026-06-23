"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { requireRole } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import { resolveDbUser } from "@/lib/db/users";
import {
  PermissionError,
  type PermissionErrorCode,
} from "@/lib/db/permissions";

/**
 * Server actions for the Permission Matrix admin screen
 * (`/app/admin/permissoes`).
 *
 * Every action is gated by `requireRole(["ADMIN"])` — only administrators may
 * edit permissions (faithful to the requirement; authorization is enforced on
 * the server even if the UI is bypassed). The acting user's REAL persisted id
 * (resolveDbUser) is the audit actor. Actions return ActionResult and never
 * throw to the client.
 *
 * Safeguards:
 *  - Editing the Administrador group requires explicit `confirmAdminChange`
 *    (anti self-elevation / accidental lockout).
 *  - The domain layer rejects any change that would remove the last
 *    administrative permission (LAST_ADMIN_PERMISSION).
 */

const ROUTE = "/app/admin/permissoes";

const noDatabase = (): ActionResult<never> => ({
  ok: false,
  error: "NO_DATABASE",
  message: "Banco de dados não configurado.",
});

/** Map a domain PermissionError code to the shared ActionResult ErrorCode. */
function mapPermissionError(code: PermissionErrorCode): ErrorCode {
  switch (code) {
    case "LAST_ADMIN_PERMISSION":
      return "LAST_ADMIN_PERMISSION";
    case "SYSTEM_ROLE_PROTECTED":
      return "SYSTEM_ROLE_PROTECTED";
    case "DUPLICATE_CODE":
      return "DUPLICATE_CODE";
    case "NOT_FOUND":
      return "NOT_FOUND";
    case "INVALID_INPUT":
      return "INVALID_INPUT";
    default:
      return "UNEXPECTED";
  }
}

const cellSchema = z.object({
  permissionId: z.string().min(1),
  canView: z.boolean(),
  canCreate: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});

const setMatrixSchema = z.object({
  roleId: z.string().min(1),
  updates: z.array(cellSchema).min(1, "Nenhuma alteração para salvar."),
  /** Required confirmation when editing the Administrador group. */
  confirmAdminChange: z.boolean().optional(),
});

export type SetMatrixInput = z.infer<typeof setMatrixSchema>;

export async function saveRolePermissions(
  input: SetMatrixInput,
): Promise<ActionResult<{ roleId: string; changed: number }>> {
  const user = await requireRole(["ADMIN"]);
  if (!isDatabaseConfigured()) return noDatabase();

  const parsed = setMatrixSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  const actor = await resolveDbUser(user);
  if (!actor) {
    return { ok: false, error: "FORBIDDEN", message: "Ação não autorizada." };
  }

  try {
    const { prisma } = await import("@jumpflow/database");
    const role = await prisma.role.findUnique({
      where: { id: parsed.data.roleId },
      select: { key: true },
    });
    if (!role) {
      return { ok: false, error: "NOT_FOUND", message: "Grupo não encontrado." };
    }

    // Anti self-elevation / accidental lockout: changing the Administrador
    // group requires an explicit second confirmation from the UI.
    if (role.key === "ADMIN" && !parsed.data.confirmAdminChange) {
      return {
        ok: false,
        error: "CONFIRM_REQUIRED",
        message:
          "Você está alterando as permissões do grupo Administrador. Confirme para prosseguir.",
      };
    }

    const { setRolePermissions } = await import("@/lib/db/permissions");
    const result = await setRolePermissions({
      roleId: parsed.data.roleId,
      updates: parsed.data.updates,
      actorDbUserId: actor.id,
    });
    revalidatePath(ROUTE);
    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof PermissionError) {
      return {
        ok: false,
        error: mapPermissionError(error.code),
        message: error.message,
      };
    }
    console.error("[permissoes] saveRolePermissions failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao salvar permissões." };
  }
}

// --- Catalog: permissions (funcionalidades) --------------------------------

const upsertPermissionSchema = z.object({
  id: z.string().min(1).optional(),
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  module: z.string().trim().min(1),
  description: z.string().trim().optional(),
  parentId: z.string().min(1).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export type UpsertPermissionFormInput = z.infer<typeof upsertPermissionSchema>;

export async function savePermission(
  input: UpsertPermissionFormInput,
): Promise<ActionResult<{ id: string; code: string }>> {
  const user = await requireRole(["ADMIN"]);
  if (!isDatabaseConfigured()) return noDatabase();

  const parsed = upsertPermissionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }
  const actor = await resolveDbUser(user);
  if (!actor) {
    return { ok: false, error: "FORBIDDEN", message: "Ação não autorizada." };
  }

  try {
    const { upsertPermission } = await import("@/lib/db/permissions");
    const saved = await upsertPermission({ ...parsed.data, actorDbUserId: actor.id });
    revalidatePath(ROUTE);
    return { ok: true, data: { id: saved.id, code: saved.code } };
  } catch (error) {
    if (error instanceof PermissionError) {
      return { ok: false, error: mapPermissionError(error.code), message: error.message };
    }
    console.error("[permissoes] savePermission failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao salvar funcionalidade." };
  }
}

const togglePermissionSchema = z.object({
  permissionId: z.string().min(1),
  active: z.boolean(),
});

export async function togglePermissionActive(
  input: z.infer<typeof togglePermissionSchema>,
): Promise<ActionResult<{ id: string; active: boolean }>> {
  const user = await requireRole(["ADMIN"]);
  if (!isDatabaseConfigured()) return noDatabase();

  const parsed = togglePermissionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "INVALID_INPUT", message: "Dados inválidos." };
  }
  const actor = await resolveDbUser(user);
  if (!actor) {
    return { ok: false, error: "FORBIDDEN", message: "Ação não autorizada." };
  }

  try {
    const { setPermissionActive } = await import("@/lib/db/permissions");
    const result = await setPermissionActive({ ...parsed.data, actorDbUserId: actor.id });
    revalidatePath(ROUTE);
    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof PermissionError) {
      return { ok: false, error: mapPermissionError(error.code), message: error.message };
    }
    console.error("[permissoes] togglePermissionActive failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao alterar a funcionalidade." };
  }
}

// --- Groups (grupos de acesso) ---------------------------------------------

const upsertRoleSchema = z.object({
  id: z.string().min(1).optional(),
  key: z.string().trim().optional(),
  label: z.string().trim().min(1),
  description: z.string().trim().optional(),
});

export type UpsertRoleFormInput = z.infer<typeof upsertRoleSchema>;

export async function saveRole(
  input: UpsertRoleFormInput,
): Promise<ActionResult<{ id: string; key: string }>> {
  const user = await requireRole(["ADMIN"]);
  if (!isDatabaseConfigured()) return noDatabase();

  const parsed = upsertRoleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }
  const actor = await resolveDbUser(user);
  if (!actor) {
    return { ok: false, error: "FORBIDDEN", message: "Ação não autorizada." };
  }

  try {
    const { upsertRole } = await import("@/lib/db/permissions");
    const saved = await upsertRole({ ...parsed.data, actorDbUserId: actor.id });
    revalidatePath(ROUTE);
    return { ok: true, data: { id: saved.id, key: saved.key } };
  } catch (error) {
    if (error instanceof PermissionError) {
      return { ok: false, error: mapPermissionError(error.code), message: error.message };
    }
    console.error("[permissoes] saveRole failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao salvar grupo." };
  }
}

const toggleRoleSchema = z.object({
  roleId: z.string().min(1),
  active: z.boolean(),
});

export async function toggleRoleActive(
  input: z.infer<typeof toggleRoleSchema>,
): Promise<ActionResult<{ id: string; active: boolean }>> {
  const user = await requireRole(["ADMIN"]);
  if (!isDatabaseConfigured()) return noDatabase();

  const parsed = toggleRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "INVALID_INPUT", message: "Dados inválidos." };
  }
  const actor = await resolveDbUser(user);
  if (!actor) {
    return { ok: false, error: "FORBIDDEN", message: "Ação não autorizada." };
  }

  try {
    const { setRoleActive } = await import("@/lib/db/permissions");
    const result = await setRoleActive({ ...parsed.data, actorDbUserId: actor.id });
    revalidatePath(ROUTE);
    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof PermissionError) {
      return { ok: false, error: mapPermissionError(error.code), message: error.message };
    }
    console.error("[permissoes] toggleRoleActive failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao alterar o grupo." };
  }
}
