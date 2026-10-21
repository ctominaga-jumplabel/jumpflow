"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  Trash2,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ActionButton } from "@/components/ui/ActionButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { cn } from "@/lib/utils";
import { focusRing, focusRingInput } from "@/lib/styles";
import { suggestRoleKey } from "@/lib/auth/permission-tree";
import type { RolePermissionCell, RoleView } from "@/lib/db/permissions";
import {
  deleteRoleAction,
  saveRole,
  toggleRoleActive,
} from "@/app/app/admin/permissoes/actions";

const inputCls = cn(
  "rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-strong",
  focusRingInput,
);

const iconBtn = cn(
  "inline-flex size-8 items-center justify-center rounded-md text-medium transition-colors hover:bg-surface-muted hover:text-strong disabled:cursor-not-allowed disabled:opacity-40",
  focusRing,
);

export interface AccessGroupsPanelProps {
  roles: RoleView[];
  matrices: Record<string, RolePermissionCell[]>;
  /** Jump to the Matriz tab with this group selected. */
  onConfigure: (roleId: string) => void;
}

/**
 * CRUD of access groups ("Grupos de acesso") for the Permission Matrix screen.
 * System groups (Administrador, Consultor…) can be renamed/described but never
 * inactivated or deleted; custom groups can be inactivated, and deleted only
 * when no user belongs to them. All rules are enforced on the server too.
 */
export function AccessGroupsPanel({ roles, matrices, onConfigure }: AccessGroupsPanelProps) {
  const router = useRouter();
  const { feedback, notify } = useFeedback();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<RoleView | "new" | null>(null);
  const [toDelete, setToDelete] = useState<RoleView | null>(null);

  const viewableCount = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [rid, cells] of Object.entries(matrices)) {
      out[rid] = cells.filter((c) => c.canView).length;
    }
    return out;
  }, [matrices]);

  const q = query.trim().toLowerCase();
  const visible = q
    ? roles.filter(
        (r) =>
          r.label.toLowerCase().includes(q) ||
          r.key.toLowerCase().includes(q) ||
          (r.description ?? "").toLowerCase().includes(q),
      )
    : roles;

  function toggle(role: RoleView) {
    startTransition(async () => {
      const r = await toggleRoleActive({ roleId: role.id, active: !role.active });
      if (r.ok) {
        notify("success", `Grupo ${role.label} ${r.data.active ? "ativado" : "inativado"}.`);
        router.refresh();
      } else notify("warning", r.message);
    });
  }

  function confirmDelete() {
    if (!toDelete) return;
    const role = toDelete;
    startTransition(async () => {
      const r = await deleteRoleAction({ roleId: role.id });
      setToDelete(null);
      if (r.ok) {
        notify("success", `Grupo ${role.label} excluído.`);
        router.refresh();
      } else notify("warning", r.message);
    });
  }

  return (
    <div className="space-y-4">
      <FeedbackBanner message={feedback} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex w-full max-w-xs flex-col gap-1 text-xs font-semibold text-soft">
          Pesquisar grupo
          <span className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-soft"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nome ou identificador"
              className={cn(inputCls, "w-full pl-8 font-normal")}
            />
          </span>
        </label>
        <ActionButton size="sm" icon={Plus} onClick={() => setEditing("new")}>
          Novo grupo
        </ActionButton>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-card)] border-2 border-ink bg-surface shadow-[4px_4px_0_0_var(--color-ink)]">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b-2 border-ink bg-surface-muted text-xs uppercase tracking-wide text-soft">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Grupo</th>
              <th className="px-4 py-2.5 font-semibold">Identificador</th>
              <th className="px-4 py-2.5 font-semibold">Tipo</th>
              <th className="px-4 py-2.5 text-right font-semibold">Usuários</th>
              <th className="px-4 py-2.5 text-right font-semibold">Telas visíveis</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-soft">
                  Nenhum grupo encontrado.
                </td>
              </tr>
            ) : (
              visible.map((role) => {
                const canDelete = !role.isSystem && role.userCount === 0;
                return (
                  <tr key={role.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 align-top">
                      <span className="font-medium text-strong">{role.label}</span>
                      {role.description ? (
                        <span className="block text-xs text-soft">{role.description}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 align-top font-mono text-xs text-medium">
                      {role.key}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <StatusBadge tone={role.isSystem ? "info" : "neutral"}>
                        {role.isSystem ? "Sistema" : "Personalizado"}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-2.5 text-right align-top tabular-nums text-strong">
                      {role.userCount}
                    </td>
                    <td className="px-4 py-2.5 text-right align-top tabular-nums text-strong">
                      {viewableCount[role.id] ?? 0}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <StatusBadge tone={role.active ? "success" : "neutral"}>
                        {role.active ? "Ativo" : "Inativo"}
                      </StatusBadge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-right align-top">
                      <button
                        type="button"
                        className={iconBtn}
                        title="Configurar permissões"
                        aria-label={`Configurar permissões de ${role.label}`}
                        onClick={() => onConfigure(role.id)}
                      >
                        <KeyRound aria-hidden="true" className="size-4" />
                      </button>
                      <button
                        type="button"
                        className={iconBtn}
                        title="Editar"
                        aria-label={`Editar ${role.label}`}
                        disabled={pending}
                        onClick={() => setEditing(role)}
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                      </button>
                      <button
                        type="button"
                        className={iconBtn}
                        title={
                          role.isSystem
                            ? "Grupos do sistema não podem ser inativados"
                            : role.active
                              ? "Inativar"
                              : "Ativar"
                        }
                        aria-label={`${role.active ? "Inativar" : "Ativar"} ${role.label}`}
                        disabled={pending || (role.isSystem && role.active)}
                        onClick={() => toggle(role)}
                      >
                        {role.active ? (
                          <PowerOff aria-hidden="true" className="size-4" />
                        ) : (
                          <Power aria-hidden="true" className="size-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        className={cn(iconBtn, "text-danger hover:text-danger")}
                        title={
                          role.isSystem
                            ? "Grupos do sistema não podem ser excluídos"
                            : role.userCount > 0
                              ? "Remova os usuários do grupo em Acessos antes de excluir"
                              : "Excluir"
                        }
                        aria-label={`Excluir ${role.label}`}
                        disabled={pending || !canDelete}
                        onClick={() => setToDelete(role)}
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editing ? (
        <RoleFormModal
          role={editing === "new" ? null : editing}
          roles={roles}
          onClose={() => setEditing(null)}
          onSaved={(message, newRoleId) => {
            setEditing(null);
            notify("success", message);
            router.refresh();
            if (newRoleId) onConfigure(newRoleId);
          }}
        />
      ) : null}

      <Modal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title="Excluir grupo?"
        description="As permissões configuradas para este grupo serão removidas. Esta ação não pode ser desfeita."
        footer={
          <>
            <ActionButton variant="secondary" size="sm" disabled={pending} onClick={() => setToDelete(null)}>
              Cancelar
            </ActionButton>
            <ActionButton variant="danger" size="sm" icon={Trash2} disabled={pending} onClick={confirmDelete}>
              Excluir
            </ActionButton>
          </>
        }
      >
        {toDelete ? (
          <p className="text-sm text-medium">
            Excluir o grupo <strong className="text-strong">{toDelete.label}</strong> (
            <span className="font-mono text-xs">{toDelete.key}</span>)?
          </p>
        ) : null}
      </Modal>
    </div>
  );
}

function RoleFormModal({
  role,
  roles,
  onClose,
  onSaved,
}: {
  role: RoleView | null;
  roles: RoleView[];
  onClose: () => void;
  /** `newRoleId` is set on create so the caller can open its matrix. */
  onSaved: (message: string, newRoleId?: string) => void;
}) {
  const isEdit = role !== null;
  const [label, setLabel] = useState(role?.label ?? "");
  const [key, setKey] = useState(role?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState(role?.description ?? "");
  const [copyFrom, setCopyFrom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const effectiveKey = isEdit || keyTouched ? key : suggestRoleKey(label);

  function handleSubmit() {
    setError(null);
    start(async () => {
      const r = await saveRole(
        isEdit
          ? { id: role.id, label, description }
          : {
              key: effectiveKey,
              label,
              description,
              copyFromRoleId: copyFrom || null,
            },
      );
      if (r.ok) {
        onSaved(
          isEdit ? `Grupo ${label} atualizado.` : `Grupo ${label} criado. Configure suas permissões.`,
          isEdit ? undefined : r.data.id,
        );
      } else setError(r.message);
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Editar grupo de acesso" : "Novo grupo de acesso"}
      description={
        isEdit
          ? role.isSystem
            ? "Grupo do sistema: o identificador é fixo; nome e descrição podem ser ajustados."
            : "O identificador é fixo após a criação."
          : "Crie um grupo vazio ou copie as permissões de um grupo existente como ponto de partida."
      }
      footer={
        <>
          <ActionButton variant="secondary" size="sm" disabled={pending} onClick={onClose}>
            Cancelar
          </ActionButton>
          <ActionButton variant="primary" size="sm" disabled={pending || !label.trim()} onClick={handleSubmit}>
            {pending ? "Salvando…" : isEdit ? "Salvar" : "Cadastrar"}
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
        <label className="flex flex-col gap-1 text-xs text-soft">
          Nome do grupo
          <input
            className={inputCls}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex.: Auditoria interna"
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-soft">
          Identificador
          <input
            className={cn(inputCls, "font-mono disabled:opacity-60")}
            value={effectiveKey}
            disabled={isEdit}
            onChange={(e) => {
              setKeyTouched(true);
              setKey(e.target.value);
            }}
            placeholder="auditoria-interna"
          />
          {!isEdit ? (
            <span className="text-[11px]">Letras minúsculas, números e hífen. Não pode ser alterado depois.</span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1 text-xs text-soft">
          Descrição
          <textarea
            className={cn(inputCls, "min-h-16")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Quem pertence a este grupo e para que ele serve"
          />
        </label>
        {!isEdit ? (
          <label className="flex flex-col gap-1 text-xs text-soft">
            Copiar permissões de
            <SearchableSelect
              value={copyFrom}
              onChange={(e) => setCopyFrom(e.target.value)}
              className={inputCls}
            >
              <option value="">Nenhum — começar sem permissões</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </SearchableSelect>
          </label>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </Modal>
  );
}
