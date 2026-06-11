"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { requireRole } from "@/lib/auth/guards";
import { ROLE_NAMES, type RoleName } from "@/lib/auth/roles";
import { isDatabaseConfigured } from "@/lib/db/config";
import { resolveDbUser } from "@/lib/db/users";
import {
  InvitationError,
  type InvitationErrorCode,
} from "@/lib/db/invitations";
import { getEmailTransport } from "@/lib/automation/email-transport";

/**
 * Server actions for the admin access screen (`/app/admin/acessos`).
 *
 * Every action is gated by `requireRole(["ADMIN"])` and returns an ActionResult
 * (never throws to the client). Authorization is enforced on the server even if
 * the UI is bypassed. The acting user's REAL persisted id (resolveDbUser) is the
 * audit actor — never the session id.
 *
 * SECURITY: the plaintext invite token is never logged. When no real email
 * provider is configured it is returned to the UI for the ADMIN to copy and
 * relay over a secure channel; with a real provider it is emailed and NOT
 * returned.
 */

const ROUTE = "/app/admin/acessos";

const noDatabase = (): ActionResult<never> => ({
  ok: false,
  error: "NO_DATABASE",
  message: "Banco de dados não configurado.",
});

/** Map a domain InvitationError code to the shared ActionResult ErrorCode. */
function mapInvitationError(code: InvitationErrorCode): ErrorCode {
  switch (code) {
    case "ALREADY_HAS_ACCESS":
      return "ALREADY_HAS_ACCESS";
    case "INVALID_INPUT":
      return "INVALID_INPUT";
    case "NOT_FOUND":
      return "NOT_FOUND";
    case "INVITE_INVALID":
      return "INVITE_INVALID";
    case "WEAK_PASSWORD":
      return "WEAK_PASSWORD";
    case "LAST_ADMIN":
      return "LAST_ADMIN";
    default:
      return "UNEXPECTED";
  }
}

const roleEnum = z.enum(ROLE_NAMES);

const inviteSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome."),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  roles: z.array(roleEnum).min(1, "Selecione ao menos um grupo de acesso."),
});

export type InviteUserInput = z.infer<typeof inviteSchema>;

export interface InviteUserData {
  email: string;
  /** Acceptance link to relay manually; present ONLY when no email was sent. */
  link?: string;
  /** Whether the invite was delivered by a real email provider. */
  emailed: boolean;
}

/** Build the absolute acceptance URL from the request origin (env fallback). */
async function buildAcceptUrl(token: string): Promise<string> {
  const envBase =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL ?? null;
  let base = envBase?.replace(/\/$/, "") ?? null;
  if (!base) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    base = host ? `${proto}://${host}` : "";
  }
  return `${base}/convite/${encodeURIComponent(token)}`;
}

/**
 * Whether a real (non-console) email provider is FULLY configured. Resend
 * silently falls back to the console transport when its keys are missing, so
 * requiring the keys here prevents reporting `emailed: true` when the invite
 * was not actually sent — in that case the admin gets the link to deliver.
 */
function hasRealEmailProvider(): boolean {
  return (
    process.env.EMAIL_PROVIDER === "resend" &&
    Boolean(process.env.RESEND_API_KEY) &&
    Boolean(process.env.RESEND_FROM_EMAIL)
  );
}

export async function inviteUser(
  input: InviteUserInput,
): Promise<ActionResult<InviteUserData>> {
  const user = await requireRole(["ADMIN"]);
  if (!isDatabaseConfigured()) return noDatabase();

  const parsed = inviteSchema.safeParse(input);
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
    const { createInvitation } = await import("@/lib/db/invitations");
    const result = await createInvitation({
      email: parsed.data.email,
      name: parsed.data.name,
      roles: parsed.data.roles as RoleName[],
      invitedByDbUserId: actor.id,
    });

    const link = await buildAcceptUrl(result.token);

    if (hasRealEmailProvider()) {
      try {
        await getEmailTransport().send({
          to: [result.invitation.email],
          subject: "Convite de acesso à plataforma Jump",
          text: `Você foi convidado a acessar a plataforma. Defina sua senha em:\n\n${link}\n\nO link expira em breve. Se não reconhece este convite, ignore esta mensagem.`,
        });
        revalidatePath(ROUTE);
        return {
          ok: true,
          data: { email: result.invitation.email, emailed: true },
        };
      } catch (error) {
        // Email failed: fall back to returning the link so the admin is not
        // left without a way to deliver it. Never log the token.
        console.error("[acessos] invite email failed; returning link", {
          email: result.invitation.email,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    revalidatePath(ROUTE);
    return {
      ok: true,
      data: { email: result.invitation.email, link, emailed: false },
    };
  } catch (error) {
    if (error instanceof InvitationError) {
      return {
        ok: false,
        error: mapInvitationError(error.code),
        message: error.message,
      };
    }
    console.error("[acessos] inviteUser failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao criar o convite." };
  }
}

const idSchema = z.object({ invitationId: z.string().min(1) });

export async function revokeInvite(input: {
  invitationId: string;
}): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole(["ADMIN"]);
  if (!isDatabaseConfigured()) return noDatabase();

  const parsed = idSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "INVALID_INPUT", message: "Dados inválidos." };
  }
  const actor = await resolveDbUser(user);
  if (!actor) {
    return { ok: false, error: "FORBIDDEN", message: "Ação não autorizada." };
  }

  try {
    const { revokeInvitation } = await import("@/lib/db/invitations");
    await revokeInvitation(parsed.data.invitationId, actor.id);
    revalidatePath(ROUTE);
    return { ok: true, data: { id: parsed.data.invitationId } };
  } catch (error) {
    if (error instanceof InvitationError) {
      return {
        ok: false,
        error: mapInvitationError(error.code),
        message: error.message,
      };
    }
    console.error("[acessos] revokeInvite failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao revogar o convite." };
  }
}

export async function regenerateInvite(input: {
  invitationId: string;
}): Promise<ActionResult<InviteUserData>> {
  const user = await requireRole(["ADMIN"]);
  if (!isDatabaseConfigured()) return noDatabase();

  const parsed = idSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "INVALID_INPUT", message: "Dados inválidos." };
  }
  const actor = await resolveDbUser(user);
  if (!actor) {
    return { ok: false, error: "FORBIDDEN", message: "Ação não autorizada." };
  }

  try {
    const { regenerateInvitation } = await import("@/lib/db/invitations");
    const result = await regenerateInvitation(parsed.data.invitationId, actor.id);
    const link = await buildAcceptUrl(result.token);

    if (hasRealEmailProvider()) {
      try {
        await getEmailTransport().send({
          to: [result.invitation.email],
          subject: "Novo link de acesso à plataforma Jump",
          text: `Seu link de acesso foi regenerado. Defina sua senha em:\n\n${link}\n\nO link anterior não funciona mais.`,
        });
        revalidatePath(ROUTE);
        return {
          ok: true,
          data: { email: result.invitation.email, emailed: true },
        };
      } catch (error) {
        console.error("[acessos] regenerate email failed; returning link", {
          email: result.invitation.email,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    revalidatePath(ROUTE);
    return {
      ok: true,
      data: { email: result.invitation.email, link, emailed: false },
    };
  } catch (error) {
    if (error instanceof InvitationError) {
      return {
        ok: false,
        error: mapInvitationError(error.code),
        message: error.message,
      };
    }
    console.error("[acessos] regenerateInvite failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao regenerar o convite." };
  }
}

const changeRolesSchema = z.object({
  targetUserId: z.string().min(1),
  roles: z.array(roleEnum).min(1, "Selecione ao menos um grupo de acesso."),
});

export type ChangeUserRolesInput = z.infer<typeof changeRolesSchema>;

export async function changeUserRoles(
  input: ChangeUserRolesInput,
): Promise<ActionResult<{ id: string; roles: RoleName[] }>> {
  const user = await requireRole(["ADMIN"]);
  if (!isDatabaseConfigured()) return noDatabase();

  const parsed = changeRolesSchema.safeParse(input);
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
    const { setUserRoles } = await import("@/lib/db/invitations");
    const result = await setUserRoles({
      targetUserId: parsed.data.targetUserId,
      roles: parsed.data.roles as RoleName[],
      actorDbUserId: actor.id,
    });
    revalidatePath(ROUTE);
    return { ok: true, data: { id: parsed.data.targetUserId, roles: result.roles } };
  } catch (error) {
    if (error instanceof InvitationError) {
      return {
        ok: false,
        error: mapInvitationError(error.code),
        message: error.message,
      };
    }
    console.error("[acessos] changeUserRoles failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao atualizar grupos." };
  }
}

const changeStatusSchema = z.object({
  targetUserId: z.string().min(1),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export type ChangeUserStatusInput = z.infer<typeof changeStatusSchema>;

export async function changeUserStatus(
  input: ChangeUserStatusInput,
): Promise<ActionResult<{ id: string; status: "ACTIVE" | "INACTIVE" }>> {
  const user = await requireRole(["ADMIN"]);
  if (!isDatabaseConfigured()) return noDatabase();

  const parsed = changeStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "INVALID_INPUT", message: "Dados inválidos." };
  }
  const actor = await resolveDbUser(user);
  if (!actor) {
    return { ok: false, error: "FORBIDDEN", message: "Ação não autorizada." };
  }

  try {
    const { setUserStatus } = await import("@/lib/db/invitations");
    const result = await setUserStatus({
      targetUserId: parsed.data.targetUserId,
      status: parsed.data.status,
      actorDbUserId: actor.id,
    });
    revalidatePath(ROUTE);
    return { ok: true, data: { id: parsed.data.targetUserId, status: result.status } };
  } catch (error) {
    if (error instanceof InvitationError) {
      return {
        ok: false,
        error: mapInvitationError(error.code),
        message: error.message,
      };
    }
    console.error("[acessos] changeUserStatus failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Falha ao alterar o status." };
  }
}
