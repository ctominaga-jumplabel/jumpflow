"use client";

import { motion, useReducedMotion } from "motion/react";
import { LogIn, ShieldCheck, TriangleAlert } from "lucide-react";
import { appConfig } from "@/config/app";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";

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

/** Premium, institutional login screen. Motion is restrained (single fade-in). */
export function LoginView({ appName, variant, action }: LoginViewProps) {
  const reduce = useReducedMotion();

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-md bg-brand text-base font-bold text-white">
              {appConfig.monogram}
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-soft">
                Jump
              </p>
              <h1 className="text-lg font-semibold text-strong">{appName}</h1>
            </div>
          </div>

          <h2 className="mt-7 text-2xl font-semibold tracking-tight text-strong">
            Acesse a plataforma
          </h2>
          <p className="mt-2 text-sm leading-6 text-medium">
            Plataforma operacional dos consultores da Jump: horas, alocações,
            skills e aprovações em um fluxo único. Entre com sua conta
            corporativa para continuar.
          </p>

          {variant === "unconfigured" ? (
            <div className="mt-7 flex items-start gap-3 rounded-md border border-warning-soft bg-warning-soft px-4 py-3">
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-warning"
              />
              <p className="text-sm leading-6 text-strong">
                Autenticação não configurada neste ambiente. Defina as variáveis
                do provedor (Microsoft Entra ID) ou habilite{" "}
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
                  "inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-dark",
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
      </motion.div>
    </main>
  );
}
