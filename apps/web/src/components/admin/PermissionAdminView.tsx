"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import type {
  PermissionView,
  RolePermissionCell,
  RoleView,
} from "@/lib/db/permissions";
import { PermissionMatrixView } from "./PermissionMatrixView";
import { AccessGroupsPanel } from "./AccessGroupsPanel";
import { PermissionCatalogPanel } from "./PermissionCatalogPanel";

export const PERMISSION_ADMIN_TABS = ["matriz", "grupos", "funcionalidades"] as const;
export type PermissionAdminTab = (typeof PERMISSION_ADMIN_TABS)[number];

const TAB_LABELS: Record<PermissionAdminTab, string> = {
  matriz: "Matriz",
  grupos: "Grupos de acesso",
  funcionalidades: "Funcionalidades",
};

export interface PermissionAdminViewProps {
  roles: RoleView[];
  permissions: PermissionView[];
  matrices: Record<string, RolePermissionCell[]>;
  screenRoutes: Record<string, string>;
  initialTab?: PermissionAdminTab;
}

/**
 * Permission Matrix admin screen: the matrix itself plus the CRUD of what it is
 * made of — access groups (rows) and features (columns). All panels stay
 * MOUNTED (only hidden) so unsaved matrix edits survive a tab switch. The
 * active tab is mirrored to `?tab=` with replaceState (no server round-trip).
 */
export function PermissionAdminView({
  roles,
  permissions,
  matrices,
  screenRoutes,
  initialTab = "matriz",
}: PermissionAdminViewProps) {
  const [tab, setTab] = useState<PermissionAdminTab>(initialTab);
  const [roleId, setRoleId] = useState<string | undefined>(undefined);

  function selectTab(next: PermissionAdminTab) {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState(null, "", url.toString());
    } catch {
      // URL sync is a convenience; the tab still switches.
    }
  }

  const counts: Record<PermissionAdminTab, number | null> = {
    matriz: null,
    grupos: roles.length,
    funcionalidades: permissions.length,
  };

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Seções da Matriz de Permissões" className="flex flex-wrap gap-2 border-b border-border">
        {PERMISSION_ADMIN_TABS.map((id) => {
          const selected = id === tab;
          return (
            <button
              key={id}
              id={`perm-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`perm-panel-${id}`}
              onClick={() => selectTab(id)}
              className={cn(
                "-mb-px border-b-2 px-4 py-2 text-sm",
                focusRing,
                selected
                  ? "border-ink font-semibold text-strong"
                  : "border-transparent font-medium text-medium hover:text-strong",
              )}
            >
              {TAB_LABELS[id]}
              {counts[id] !== null ? (
                <span className="ml-1.5 text-xs font-normal text-soft">{counts[id]}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="perm-panel-matriz" aria-labelledby="perm-tab-matriz" hidden={tab !== "matriz"}>
        <PermissionMatrixView
          roles={roles}
          permissions={permissions}
          matrices={matrices}
          screenRoutes={screenRoutes}
          selectedRoleId={roleId}
          onSelectRole={setRoleId}
        />
      </div>
      <div role="tabpanel" id="perm-panel-grupos" aria-labelledby="perm-tab-grupos" hidden={tab !== "grupos"}>
        <AccessGroupsPanel
          roles={roles}
          matrices={matrices}
          onConfigure={(id) => {
            setRoleId(id);
            selectTab("matriz");
          }}
        />
      </div>
      <div
        role="tabpanel"
        id="perm-panel-funcionalidades"
        aria-labelledby="perm-tab-funcionalidades"
        hidden={tab !== "funcionalidades"}
      >
        <PermissionCatalogPanel
          permissions={permissions}
          matrices={matrices}
          screenRoutes={screenRoutes}
        />
      </div>
    </div>
  );
}
