"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Edit,
  FolderKanban,
  Link2,
  Plus,
  ReceiptText,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { Modal } from "@/components/ui/Modal";
import { SectionPanel } from "@/components/ui/SectionPanel";
import {
  addAllocationSkill,
  createAllocation,
  createProject,
  createSaleRate,
  removeAllocation,
  removeAllocationSkill,
  updateAllocation,
  updateProject,
  upsertProjectBillingConfig,
} from "@/app/app/projetos/actions";
import type {
  AllocationInput,
  AllocationSkillInput,
  AllocationSkillRemoveInput,
  ProjectBillingConfigInput,
  ProjectInput,
  SaleRateInput,
} from "@/lib/projects/schemas";
import {
  demoProjectClients,
  demoProjectConsultants,
  demoProjectManagers,
  demoProjects,
  demoProjectSkills,
} from "@/lib/projects/mock-data";
import type {
  AdjustmentIndex,
  AllocationStatus,
  BillingPeriodicity,
  BillingRoundingRule,
  OverageTreatment,
  ProjectAllocationItem,
  ProjectBillingConfigItem,
  ProjectBillingTypeOption,
  ProjectClientOption,
  ProjectConsultantOption,
  ProjectItem,
  ProjectManagerOption,
  ProjectSkillOption,
  ProjectStatus,
  SkillLevel,
} from "@/lib/projects/types";
import {
  formatCurrencyPrecise,
  formatDate,
  formatHours,
  MASKED_VALUE,
} from "@/lib/format";
import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { ProjectStatusBadge, projectStatusLabels } from "./ProjectStatusBadge";

type Mode = "demo" | "db";
type DetailTab = "ALLOCATIONS" | "SKILLS" | "RATES" | "BILLING";

const periodicityLabels: Record<BillingPeriodicity, string> = {
  MONTHLY: "Mensal",
  BIWEEKLY: "Quinzenal",
  WEEKLY: "Semanal",
  PER_EVENT: "Por evento",
};

const overageLabels: Record<OverageTreatment, string> = {
  BILL_EXTRA: "Cobrar excedente",
  BLOCK_AT_LIMIT: "Bloquear no limite",
  INCLUDE_FREE: "Incluir sem custo",
  CARRY_OVER: "Acumular p/ próximo período",
};

const adjustmentLabels: Record<AdjustmentIndex, string> = {
  NONE: "Sem reajuste",
  IPCA: "IPCA",
  IGPM: "IGP-M",
  CDI: "CDI",
  FIXED: "Percentual fixo",
};

const billingRoundingLabels: Record<BillingRoundingRule, string> = {
  NONE: "Sem arredondamento",
  NEAREST_15_MINUTES: "Mais próximo 15min",
  NEAREST_30_MINUTES: "Mais próximo 30min",
  NEAREST_HOUR: "Mais próxima hora",
  CEIL_15_MINUTES: "Teto 15min",
  CEIL_30_MINUTES: "Teto 30min",
  CEIL_HOUR: "Teto hora",
};

const skillLevelLabels: Record<SkillLevel, string> = {
  BASIC: "Básico",
  INTERMEDIATE: "Intermediário",
  ADVANCED: "Avançado",
  SPECIALIST: "Especialista",
};

const allocationStatusLabels: Record<AllocationStatus, string> = {
  PLANNED: "Planejado",
  ACTIVE: "Ativo",
  ENDED: "Encerrado",
  CANCELLED: "Cancelado",
  INACTIVE: "Inativo",
};

interface ProjectsViewProps {
  mode: Mode;
  projects?: ProjectItem[];
  clients?: ProjectClientOption[];
  consultants?: ProjectConsultantOption[];
  managers?: ProjectManagerOption[];
  skills?: ProjectSkillOption[];
  billingTypes?: ProjectBillingTypeOption[];
  canManageProjects: boolean;
  canViewCommercials: boolean;
  canManageSaleRates: boolean;
  canEditBillingConfig: boolean;
}

const statusFilters: (ProjectStatus | "ALL")[] = [
  "ALL",
  "PROPOSAL",
  "ACTIVE",
  "PAUSED",
  "CLOSED",
];

const emptyProject: ProjectInput = {
  clientId: "",
  name: "",
  description: "",
  status: "PROPOSAL",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: undefined,
  managerUserId: "",
  billingTypeId: undefined,
  billingHourlyRate: undefined,
  budgetHours: undefined,
  costCenter: "",
};

function projectToInput(project: ProjectItem): ProjectInput {
  return {
    clientId: project.clientId,
    name: project.name,
    description: project.description ?? "",
    status: project.status,
    startDate: project.startDate,
    endDate: project.endDate,
    managerUserId: project.managerUserId ?? "",
    billingTypeId: project.billingTypeId,
    billingHourlyRate: project.billingHourlyRate,
    budgetHours: project.budgetHours,
    costCenter: project.costCenter ?? "",
  };
}

function billingConfigToForm(project: ProjectItem): ProjectBillingConfigInput {
  const c = project.billingConfig;
  return {
    projectId: project.id,
    periodicity: c?.periodicity ?? "MONTHLY",
    roundingRule: c?.roundingRule ?? "NONE",
    fixedAmount: c?.fixedAmount,
    includedHours: c?.includedHours,
    overageRate: c?.overageRate,
    overageTreatment: c?.overageTreatment ?? "BILL_EXTRA",
    perConsultantAmount: c?.perConsultantAmount,
    reimbursableExpenses: c?.reimbursableExpenses ?? false,
    reimbursableMarkupPct: c?.reimbursableMarkupPct,
    discountPct: c?.discountPct,
    penaltyPct: c?.penaltyPct,
    adjustmentIndex: c?.adjustmentIndex ?? "NONE",
    adjustmentPct: c?.adjustmentPct,
    withholdIss: c?.withholdIss ?? false,
    withholdingPct: c?.withholdingPct,
    closingDay: c?.closingDay,
    dueDay: c?.dueDay,
    requireApproval: c?.requireApproval ?? true,
    notes: c?.notes ?? "",
  };
}

function formToBillingConfigItem(
  form: ProjectBillingConfigInput,
): ProjectBillingConfigItem {
  return {
    periodicity: form.periodicity,
    roundingRule: form.roundingRule,
    fixedAmount: form.fixedAmount,
    includedHours: form.includedHours,
    overageRate: form.overageRate,
    overageTreatment: form.overageTreatment,
    perConsultantAmount: form.perConsultantAmount,
    reimbursableExpenses: form.reimbursableExpenses,
    reimbursableMarkupPct: form.reimbursableMarkupPct,
    discountPct: form.discountPct,
    penaltyPct: form.penaltyPct,
    adjustmentIndex: form.adjustmentIndex,
    adjustmentPct: form.adjustmentPct,
    withholdIss: form.withholdIss,
    withholdingPct: form.withholdingPct,
    closingDay: form.closingDay,
    dueDay: form.dueDay,
    requireApproval: form.requireApproval,
    notes: form.notes,
  };
}

function fieldClass() {
  return cn("h-10 rounded-md border border-border bg-surface px-3 text-sm", focusRingInput);
}

function budgetPercent(project: ProjectItem): number {
  if (!project.budgetHours || project.budgetHours <= 0) return 0;
  return Math.round((project.consumedHours / project.budgetHours) * 100);
}

export function ProjectsView({
  mode,
  projects = demoProjects,
  clients = demoProjectClients,
  consultants = demoProjectConsultants,
  managers = demoProjectManagers,
  skills = demoProjectSkills,
  billingTypes = [],
  canManageProjects,
  canViewCommercials,
  canManageSaleRates,
  canEditBillingConfig,
}: ProjectsViewProps) {
  // In db mode `items` derives straight from props, so data revalidated by a
  // server action (e.g. trocar o gestor) shows up immediately without a reload.
  // Demo mode keeps local optimistic state since there is no server to refetch.
  const [localItems, setLocalItems] = useState(projects);
  const items = mode === "db" ? projects : localItems;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "ALL">("ALL");
  const [clientId, setClientId] = useState("ALL");
  const [editing, setEditing] = useState<ProjectItem | null>(null);
  const [projectForm, setProjectForm] = useState<ProjectInput>(emptyProject);
  const [projectOpen, setProjectOpen] = useState(false);
  // Hold only the id of the open project: the detail object is derived from
  // `items` below so that data refreshed by a server action (db mode) or local
  // optimistic update (demo mode) reflows into the open dialog immediately,
  // instead of showing a stale snapshot captured when the dialog was opened.
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("ALLOCATIONS");
  const [billingForm, setBillingForm] =
    useState<ProjectBillingConfigInput | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const detailProject = detailProjectId
    ? (items.find((project) => project.id === detailProjectId) ?? null)
    : null;

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((project) => {
      const matchesSearch =
        term.length === 0 ||
        `${project.name} ${project.clientName}`.toLowerCase().includes(term);
      const matchesStatus = status === "ALL" || project.status === status;
      const matchesClient = clientId === "ALL" || project.clientId === clientId;
      return matchesSearch && matchesStatus && matchesClient;
    });
  }, [items, search, status, clientId]);

  const columns: DataTableColumn<ProjectItem>[] = [
    {
      key: "project",
      header: "Projeto",
      cell: (project) => (
        <div>
          <p className="font-medium text-strong">{project.name}</p>
          <p className="text-xs text-soft">{project.clientName}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (project) => <ProjectStatusBadge status={project.status} />,
    },
    {
      key: "manager",
      header: "Gestor",
      cell: (project) => <span>{project.managerName ?? "-"}</span>,
      className: "hidden md:table-cell",
    },
    {
      key: "period",
      header: "Período",
      cell: (project) => (
        <span className="tabular-nums">
          {formatDate(project.startDate)} -{" "}
          {project.endDate ? formatDate(project.endDate) : "em aberto"}
        </span>
      ),
      className: "hidden lg:table-cell",
    },
    {
      key: "rate",
      header: "Valor hora",
      align: "right",
      cell: (project) => (
        <span className="tabular-nums">
          {canViewCommercials
            ? project.billingHourlyRate === undefined
              ? "-"
              : formatCurrencyPrecise(project.billingHourlyRate)
            : MASKED_VALUE}
        </span>
      ),
    },
    {
      key: "budget",
      header: canViewCommercials ? "Budget" : "Consumo",
      cell: (project) => {
        const pct = budgetPercent(project);
        return (
          <div className="min-w-[120px]">
            <div className="flex justify-between gap-3 text-xs">
              <span className="tabular-nums">
                {canViewCommercials && project.budgetHours
                  ? `${formatHours(project.consumedHours)} / ${formatHours(project.budgetHours)}`
                  : formatHours(project.consumedHours)}
              </span>
              {canViewCommercials && project.budgetHours ? (
                <span className={pct > 100 ? "text-danger" : "text-soft"}>
                  {pct}%
                </span>
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      key: "team",
      header: "Equipe",
      align: "right",
      cell: (project) => (
        <button
          type="button"
          className="rounded-md px-2 py-1 tabular-nums hover:bg-surface-muted"
          onClick={() => {
            setDetailProjectId(project.id);
            setDetailTab("ALLOCATIONS");
          }}
        >
          {project.allocatedConsultants}
        </button>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (project) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            aria-label={`Vínculos e valores de ${project.name}`}
            onClick={() => setDetailProjectId(project.id)}
            className="rounded-md p-2 text-medium hover:bg-surface-muted"
          >
            <Link2 aria-hidden="true" className="size-4" />
          </button>
          {canManageProjects ? (
            <button
              type="button"
              aria-label={`Editar ${project.name}`}
              onClick={() => openProject(project)}
              className="rounded-md p-2 text-medium hover:bg-surface-muted"
            >
              <Edit aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  function openProject(project?: ProjectItem) {
    setEditing(project ?? null);
    setProjectForm(project ? projectToInput(project) : emptyProject);
    setProjectOpen(true);
  }

  function saveProject() {
    if (!projectForm.clientId || !projectForm.name.trim()) {
      setFeedback("Informe cliente e nome do projeto.");
      return;
    }
    if (mode === "demo") {
      const client = clients.find((item) => item.id === projectForm.clientId);
      const manager = managers.find((item) => item.id === projectForm.managerUserId);
      const next: ProjectItem = {
        ...(editing ?? {
          id: `prj-local-${Date.now()}`,
          allocations: [],
          saleRates: [],
          consumedHours: 0,
          allocatedConsultants: 0,
        }),
        ...projectForm,
        clientId: projectForm.clientId,
        clientName: client?.name ?? "Cliente",
        managerName: manager?.name,
        endDate: projectForm.endDate,
      };
      setLocalItems((current) =>
        editing
          ? current.map((item) => (item.id === editing.id ? next : item))
          : [next, ...current],
      );
      setProjectOpen(false);
      setFeedback("Projeto salvo localmente.");
      return;
    }
    startTransition(async () => {
      const result = editing
        ? await updateProject({ id: editing.id, ...projectForm })
        : await createProject(projectForm);
      if (result.ok) {
        setProjectOpen(false);
        setFeedback("Projeto salvo.");
      } else {
        setFeedback(result.message);
      }
    });
  }

  // Initialize the billing form lazily when the Cobrança tab is opened (avoids
  // setState-in-effect; the form holds the user's edits across data refreshes).
  function handleDetailTabChange(next: DetailTab) {
    if (next === "BILLING" && detailProject) {
      setBillingForm(billingConfigToForm(detailProject));
    }
    setDetailTab(next);
  }

  function saveBillingConfig() {
    if (!billingForm) return;
    if (mode === "demo") {
      setLocalItems((current) =>
        current.map((project) =>
          project.id === billingForm.projectId
            ? { ...project, billingConfig: formToBillingConfigItem(billingForm) }
            : project,
        ),
      );
      setFeedback("Configuração de cobrança salva localmente.");
      return;
    }
    startTransition(async () => {
      const result = await upsertProjectBillingConfig(billingForm);
      setFeedback(
        result.ok ? "Configuração de cobrança salva." : result.message,
      );
    });
  }

  function addAllocation(value: AllocationInput) {
    if (mode === "demo") {
      const consultant = consultants.find((item) => item.id === value.consultantId);
      const nextAllocation: ProjectAllocationItem = {
        ...value,
        id: `alloc-local-${Date.now()}`,
        consultantName: consultant?.name ?? "Consultor",
        skills: [],
      };
      setLocalItems((current) =>
        current.map((project) =>
          project.id === value.projectId
            ? {
                ...project,
                allocatedConsultants: project.allocatedConsultants + 1,
                allocations: [...project.allocations, nextAllocation],
              }
            : project,
        ),
      );
      setFeedback("Vínculo salvo localmente.");
      return;
    }
    startTransition(async () => {
      const result = await createAllocation(value);
      setFeedback(result.ok ? "Vínculo salvo." : result.message);
    });
  }

  function editAllocation(id: string, value: AllocationInput) {
    if (mode === "demo") {
      const consultant = consultants.find((item) => item.id === value.consultantId);
      setLocalItems((current) =>
        current.map((project) =>
          project.id === value.projectId
            ? {
                ...project,
                allocations: project.allocations.map((item) =>
                  item.id === id
                    ? {
                        ...item,
                        ...value,
                        consultantName: consultant?.name ?? item.consultantName,
                      }
                    : item,
                ),
              }
            : project,
        ),
      );
      setFeedback("Vínculo atualizado localmente.");
      return;
    }
    startTransition(async () => {
      const result = await updateAllocation({ id, ...value });
      setFeedback(result.ok ? "Vínculo atualizado." : result.message);
    });
  }

  function deleteAllocation(allocation: ProjectAllocationItem) {
    if (mode === "demo") {
      setLocalItems((current) =>
        current.map((project) =>
          project.id === allocation.projectId
            ? {
                ...project,
                allocations: project.allocations.filter(
                  (item) => item.id !== allocation.id,
                ),
                allocatedConsultants: project.allocations.filter(
                  (item) =>
                    item.id !== allocation.id && item.status === "ACTIVE",
                ).length,
              }
            : project,
        ),
      );
      setFeedback("Vínculo removido localmente.");
      return;
    }
    startTransition(async () => {
      const result = await removeAllocation({ id: allocation.id });
      if (!result.ok) {
        setFeedback(result.message);
        return;
      }
      setFeedback(
        result.data.outcome === "deactivated"
          ? "Consultor tinha horas lançadas: vínculo marcado como Inativo."
          : "Vínculo removido (sem horas lançadas).",
      );
    });
  }

  function addSaleRate(value: SaleRateInput) {
    if (mode === "demo") {
      const consultant = consultants.find((item) => item.id === value.consultantId);
      const allocation = detailProject?.allocations.find(
        (item) => item.id === value.allocationId,
      );
      const nextRate = {
        ...value,
        id: `rate-local-${Date.now()}`,
        consultantName: consultant?.name,
        allocationLabel: allocation
          ? `${allocation.consultantName} - ${allocation.role}`
          : undefined,
      };
      setLocalItems((current) =>
        current.map((project) =>
          project.id === value.projectId
            ? {
                ...project,
                saleRates: [...project.saleRates, nextRate],
              }
            : project,
        ),
      );
      setFeedback("Valor de venda salvo localmente.");
      return;
    }
    startTransition(async () => {
      const result = await createSaleRate(value);
      setFeedback(result.ok ? "Valor de venda salvo." : result.message);
    });
  }

  function applyAllocationSkills(
    projectId: string,
    allocationId: string,
    next: (skills: ProjectAllocationItem["skills"]) => ProjectAllocationItem["skills"],
  ) {
    const updater = (project: ProjectItem): ProjectItem =>
      project.id !== projectId
        ? project
        : {
            ...project,
            allocations: project.allocations.map((allocation) =>
              allocation.id === allocationId
                ? { ...allocation, skills: next(allocation.skills) }
                : allocation,
            ),
          };
    setLocalItems((current) => current.map(updater));
  }

  function addSkill(value: AllocationSkillInput) {
    const project = items.find((item) =>
      item.allocations.some((allocation) => allocation.id === value.allocationId),
    );
    if (mode === "demo") {
      const skill = skills.find((item) => item.id === value.skillId);
      if (project) {
        applyAllocationSkills(project.id, value.allocationId, (current) => [
          ...current,
          {
            id: `alloc-skill-local-${Date.now()}`,
            allocationId: value.allocationId,
            skillId: value.skillId,
            skillName: skill?.name ?? "Skill",
            skillCategory: skill?.category,
            level: value.level,
            note: value.note,
          },
        ]);
      }
      setFeedback("Skill da alocação salva localmente.");
      return;
    }
    startTransition(async () => {
      const result = await addAllocationSkill(value);
      setFeedback(result.ok ? "Skill adicionada a alocação." : result.message);
    });
  }

  function removeSkill(input: AllocationSkillRemoveInput) {
    const located = items
      .flatMap((project) =>
        project.allocations.map((allocation) => ({ project, allocation })),
      )
      .find(({ allocation }) =>
        allocation.skills.some((skill) => skill.id === input.id),
      );
    if (mode === "demo") {
      if (located) {
        applyAllocationSkills(
          located.project.id,
          located.allocation.id,
          (current) => current.filter((skill) => skill.id !== input.id),
        );
      }
      setFeedback("Skill removida da alocação localmente.");
      return;
    }
    startTransition(async () => {
      const result = await removeAllocationSkill(input);
      setFeedback(result.ok ? "Skill removida da alocação." : result.message);
    });
  }

  return (
    <div className="space-y-4">
      {mode === "demo" ? (
        <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
          Modo demonstração: projetos, vínculos e valores ficam apenas nesta sessão.
        </p>
      ) : null}
      {feedback ? (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-medium">
          {feedback}
        </p>
      ) : null}

      <DataToolbar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "Buscar projeto ou cliente",
        }}
        filters={
          <>
            {statusFilters.map((item) => (
              <FilterChip
                key={item}
                label={item === "ALL" ? "Todos" : projectStatusLabels[item]}
                active={status === item}
                onClick={() => setStatus(item)}
              />
            ))}
            <label className="sr-only" htmlFor="project-client-filter">
              Filtrar por cliente
            </label>
            <select
              id="project-client-filter"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              className={cn(
                "h-9 rounded-md border border-border bg-surface px-2 text-xs font-semibold text-medium",
                focusRingInput,
              )}
            >
              <option value="ALL">Todos os clientes</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </>
        }
        actions={
          <ActionButton
            variant="primary"
            size="sm"
            icon={Plus}
            disabled={!canManageProjects}
            onClick={() => openProject()}
          >
            Novo projeto
          </ActionButton>
        }
      />

      <SectionPanel title="Projetos" description={`${rows.length} projetos`}>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(project) => project.id}
          caption="Lista de projetos"
          empty={
            <EmptyState
              icon={FolderKanban}
              title="Nenhum projeto encontrado"
              description="Ajuste a busca ou crie um novo projeto."
            />
          }
        />
      </SectionPanel>

      <ProjectModal
        open={projectOpen}
        value={projectForm}
        clients={clients}
        managers={managers}
        billingTypes={billingTypes}
        canViewCommercials={canViewCommercials}
        isPending={isPending}
        onChange={setProjectForm}
        onClose={() => setProjectOpen(false)}
        onSave={saveProject}
      />
      <ProjectDetailModal
        project={detailProject}
        tab={detailTab}
        consultants={consultants}
        skills={skills}
        canViewCommercials={canViewCommercials}
        canManageProjects={canManageProjects}
        canManageSaleRates={canManageSaleRates}
        canEditBillingConfig={canEditBillingConfig}
        billingForm={billingForm}
        isPending={isPending}
        onTabChange={handleDetailTabChange}
        onClose={() => setDetailProjectId(null)}
        onAddAllocation={addAllocation}
        onEditAllocation={editAllocation}
        onRemoveAllocation={deleteAllocation}
        onAddSaleRate={addSaleRate}
        onAddSkill={addSkill}
        onRemoveSkill={removeSkill}
        onBillingChange={setBillingForm}
        onSaveBillingConfig={saveBillingConfig}
      />
    </div>
  );
}

function ProjectModal({
  open,
  value,
  clients,
  managers,
  billingTypes,
  canViewCommercials,
  isPending,
  onChange,
  onClose,
  onSave,
}: {
  open: boolean;
  value: ProjectInput;
  clients: ProjectClientOption[];
  managers: ProjectManagerOption[];
  billingTypes: ProjectBillingTypeOption[];
  canViewCommercials: boolean;
  isPending: boolean;
  onChange: (value: ProjectInput) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Projeto"
      description="Dados operacionais, comerciais e periodo."
      className="max-w-3xl"
      footer={
        <>
          <ActionButton variant="secondary" onClick={onClose}>
            Cancelar
          </ActionButton>
          <ActionButton disabled={isPending} onClick={onSave}>
            Salvar
          </ActionButton>
        </>
      }
    >
      <form className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-medium">
          Cliente
          <select
            value={value.clientId}
            onChange={(event) => onChange({ ...value, clientId: event.target.value })}
            className={fieldClass()}
          >
            <option value="">Selecione</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-medium">
          Nome
          <input
            value={value.name}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
            className={fieldClass()}
          />
        </label>
        <label className="space-y-1 text-sm font-medium text-medium">
          Status
          <select
            value={value.status}
            onChange={(event) =>
              onChange({ ...value, status: event.target.value as ProjectStatus })
            }
            className={fieldClass()}
          >
            {(["PROPOSAL", "ACTIVE", "PAUSED", "CLOSED"] as ProjectStatus[]).map(
              (item) => (
                <option key={item} value={item}>
                  {projectStatusLabels[item]}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-medium">
          Gestor
          <select
            value={value.managerUserId ?? ""}
            onChange={(event) =>
              onChange({ ...value, managerUserId: event.target.value })
            }
            className={fieldClass()}
          >
            <option value="">Sem gestor</option>
            {managers.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.name}
              </option>
            ))}
          </select>
        </label>
        <DateField
          label="Inicio"
          value={value.startDate}
          onChange={(next) => onChange({ ...value, startDate: next })}
        />
        <DateField
          label="Fim"
          value={value.endDate ?? ""}
          onChange={(next) => onChange({ ...value, endDate: next || undefined })}
        />
        <label className="space-y-1 text-sm font-medium text-medium">
          Tipo de cobrança
          <select
            value={value.billingTypeId ?? ""}
            disabled={!canViewCommercials}
            onChange={(event) =>
              onChange({ ...value, billingTypeId: event.target.value || undefined })
            }
            className={fieldClass()}
          >
            <option value="">Herdar do cliente</option>
            {billingTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="Valor hora legado"
          value={value.billingHourlyRate}
          disabled={!canViewCommercials}
          onChange={(next) => onChange({ ...value, billingHourlyRate: next })}
        />
        <NumberField
          label="Budget horas"
          value={value.budgetHours}
          disabled={!canViewCommercials}
          onChange={(next) => onChange({ ...value, budgetHours: next })}
        />
        <label className="space-y-1 text-sm font-medium text-medium">
          Centro de custo
          <input
            value={value.costCenter ?? ""}
            disabled={!canViewCommercials}
            onChange={(event) =>
              onChange({ ...value, costCenter: event.target.value })
            }
            className={fieldClass()}
          />
        </label>
        <label className="space-y-1 text-sm font-medium text-medium md:col-span-2">
          Descrição
          <textarea
            value={value.description ?? ""}
            onChange={(event) =>
              onChange({ ...value, description: event.target.value })
            }
            className={cn(fieldClass(), "min-h-24 py-2")}
          />
        </label>
      </form>
    </Modal>
  );
}

function ProjectDetailModal({
  project,
  tab,
  consultants,
  skills,
  canViewCommercials,
  canManageProjects,
  canManageSaleRates,
  canEditBillingConfig,
  billingForm,
  isPending,
  onTabChange,
  onClose,
  onAddAllocation,
  onEditAllocation,
  onRemoveAllocation,
  onAddSaleRate,
  onAddSkill,
  onRemoveSkill,
  onBillingChange,
  onSaveBillingConfig,
}: {
  project: ProjectItem | null;
  tab: DetailTab;
  consultants: ProjectConsultantOption[];
  skills: ProjectSkillOption[];
  canViewCommercials: boolean;
  canManageProjects: boolean;
  canManageSaleRates: boolean;
  canEditBillingConfig: boolean;
  billingForm: ProjectBillingConfigInput | null;
  isPending: boolean;
  onTabChange: (tab: DetailTab) => void;
  onClose: () => void;
  onAddAllocation: (value: AllocationInput) => void;
  onEditAllocation: (id: string, value: AllocationInput) => void;
  onRemoveAllocation: (allocation: ProjectAllocationItem) => void;
  onAddSaleRate: (value: SaleRateInput) => void;
  onAddSkill: (value: AllocationSkillInput) => void;
  onRemoveSkill: (value: AllocationSkillRemoveInput) => void;
  onBillingChange: (value: ProjectBillingConfigInput) => void;
  onSaveBillingConfig: () => void;
}) {
  const [allocation, setAllocation] = useState<AllocationInput | null>(null);
  // When set, the allocation modal is in edit mode for this allocation id.
  const [allocationEditId, setAllocationEditId] = useState<string | null>(null);
  const [rate, setRate] = useState<SaleRateInput | null>(null);
  const [skillFor, setSkillFor] = useState<ProjectAllocationItem | null>(null);

  if (!project) return null;
  const allocationOptions = project.allocations.map((item) => ({
    id: item.id,
    label: `${item.consultantName} - ${item.role}`,
  }));

  return (
    <Modal
      open={project !== null}
      onClose={onClose}
      title={project.name}
      description="Vínculos de consultores e valores comerciais por vigência."
      className="max-w-4xl"
      footer={
        <>
          <ActionButton variant="secondary" onClick={onClose}>
            Fechar
          </ActionButton>
          {tab === "ALLOCATIONS" ? (
            <ActionButton
              icon={Link2}
              disabled={!canManageProjects}
              onClick={() => {
                setAllocationEditId(null);
                setAllocation({
                  projectId: project.id,
                  consultantId: "",
                  role: "",
                  allocationPercent: 100,
                  startDate: project.startDate,
                  endDate: undefined,
                  status: "PLANNED",
                });
              }}
            >
              Novo vínculo
            </ActionButton>
          ) : tab === "RATES" ? (
            <ActionButton
              icon={ReceiptText}
              disabled={!canManageSaleRates}
              onClick={() =>
                setRate({
                  projectId: project.id,
                  // Comercial cadastra o valor a nível de Consultor: o escopo
                  // padrão é o primeiro consultor alocado (cai para Projeto se
                  // não houver alocação).
                  consultantId: project.allocations[0]?.consultantId,
                  allocationId: undefined,
                  startsAt: project.startDate,
                  endsAt: undefined,
                  hourlyRate: 0,
                  currency: "BRL",
                  note: "",
                })
              }
            >
              Novo valor
            </ActionButton>
          ) : tab === "BILLING" && canEditBillingConfig ? (
            <ActionButton
              icon={ReceiptText}
              disabled={isPending || !billingForm}
              onClick={onSaveBillingConfig}
            >
              Salvar configuração
            </ActionButton>
          ) : null}
        </>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterChip
          label="Vínculos"
          active={tab === "ALLOCATIONS"}
          onClick={() => onTabChange("ALLOCATIONS")}
        />
        <FilterChip
          label="Skills"
          active={tab === "SKILLS"}
          onClick={() => onTabChange("SKILLS")}
        />
        <FilterChip
          label="Valores de venda"
          active={tab === "RATES"}
          onClick={() => onTabChange("RATES")}
        />
        {canEditBillingConfig ? (
          <FilterChip
            label="Cobrança"
            active={tab === "BILLING"}
            onClick={() => onTabChange("BILLING")}
          />
        ) : null}
      </div>
      {tab === "ALLOCATIONS" ? (
        <DataTable
          columns={[
            {
              key: "consultant",
              header: "Consultor",
              cell: (item) => (
                <div>
                  <p className="font-medium text-strong">{item.consultantName}</p>
                  <p className="text-xs text-soft">{item.role}</p>
                </div>
              ),
            },
            {
              key: "percent",
              header: "%",
              cell: (item) => `${item.allocationPercent}%`,
              align: "right",
            },
            {
              key: "period",
              header: "Período",
              cell: (item) =>
                `${formatDate(item.startDate)} - ${
                  item.endDate ? formatDate(item.endDate) : "em aberto"
                }`,
            },
            {
              key: "status",
              header: "Status",
              cell: (item) => allocationStatusLabels[item.status],
            },
            {
              key: "actions",
              header: "Ações",
              align: "right",
              cell: (item) => (
                <div className="flex justify-end gap-1">
                  <ActionButton
                    size="sm"
                    variant="secondary"
                    icon={Edit}
                    disabled={!canManageProjects}
                    aria-label={`Editar vínculo de ${item.consultantName}`}
                    onClick={() => {
                      setAllocationEditId(item.id);
                      setAllocation({
                        projectId: item.projectId,
                        consultantId: item.consultantId,
                        role: item.role,
                        allocationPercent: item.allocationPercent,
                        startDate: item.startDate,
                        endDate: item.endDate,
                        status: item.status,
                      });
                    }}
                  >
                    Editar
                  </ActionButton>
                  <ActionButton
                    size="sm"
                    variant="danger"
                    icon={Trash2}
                    disabled={!canManageProjects}
                    aria-label={`Remover vínculo de ${item.consultantName}`}
                    onClick={() => {
                      const message =
                        "Remover este vínculo?\n\n" +
                        "Se o consultor já tiver horas lançadas, o vínculo fica " +
                        "Inativo (mantém o histórico). Caso contrário, é apagado " +
                        "do projeto.";
                      if (typeof window !== "undefined" && !window.confirm(message)) {
                        return;
                      }
                      onRemoveAllocation(item);
                    }}
                  >
                    Remover
                  </ActionButton>
                </div>
              ),
            },
          ]}
          rows={project.allocations}
          rowKey={(item) => item.id}
          empty={<p className="text-center text-sm text-soft">Sem vínculos.</p>}
        />
      ) : tab === "SKILLS" ? (
        <AllocationSkillsPanel
          allocations={project.allocations}
          canManageProjects={canManageProjects}
          onAddSkill={(item) => setSkillFor(item)}
          onRemoveSkill={onRemoveSkill}
        />
      ) : tab === "RATES" ? (
        canViewCommercials ? (
        <DataTable
          columns={[
            {
              key: "scope",
              header: "Escopo",
              cell: (item) =>
                item.allocationLabel ?? item.consultantName ?? "Projeto",
            },
            {
              key: "period",
              header: "Vigência",
              cell: (item) =>
                `${formatDate(item.startsAt)} - ${
                  item.endsAt ? formatDate(item.endsAt) : "em aberto"
                }`,
            },
            {
              key: "rate",
              header: "Valor",
              align: "right",
              cell: (item) =>
                item.hourlyRate === undefined
                  ? MASKED_VALUE
                  : formatCurrencyPrecise(item.hourlyRate),
            },
            { key: "note", header: "Nota", cell: (item) => item.note ?? "-" },
          ]}
          rows={project.saleRates}
          rowKey={(item) => item.id}
          empty={<p className="text-center text-sm text-soft">Sem valores.</p>}
        />
        ) : (
          <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-soft">
            Valores comerciais restritos por perfil.
          </p>
        )
      ) : canEditBillingConfig && billingForm ? (
        <BillingConfigPanel
          chargeType={project.billingChargeType}
          value={billingForm}
          onChange={onBillingChange}
        />
      ) : (
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-soft">
          Configuração de cobrança restrita por perfil.
        </p>
      )}

      {allocation ? (
        <AllocationModal
          value={allocation}
          consultants={consultants}
          isEditing={allocationEditId !== null}
          isPending={isPending}
          onChange={setAllocation}
          onClose={() => {
            setAllocation(null);
            setAllocationEditId(null);
          }}
          onSave={() => {
            if (allocationEditId) {
              onEditAllocation(allocationEditId, allocation);
            } else {
              onAddAllocation(allocation);
            }
            setAllocation(null);
            setAllocationEditId(null);
          }}
        />
      ) : null}
      {rate ? (
        <SaleRateModal
          value={rate}
          consultants={consultants}
          allocations={allocationOptions}
          isPending={isPending}
          onChange={setRate}
          onClose={() => setRate(null)}
          onSave={() => {
            onAddSaleRate(rate);
            setRate(null);
          }}
        />
      ) : null}
      {skillFor ? (
        <AllocationSkillModal
          allocation={skillFor}
          skills={skills}
          isPending={isPending}
          onClose={() => setSkillFor(null)}
          onSave={(value) => {
            onAddSkill(value);
            setSkillFor(null);
          }}
        />
      ) : null}
    </Modal>
  );
}

function AllocationSkillsPanel({
  allocations,
  canManageProjects,
  onAddSkill,
  onRemoveSkill,
}: {
  allocations: ProjectAllocationItem[];
  canManageProjects: boolean;
  onAddSkill: (allocation: ProjectAllocationItem) => void;
  onRemoveSkill: (value: AllocationSkillRemoveInput) => void;
}) {
  if (allocations.length === 0) {
    return (
      <p className="text-center text-sm text-soft">
        Adicione um vínculo para registrar skills.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {allocations.map((allocation) => (
        <div
          key={allocation.id}
          className="rounded-md border border-border bg-surface p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-strong">
                {allocation.consultantName}
              </p>
              <p className="text-xs text-soft">{allocation.role}</p>
            </div>
            <ActionButton
              variant="secondary"
              size="sm"
              icon={Tag}
              disabled={!canManageProjects}
              onClick={() => onAddSkill(allocation)}
            >
              Adicionar skill
            </ActionButton>
          </div>
          {allocation.skills.length === 0 ? (
            <p className="mt-3 text-sm text-soft">Sem skills nesta alocação.</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {allocation.skills.map((skill) => (
                <li
                  key={skill.id}
                  className="flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-1 text-xs"
                >
                  <span className="font-medium text-strong">
                    {skill.skillName}
                  </span>
                  {skill.level ? (
                    <span className="text-soft">
                      {skillLevelLabels[skill.level]}
                    </span>
                  ) : null}
                  {skill.note ? (
                    <span className="text-soft" title={skill.note}>
                      *
                    </span>
                  ) : null}
                  {canManageProjects ? (
                    <button
                      type="button"
                      aria-label={`Remover ${skill.skillName} de ${allocation.consultantName}`}
                      onClick={() => onRemoveSkill({ id: skill.id })}
                      className="rounded-full p-0.5 text-medium hover:bg-surface"
                    >
                      <X aria-hidden="true" className="size-3.5" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function AllocationSkillModal({
  allocation,
  skills,
  isPending,
  onClose,
  onSave,
}: {
  allocation: ProjectAllocationItem;
  skills: ProjectSkillOption[];
  isPending: boolean;
  onClose: () => void;
  onSave: (value: AllocationSkillInput) => void;
}) {
  const [skillId, setSkillId] = useState("");
  const [level, setLevel] = useState<SkillLevel | "">("");
  const [note, setNote] = useState("");
  const usedSkillIds = new Set(allocation.skills.map((skill) => skill.skillId));
  const available = skills.filter((skill) => !usedSkillIds.has(skill.id));

  return (
    <Modal
      open
      onClose={onClose}
      title="Skill da alocação"
      description={`Skill do catalogo usada por ${allocation.consultantName} neste projeto.`}
      footer={
        <>
          <ActionButton variant="secondary" onClick={onClose}>
            Cancelar
          </ActionButton>
          <ActionButton
            disabled={isPending || !skillId}
            onClick={() =>
              onSave({
                allocationId: allocation.id,
                skillId,
                level: level || undefined,
                note: note.trim() || undefined,
              })
            }
          >
            Salvar
          </ActionButton>
        </>
      }
    >
      <form className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-medium">
          Skill
          <select
            value={skillId}
            onChange={(event) => setSkillId(event.target.value)}
            className={fieldClass()}
          >
            <option value="">Selecione</option>
            {available.map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.category ? `${skill.category} - ${skill.name}` : skill.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-medium">
          Nivel
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value as SkillLevel | "")}
            className={fieldClass()}
          >
            <option value="">Sem nivel</option>
            {(
              ["BASIC", "INTERMEDIATE", "ADVANCED", "SPECIALIST"] as SkillLevel[]
            ).map((item) => (
              <option key={item} value={item}>
                {skillLevelLabels[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-medium md:col-span-2">
          Nota
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className={cn(fieldClass(), "min-h-20 py-2")}
          />
        </label>
      </form>
    </Modal>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-medium">
      {label}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass()}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value?: number;
  disabled?: boolean;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-medium">
      {label}
      <input
        type="number"
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value === "" ? undefined : Number(event.target.value))
        }
        className={fieldClass()}
      />
    </label>
  );
}

function BillingConfigSelect<T extends string>({
  label,
  value,
  options,
  hint,
  onChange,
}: {
  label: string;
  value: T;
  options: Record<T, string>;
  hint?: string;
  onChange: (value: T) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-medium">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className={fieldClass()}
      >
        {(Object.entries(options) as [T, string][]).map(([key, optionLabel]) => (
          <option key={key} value={key}>
            {optionLabel}
          </option>
        ))}
      </select>
      {hint ? <span className="text-xs font-normal text-soft">{hint}</span> : null}
    </label>
  );
}

function BillingConfigCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-medium">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

/**
 * Formulario de configuracao de cobranca por projeto (motor parametrizavel).
 * Editado pelo Financeiro. Todos os campos sao opcionais: cada tipo de cobranca
 * usa apenas os que fazem sentido — o cabecalho lembra o modelo do projeto.
 */
function BillingConfigPanel({
  chargeType,
  value,
  onChange,
}: {
  chargeType?: string;
  value: ProjectBillingConfigInput;
  onChange: (value: ProjectBillingConfigInput) => void;
}) {
  function groupTitle(text: string) {
    return (
      <p className="md:col-span-2 text-xs font-semibold uppercase tracking-wide text-soft">
        {text}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-medium">
        Modelo de cálculo do projeto:{" "}
        <span className="font-semibold text-strong">{chargeType ?? "não definido"}</span>.
        Preencha apenas os parâmetros usados por este modelo.
      </p>
      <form className="grid gap-4 md:grid-cols-2">
        {groupTitle("Periodicidade e datas")}
        <BillingConfigSelect
          label="Periodicidade"
          value={value.periodicity}
          options={periodicityLabels}
          onChange={(periodicity) => onChange({ ...value, periodicity })}
        />
        <NumberField
          label="Dia de fechamento"
          value={value.closingDay}
          onChange={(closingDay) => onChange({ ...value, closingDay })}
        />
        <NumberField
          label="Dia de vencimento"
          value={value.dueDay}
          onChange={(dueDay) => onChange({ ...value, dueDay })}
        />

        {groupTitle("Cálculo e excedentes")}
        <BillingConfigSelect
          label="Arredondamento"
          value={value.roundingRule}
          options={billingRoundingLabels}
          onChange={(roundingRule) => onChange({ ...value, roundingRule })}
        />
        <NumberField
          label="Valor fixo / mensalidade (R$)"
          value={value.fixedAmount}
          onChange={(fixedAmount) => onChange({ ...value, fixedAmount })}
        />
        <NumberField
          label="Horas inclusas (franquia)"
          value={value.includedHours}
          onChange={(includedHours) => onChange({ ...value, includedHours })}
        />
        <NumberField
          label="Valor hora excedente (R$)"
          value={value.overageRate}
          onChange={(overageRate) => onChange({ ...value, overageRate })}
        />
        <BillingConfigSelect
          label="Tratamento de excedentes"
          value={value.overageTreatment}
          options={overageLabels}
          onChange={(overageTreatment) =>
            onChange({ ...value, overageTreatment })
          }
        />
        <NumberField
          label="Valor por consultor alocado (R$)"
          value={value.perConsultantAmount}
          onChange={(perConsultantAmount) =>
            onChange({ ...value, perConsultantAmount })
          }
        />

        {groupTitle("Reembolsos, descontos e multas")}
        <BillingConfigCheckbox
          label="Despesas reembolsáveis"
          checked={value.reimbursableExpenses}
          onChange={(reimbursableExpenses) =>
            onChange({ ...value, reimbursableExpenses })
          }
        />
        <NumberField
          label="Markup sobre reembolso (%)"
          value={value.reimbursableMarkupPct}
          onChange={(reimbursableMarkupPct) =>
            onChange({ ...value, reimbursableMarkupPct })
          }
        />
        <NumberField
          label="Desconto (%)"
          value={value.discountPct}
          onChange={(discountPct) => onChange({ ...value, discountPct })}
        />
        <NumberField
          label="Multa (%)"
          value={value.penaltyPct}
          onChange={(penaltyPct) => onChange({ ...value, penaltyPct })}
        />

        {groupTitle("Reajuste e impostos")}
        <BillingConfigSelect
          label="Índice de reajuste"
          value={value.adjustmentIndex}
          options={adjustmentLabels}
          hint="IPCA/IGP-M/CDI ficam registrados; apenas o percentual fixo é aplicado automaticamente."
          onChange={(adjustmentIndex) => onChange({ ...value, adjustmentIndex })}
        />
        <NumberField
          label="Percentual de reajuste (%)"
          value={value.adjustmentPct}
          onChange={(adjustmentPct) => onChange({ ...value, adjustmentPct })}
        />
        <BillingConfigCheckbox
          label="Reter ISS"
          checked={value.withholdIss}
          onChange={(withholdIss) => onChange({ ...value, withholdIss })}
        />
        <NumberField
          label="Retenção de impostos (%)"
          value={value.withholdingPct}
          onChange={(withholdingPct) => onChange({ ...value, withholdingPct })}
        />

        {groupTitle("Aprovação e observações")}
        <div className="md:col-span-2">
          <BillingConfigCheckbox
            label="Exigir aprovação antes da emissão da nota"
            checked={value.requireApproval}
            onChange={(requireApproval) =>
              onChange({ ...value, requireApproval })
            }
          />
        </div>
        <label className="md:col-span-2 space-y-1 text-sm font-medium text-medium">
          Observações
          <textarea
            value={value.notes ?? ""}
            onChange={(event) => onChange({ ...value, notes: event.target.value })}
            className={cn(fieldClass(), "min-h-20 py-2")}
          />
        </label>
      </form>
    </div>
  );
}

function AllocationModal({
  value,
  consultants,
  isEditing = false,
  isPending,
  onChange,
  onClose,
  onSave,
}: {
  value: AllocationInput;
  consultants: ProjectConsultantOption[];
  isEditing?: boolean;
  isPending: boolean;
  onChange: (value: AllocationInput) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? "Editar vínculo" : "Vínculo"}
      description="Consultor, skill/papel e periodo no projeto."
      footer={
        <>
          <ActionButton variant="secondary" onClick={onClose}>
            Cancelar
          </ActionButton>
          <ActionButton disabled={isPending} onClick={onSave}>
            Salvar
          </ActionButton>
        </>
      }
    >
      <form className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-medium">
          Consultor
          <select
            value={value.consultantId}
            disabled={isEditing}
            onChange={(event) =>
              onChange({ ...value, consultantId: event.target.value })
            }
            className={cn(fieldClass(), isEditing && "opacity-70")}
          >
            <option value="">Selecione</option>
            {consultants.map((consultant) => (
              <option key={consultant.id} value={consultant.id}>
                {consultant.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-medium">
          Skill ou papel
          <input
            value={value.role}
            onChange={(event) => onChange({ ...value, role: event.target.value })}
            className={fieldClass()}
          />
        </label>
        <NumberField
          label="Alocação (%)"
          value={value.allocationPercent}
          onChange={(next) =>
            onChange({ ...value, allocationPercent: next ?? 100 })
          }
        />
        <label className="space-y-1 text-sm font-medium text-medium">
          Status
          <select
            value={value.status}
            onChange={(event) =>
              onChange({
                ...value,
                status: event.target.value as AllocationInput["status"],
              })
            }
            className={fieldClass()}
          >
            <option value="PLANNED">Planejado</option>
            <option value="ACTIVE">Ativo</option>
            <option value="ENDED">Encerrado</option>
            <option value="CANCELLED">Cancelado</option>
            <option value="INACTIVE">Inativo</option>
          </select>
        </label>
        <DateField
          label="Inicio"
          value={value.startDate}
          onChange={(next) => onChange({ ...value, startDate: next })}
        />
        <DateField
          label="Fim"
          value={value.endDate ?? ""}
          onChange={(next) => onChange({ ...value, endDate: next || undefined })}
        />
      </form>
    </Modal>
  );
}

function SaleRateModal({
  value,
  consultants,
  allocations,
  isPending,
  onChange,
  onClose,
  onSave,
}: {
  value: SaleRateInput;
  consultants: ProjectConsultantOption[];
  allocations: { id: string; label: string }[];
  isPending: boolean;
  onChange: (value: SaleRateInput) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Valor de venda"
      description="Valor comercial por escopo e vigência."
      footer={
        <>
          <ActionButton variant="secondary" onClick={onClose}>
            Cancelar
          </ActionButton>
          <ActionButton disabled={isPending} onClick={onSave}>
            Salvar
          </ActionButton>
        </>
      }
    >
      <form className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-medium">
          Escopo
          <select
            value={value.allocationId ? `allocation:${value.allocationId}` : value.consultantId ? `consultant:${value.consultantId}` : "project"}
            onChange={(event) => {
              const [kind, id] = event.target.value.split(":");
              onChange({
                ...value,
                allocationId: kind === "allocation" ? id : undefined,
                consultantId: kind === "consultant" ? id : undefined,
              });
            }}
            className={fieldClass()}
          >
            <option value="project">Projeto</option>
            {consultants.map((consultant) => (
              <option key={consultant.id} value={`consultant:${consultant.id}`}>
                {consultant.name}
              </option>
            ))}
            {allocations.map((allocation) => (
              <option key={allocation.id} value={`allocation:${allocation.id}`}>
                {allocation.label}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="Valor hora"
          value={value.hourlyRate}
          onChange={(next) => onChange({ ...value, hourlyRate: next ?? 0 })}
        />
        <DateField
          label="Inicio"
          value={value.startsAt}
          onChange={(next) => onChange({ ...value, startsAt: next })}
        />
        <DateField
          label="Fim"
          value={value.endsAt ?? ""}
          onChange={(next) => onChange({ ...value, endsAt: next || undefined })}
        />
        <label className="space-y-1 text-sm font-medium text-medium md:col-span-2">
          Nota
          <textarea
            value={value.note ?? ""}
            onChange={(event) => onChange({ ...value, note: event.target.value })}
            className={cn(fieldClass(), "min-h-20 py-2")}
          />
        </label>
      </form>
    </Modal>
  );
}
