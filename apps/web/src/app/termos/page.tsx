import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { isDevAuthEnabled } from "@/lib/auth/dev";
import { isDatabaseConfigured } from "@/lib/db/config";
import { CURRENT_TERMS } from "@/lib/terms/terms";
import { cn } from "@/lib/utils";
import { focusRing, tactileButton } from "@/lib/styles";
import { acceptTerms, declineTerms } from "./actions";

export const metadata: Metadata = { title: "Termos de Uso" };

/**
 * Tela de gate dos Termos de Uso (EP-M08). Fora de `/app` (para o gate do
 * layout autenticado nao criar loop de redirect). Exige sessao: `requireUser`
 * manda um nao-logado para `/login`. Se o usuario JA aceitou a versao vigente,
 * redireciona para `/app` (nao exibe a tela a toa).
 */
export default async function TermsPage() {
  const user = await requireUser();

  // Se ja aceitou a versao vigente (apenas no caminho com banco real), nao ha o
  // que exibir — segue para o app. Em dev/sem banco o gate ja e pulado no
  // layout, mas manter o comportamento aqui evita exibir a tela sem proposito.
  if (!isDevAuthEnabled() && isDatabaseConfigured()) {
    const { hasAcceptedCurrentTerms } = await import("@/lib/db/terms");
    if (await hasAcceptedCurrentTerms(user.id)) redirect("/app");
  }

  const terms = CURRENT_TERMS;

  return (
    <main className="min-h-screen bg-canvas px-4 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-[var(--radius-card)] border-2 border-ink bg-surface p-6 shadow-[6px_6px_0_0_var(--color-ink)] sm:p-8">
        <header className="border-b-2 border-ink/10 pb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-medium">
            Versão {terms.version}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-strong">
            {terms.title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-medium">{terms.intro}</p>
        </header>

        <div className="mt-6 max-h-[55vh] space-y-6 overflow-y-auto pr-1 text-sm leading-6 text-medium">
          {terms.sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-base font-semibold text-strong">
                {section.title}
              </h2>
              {section.paragraphs?.map((paragraph, i) => (
                <p key={i} className="mt-2">
                  {paragraph}
                </p>
              ))}
              {section.bullets && section.bullets.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {section.bullets.map((bullet, i) => (
                    <li key={i}>{bullet}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <p className="mt-6 rounded-md border-2 border-ink/10 bg-surface-muted p-4 text-sm font-medium leading-6 text-strong">
          {terms.closing}
        </p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <form action={declineTerms} className="sm:contents">
            <button
              type="submit"
              className={cn(
                "inline-flex w-full items-center justify-center rounded-md bg-surface px-5 py-2.5 text-sm font-semibold text-strong hover:bg-surface-muted sm:w-auto",
                tactileButton,
                focusRing,
              )}
            >
              Não Aceito
            </button>
          </form>
          <form action={acceptTerms} className="sm:contents">
            <button
              type="submit"
              className={cn(
                "inline-flex w-full items-center justify-center rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark sm:w-auto",
                tactileButton,
                focusRing,
              )}
            >
              Aceito
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
