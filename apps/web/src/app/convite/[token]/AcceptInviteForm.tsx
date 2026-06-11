"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing, focusRingInput, tactileButton } from "@/lib/styles";
import { acceptInvite } from "./actions";

const MIN_PASSWORD = 10;

export interface AcceptInviteFormProps {
  token: string;
  email: string;
  defaultName: string;
}

/**
 * Password-set form for accepting an invitation. The email is read-only (bound
 * to the invitation). On success the user is redirected to /login with a notice
 * that the account was activated. The token is passed back to the action but
 * never displayed or logged.
 */
export function AcceptInviteForm({
  token,
  email,
  defaultName,
}: AcceptInviteFormProps) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD) {
      setError(`A senha deve ter ao menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }

    start(async () => {
      const result = await acceptInvite({ token, password, name });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push("/login?activated=1");
    });
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
      <div className="space-y-1.5">
        <label
          htmlFor="accept-email"
          className="block text-sm font-medium text-strong"
        >
          E-mail
        </label>
        <input
          id="accept-email"
          type="email"
          value={email}
          readOnly
          className={cn(
            "w-full rounded-md border-2 border-ink/40 bg-surface-muted px-3.5 py-2.5 text-sm text-medium",
          )}
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="accept-name"
          className="block text-sm font-medium text-strong"
        >
          Nome
        </label>
        <input
          id="accept-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required
          className={cn(
            "w-full rounded-md border-2 border-ink bg-surface px-3.5 py-2.5 text-sm text-strong placeholder:text-soft",
            focusRingInput,
          )}
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="accept-password"
          className="block text-sm font-medium text-strong"
        >
          Senha
        </label>
        <input
          id="accept-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          aria-describedby="accept-password-hint"
          className={cn(
            "w-full rounded-md border-2 border-ink bg-surface px-3.5 py-2.5 text-sm text-strong placeholder:text-soft",
            focusRingInput,
          )}
        />
        <p id="accept-password-hint" className="text-xs leading-5 text-soft">
          Use ao menos {MIN_PASSWORD} caracteres.
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="accept-confirm"
          className="block text-sm font-medium text-strong"
        >
          Confirmar senha
        </label>
        <input
          id="accept-confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          aria-invalid={
            confirm.length > 0 && confirm !== password ? true : undefined
          }
          className={cn(
            "w-full rounded-md border-2 border-ink bg-surface px-3.5 py-2.5 text-sm text-strong placeholder:text-soft",
            focusRingInput,
          )}
        />
      </div>

      {error ? (
        <div
          id="accept-error"
          role="alert"
          className="flex items-start gap-2 rounded-md border-2 border-ink bg-warning-soft px-3.5 py-2.5"
        >
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-warning"
          />
          <p className="text-sm leading-5 text-strong">{error}</p>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        aria-busy={isPending}
        className={cn(
          "inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-70",
          tactileButton,
          focusRing,
        )}
      >
        <CheckCircle2 aria-hidden="true" className="size-4" />
        {isPending ? "Ativando…" : "Ativar conta"}
      </button>
    </form>
  );
}
