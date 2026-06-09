"use client";

import { motion, useReducedMotion } from "motion/react";
import { LogIn, ShieldCheck, TriangleAlert } from "lucide-react";
import { appConfig } from "@/config/app";
import { cn } from "@/lib/utils";
import { focusRing, tactileButton } from "@/lib/styles";

export type LoginVariant = "dev" | "entra" | "unconfigured";

export interface LoginViewProps {
  appName: string;
  variant: LoginVariant;
  /** Bound server action that performs the sign-in (absent when unconfigured). */
  action?: () => void | Promise<void>;
}

const ctaLabel: Record<Exclude<LoginVariant, "unconfigured">, string> = {
  dev: "Entrar (ambiente de desenvolvimento)",
  entra: "Entrar com Microsoft",
};

/** Steps of the operational flow, used as the decorative "pipeline" on the brand pane. */
const flowSteps = [
  { label: "Horas", color: "bg-marker" },
  { label: "Aprovação", color: "bg-flow" },
  { label: "Fechamento", color: "bg-cyan" },
];

/**
 * Login — the most expressive Playful Ops surface in this phase. A two-pane
 * card: an ink brand panel with a CSS "flow" composition (no 3D) and a clean
 * form panel with a tactile CTA. Motion is restrained and reduced-motion aware.
 */
export function LoginView({ appName, variant, action }: LoginViewProps) {
  const reduce = useReducedMotion();

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-canvas px-4 py-10">
      {/* Soft Playful Ops backdrop: blocks behind the card, never over text. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-10 top-16 size-40 rounded-[var(--radius-card)] border-2 border-ink/10 bg-marker/20" />
        <div className="absolute -right-8 bottom-24 size-52 rounded-full border-2 border-ink/10 bg-flow/15" />
        <div className="absolute right-1/4 top-10 size-24 rounded-[var(--radius-card)] border-2 border-ink/10 bg-cyan/15" />
      </div>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative w-full max-w-4xl"
      >
        <div className="overflow-hidden rounded-[var(--radius-card)] border-2 border-ink bg-surface shadow-[6px_6px_0_0_var(--color-ink)] lg:grid lg:grid-cols-[1.05fr_1fr]">
          {/* Brand pane (lg only): identity + flow composition. */}
          <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink p-9 text-white lg:flex">
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  "linear-gradient(var(--color-marker) 1px, transparent 1px), linear-gradient(90deg, var(--color-marker) 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            />

            <div className="relative flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-md border-2 border-marker bg-brand text-base font-bold text-white shadow-[2px_2px_0_0_var(--color-marker)]">
                {appConfig.monogram}
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-marker">
                  Jump
                </p>
                <p className="text-lg font-semibold">{appName}</p>
              </div>
            </div>

            <div className="relative">
              <p className="text-2xl font-semibold leading-snug">
                Trabalho operacional não precisa parecer arrastado.
              </p>
              <p className="mt-3 max-w-xs text-sm leading-6 text-white/70">
                Horas, alocações, skills e aprovações em um fluxo único — rápido,
                claro e tátil.
              </p>

              {/* Decorative operational "flow": connected blocks. */}
              <ul className="mt-8 flex items-center gap-2">
                {flowSteps.map((step, index) => (
                  <li key={step.label} className="flex items-center gap-2">
                    <motion.span
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: 0.2 + index * 0.08,
                        duration: 0.3,
                        ease: "easeOut",
                      }}
                      className={cn(
                        "inline-flex items-center rounded-md border-2 border-white/20 px-3 py-1.5 text-xs font-semibold text-ink",
                        step.color,
                      )}
                    >
                      {step.label}
                    </motion.span>
                    {index < flowSteps.length - 1 ? (
                      <span aria-hidden="true" className="text-white/40">
                        →
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Form pane. */}
          <div className="p-8 sm:p-10">
            {/* Compact brand header (visible on small screens where the pane is hidden). */}
            <div className="flex items-center gap-3 lg:hidden">
              <span className="grid size-11 place-items-center rounded-md border-2 border-ink bg-brand text-base font-bold text-white shadow-[2px_2px_0_0_var(--color-ink)]">
                {appConfig.monogram}
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-soft">
                  Jump
                </p>
                <p className="text-lg font-semibold text-strong">{appName}</p>
              </div>
            </div>

            <h1 className="mt-7 text-2xl font-semibold tracking-tight text-strong lg:mt-0">
              Acesse a plataforma
            </h1>
            <p className="mt-2 text-sm leading-6 text-medium">
              Plataforma operacional dos consultores da Jump. Entre com sua conta
              corporativa para continuar.
            </p>

            {variant === "unconfigured" ? (
              <div className="mt-7 flex items-start gap-3 rounded-md border-2 border-ink bg-warning-soft px-4 py-3">
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-warning"
                />
                <p className="text-sm leading-6 text-strong">
                  Autenticação não configurada neste ambiente. Defina as
                  variáveis do provedor (Microsoft Entra ID) ou habilite{" "}
                  <code className="rounded bg-surface px-1 py-0.5 text-xs">
                    AUTH_DEV_MODE
                  </code>{" "}
                  em desenvolvimento.
                </p>
              </div>
            ) : (
              <form action={action} className="mt-7">
                <button
                  type="submit"
                  className={cn(
                    "inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-dark",
                    tactileButton,
                    focusRing,
                  )}
                >
                  <LogIn aria-hidden="true" className="size-4" />
                  {ctaLabel[variant]}
                </button>
              </form>
            )}

            {variant === "dev" ? (
              <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-soft">
                <ShieldCheck aria-hidden="true" className="size-3.5" />
                Modo de desenvolvimento: usuário mockado, sem credenciais reais.
              </p>
            ) : (
              <p className="mt-4 text-xs text-soft">
                Acesso restrito a usuários autorizados da Jump.
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </main>
  );
}
