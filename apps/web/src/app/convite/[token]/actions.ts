"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { isDatabaseConfigured } from "@/lib/db/config";
import { InvitationError } from "@/lib/db/invitations";

/**
 * Public acceptance action for `/convite/[token]`. No auth: the token itself is
 * the bearer credential. Validates status + expiry inside the domain layer's
 * transaction, sets the chosen password and grants roles. On failure it returns
 * ONE neutral message — never revealing whether the token is unknown, revoked,
 * accepted or expired. The token is never logged.
 */

const acceptSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(10, "A senha deve ter ao menos 10 caracteres."),
  name: z.string().trim().min(1, "Informe o nome.").optional(),
});

export interface AcceptInviteInput {
  token: string;
  password: string;
  name?: string;
}

export async function acceptInvite(
  input: AcceptInviteInput,
): Promise<ActionResult<{ ok: true }>> {
  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      error: "NO_DATABASE",
      message: "Cadastro indisponível neste ambiente.",
    };
  }

  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    // A short password is a validation issue (surfaced honestly), not an
    // existence leak — the password never identifies the invitation.
    const isWeak = parsed.error.issues.some((i) => i.path[0] === "password");
    return {
      ok: false,
      error: isWeak ? "WEAK_PASSWORD" : "INVALID_INPUT",
      message,
    };
  }

  try {
    const { acceptInvitation } = await import("@/lib/db/invitations");
    await acceptInvitation({
      token: parsed.data.token,
      password: parsed.data.password,
      name: parsed.data.name,
    });
    return { ok: true, data: { ok: true } };
  } catch (error) {
    if (error instanceof InvitationError) {
      // INVITE_INVALID and WEAK_PASSWORD carry safe, neutral messages.
      return { ok: false, error: error.code === "WEAK_PASSWORD" ? "WEAK_PASSWORD" : "INVITE_INVALID", message: error.message };
    }
    console.error("[convite] acceptInvite failed", error);
    return {
      ok: false,
      error: "UNEXPECTED",
      message: "Não foi possível concluir o cadastro. Tente novamente.",
    };
  }
}
