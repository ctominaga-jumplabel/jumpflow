import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing, tactileButton } from "@/lib/styles";
import { appConfig } from "@/config/app";
import { isDatabaseConfigured } from "@/lib/db/config";
import { AcceptInviteForm } from "./AcceptInviteForm";

export const metadata: Metadata = { title: "Aceitar convite" };

/**
 * PUBLIC invitation acceptance page (outside `/app`, no auth). The token in the
 * URL is the bearer credential. We validate it server-side; an invalid,
 * expired, revoked or unknown token yields ONE neutral message — never
 * revealing which case occurred. On success the user sets a password (>=10) and
 * confirms their name, then is sent to /login.
 */
export default async function ConvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const valid =
    isDatabaseConfigured() &&
    (await (async () => {
      const { findValidInvitationByToken } = await import(
        "@/lib/db/invitations"
      );
      return findValidInvitationByToken(token);
    })());

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md rounded-[var(--radius-card)] border-2 border-ink bg-surface p-8 shadow-[6px_6px_0_0_var(--color-ink)]">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-md border-2 border-ink bg-brand text-base font-bold text-white shadow-[2px_2px_0_0_var(--color-ink)]">
            {appConfig.monogram}
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-soft">
              Jump
            </p>
            <p className="text-lg font-semibold text-strong">
              {appConfig.name}
            </p>
          </div>
        </div>

        {valid ? (
          <>
            <h1 className="mt-7 text-2xl font-semibold tracking-tight text-strong">
              Ative sua conta
            </h1>
            <p className="mt-2 text-sm leading-6 text-medium">
              Você foi convidado para <strong>{valid.email}</strong>. Defina uma
              senha para concluir o acesso.
            </p>
            <AcceptInviteForm
              token={token}
              email={valid.email}
              defaultName={valid.name}
            />
          </>
        ) : (
          <div className="mt-7 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-md border-2 border-ink bg-warning-soft text-warning shadow-[2px_2px_0_0_var(--color-ink)]">
              <ShieldAlert aria-hidden="true" className="size-6" />
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-strong">
              Convite inválido ou expirado
            </h1>
            <p className="mt-2 text-sm leading-6 text-medium">
              Este link de convite não é mais válido. Solicite um novo convite a
              um administrador.
            </p>
            <Link
              href="/login"
              className={cn(
                "mt-7 inline-flex items-center justify-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark",
                tactileButton,
                focusRing,
              )}
            >
              Ir para o login
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
