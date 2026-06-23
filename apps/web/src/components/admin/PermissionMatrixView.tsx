"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Eye,
  KeyRound,
  Save,
  Search,
  ShieldCheck,
  Square,
  Undo2,
} from "lucide-react";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { Modal } from "@/components/ui/Modal";
import { ActionButton } from "@/components/ui/ActionButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { cn } from "@/lib/utils";
import { focusRing, focusRingInput } from "@/lib/styles";
import {
  PERMISSION_ACTIONS,
  type PermissionAction,
} from "@/lib/auth/permission-codes";
import type {
  PermissionView,
  RolePermissionCell,
  RoleView,
} from "@/lib/db/permissions";
import { saveRolePermissions } from "@/app/app/admin/permissoes/actions";

interface Grant {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

const EMPTY_GRANT: Grant = { view: false, create: false, edit: false, delete: false };

const ACTION_LABELS: Record<PermissionAction, string> = {
  view: "Ver",
  create: "Criar",
  edit: "Editar",
  delete: "Excluir",
};

function cellToGrant(c: RolePermissionCell): Grant {
  return { view: c.canView, create: c.canCreate, edit: c.canEdit, delete: c.canDelete };
}

function grantsEqual(a: Grant, b: Grant): boolean {
  return (
    a.view === b.view &&
    a.create === b.create &&
    a.edit === b.edit &&
    a.delete === b.delete
  );
}

export interface PermissionMatrixViewProps {
  roles: RoleView[];
  permissions: PermissionView[];
  /** roleId → matrix cells. */
  matrices: Record<string, RolePermissionCell[]>;
}

/**
 * Permission Matrix admin screen. Pick an access group, then toggle what each
 * feature allows (Ver/Criar/Editar/Excluir). Supports search, collapsible
 * modules, bulk presets and a single audited save. Editing the Administrador
 * group asks for an extra confirmation.
 */
export function PermissionMatrixView({
  roles,
  permissions,
  matrices,
}: PermissionMatrixViewProps) {
  const activeRoles = roles.filter((r) => r.active);
  const [roleId, setRoleId] = useState<string>(activeRoles[0]?.id ?? roles[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const { feedback, notify } = useFeedback();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const selectedRole = roles.find((r) => r.id === roleId);

  // Baseline grants per role from the server props. Recomputes if the server
  // revalidates after a save (matrices prop changes) — no setState-in-effect.
  const baseline = useMemo(() => {
    const byRole: Record<string, Record<string, Grant>> = {};
    for (const [rid, cells] of Object.entries(matrices)) {
      const map: Record<string, Grant> = {};
      for (const c of cells) map[c.permissionId] = cellToGrant(c);
      byRole[rid] = map;
    }
    return byRole;
  }, [matrices]);

  // Local edits: roleId → permissionId → Grant. Only changed cells are stored.
  const [overrides, setOverrides] = useState<
    Record<string, Record<string, Grant>>
  >({});

  const grantOf = (rid: string, permId: string): Grant =>
    overrides[rid]?.[permId] ?? baseline[rid]?.[permId] ?? EMPTY_GRANT;

  const setGrant = (permId: string, next: Grant) => {
    setOverrides((prev) => ({
      ...prev,
      [roleId]: { ...(prev[roleId] ?? {}), [permId]: next },
    }));
  };

  // Cells whose current value differs from the baseline, for the selected role.
  const changedUpdates = useMemo(() => {
    const roleOverrides = overrides[roleId] ?? {};
    const base = baseline[roleId] ?? {};
    const updates: Array<{ permissionId: string } & {
      canView: boolean;
      canCreate: boolean;
      canEdit: boolean;
      canDelete: boolean;
    }> = [];
    for (const [permId, grant] of Object.entries(roleOverrides)) {
      const b = base[permId] ?? EMPTY_GRANT;
      if (!grantsEqual(grant, b)) {
        updates.push({
          permissionId: permId,
          canView: grant.view,
          canCreate: grant.create,
          canEdit: grant.edit,
          canDelete: grant.delete,
        });
      }
    }
    return updates;
  }, [overrides, baseline, roleId]);

  const dirty = changedUpdates.length > 0;

  // Group permissions by module, ordered; children render indented under parents.
  const normalizedQuery = query.trim().toLowerCase();
  const visiblePermissions = useMemo(() => {
    if (!normalizedQuery) return permissions;
    return permissions.filter(
      (p) =>
        p.name.toLowerCase().includes(normalizedQuery) ||
        p.code.toLowerCase().includes(normalizedQuery) ||
        p.module.toLowerCase().includes(normalizedQuery),
    );
  }, [permissions, normalizedQuery]);

  const modules = useMemo(() => {
    const map = new Map<string, PermissionView[]>();
    for (const p of visiblePermissions) {
      if (!map.has(p.module)) map.set(p.module, []);
      map.get(p.module)!.push(p);
    }
    return [...map.entries()];
  }, [visiblePermissions]);

  const toggleModule = (module: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  };

  // Apply a preset to all CURRENTLY VISIBLE permissions (respects search).
  const applyPreset = (preset: "all" | "none" | "readonly" | "full") => {
    const next: Grant =
      preset === "all" || preset === "full"
        ? { view: true, create: true, edit: true, delete: true }
        : preset === "readonly"
          ? { view: true, create: false, edit: false, delete: false }
          : EMPTY_GRANT;
    setOverrides((prev) => {
      const roleMap = { ...(prev[roleId] ?? {}) };
      for (const p of visiblePermissions) roleMap[p.id] = { ...next };
      return { ...prev, [roleId]: roleMap };
    });
  };

  const doSave = (confirmAdminChange: boolean) => {
    if (!dirty) return;
    startTransition(async () => {
      const result = await saveRolePermissions({
        roleId,
        updates: changedUpdates,
        confirmAdminChange,
      });
      if (result.ok) {
        // Clear this role's overrides; the revalidated baseline now matches.
        setOverrides((prev) => {
          const next = { ...prev };
          delete next[roleId];
          return next;
        });
        setConfirmOpen(false);
        notify("success", `Permissões do grupo ${selectedRole?.label ?? ""} salvas.`);
      } else if (result.error === "CONFIRM_REQUIRED") {
        setConfirmOpen(true);
      } else {
        notify("warning", result.message);
      }
    });
  };

  const onSaveClick = () => {
    // The server enforces it too, but prompt up-front for the Admin group.
    if (selectedRole?.key === "ADMIN") setConfirmOpen(true);
    else doSave(false);
  };

  const discard = () =>
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[roleId];
      return next;
    });

  return (
    <div className="space-y-5">
      <FeedbackBanner message={feedback} />

      <SectionPanel
        title="Grupo de acesso"
        description="Escolha o grupo para configurar suas permissões. As alterações ficam em rascunho até você salvar."
        action={
          <div className="flex items-center gap-2">
            {selectedRole ? (
              <StatusBadge tone={selectedRole.active ? "success" : "neutral"}>
                {selectedRole.active ? "Ativo" : "Inativo"}
              </StatusBadge>
            ) : null}
          </div>
        }
      >
        <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <label className="flex max-w-xs flex-1 flex-col gap-1">
            <span className="text-xs font-semibold text-soft">Grupo</span>
            <div className="relative">
              <ShieldCheck
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-soft"
              />
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className={cn(
                  "h-10 w-full appearance-none rounded-md border-2 border-ink bg-surface pl-9 pr-8 text-sm font-medium text-strong",
                  focusRingInput,
                )}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                    {r.isSystem ? "" : " (personalizado)"}
                    {r.active ? "" : " — inativo"}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-soft"
              />
            </div>
          </label>

          <label className="flex max-w-xs flex-1 flex-col gap-1">
            <span className="text-xs font-semibold text-soft">
              Pesquisar funcionalidade
            </span>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-soft"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ex.: Horas, Financeiro…"
                className={cn(
                  "h-10 w-full rounded-md border-2 border-ink bg-surface pl-9 pr-3 text-sm text-strong placeholder:text-soft",
                  focusRingInput,
                )}
              />
            </div>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t-2 border-ink/10 px-5 py-3">
          <span className="mr-1 text-xs font-semibold text-soft">
            Ações em lote{normalizedQuery ? " (resultados da busca)" : ""}:
          </span>
          <ActionButton size="sm" variant="secondary" icon={CheckCheck} onClick={() => applyPreset("full")}>
            Controle total
          </ActionButton>
          <ActionButton size="sm" variant="secondary" icon={Eye} onClick={() => applyPreset("readonly")}>
            Somente leitura
          </ActionButton>
          <ActionButton size="sm" variant="secondary" icon={CheckCheck} onClick={() => applyPreset("all")}>
            Marcar tudo
          </ActionButton>
          <ActionButton size="sm" variant="secondary" icon={Square} onClick={() => applyPreset("none")}>
            Desmarcar tudo
          </ActionButton>
        </div>
      </SectionPanel>

      {modules.length === 0 ? (
        <SectionPanel title="Funcionalidades">
          <p className="px-5 py-8 text-center text-sm text-soft">
            Nenhuma funcionalidade encontrada para “{query}”.
          </p>
        </SectionPanel>
      ) : (
        <div className="space-y-4">
          {modules.map(([module, items]) => {
            const isCollapsed = !normalizedQuery && collapsed.has(module);
            return (
              <section
                key={module}
                className="overflow-hidden rounded-[var(--radius-card)] border-2 border-ink bg-surface shadow-[4px_4px_0_0_var(--color-ink)]"
              >
                <button
                  type="button"
                  onClick={() => toggleModule(module)}
                  aria-expanded={!isCollapsed}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 border-b-2 border-ink bg-surface-muted px-5 py-3 text-left",
                    focusRing,
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-strong">
                    {isCollapsed ? (
                      <ChevronRight aria-hidden="true" className="size-4" />
                    ) : (
                      <ChevronDown aria-hidden="true" className="size-4" />
                    )}
                    {module}
                  </span>
                  <span className="text-xs text-soft">
                    {items.length} {items.length === 1 ? "item" : "itens"}
                  </span>
                </button>

                {isCollapsed ? null : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[36rem] border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-5 py-2 text-left text-xs font-semibold uppercase tracking-wide text-soft">
                            Funcionalidade
                          </th>
                          {PERMISSION_ACTIONS.map((action) => (
                            <th
                              key={action}
                              className="w-20 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-soft"
                            >
                              {ACTION_LABELS[action]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((p) => {
                          const grant = grantOf(roleId, p.id);
                          const isChild = Boolean(p.parentId);
                          return (
                            <tr
                              key={p.id}
                              className={cn(
                                "border-b border-border/60 last:border-0",
                                !p.active && "opacity-50",
                              )}
                            >
                              <td className="px-5 py-2.5 align-top">
                                <div className={cn("flex flex-col", isChild && "pl-5")}>
                                  <span className="text-sm font-medium text-strong">
                                    {isChild ? "└ " : ""}
                                    {p.name}
                                    {!p.active ? " (inativa)" : ""}
                                  </span>
                                  <span className="text-[11px] font-mono text-soft">
                                    {p.code}
                                  </span>
                                </div>
                              </td>
                              {PERMISSION_ACTIONS.map((action) => (
                                <td key={action} className="px-2 py-2.5 text-center">
                                  <input
                                    type="checkbox"
                                    aria-label={`${ACTION_LABELS[action]} — ${p.name}`}
                                    checked={grant[action]}
                                    disabled={!p.active}
                                    onChange={(e) =>
                                      setGrant(p.id, { ...grant, [action]: e.target.checked })
                                    }
                                    className={cn(
                                      "size-4 cursor-pointer rounded border-2 border-ink accent-brand disabled:cursor-not-allowed",
                                      focusRing,
                                    )}
                                  />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Sticky save bar */}
      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-[var(--radius-card)] border-2 border-ink bg-surface px-5 py-3 shadow-[4px_4px_0_0_var(--color-ink)]">
        <p className="text-sm text-medium">
          {dirty ? (
            <>
              <span className="font-semibold text-strong">{changedUpdates.length}</span>{" "}
              {changedUpdates.length === 1 ? "alteração pendente" : "alterações pendentes"} em{" "}
              <span className="font-semibold text-strong">{selectedRole?.label}</span>
            </>
          ) : (
            "Sem alterações pendentes."
          )}
        </p>
        <div className="flex items-center gap-2">
          <ActionButton
            size="sm"
            variant="secondary"
            icon={Undo2}
            onClick={discard}
            disabled={!dirty || pending}
          >
            Descartar
          </ActionButton>
          <ActionButton
            size="sm"
            variant="primary"
            icon={Save}
            onClick={onSaveClick}
            disabled={!dirty || pending}
          >
            {pending ? "Salvando…" : "Salvar alterações"}
          </ActionButton>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Alterar permissões do grupo Administrador"
        description="Você está prestes a alterar o que o grupo Administrador pode acessar. Isso pode afetar a sua própria capacidade de administrar a plataforma."
        footer={
          <div className="flex justify-end gap-2">
            <ActionButton
              size="sm"
              variant="secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={pending}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              size="sm"
              variant="danger"
              icon={KeyRound}
              onClick={() => doSave(true)}
              disabled={pending}
            >
              {pending ? "Salvando…" : "Confirmar alteração"}
            </ActionButton>
          </div>
        }
      >
        <p className="text-sm text-medium">
          O sistema impede remover a última permissão administrativa, mas
          alterações no grupo Administrador exigem confirmação. Deseja continuar?
        </p>
      </Modal>
    </div>
  );
}
