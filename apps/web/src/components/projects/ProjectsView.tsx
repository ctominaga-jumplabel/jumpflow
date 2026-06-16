"use client";

import { useMemo, useState, useTransition } from "react";
import { Edit, FolderKanban, Link2, Plus, ReceiptText, Tag, X } from "lucide-react";
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
  removeAllocationSkill,
  updateProject,
} from "@/app/app/projetos/actions";
import type {
  AllocationInput,
  AllocationSkillInput,
  AllocationSkillRemoveInput,
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
  ProjectAllocationItem,
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
type DetailTab = "ALLOCATIONS" | "SKILLS" | "RATES";

const skillLevelLabels: Record<SkillLevel, string> = {
  BASIC: "Basico",
  INTERMEDIATE: "Intermediario",
  ADVANCED: "Avancado",
  SPECIALIST: "Especialista",
};

interface ProjectsViewProps {
  mode: Mode;
  projects?: ProjectItem[];
  clients?: ProjectClientOption[];
  consultants?: ProjectConsultantOption[];
  managers?: ProjectManagerOption[];
  skills?: ProjectSkillOption[];
  canManageProjects: boolean;
  canViewCommercials: boolean;
  canManageSaleRates: boolean;
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
    billingHourlyRate: project.billingHourlyRate,
    budgetHours: project.budgetHours,
    costCenter: project.costCenter ?? "",
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
  canManageProjects,
  canViewCommercials,
  canManageSaleRates,
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
  const [detailProject, setDetailProject] = useState<ProjectItem | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("ALLOCATIONS");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
      header: "Periodo",
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
            setDetailProject(project);
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
            aria-label={`Vinculos e valores de ${project.name}`}
            onClick={() => setDetailProject(project)}
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
      setDetailProject((current) =>
        current && current.id === value.projectId
          ? {
              ...current,
              allocatedConsultants: current.allocatedConsultants + 1,
              allocations: [...current.allocations, nextAllocation],
            }
          : current,
      );
      setFeedback("Vinculo salvo localmente.");
      return;
    }
    startTransition(async () => {
      const result = await createAllocation(value);
      setFeedback(result.ok ? "Vinculo salvo." : result.message);
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
      setDetailProject((current) =>
        current && current.id === value.projectId
          ? { ...current, saleRates: [...current.saleRates, nextRate] }
          : current,
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
    setDetailProject((current) => (current ? updater(current) : current));
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
      setFeedback("Skill da alocacao salva localmente.");
      return;
    }
    startTransition(async () => {
      const result = await addAllocationSkill(value);
      setFeedback(result.ok ? "Skill adicionada a alocacao." : result.message);
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
      setFeedback("Skill removida da alocacao localmente.");
      return;
    }
    startTransition(async () => {
      const result = await removeAllocationSkill(input);
      setFeedback(result.ok ? "Skill removida da alocacao." : result.message);
    });
  }

  return (
    <div className="space-y-4">
      {mode === "demo" ? (
        <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
          Modo demonstracao: projetos, vinculos e valores ficam apenas nesta sessao.
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
        isPending={isPending}
        onTabChange={setDetailTab}
        onClose={() => setDetailProject(null)}
        onAddAllocation={addAllocation}
        onAddSaleRate={addSaleRate}
        onAddSkill={addSkill}
        onRemoveSkill={removeSkill}
      />
    </div>
  );
}

function ProjectModal({
  open,
  value,
  clients,
  managers,
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
          Descricao
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
  isPending,
  onTabChange,
  onClose,
  onAddAllocation,
  onAddSaleRate,
  onAddSkill,
  onRemoveSkill,
}: {
  project: ProjectItem | null;
  tab: DetailTab;
  consultants: ProjectConsultantOption[];
  skills: ProjectSkillOption[];
  canViewCommercials: boolean;
  canManageProjects: boolean;
  canManageSaleRates: boolean;
  isPending: boolean;
  onTabChange: (tab: DetailTab) => void;
  onClose: () => void;
  onAddAllocation: (value: AllocationInput) => void;
  onAddSaleRate: (value: SaleRateInput) => void;
  onAddSkill: (value: AllocationSkillInput) => void;
  onRemoveSkill: (value: AllocationSkillRemoveInput) => void;
}) {
  const [allocation, setAllocation] = useState<AllocationInput | null>(null);
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
      description="Vinculos de consultores e valores comerciais por vigencia."
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
              onClick={() =>
                setAllocation({
                  projectId: project.id,
                  consultantId: "",
                  role: "",
                  allocationPercent: 100,
                  startDate: project.startDate,
                  endDate: undefined,
                  status: "PLANNED",
                })
              }
            >
              Novo vinculo
            </ActionButton>
          ) : tab === "RATES" ? (
            <ActionButton
              icon={ReceiptText}
              disabled={!canManageSaleRates}
              onClick={() =>
                setRate({
                  projectId: project.id,
                  consultantId: undefined,
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
          ) : null}
        </>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterChip
          label="Vinculos"
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
              header: "Periodo",
              cell: (item) =>
                `${formatDate(item.startDate)} - ${
                  item.endDate ? formatDate(item.endDate) : "em aberto"
                }`,
            },
            { key: "status", header: "Status", cell: (item) => item.status },
          ]}
          rows={project.allocations}
          rowKey={(item) => item.id}
          empty={<p className="text-center text-sm text-soft">Sem vinculos.</p>}
        />
      ) : tab === "SKILLS" ? (
        <AllocationSkillsPanel
          allocations={project.allocations}
          canManageProjects={canManageProjects}
          onAddSkill={(item) => setSkillFor(item)}
          onRemoveSkill={onRemoveSkill}
        />
      ) : canViewCommercials ? (
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
              header: "Vigencia",
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
      )}

      {allocation ? (
        <AllocationModal
          value={allocation}
          consultants={consultants}
          isPending={isPending}
          onChange={setAllocation}
          onClose={() => setAllocation(null)}
          onSave={() => {
            onAddAllocation(allocation);
            setAllocation(null);
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
        Adicione um vinculo para registrar skills.
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
            <p className="mt-3 text-sm text-soft">Sem skills nesta alocacao.</p>
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
      title="Skill da alocacao"
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

function AllocationModal({
  value,
  consultants,
  isPending,
  onChange,
  onClose,
  onSave,
}: {
  value: AllocationInput;
  consultants: ProjectConsultantOption[];
  isPending: boolean;
  onChange: (value: AllocationInput) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Vinculo"
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
            onChange={(event) =>
              onChange({ ...value, consultantId: event.target.value })
            }
            className={fieldClass()}
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
          label="Alocacao (%)"
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
      description="Valor comercial por escopo e vigencia."
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
