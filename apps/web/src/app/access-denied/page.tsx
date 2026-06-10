import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { logout } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import { focusRing, tactileButton } from "@/lib/styles";

export const metadata: Metadata = { title: "Acesso negado" };

export default function AccessDeniedPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md rounded-[var(--radius-card)] border-2 border-ink bg-surface p-8 text-center shadow-[6px_6px_0_0_var(--color-ink)]">
        <span className="mx-auto grid size-12 place-items-center rounded-md border-2 border-ink bg-warning-soft text-warning shadow-[2px_2px_0_0_var(--color-ink)]">
          <ShieldAlert aria-hidden="true" className="size-6" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-strong">
          Acesso negado
        </h1>
        <p className="mt-2 text-sm leading-6 text-medium">
          Você não tem permissão para acessar esta área. Se acredita que isso é
          um engano, fale com um administrador.
        </p>

        <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/app"
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark",
              tactileButton,
              focusRing,
            )}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Voltar ao início
          </Link>
          <form action={logout} className="sm:contents">
            <button
              type="submit"
              className={cn(
                "inline-flex w-full items-center justify-center rounded-md bg-surface px-5 py-2.5 text-sm font-semibold text-strong hover:bg-surface-muted",
                tactileButton,
                focusRing,
              )}
            >
              Sair
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
