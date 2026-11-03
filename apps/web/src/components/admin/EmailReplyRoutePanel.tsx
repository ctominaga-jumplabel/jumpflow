"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CornerUpLeft, Plus, X } from "lucide-react";
import { saveEmailReplyRouteAction } from "@/app/app/admin/templates-email/reply-actions";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ROLE_NAMES, roleLabels, type RoleName } from "@/lib/auth/roles";
import {
  describeReplyRecipient,
  REPLY_RECIPIENT_MAX,
  replyRecipientsSchema,
  type ReplyRecipient,
} from "@/lib/automation/email/reply-routing-core";
import { focusRing, focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";

export interface ReplyRouteView {
  active: boolean;
  recipients: ReplyRecipient[];
}

export interface ReplyRoutingSettingsView {
  canEdit: boolean;
  /** Resend Inbound completo (domínio + webhook + API key). */
  inboundConfigured: boolean;
  /** Exemplo do endereço de resposta (`respostas+<token>@domínio`). */
  inboundAddressExample: string | null;
  /** Eventos cujas respostas ficam registradas no Flow mesmo sem destino. */
  captureEvents: string[];
  routes: Record<string, ReplyRouteView>;
}

const inputCls = cn(
  "rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink",
  focusRingInput,
);
const btnPrimary = cn(
  "inline-flex items-center gap-1.5 rounded-md border-2 border-ink bg-brand-fill px-3 py-1.5 text-sm font-bold text-white shadow-[3px_3px_0_0_var(--color-ink)] disabled:opacity-60",
  focusRing,
);
const btnGhost = cn(
  "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-medium hover:bg-surface-muted disabled:opacity-60",
  focusRing,
);

/** Perfis oferecidos como grupo de destino (SENSITIVE_DATA não é time). */
const ROLE_OPTIONS = ROLE_NAMES.filter((r) => r !== "SENSITIVE_DATA" && r !== "CONSULTANT");

/**
 * Destino das RESPOSTAS ao e-mail do evento: e-mails específicos e/ou perfis
 * (todos os usuários ativos do perfil). Com o Resend Inbound configurado, as
 * respostas passam pelo Flow (registradas e encaminhadas); sem ele, o Reply-To
 * aponta direto para esses destinatários.
 */
export function EmailReplyRoutePanel({
  event,
  settings,
}: {
  event: string;
  settings: ReplyRoutingSettingsView;
}) {
  const router = useRouter();
  const { feedback, notify } = useFeedback();
  const [pending, startTransition] = useTransition();
  const initial = settings.routes[event] ?? { active: true, recipients: [] };
  const [recipients, setRecipients] = useState<ReplyRecipient[]>(initial.recipients);
  const [active, setActive] = useState(initial.active);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RoleName | "">("");
  const captured = settings.captureEvents.includes(event);
  const dirty =
    JSON.stringify({ active, recipients }) !==
    JSON.stringify({ active: initial.active, recipients: initial.recipients });

  function addEmail() {
    const parsed = replyRecipientsSchema.safeParse([
      ...recipients,
      { type: "STATIC", address: email },
    ]);
    if (!parsed.success) {
      notify("warning", parsed.error.issues[0]?.message ?? "E-mail inválido.");
      return;
    }
    setRecipients(parsed.data);
    setEmail("");
  }

  function addRole() {
    if (!role) return;
    const parsed = replyRecipientsSchema.safeParse([...recipients, { type: "ROLE", address: role }]);
    if (parsed.success) setRecipients(parsed.data);
    setRole("");
  }

  function save() {
    startTransition(async () => {
      const result = await saveEmailReplyRouteAction({ event, active, recipients });
      if (!result.ok) {
        notify("warning", result.message);
        return;
      }
      notify(
        "success",
        recipients.length
          ? "Destino das respostas salvo."
          : "Destino removido: respostas voltam ao remetente padrão.",
      );
      router.refresh();
    });
  }

  return (
    <section
      aria-labelledby={`reply-route-${event}`}
      className="space-y-3 rounded-[var(--radius-card)] border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_var(--color-ink)]"
    >
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <CornerUpLeft aria-hidden className="size-4 text-medium" />
          <h3 id={`reply-route-${event}`} className="text-base font-bold text-strong">
            Respostas a este e-mail
          </h3>
          {settings.inboundConfigured ? (
            <StatusBadge tone="success">Recebimento ativo</StatusBadge>
          ) : (
            <StatusBadge tone="warning">Recebimento não configurado</StatusBadge>
          )}
        </div>
        <p className="text-sm text-medium">
          Quando o destinatário responder, a resposta vai para os e-mails e perfis abaixo.
          {settings.inboundConfigured
            ? ` A resposta passa pelo Flow (${settings.inboundAddressExample ?? "endereço de respostas"}), fica registrada e é encaminhada com os anexos.`
            : " Sem o recebimento do Resend configurado, o Reply-To aponta direto para esses destinatários (a resposta não fica registrada no Flow)."}
        </p>
        {captured ? (
          <p className="text-xs text-medium">
            {settings.inboundConfigured
              ? "Este evento também registra as respostas no Flow: a NF enviada pelo próprio consultor vira anexo do pagamento. Sem destino configurado, as respostas são encaminhadas ao perfil Financeiro."
              : "Com o recebimento configurado, a NF anexada na resposta vira anexo do pagamento."}
          </p>
        ) : null}
        {!settings.inboundConfigured && recipients.some((r) => r.type === "ROLE") ? (
          <p className="text-xs font-semibold text-warning">
            Atenção: sem o recebimento configurado, o Reply-To lista os e-mails de todos os
            usuários do perfil — visíveis para quem recebe este e-mail (clientes/consultores).
          </p>
        ) : null}
      </header>
      <FeedbackBanner message={feedback} />

      {recipients.length === 0 ? (
        <p className="text-sm text-soft">Nenhum destino: as respostas vão para o remetente padrão.</p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label="Destinatários das respostas">
          {recipients.map((r) => (
            <li
              key={`${r.type}:${r.address}`}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-muted px-2.5 py-1 text-xs text-ink"
            >
              {describeReplyRecipient(r)}
              {settings.canEdit ? (
                <button
                  type="button"
                  aria-label={`Remover ${describeReplyRecipient(r)}`}
                  className={cn("rounded-full p-0.5 hover:bg-surface", focusRing)}
                  onClick={() => setRecipients(recipients.filter((x) => x !== r))}
                >
                  <X aria-hidden className="size-3" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {settings.canEdit ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addEmail();
              }}
            >
              <label className="grid gap-1 text-xs font-medium text-medium">
                E-mail específico
                <input
                  type="email"
                  className={cn(inputCls, "w-64")}
                  placeholder="financeiro@empresa.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button
                type="submit"
                className={btnGhost}
                disabled={!email.trim() || recipients.length >= REPLY_RECIPIENT_MAX}
              >
                <Plus aria-hidden className="size-4" /> Adicionar
              </button>
            </form>
            <div className="flex items-end gap-2">
              <label className="grid gap-1 text-xs font-medium text-medium">
                Grupo de perfil
                <select
                  className={inputCls}
                  value={role}
                  onChange={(e) => setRole(e.target.value as RoleName | "")}
                >
                  <option value="">Selecione…</option>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {roleLabels[r]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={btnGhost}
                disabled={!role || recipients.length >= REPLY_RECIPIENT_MAX}
                onClick={addRole}
              >
                <Plus aria-hidden className="size-4" /> Adicionar perfil
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-medium">
              <input
                type="checkbox"
                className="size-4 rounded border-border"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Encaminhar respostas
            </label>
            <button type="button" className={btnPrimary} disabled={!dirty || pending} onClick={save}>
              {pending ? "Salvando…" : "Salvar destino"}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
