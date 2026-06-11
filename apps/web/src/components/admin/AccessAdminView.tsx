"use client";

import { useState, useTransition } from "react";
import {
  Ban,
  Copy,
  Check,
  KeyRound,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ActionButton } from "@/components/ui/ActionButton";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { ROLE_NAMES, roleLabels, type RoleName } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { focusRingInput } from "@/lib/styles";
import type {
  AccessUserView,
  PendingInvitationView,
} from "@/lib/db/invitations";
import {
  changeUserRoles,
  changeUserStatus,
  inviteUser,
  regenerateInvite,
  revokeInvite,
} from "@/app/app/admin/acessos/actions";

const thClass =
  "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-soft";
const tdClass = "px-4 py-3 text-sm text-medium align-top";

function formatDateTime(value: Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export interface AccessAdminViewProps {
  users: AccessUserView[];
  invitations: PendingInvitationView[];
}

/**
 * Admin access management view. Invite people, edit each user's access groups
 * (roles), block/unblock users, and revoke/regenerate pending invitations.
 *
 * When no real email provider is configured, a freshly created/regenerated
 * invite returns a one-time acceptance LINK shown in a highlighted callout with
 * a clear warning to relay it over a secure channel — it is never shown again.
 * Every mutation re-checks ADMIN on the server and reports through a polite
 * live region.
 */
export function AccessAdminView({ users, invitations }: AccessAdminViewProps) {
  const { feedback, notify } = useFeedback();
  const [generatedLink, setGeneratedLink] = useState<{
    email: string;
    link: string;
  } | null>(null);

  function announceInvite(
    result: Awaited<ReturnType<typeof inviteUser>>,
  ) {
    if (!result.ok) {
      notify("warning", result.message);
      return;
    }
    if (result.data.emailed) {
      setGeneratedLink(null);
      notify("success", `Convite enviado por e-mail para ${result.data.email}.`);
      return;
    }
    if (result.data.link) {
      setGeneratedLink({ email: result.data.email, link: result.data.link });
      notify(
        "success",
        "Convite criado. Copie o link abaixo e envie por um canal seguro.",
      );
    }
  }

  return (
    <div className="space-y-6">
      <FeedbackBanner message={feedback} />

      {generatedLink ? (
        <InviteLinkCallout
          email={generatedLink.email}
          link={generatedLink.link}
          onDismiss={() => setGeneratedLink(null)}
        />
      ) : null}

      <InviteForm onResult={announceInvite} />

      <UsersPanel users={users} notify={notify} />

      <InvitationsPanel
        invitations={invitations}
        notify={notify}
        onRegenerated={announceInvite}
      />
    </div>
  );
}

/** One-time acceptance link callout, with copy + secure-relay warning. */
function InviteLinkCallout({
  email,
  link,
  onDismiss,
}: {
  email: string;
  link: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-card)] border-2 border-ink bg-warning-soft p-5 shadow-[4px_4px_0_0_var(--color-ink)]">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border-2 border-ink bg-marker text-ink">
          <KeyRound aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-strong">
            Link de acesso para {email}
          </h3>
          <p className="mt-1 text-xs leading-5 text-strong">
            Copie e envie por um canal seguro. Por segurança, este link não será
            exibido novamente.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="block min-w-0 flex-1 truncate rounded-md border-2 border-ink bg-surface px-3 py-2 text-xs text-strong">
              {link}
            </code>
            <div className="flex shrink-0 gap-2">
              <ActionButton
                size="sm"
                icon={copied ? Check : Copy}
                onClick={copy}
                variant={copied ? "success" : "primary"}
              >
                {copied ? "Copiado" : "Copiar"}
              </ActionButton>
              <ActionButton size="sm" variant="secondary" onClick={onDismiss}>
                Fechar
              </ActionButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Invite form: name, email, multi-select of access groups (roles). */
function InviteForm({
  onResult,
}: {
  onResult: (result: Awaited<ReturnType<typeof inviteUser>>) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<RoleName[]>(["CONSULTANT"]);
  const [isPending, start] = useTransition();

  function toggleRole(role: RoleName) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await inviteUser({ name, email, roles });
      onResult(result);
      if (result.ok) {
        setName("");
        setEmail("");
        setRoles(["CONSULTANT"]);
      }
    });
  }

  return (
    <SectionPanel
      title="Convidar pessoa"
      description="Cria um convite por link único. A pessoa define a senha ao aceitar — não há cadastro público."
    >
      <form onSubmit={submit} className="space-y-5 px-5 py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="invite-name"
              className="block text-sm font-medium text-strong"
            >
              Nome
            </label>
            <input
              id="invite-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Nome completo"
              className={cn(
                "w-full rounded-md border-2 border-ink bg-surface px-3.5 py-2.5 text-sm text-strong placeholder:text-soft",
                focusRingInput,
              )}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="invite-email"
              className="block text-sm font-medium text-strong"
            >
              E-mail
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="pessoa@jumplabel.com.br"
              autoComplete="email"
              className={cn(
                "w-full rounded-md border-2 border-ink bg-surface px-3.5 py-2.5 text-sm text-strong placeholder:text-soft",
                focusRingInput,
              )}
            />
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-strong">
            Grupos de acesso
          </legend>
          <div className="flex flex-wrap gap-2">
            {ROLE_NAMES.map((role) => {
              const checked = roles.includes(role);
              return (
                <label
                  key={role}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-md border-2 px-3 py-1.5 text-sm font-semibold transition-colors",
                    checked
                      ? "border-ink bg-marker text-ink shadow-[2px_2px_0_0_var(--color-ink)]"
                      : "border-ink/20 bg-surface text-medium hover:border-ink/40",
                    "outline-none focus-within:ring-2 focus-within:ring-brand focus-within:ring-offset-2 focus-within:ring-offset-surface",
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggleRole(role)}
                  />
                  {roleLabels[role]}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex justify-end">
          <ActionButton
            type="submit"
            icon={UserPlus}
            disabled={isPending || roles.length === 0}
            aria-busy={isPending}
          >
            {isPending ? "Convidando…" : "Convidar"}
          </ActionButton>
        </div>
      </form>
    </SectionPanel>
  );
}

/** Users list with editable roles and a block/unblock toggle. */
function UsersPanel({
  users,
  notify,
}: {
  users: AccessUserView[];
  notify: ReturnType<typeof useFeedback>["notify"];
}) {
  return (
    <SectionPanel
      title="Usuários"
      description="Grupos de acesso e status. Edite os grupos pelos seletores; bloqueie ou reative pelo botão de status."
    >
      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum usuário ainda"
          description="Convide a primeira pessoa para a plataforma."
          className="border-0 shadow-none"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-ink">
                <th scope="col" className={thClass}>
                  Pessoa
                </th>
                <th scope="col" className={thClass}>
                  Grupos de acesso
                </th>
                <th scope="col" className={thClass}>
                  Status
                </th>
                <th scope="col" className={thClass}>
                  Último acesso
                </th>
                <th scope="col" className={`${thClass} text-right`}>
                  Ação
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <UserRow key={user.id} user={user} notify={notify} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionPanel>
  );
}

function UserRow({
  user,
  notify,
}: {
  user: AccessUserView;
  notify: ReturnType<typeof useFeedback>["notify"];
}) {
  const [roles, setRoles] = useState<RoleName[]>(user.roles);
  const [status, setStatus] = useState(user.status);
  const [isSaving, startSave] = useTransition();
  const [isToggling, startToggle] = useTransition();

  const dirty =
    roles.length !== user.roles.length ||
    roles.some((r) => !user.roles.includes(r)) ||
    user.roles.some((r) => !roles.includes(r));

  function toggleRole(role: RoleName) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  function saveRoles() {
    startSave(async () => {
      const result = await changeUserRoles({ targetUserId: user.id, roles });
      if (!result.ok) {
        notify("warning", result.message);
        setRoles(user.roles); // revert optimistic edit
        return;
      }
      notify("success", `Grupos atualizados para ${user.name}.`);
    });
  }

  function toggleStatus() {
    const next = status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    startToggle(async () => {
      const result = await changeUserStatus({
        targetUserId: user.id,
        status: next,
      });
      if (!result.ok) {
        notify("warning", result.message);
        return;
      }
      setStatus(next);
      notify(
        "success",
        next === "INACTIVE"
          ? `${user.name} foi bloqueado.`
          : `${user.name} foi reativado.`,
      );
    });
  }

  return (
    <tr className="border-b border-ink/10 align-top">
      <td className={tdClass}>
        <span className="block font-semibold text-strong">{user.name}</span>
        <span className="block text-xs text-soft">{user.email}</span>
      </td>
      <td className={tdClass}>
        <div className="flex flex-wrap gap-1.5">
          {ROLE_NAMES.map((role) => {
            const checked = roles.includes(role);
            return (
              <label
                key={role}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors",
                  checked
                    ? "border-ink bg-marker text-ink"
                    : "border-ink/15 bg-surface-muted text-medium hover:border-ink/30",
                  "outline-none focus-within:ring-2 focus-within:ring-brand focus-within:ring-offset-2 focus-within:ring-offset-surface",
                )}
                title={roleLabels[role]}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => toggleRole(role)}
                />
                {roleLabels[role]}
              </label>
            );
          })}
        </div>
        {dirty ? (
          <div className="mt-2">
            <ActionButton
              size="sm"
              icon={ShieldCheck}
              onClick={saveRoles}
              disabled={isSaving || roles.length === 0}
              aria-busy={isSaving}
            >
              {isSaving ? "Salvando…" : "Salvar grupos"}
            </ActionButton>
          </div>
        ) : null}
      </td>
      <td className={tdClass}>
        <StatusBadge tone={status === "ACTIVE" ? "success" : "neutral"}>
          {status === "ACTIVE" ? "Ativo" : "Bloqueado"}
        </StatusBadge>
      </td>
      <td className={`${tdClass} whitespace-nowrap`}>
        {formatDateTime(user.lastLoginAt)}
      </td>
      <td className={`${tdClass} text-right`}>
        <ActionButton
          size="sm"
          variant={status === "ACTIVE" ? "danger" : "success"}
          icon={Ban}
          onClick={toggleStatus}
          disabled={isToggling}
          aria-busy={isToggling}
          aria-label={
            status === "ACTIVE"
              ? `Bloquear ${user.name}`
              : `Reativar ${user.name}`
          }
        >
          {isToggling
            ? "Salvando…"
            : status === "ACTIVE"
              ? "Bloquear"
              : "Reativar"}
        </ActionButton>
      </td>
    </tr>
  );
}

/** Pending invitations with revoke + regenerate. */
function InvitationsPanel({
  invitations,
  notify,
  onRegenerated,
}: {
  invitations: PendingInvitationView[];
  notify: ReturnType<typeof useFeedback>["notify"];
  onRegenerated: (result: Awaited<ReturnType<typeof regenerateInvite>>) => void;
}) {
  return (
    <SectionPanel
      title="Convites pendentes"
      description="Convites ainda não aceitos. Revogue para invalidar o link ou regenere para emitir um novo (o anterior deixa de funcionar)."
    >
      {invitations.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="Nenhum convite pendente"
          description="Convites pendentes aparecerão aqui até serem aceitos, revogados ou expirados."
          className="border-0 shadow-none"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-ink">
                <th scope="col" className={thClass}>
                  Convidado
                </th>
                <th scope="col" className={thClass}>
                  Grupos
                </th>
                <th scope="col" className={thClass}>
                  Expira em
                </th>
                <th scope="col" className={`${thClass} text-right`}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((invite) => (
                <InvitationRow
                  key={invite.id}
                  invite={invite}
                  notify={notify}
                  onRegenerated={onRegenerated}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionPanel>
  );
}

function InvitationRow({
  invite,
  notify,
  onRegenerated,
}: {
  invite: PendingInvitationView;
  notify: ReturnType<typeof useFeedback>["notify"];
  onRegenerated: (result: Awaited<ReturnType<typeof regenerateInvite>>) => void;
}) {
  const [isRevoking, startRevoke] = useTransition();
  const [isRegenerating, startRegen] = useTransition();

  function revoke() {
    startRevoke(async () => {
      const result = await revokeInvite({ invitationId: invite.id });
      if (!result.ok) {
        notify("warning", result.message);
        return;
      }
      notify("success", `Convite de ${invite.email} revogado.`);
    });
  }

  function regenerate() {
    startRegen(async () => {
      const result = await regenerateInvite({ invitationId: invite.id });
      onRegenerated(result);
    });
  }

  return (
    <tr className="border-b border-ink/10 align-top">
      <td className={tdClass}>
        <span className="block font-semibold text-strong">{invite.name}</span>
        <span className="block text-xs text-soft">{invite.email}</span>
      </td>
      <td className={tdClass}>
        <div className="flex flex-wrap gap-1.5">
          {invite.roles.map((role) => (
            <StatusBadge key={role} tone="info">
              {roleLabels[role]}
            </StatusBadge>
          ))}
        </div>
      </td>
      <td className={`${tdClass} whitespace-nowrap`}>
        {formatDate(invite.expiresAt)}
      </td>
      <td className={`${tdClass} text-right`}>
        <div className="inline-flex gap-2">
          <ActionButton
            size="sm"
            variant="secondary"
            icon={RefreshCw}
            onClick={regenerate}
            disabled={isRegenerating}
            aria-busy={isRegenerating}
            aria-label={`Regenerar convite de ${invite.email}`}
          >
            {isRegenerating ? "Gerando…" : "Regenerar"}
          </ActionButton>
          <ActionButton
            size="sm"
            variant="danger"
            icon={Ban}
            onClick={revoke}
            disabled={isRevoking}
            aria-busy={isRevoking}
            aria-label={`Revogar convite de ${invite.email}`}
          >
            {isRevoking ? "Revogando…" : "Revogar"}
          </ActionButton>
        </div>
      </td>
    </tr>
  );
}
