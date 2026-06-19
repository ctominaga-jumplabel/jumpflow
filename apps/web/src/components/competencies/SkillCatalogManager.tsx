"use client";

import { useMemo, useState, useTransition } from "react";
import { GraduationCap, Pencil, Plus } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { Modal } from "@/components/ui/Modal";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import {
  createSkill,
  setSkillStatus,
  updateSkill,
} from "@/app/app/competencias/actions";
import {
  skillStatusLabels,
  skillTypeLabels,
  type SkillCatalogItem,
  type SkillStatus,
  type SkillType,
} from "@/lib/competencies/types";
import { EnumSelect, TextField } from "./fields";

type TypeFilter = "ALL" | SkillType;
type StatusFilter = "ALL" | SkillStatus;

interface DraftState {
  id?: string;
  name: string;
  category: string;
  type: SkillType;
  status: SkillStatus;
}

const emptyDraft: DraftState = {
  name: "",
  category: "",
  type: "TECHNICAL",
  status: "ACTIVE",
};

export interface SkillCatalogManagerProps {
  catalog: SkillCatalogItem[];
  canManage: boolean;
}

/**
 * CRUD do catálogo de skills (EP12). Criar/editar via modal; inativar/reativar
 * (soft delete via status) por botão na linha. Escrita gated no servidor por
 * COMPETENCY_WRITE_ROLES; `canManage` apenas mostra/oculta os controles.
 */
export function SkillCatalogManager({
  catalog,
  canManage,
}: SkillCatalogManagerProps) {
  const { feedback, notify } = useFeedback();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((s) => {
      if (typeFilter !== "ALL" && s.type !== typeFilter) return false;
      if (statusFilter !== "ALL" && s.status !== statusFilter) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catalog, query, typeFilter, statusFilter]);

  function openCreate() {
    setDraft(emptyDraft);
    setOpen(true);
  }

  function openEdit(item: SkillCatalogItem) {
    setDraft({
      id: item.id,
      name: item.name,
      category: item.category ?? "",
      type: item.type,
      status: item.status,
    });
    setOpen(true);
  }

  function submit() {
    const isEdit = Boolean(draft.id);
    startTransition(async () => {
      const result = isEdit
        ? await updateSkill({
            id: draft.id!,
            name: draft.name,
            category: draft.category || undefined,
            type: draft.type,
            status: draft.status,
          })
        : await createSkill({
            name: draft.name,
            category: draft.category || undefined,
            type: draft.type,
          });
      if (result.ok) {
        setOpen(false);
        notify("success", isEdit ? "Skill atualizada." : "Skill criada.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  function toggleStatus(item: SkillCatalogItem) {
    const next: SkillStatus = item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    startTransition(async () => {
      const result = await setSkillStatus({ id: item.id, status: next });
      if (result.ok) {
        notify(
          "success",
          next === "ACTIVE" ? "Skill reativada." : "Skill inativada.",
        );
      } else {
        notify("warning", result.message);
      }
    });
  }

  const columns: DataTableColumn<SkillCatalogItem>[] = [
    {
      key: "name",
      header: "Skill",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-strong">{row.name}</p>
          <p className="text-xs text-soft">{row.category ?? "Sem categoria"}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Tipo",
      cell: (row) => (
        <StatusBadge tone={row.type === "TECHNICAL" ? "info" : "neutral"}>
          {skillTypeLabels[row.type]}
        </StatusBadge>
      ),
    },
    {
      key: "usage",
      header: "Uso",
      align: "right",
      cell: (row) => (
        <span className="text-xs text-soft tabular-nums">
          {row.consultantCount} cons. · {row.profileItemCount} perfis
        </span>
      ),
    },
    {
      key: "status",
      header: "Situação",
      cell: (row) => (
        <StatusBadge tone={row.status === "ACTIVE" ? "success" : "neutral"}>
          {skillStatusLabels[row.status]}
        </StatusBadge>
      ),
    },
  ];

  if (canManage) {
    columns.push({
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          <ActionButton
            variant="secondary"
            size="sm"
            icon={Pencil}
            onClick={() => openEdit(row)}
            disabled={pending}
          >
            Editar
          </ActionButton>
          <ActionButton
            variant={row.status === "ACTIVE" ? "danger" : "success"}
            size="sm"
            onClick={() => toggleStatus(row)}
            disabled={pending}
          >
            {row.status === "ACTIVE" ? "Inativar" : "Reativar"}
          </ActionButton>
        </div>
      ),
    });
  }

  return (
    <div className="space-y-4">
      <FeedbackBanner message={feedback} />
      <DataToolbar
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Buscar skill",
          label: "Buscar skill",
        }}
        filters={
          <>
            <FilterChip
              label="Todos os tipos"
              active={typeFilter === "ALL"}
              onClick={() => setTypeFilter("ALL")}
            />
            <FilterChip
              label={skillTypeLabels.TECHNICAL}
              active={typeFilter === "TECHNICAL"}
              onClick={() => setTypeFilter("TECHNICAL")}
            />
            <FilterChip
              label={skillTypeLabels.BEHAVIORAL}
              active={typeFilter === "BEHAVIORAL"}
              onClick={() => setTypeFilter("BEHAVIORAL")}
            />
            <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
            <FilterChip
              label="Ativas"
              active={statusFilter === "ACTIVE"}
              onClick={() => setStatusFilter("ACTIVE")}
            />
            <FilterChip
              label="Inativas"
              active={statusFilter === "INACTIVE"}
              onClick={() => setStatusFilter("INACTIVE")}
            />
            <FilterChip
              label="Todas"
              active={statusFilter === "ALL"}
              onClick={() => setStatusFilter("ALL")}
            />
          </>
        }
        actions={
          canManage ? (
            <ActionButton icon={Plus} onClick={openCreate} disabled={pending}>
              Nova skill
            </ActionButton>
          ) : null
        }
      />

      <SectionPanel
        title="Catálogo de skills"
        description={`${rows.length} ${rows.length === 1 ? "skill" : "skills"} no filtro atual`}
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={GraduationCap}
              title="Nenhuma skill no filtro"
              description="Ajuste os filtros ou cadastre uma nova skill no catálogo."
            />
          }
        />
      </SectionPanel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={draft.id ? "Editar skill" : "Nova skill"}
        description="Classifique a skill como técnica ou comportamental. O nome é único no catálogo."
        footer={
          <>
            <ActionButton
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </ActionButton>
            <ActionButton onClick={submit} disabled={pending || draft.name.trim().length < 2}>
              {draft.id ? "Salvar" : "Criar"}
            </ActionButton>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Nome"
            value={draft.name}
            placeholder="Ex.: React, Comunicação"
            required
            onChange={(name) => setDraft((d) => ({ ...d, name }))}
          />
          <TextField
            label="Categoria (opcional)"
            value={draft.category}
            placeholder="Ex.: Frontend, Soft skills"
            onChange={(category) => setDraft((d) => ({ ...d, category }))}
          />
          <EnumSelect
            label="Tipo"
            value={draft.type}
            options={skillTypeLabels}
            onChange={(type) => setDraft((d) => ({ ...d, type }))}
          />
          {draft.id ? (
            <EnumSelect
              label="Situação"
              value={draft.status}
              options={skillStatusLabels}
              hint="Inativar preserva os vínculos históricos; a skill só deixa de ser ofertada."
              onChange={(status) => setDraft((d) => ({ ...d, status }))}
            />
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
