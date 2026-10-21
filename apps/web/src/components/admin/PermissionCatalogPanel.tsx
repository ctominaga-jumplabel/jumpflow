"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CornerDownRight,
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
import { MANAGE_PERMISSIONS_CODE } from "@/lib/auth/permission-codes";
import {
  groupPermissionTree,
  suggestPermissionCode,
} from "@/lib/auth/permission-tree";
import type { PermissionView, RolePermissionCell } from "@/lib/db/permissions";
import {
  deletePermissionAction,
  savePermission,
  togglePermissionActive,
} from "@/app/app/admin/permissoes/actions";

const inputCls = cn(
  "rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-strong",
  focusRingInput,
);

const iconBtn = cn(
  "inline-flex size-8 items-center justify-center rounded-md text-medium transition-colors hover:bg-surface-muted hover:text-strong disabled:cursor-not-allowed disabled:opacity-40",
  focusRing,
);

type StatusFilter = "all" | "active" | "inactive";

type Draft =
  | { mode: "new"; parent: PermissionView | null }
  | { mode: "edit"; permission: PermissionView };

export interface PermissionCatalogPanelProps {
  permissions: PermissionView[];
  matrices: Record<string, RolePermissionCell[]>;
  /** permission code → screen route (from the navigation). */
  screenRoutes: Record<string, string>;
}

/**
 * CRUD of the feature catalog ("Funcionalidades") behind the Permission Matrix,
 * organized like the app: módulo → tela → subtelas/funcionalidades. Native
 * features (seeded, read by the guards) keep their code and cannot be deleted —
 * only renamed, reordered or inactivated. Admin-created features can be fully
 * managed. All rules are enforced on the server too.
 */
export function PermissionCatalogPanel({
  permissions,
  matrices,
  screenRoutes,
}: PermissionCatalogPanelProps) {
  const router = useRouter();
  const { feedback, notify } = useFeedback();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toDelete, setToDelete] = useState<PermissionView | null>(null);
  const [toDeactivate, setToDeactivate] = useState<PermissionView | null>(null);

  const byId = useMemo(() => new Map(permissions.map((p) => [p.id, p])), [permissions]);
  const childCount = useMemo(() => {
    const out = new Map<string, number>();
    for (const p of permissions) {
      if (p.parentId) out.set(p.parentId, (out.get(p.parentId) ?? 0) + 1);
    }
    return out;
  }, [permissions]);

  // How many groups can SEE each feature — a quick read of its reach.
  const groupsWithView = useMemo(() => {
    const out = new Map<string, number>();
    for (const cells of Object.values(matrices)) {
      for (const c of cells) {
        if (c.canView) out.set(c.permissionId, (out.get(c.permissionId) ?? 0) + 1);
      }
    }
    return out;
  }, [matrices]);

  const routeOf = (p: PermissionView): string | undefined => {
    if (screenRoutes[p.code]) return screenRoutes[p.code];
    const parent = p.parentId ? byId.get(p.parentId) : undefined;
    return parent ? screenRoutes[parent.code] : undefined;
  };

  const q = query.trim().toLowerCase();
  const filtered = permissions.filter((p) => {
    if (status === "active" && !p.active) return false;
    if (status === "inactive" && p.active) return false;
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.module.toLowerCase().includes(q) ||
      (routeOf(p) ?? "").toLowerCase().includes(q)
    );
  });
  const modules = groupPermissionTree(filtered);

  const total = permissions.length;
  const inactive = permissions.filter((p) => !p.active).length;
  const custom = permissions.filter((p) => !p.isSystem).length;

  function setActive(p: PermissionView, active: boolean) {
    startTransition(async () => {
      const r = await togglePermissionActive({ permissionId: p.id, active });
      setToDeactivate(null);
      if (r.ok) {
        notify("success", `${p.name} ${active ? "ativada" : "inativada"}.`);
        router.refresh();
      } else notify("warning", r.message);
    });
  }

  function confirmDelete() {
    if (!toDelete) return;
    const p = toDelete;
    startTransition(async () => {
      const r = await deletePermissionAction({ permissionId: p.id });
      setToDelete(null);
      if (r.ok) {
        notify("success", `${p.name} excluída.`);
        router.refresh();
      } else notify("warning", r.message);
    });
  }

  return (
    <div className="space-y-4">
      <FeedbackBanner message={feedback} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-full max-w-xs flex-col gap-1 text-xs font-semibold text-soft sm:w-72">
            Pesquisar funcionalidade
            <span className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-soft"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nome, código, módulo ou rota"
                className={cn(inputCls, "w-full pl-8 font-normal")}
              />
            </span>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-soft">
            Status
            <SearchableSelect
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className={cn(inputCls, "font-normal")}
            >
              <option value="all">Todas</option>
              <option value="active">Ativas</option>
              <option value="inactive">Inativas</option>
            </SearchableSelect>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-soft">
            {total} funcionalidades · {custom} personalizadas · {inactive} inativas
          </p>
          <ActionButton size="sm" icon={Plus} onClick={() => setDraft({ mode: "new", parent: null })}>
            Nova funcionalidade
          </ActionButton>
        </div>
      </div>

      {modules.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border-2 border-ink bg-surface px-5 py-8 text-center text-sm text-soft">
          Nenhuma funcionalidade encontrada.
        </p>
      ) : (
        modules.map(([module, items]) => (
          <section
            key={module}
            aria-label={module}
            className="overflow-x-auto rounded-[var(--radius-card)] border-2 border-ink bg-surface shadow-[4px_4px_0_0_var(--color-ink)]"
          >
            <div className="flex items-center justify-between gap-3 border-b-2 border-ink bg-surface-muted px-4 py-2.5">
              <h3 className="text-sm font-semibold text-strong">{module}</h3>
              <span className="text-xs text-soft">
                {items.length} {items.length === 1 ? "item" : "itens"}
              </span>
            </div>
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-soft">
                <tr>
                  <th className="px-4 py-2 font-semibold">Funcionalidade</th>
                  <th className="px-4 py-2 font-semibold">Código</th>
                  <th className="px-4 py-2 font-semibold">Tela</th>
                  <th className="px-4 py-2 font-semibold">Tipo</th>
                  <th className="px-4 py-2 text-right font-semibold">Grupos c/ acesso</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const parent = p.parentId ? byId.get(p.parentId) : undefined;
                  const isChild = Boolean(parent && parent.module === p.module);
                  const children = childCount.get(p.id) ?? 0;
                  const canDelete = !p.isSystem && children === 0;
                  const locked = p.code === MANAGE_PERMISSIONS_CODE;
                  return (
                    <tr
                      key={p.id}
                      className={cn("border-b border-border/60 last:border-0", !p.active && "opacity-60")}
                    >
                      <td className="px-4 py-2 align-top">
                        <span className={cn("flex items-start gap-1.5", isChild && "pl-5")}>
                          {isChild ? (
                            <CornerDownRight aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-soft" />
                          ) : null}
                          <span>
                            <span className={cn("text-strong", isChild ? "font-normal" : "font-semibold")}>
                              {p.name}
                            </span>
                            {p.description ? (
                              <span className="block text-xs text-soft">{p.description}</span>
                            ) : null}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-2 align-top font-mono text-xs text-medium">{p.code}</td>
                      <td className="px-4 py-2 align-top font-mono text-xs text-medium">
                        {routeOf(p) ?? <span className="font-sans text-soft">—</span>}
                      </td>
                      <td className="px-4 py-2 align-top">
                        <span className="flex flex-wrap gap-1">
                          <StatusBadge tone="neutral">{isChild ? "Subtela" : "Tela"}</StatusBadge>
                          {p.isSystem ? null : <StatusBadge tone="info">Personalizada</StatusBadge>}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right align-top tabular-nums text-strong">
                        {groupsWithView.get(p.id) ?? 0}
                      </td>
                      <td className="px-4 py-2 align-top">
                        <StatusBadge tone={p.active ? "success" : "neutral"}>
                          {p.active ? "Ativa" : "Inativa"}
                        </StatusBadge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-1 text-right align-top">
                        {!isChild ? (
                          <button
                            type="button"
                            className={iconBtn}
                            title="Adicionar subtela"
                            aria-label={`Adicionar subtela em ${p.name}`}
                            disabled={pending}
                            onClick={() => setDraft({ mode: "new", parent: p })}
                          >
                            <Plus aria-hidden="true" className="size-4" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={iconBtn}
                          title="Editar"
                          aria-label={`Editar ${p.name}`}
                          disabled={pending}
                          onClick={() => setDraft({ mode: "edit", permission: p })}
                        >
                          <Pencil aria-hidden="true" className="size-4" />
                        </button>
                        <button
                          type="button"
                          className={iconBtn}
                          title={
                            locked
                              ? "A Matriz de Permissões não pode ser inativada"
                              : p.active
                                ? "Inativar"
                                : "Ativar"
                          }
                          aria-label={`${p.active ? "Inativar" : "Ativar"} ${p.name}`}
                          disabled={pending || (locked && p.active)}
                          onClick={() => (p.active ? setToDeactivate(p) : setActive(p, true))}
                        >
                          {p.active ? (
                            <PowerOff aria-hidden="true" className="size-4" />
                          ) : (
                            <Power aria-hidden="true" className="size-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          className={cn(iconBtn, "text-danger hover:text-danger")}
                          title={
                            p.isSystem
                              ? "Funcionalidades do sistema não podem ser excluídas — inative-a"
                              : children > 0
                                ? "Exclua ou mova as subtelas antes"
                                : "Excluir"
                          }
                          aria-label={`Excluir ${p.name}`}
                          disabled={pending || !canDelete}
                          onClick={() => setToDelete(p)}
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))
      )}

      {draft ? (
        <PermissionFormModal
          draft={draft}
          permissions={permissions}
          onClose={() => setDraft(null)}
          onSaved={(message) => {
            setDraft(null);
            notify("success", message);
            router.refresh();
          }}
        />
      ) : null}

      <Modal
        open={toDeactivate !== null}
        onClose={() => setToDeactivate(null)}
        title="Inativar funcionalidade?"
        description="Enquanto inativa, ela deixa de valer na matriz para TODOS os grupos — inclusive Administrador. Se for uma tela do menu, ela some para todos."
        footer={
          <>
            <ActionButton variant="secondary" size="sm" disabled={pending} onClick={() => setToDeactivate(null)}>
              Cancelar
            </ActionButton>
            <ActionButton
              variant="danger"
              size="sm"
              icon={PowerOff}
              disabled={pending}
              onClick={() => toDeactivate && setActive(toDeactivate, false)}
            >
              Inativar
            </ActionButton>
          </>
        }
      >
        {toDeactivate ? (
          <p className="text-sm text-medium">
            Inativar <strong className="text-strong">{toDeactivate.name}</strong> (
            <span className="font-mono text-xs">{toDeactivate.code}</span>)? As permissões
            configuradas são preservadas e voltam a valer ao reativar.
          </p>
        ) : null}
      </Modal>

      <Modal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title="Excluir funcionalidade?"
        description="As permissões de todos os grupos para esta funcionalidade serão removidas. Esta ação não pode ser desfeita."
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
            Excluir <strong className="text-strong">{toDelete.name}</strong> (
            <span className="font-mono text-xs">{toDelete.code}</span>)?
          </p>
        ) : null}
      </Modal>
    </div>
  );
}

function PermissionFormModal({
  draft,
  permissions,
  onClose,
  onSaved,
}: {
  draft: Draft;
  permissions: PermissionView[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const editing = draft.mode === "edit" ? draft.permission : null;
  const initialParent =
    draft.mode === "new"
      ? draft.parent
      : permissions.find((p) => p.id === draft.permission.parentId) ?? null;

  const [name, setName] = useState(editing?.name ?? "");
  const [code, setCode] = useState(editing?.code ?? "");
  const [codeTouched, setCodeTouched] = useState(false);
  const [parentId, setParentId] = useState(initialParent?.id ?? "");
  const [moduleName, setModuleName] = useState(
    editing?.module ?? initialParent?.module ?? "",
  );
  const [description, setDescription] = useState(editing?.description ?? "");
  const [sortOrder, setSortOrder] = useState(
    String(editing?.sortOrder ?? nextSortOrder(permissions, initialParent)),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const parent = permissions.find((p) => p.id === parentId) ?? null;
  const hasChildren = editing ? permissions.some((p) => p.parentId === editing.id) : false;
  const codeLocked = Boolean(editing?.isSystem);
  const effectiveCode =
    editing || codeTouched ? code : suggestPermissionCode(name, parent?.code);
  const effectiveModule = parent ? parent.module : moduleName;

  const modules = useMemo(
    () => [...new Set(permissions.map((p) => p.module))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [permissions],
  );
  // Only top-level screens can be parents (two-level hierarchy), never itself.
  const parentOptions = useMemo(
    () =>
      groupPermissionTree(
        permissions.filter((p) => !p.parentId && p.id !== editing?.id),
      ),
    [permissions, editing],
  );

  function handleSubmit() {
    setError(null);
    const order = Number.parseInt(sortOrder, 10);
    start(async () => {
      const r = await savePermission({
        ...(editing ? { id: editing.id } : {}),
        code: effectiveCode,
        name,
        module: effectiveModule,
        description,
        parentId: parentId || null,
        sortOrder: Number.isFinite(order) ? order : undefined,
      });
      if (r.ok) onSaved(editing ? `${name} atualizada.` : `${name} cadastrada.`);
      else setError(r.message);
    });
  }

  const title = editing
    ? "Editar funcionalidade"
    : draft.mode === "new" && draft.parent
      ? `Nova subtela em ${draft.parent.name}`
      : "Nova funcionalidade";

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description="Use o mesmo nome exibido no menu ou na aba da tela, para que a matriz espelhe o que o usuário vê."
      footer={
        <>
          <ActionButton variant="secondary" size="sm" disabled={pending} onClick={onClose}>
            Cancelar
          </ActionButton>
          <ActionButton
            variant="primary"
            size="sm"
            disabled={pending || !name.trim() || !effectiveModule.trim() || !effectiveCode}
            onClick={handleSubmit}
          >
            {pending ? "Salvando…" : editing ? "Salvar" : "Cadastrar"}
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
        <label className="flex flex-col gap-1 text-xs text-soft">
          Tela pai
          <SearchableSelect
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            disabled={hasChildren}
            className={inputCls}
          >
            <option value="">Nenhuma — é uma tela principal</option>
            {parentOptions.map(([mod, items]) => (
              <optgroup key={mod} label={mod}>
                {items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </SearchableSelect>
          {hasChildren ? (
            <span className="text-[11px]">Possui subtelas, por isso permanece como tela principal.</span>
          ) : null}
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_6rem]">
          <label className="flex flex-col gap-1 text-xs text-soft">
            Módulo
            <input
              className={cn(inputCls, "disabled:opacity-60")}
              list="permission-modules"
              value={effectiveModule}
              disabled={Boolean(parent)}
              onChange={(e) => setModuleName(e.target.value)}
              placeholder="Ex.: Horas"
            />
            <datalist id="permission-modules">
              {modules.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            {parent ? <span className="text-[11px]">Herdado da tela pai.</span> : null}
          </label>
          <label className="flex flex-col gap-1 text-xs text-soft">
            Ordem
            <input
              className={inputCls}
              type="number"
              inputMode="numeric"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs text-soft">
          Nome
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={parent ? "Ex.: Detalhamento por consultor" : "Ex.: Relatórios"}
            autoFocus
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-soft">
          Código
          <input
            className={cn(inputCls, "font-mono disabled:opacity-60")}
            value={effectiveCode}
            disabled={codeLocked}
            onChange={(e) => {
              setCodeTouched(true);
              setCode(e.target.value.toUpperCase());
            }}
            placeholder="HORAS_RELATORIOS"
          />
          <span className="text-[11px]">
            {codeLocked
              ? "Funcionalidade do sistema: o código é lido pelas regras de acesso e não pode mudar."
              : "Letras maiúsculas, números e underscore. É o identificador usado pelas regras de acesso."}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-xs text-soft">
          Descrição
          <textarea
            className={cn(inputCls, "min-h-16")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="O que esta permissão libera na tela"
          />
        </label>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </Modal>
  );
}

/** Next free sortOrder: after the parent's last child, or after the last screen. */
function nextSortOrder(permissions: PermissionView[], parent: PermissionView | null): number {
  const siblings = parent
    ? permissions.filter((p) => p.parentId === parent.id)
    : permissions.filter((p) => !p.parentId);
  const base = parent ? parent.sortOrder : 0;
  return Math.max(base, ...siblings.map((p) => p.sortOrder)) + 1;
}
