"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, LogIn, ShieldCheck, TriangleAlert } from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import { cn } from "@/lib/utils";
import { focusRing, focusRingInput, tactileButton } from "@/lib/styles";
import type { LoginCredentialsState } from "@/lib/auth/messages";

export type LoginVariant = "dev" | "credentials" | "entra" | "unconfigured";

type CredentialsAction = (
  prevState: LoginCredentialsState,
  formData: FormData,
) => Promise<LoginCredentialsState>;

export interface LoginViewProps {
  appName: string;
  variant: LoginVariant;
  /** Show the Entra button alongside the primary variant (coexists with credentials). */
  showEntra?: boolean;
  /** Show a "account activated, please sign in" notice (post-invite acceptance). */
  activated?: boolean;
  /** Bound dev-login action (present only for the `dev` variant). */
  devAction?: () => void | Promise<void>;
  /** Bound Entra OAuth action (present when Entra is configured). */
  entraAction?: () => void | Promise<void>;
  /** Bound email/password action (present only for the `credentials` variant). */
  credentialsAction?: CredentialsAction;
}

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
export function LoginView({
  appName,
  variant,
  showEntra = false,
  activated = false,
  devAction,
  entraAction,
  credentialsAction,
}: LoginViewProps) {
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
              <BrandMark size={44} />
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
              <BrandMark size={44} />
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

            {activated ? (
              <div className="mt-7 flex items-start gap-3 rounded-md border-2 border-ink bg-success-soft px-4 py-3">
                <CheckCircle2
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-success"
                />
                <p className="text-sm leading-6 text-strong">
                  Conta ativada com sucesso. Faça login com seu e-mail e a senha
                  que você acabou de definir.
                </p>
              </div>
            ) : null}

            {variant === "unconfigured" ? (
              <div className="mt-7 flex items-start gap-3 rounded-md border-2 border-ink bg-warning-soft px-4 py-3">
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-warning"
                />
                <p className="text-sm leading-6 text-strong">
                  Autenticação não configurada neste ambiente. Defina as
                  variáveis do provedor (Microsoft Entra ID), habilite o login
                  por e-mail e senha (
                  <code className="rounded bg-surface px-1 py-0.5 text-xs">
                    AUTH_CREDENTIALS_ENABLED
                  </code>
                  ) ou ative{" "}
                  <code className="rounded bg-surface px-1 py-0.5 text-xs">
                    AUTH_DEV_MODE
                  </code>{" "}
                  em desenvolvimento.
                </p>
              </div>
            ) : null}

            {variant === "credentials" && credentialsAction ? (
              <CredentialsForm action={credentialsAction} />
            ) : null}

            {variant === "dev" && devAction ? (
              <form action={devAction} className="mt-7">
                <SubmitButton label="Entrar (ambiente de desenvolvimento)" />
              </form>
            ) : null}

            {/* Entra: primary when it is the variant, or secondary alongside credentials. */}
            {(variant === "entra" || (variant === "credentials" && showEntra)) &&
            entraAction ? (
              <>
                {variant === "credentials" ? (
                  <div className="mt-6 flex items-center gap-3">
                    <span className="h-px flex-1 bg-ink/15" />
                    <span className="text-xs font-medium uppercase tracking-wide text-soft">
                      ou
                    </span>
                    <span className="h-px flex-1 bg-ink/15" />
                  </div>
                ) : null}
                <form
                  action={entraAction}
                  className={variant === "credentials" ? "mt-6" : "mt-7"}
                >
                  <SubmitButton
                    label="Entrar com Microsoft"
                    variant={variant === "credentials" ? "secondary" : "primary"}
                  />
                </form>
              </>
            ) : null}

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

/** Submit button shared by every login variant. Disabled while pending. */
function SubmitButton({
  label,
  variant = "primary",
}: {
  label: string;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-70",
        variant === "primary"
          ? "bg-brand text-white hover:bg-brand-dark"
          : "border-2 border-ink bg-surface text-strong hover:bg-canvas",
        tactileButton,
        focusRing,
      )}
    >
      <LogIn aria-hidden="true" className="size-4" />
      {pending ? "Entrando…" : label}
    </button>
  );
}

/** Email/password form. Errors are generic — never leak account existence. */
function CredentialsForm({ action }: { action: CredentialsAction }) {
  const [state, formAction] = useActionState<LoginCredentialsState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="mt-7 space-y-4" noValidate>
      <div className="space-y-1.5">
        <label
          htmlFor="login-email"
          className="block text-sm font-medium text-strong"
        >
          E-mail
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder="voce@jumplabel.com.br"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-error" : undefined}
          className={cn(
            "w-full rounded-md border-2 border-ink bg-surface px-3.5 py-2.5 text-sm text-strong placeholder:text-soft",
            focusRingInput,
          )}
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="login-password"
          className="block text-sm font-medium text-strong"
        >
          Senha
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-error" : undefined}
          className={cn(
            "w-full rounded-md border-2 border-ink bg-surface px-3.5 py-2.5 text-sm text-strong placeholder:text-soft",
            focusRingInput,
          )}
        />
      </div>

      {state.error ? (
        <div
          id="login-error"
          role="alert"
          className="flex items-start gap-2 rounded-md border-2 border-ink bg-warning-soft px-3.5 py-2.5"
        >
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-warning"
          />
          <p className="text-sm leading-5 text-strong">{state.error}</p>
        </div>
      ) : null}

      <SubmitButton label="Entrar" />
    </form>
  );
}
