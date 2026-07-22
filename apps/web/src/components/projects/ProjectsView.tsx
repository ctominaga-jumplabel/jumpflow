"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CalendarClock,
  CheckCircle2,
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
  createReceivable,
  createSaleRate,
  deleteReceivable,
  markProjectAcceptanceAccepted,
  removeAllocation,
  removeAllocationSkill,
  updateAllocation,
  updateProject,
  updateProjectOpportunityType,
  updateProjectPaymentType,
  updateReceivable,
  upsertProjectBillingConfig,
  getProjectTracking,
} from "@/app/app/projetos/actions";
import type { ProjectTracking } from "@/lib/projects/tracking";
import type {
  AllocationInput,
  AllocationSkillInput,
  AllocationSkillRemoveInput,
  ProjectBillingConfigInput,
  ProjectInput,
  ReceivableInput,
  SaleRateInput,
} from "@/lib/projects/schemas";
import {
  demoProjectClients,
  demoProjectConsultants,
  demoProjectManagers,
  demoProjects,
  demoProjectSkills,
} from "@/lib/projects/mock-data";
import {
  isMissingBillingConfig,
  isMissingSaleRate,
  projectItemHasSaleValue,
} from "@/lib/projects/pending";
import type {
  ProjectAllocationItem,
  ProjectBillingTypeOption,
  ProjectClientOption,
  ProjectConsultantOption,
  ProjectItem,
  ProjectManagerOption,
  ProjectOpportunityType,
  ProjectPaymentType,
  ProjectReceivableItem,
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
import { cn } from "@/lib/utils";
import { focusRingInput } from "@/lib/styles";
import {
  opportunityTypeLabels,
  opportunityTypeOptions,
} from "@/lib/projects/labels";
import { ProjectStatusBadge, projectStatusLabels } from "./ProjectStatusBadge";
import { ProjectTrackingPanel } from "./ProjectTrackingPanel";
import {
  billingConfigToForm,
  formToBillingConfigItem,
} from "./shared/billing-form";
import { BillingConfigPanel } from "./shared/BillingConfigPanel";
import { AutoApprovalConfigPanel } from "./shared/AutoApprovalConfigPanel";
import { DateField, NumberField, fieldClass } from "./shared/fields";
import { allocationStatusLabels, skillLevelLabels } from "./shared/labels";
import { SaleRateModal } from "./shared/SaleRateModal";
import {
  ReceivableModal,
  receivableStatusLabels,
} from "./shared/ReceivableModal";

type Mode = "demo" | "db";
type DetailTab =
  | "ALLOCATIONS"
  | "SKILLS"
  | "RATES"
  | "RECEIVABLES"
  | "BILLING"
  | "APPROVAL"
  | "TRACKING";

/** Rótulos pt-BR dos tipos de pagamento do cliente (comercial). */
const paymentTypeLabels: Record<ProjectPaymentType, string> = {
  ONE_TIME: "À vista",
  INSTALLMENTS: "Parcelado",
  MONTHLY: "Mensal",
  ON_MILESTONE: "Por marco",
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
  canManageReceivables: boolean;
  /** D5: usuário pode ver o Acompanhamento (Financeiro/Comercial/PM). */
  canViewTracking?: boolean;
  /**
   * Quando definido, restringe a aba de Acompanhamento aos projetos onde
   * managerUserId === este id (caso PROJECT_MANAGER sem papel amplo). Null =
   * vê todos os projetos no escopo. O servidor revalida esse escopo de qualquer
   * forma na server action.
   */
  trackingManagerUserId?: string | null;
}

const statusFilters: (ProjectStatus | "ALL")[] = [
  "ALL",
  "PROPOSAL",
  "ACTIVE",
  "PAUSED",
  "CLOSED",
  "CANCELLED",
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
  requiresAcceptanceTerm: false,
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
    // Campos comerciais não são editados na Operação, mas trafegam inalterados
    // para não serem zerados quando um perfil comercial salva o projeto aqui.
    billingTypeId: project.billingTypeId,
    billingHourlyRate: project.billingHourlyRate,
    budgetHours: project.budgetHours,
    costCenter: project.costCenter ?? "",
    requiresAcceptanceTerm: project.requiresAcceptanceTerm ?? false,
  };
}

/** Read-only pendency chips that point Operação at the áreas donas. */
function ProjectPendingBadges({ project }: { project: ProjectItem }) {
  const missingSale = isMissingSaleRate(project);
  const missingBilling = isMissingBillingConfig(project);
  // Aceite pendente: flag informativa (não bloqueia nada) — exige termo e ainda
  // não foi marcado como aceito.
  const acceptancePending = Boolean(
    project.requiresAcceptanceTerm && !project.acceptanceTermAcceptedAt,
  );
  if (!missingSale && !missingBilling && !acceptancePending) {
    return <span className="text-xs text-soft">-</span>;
  }
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {missingSale ? (
        <span className="rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
          Sem valor de venda
        </span>
      ) : null}
      {missingBilling ? (
        <span className="rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
          Sem regra de cobrança
        </span>
      ) : null}
      {acceptancePending ? (
        <span className="rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
          Aceite pendente
        </span>
      ) : null}
    </div>
  );
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
  canEditBillingConfig,
  canManageReceivables,
  canViewTracking = false,
  trackingManagerUserId = null,
}: ProjectsViewProps) {
  // Single optimistic copy of the list, seeded from server props. It re-seeds
  // whenever the server sends fresh data (e.g. after a revalidatePath from a
  // server action), so optimistic edits — like vincular um consultor — show
  // instantly and are then reconciled with the canonical server state. Without
  // this, db mode waited for the round-trip before the modal reflected the add.
  const [items, setItems] = useState(projects);
  const [syncedProjects, setSyncedProjects] = useState(projects);
  if (projects !== syncedProjects) {
    setSyncedProjects(projects);
    setItems(projects);
  }
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
  // Acompanhamento (D5): carregado sob demanda pela server action ao abrir a
  // aba (nunca em useEffect — evita set-state-in-effect). O RBAC/escopo é
  // reavaliado no servidor a cada chamada.
  const [tracking, setTracking] = useState<ProjectTracking | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
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
      key: "opportunityType",
      header: "Tipo",
      cell: (project) =>
        project.opportunityType ? (
          <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-medium">
            {opportunityTypeLabels[project.opportunityType]}
          </span>
        ) : (
          <span className="text-xs text-soft">—</span>
        ),
      className: "hidden lg:table-cell",
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
      key: "consumed",
      header: "Consumo",
      align: "right",
      cell: (project) => (
        <span className="tabular-nums">{formatHours(project.consumedHours)}</span>
      ),
    },
    {
      key: "pending",
      header: "Situação",
      align: "right",
      cell: (project) => <ProjectPendingBadges project={project} />,
      className: "hidden md:table-cell",
    },
    {
      key: "team",
      header: "Equipe",
      align: "right",
      cell: (project) => (
        <button
          type="button"
          className="rounded-md px-2 py-1 tabular-nums hover:bg-surface-muted"
          onClick={() => openDetail(project.id)}
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
            onClick={() => openDetail(project.id)}
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
    const client = clients.find((item) => item.id === projectForm.clientId);
    const manager = managers.find((item) => item.id === projectForm.managerUserId);
    const next: ProjectItem = {
      ...(editing ?? {
        id: `prj-local-${Date.now()}`,
        allocations: [],
        saleRates: [],
        consumedHours: 0,
        allocatedConsultants: 0,
        hasActiveSaleRate: false,
        hasBillingConfig: false,
      }),
      ...projectForm,
      clientId: projectForm.clientId,
      clientName: client?.name ?? "Cliente",
      managerName: manager?.name,
      endDate: projectForm.endDate,
    };
    setItems((current) =>
      editing
        ? current.map((item) => (item.id === editing.id ? next : item))
        : [next, ...current],
    );
    setProjectOpen(false);
    if (mode === "demo") {
      setFeedback("Projeto salvo localmente.");
      return;
    }
    startTransition(async () => {
      const result = editing
        ? await updateProject({ id: editing.id, ...projectForm })
        : await createProject(projectForm);
      if (result.ok) setFeedback("Projeto salvo.");
      else {
        setFeedback(result.message);
        setItems(projects); // rollback optimistic edit on failure
      }
    });
  }

  // Reset the on-demand tracking cache whenever the open project changes, so a
  // stale snapshot from another project never flashes in the new modal.
  function openDetail(projectId: string, tab: DetailTab = "ALLOCATIONS") {
    setTracking(null);
    setTrackingError(null);
    setTrackingLoading(false);
    setDetailProjectId(projectId);
    setDetailTab(tab);
  }

  function loadTracking(projectId: string) {
    setTracking(null);
    setTrackingError(null);
    setTrackingLoading(true);
    startTransition(async () => {
      const result = await getProjectTracking({ projectId });
      if (result.ok) {
        setTracking(result.data);
      } else {
        setTrackingError(result.message);
      }
      setTrackingLoading(false);
    });
  }

  // Initialize the billing form lazily when the Cobrança tab is opened (avoids
  // setState-in-effect; the form holds the user's edits across data refreshes).
  function handleDetailTabChange(next: DetailTab) {
    if (next === "BILLING" && detailProject) {
      setBillingForm(billingConfigToForm(detailProject));
    }
    // Acompanhamento: busca sob demanda na troca de aba (event handler).
    if (next === "TRACKING" && detailProject) {
      loadTracking(detailProject.id);
    }
    setDetailTab(next);
  }

  function saveBillingConfig() {
    if (!billingForm) return;
    const form = billingForm;
    setItems((current) =>
      current.map((project) =>
        project.id === form.projectId
          ? {
              ...project,
              billingConfig: formToBillingConfigItem(form),
              hasBillingConfig: true,
            }
          : project,
      ),
    );
    if (mode === "demo") {
      setFeedback("Configuração de cobrança salva localmente.");
      return;
    }
    startTransition(async () => {
      const result = await upsertProjectBillingConfig(form);
      if (result.ok) setFeedback("Configuração de cobrança salva.");
      else {
        setFeedback(result.message);
        setItems(projects);
      }
    });
  }

  function addAllocation(value: AllocationInput) {
    const consultant = consultants.find((item) => item.id === value.consultantId);
    const nextAllocation: ProjectAllocationItem = {
      ...value,
      id: `alloc-local-${Date.now()}`,
      consultantName: consultant?.name ?? "Consultor",
      skills: [],
    };
    // Optimistic insert in BOTH modes so the consultant shows in the table the
    // moment Salvar is clicked; the server revalidation reconciles it (db mode).
    setItems((current) =>
      current.map((project) =>
        project.id === value.projectId
          ? {
              ...project,
              allocatedConsultants:
                project.allocatedConsultants +
                (value.status === "ACTIVE" ? 1 : 0),
              allocations: [...project.allocations, nextAllocation],
            }
          : project,
      ),
    );
    if (mode === "demo") {
      setFeedback("Vínculo salvo localmente.");
      return;
    }
    startTransition(async () => {
      const result = await createAllocation(value);
      if (result.ok) setFeedback("Vínculo salvo.");
      else {
        setFeedback(result.message);
        setItems(projects); // rollback the optimistic insert
      }
    });
  }

  function editAllocation(id: string, value: AllocationInput) {
    const consultant = consultants.find((item) => item.id === value.consultantId);
    setItems((current) =>
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
    if (mode === "demo") {
      setFeedback("Vínculo atualizado localmente.");
      return;
    }
    startTransition(async () => {
      const result = await updateAllocation({ id, ...value });
      if (result.ok) setFeedback("Vínculo atualizado.");
      else {
        setFeedback(result.message);
        setItems(projects);
      }
    });
  }

  function deleteAllocation(allocation: ProjectAllocationItem) {
    setItems((current) =>
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
    if (mode === "demo") {
      setFeedback("Vínculo removido localmente.");
      return;
    }
    startTransition(async () => {
      const result = await removeAllocation({ id: allocation.id });
      if (!result.ok) {
        setFeedback(result.message);
        setItems(projects); // restore on failure
        return;
      }
      // On success the revalidation reconciles: a link with logged hours
      // reappears flagged INACTIVE (kept for history), a clean one stays gone.
      setFeedback(
        result.data.outcome === "deactivated"
          ? "Consultor tinha horas lançadas: vínculo marcado como Inativo."
          : "Vínculo removido (sem horas lançadas).",
      );
    });
  }

  function addSaleRate(value: SaleRateInput) {
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
    const today = new Date().toISOString().slice(0, 10);
    setItems((current) =>
      current.map((project) => {
        if (project.id !== value.projectId) return project;
        const updated = {
          ...project,
          saleRates: [...project.saleRates, nextRate],
        };
        // Recompute coverage (base rate OU todos os consultores precificados),
        // mesma semântica do servidor.
        return {
          ...updated,
          hasActiveSaleRate: projectItemHasSaleValue(updated, today),
        };
      }),
    );
    if (mode === "demo") {
      setFeedback("Valor de venda salvo localmente.");
      return;
    }
    startTransition(async () => {
      const result = await createSaleRate(value);
      if (result.ok) setFeedback("Valor de venda salvo.");
      else {
        setFeedback(result.message);
        setItems(projects);
      }
    });
  }

  // Sort receivables by dueAt (ISO date compares chronologically as string).
  function sortReceivables(list: ProjectReceivableItem[]): ProjectReceivableItem[] {
    return [...list].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  }

  function addReceivable(value: ReceivableInput) {
    const next: ProjectReceivableItem = {
      id: `receivable-local-${Date.now()}`,
      projectId: value.projectId,
      dueAt: value.dueAt,
      amount: value.amount,
      label: value.label,
      status: value.status,
      note: value.note,
    };
    setItems((current) =>
      current.map((project) =>
        project.id === value.projectId
          ? {
              ...project,
              receivables: sortReceivables([
                ...(project.receivables ?? []),
                next,
              ]),
            }
          : project,
      ),
    );
    if (mode === "demo") {
      setFeedback("Recebimento salvo localmente.");
      return;
    }
    startTransition(async () => {
      const result = await createReceivable(value);
      if (result.ok) setFeedback("Recebimento salvo.");
      else {
        setFeedback(result.message);
        setItems(projects);
      }
    });
  }

  function editReceivable(id: string, value: ReceivableInput) {
    setItems((current) =>
      current.map((project) =>
        project.id === value.projectId
          ? {
              ...project,
              receivables: sortReceivables(
                (project.receivables ?? []).map((item) =>
                  item.id === id
                    ? {
                        ...item,
                        dueAt: value.dueAt,
                        amount: value.amount,
                        label: value.label,
                        status: value.status,
                        note: value.note,
                      }
                    : item,
                ),
              ),
            }
          : project,
      ),
    );
    if (mode === "demo") {
      setFeedback("Recebimento atualizado localmente.");
      return;
    }
    startTransition(async () => {
      const result = await updateReceivable({ id, ...value });
      if (result.ok) setFeedback("Recebimento atualizado.");
      else {
        setFeedback(result.message);
        setItems(projects);
      }
    });
  }

  function removeReceivable(receivable: ProjectReceivableItem) {
    setItems((current) =>
      current.map((project) =>
        project.id === receivable.projectId
          ? {
              ...project,
              receivables: (project.receivables ?? []).filter(
                (item) => item.id !== receivable.id,
              ),
            }
          : project,
      ),
    );
    if (mode === "demo") {
      setFeedback("Recebimento removido localmente.");
      return;
    }
    startTransition(async () => {
      const result = await deleteReceivable({ id: receivable.id });
      if (result.ok) setFeedback("Recebimento removido.");
      else {
        setFeedback(result.message);
        setItems(projects);
      }
    });
  }

  function changePaymentType(
    projectId: string,
    paymentType: ProjectPaymentType | undefined,
  ) {
    setItems((current) =>
      current.map((project) =>
        project.id === projectId ? { ...project, paymentType } : project,
      ),
    );
    if (mode === "demo") {
      setFeedback("Tipo de pagamento salvo localmente.");
      return;
    }
    startTransition(async () => {
      const result = await updateProjectPaymentType({
        id: projectId,
        paymentType,
      });
      if (result.ok) setFeedback("Tipo de pagamento salvo.");
      else {
        setFeedback(result.message);
        setItems(projects);
      }
    });
  }

  function changeOpportunityType(
    projectId: string,
    opportunityType: ProjectOpportunityType | undefined,
  ) {
    setItems((current) =>
      current.map((project) =>
        project.id === projectId ? { ...project, opportunityType } : project,
      ),
    );
    if (mode === "demo") {
      setFeedback("Tipo de projeto salvo localmente.");
      return;
    }
    startTransition(async () => {
      const result = await updateProjectOpportunityType({
        id: projectId,
        opportunityType,
      });
      if (result.ok) setFeedback("Tipo de projeto salvo.");
      else {
        setFeedback(result.message);
        setItems(projects);
      }
    });
  }

  function acceptTerm(projectId: string) {
    const acceptedAt = new Date().toISOString();
    setItems((current) =>
      current.map((project) =>
        project.id === projectId
          ? { ...project, acceptanceTermAcceptedAt: acceptedAt }
          : project,
      ),
    );
    if (mode === "demo") {
      setFeedback("Termo de aceite registrado localmente.");
      return;
    }
    startTransition(async () => {
      const result = await markProjectAcceptanceAccepted({ id: projectId });
      if (result.ok) setFeedback("Termo de aceite registrado.");
      else {
        setFeedback(result.message);
        setItems(projects);
      }
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
    setItems((current) => current.map(updater));
  }

  function addSkill(value: AllocationSkillInput) {
    const project = items.find((item) =>
      item.allocations.some((allocation) => allocation.id === value.allocationId),
    );
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
    if (mode === "demo") {
      setFeedback("Skill da alocação salva localmente.");
      return;
    }
    startTransition(async () => {
      const result = await addAllocationSkill(value);
      if (result.ok) setFeedback("Skill adicionada a alocação.");
      else {
        setFeedback(result.message);
        setItems(projects);
      }
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
    if (located) {
      applyAllocationSkills(
        located.project.id,
        located.allocation.id,
        (current) => current.filter((skill) => skill.id !== input.id),
      );
    }
    if (mode === "demo") {
      setFeedback("Skill removida da alocação localmente.");
      return;
    }
    startTransition(async () => {
      const result = await removeAllocationSkill(input);
      if (result.ok) setFeedback("Skill removida da alocação.");
      else {
        setFeedback(result.message);
        setItems(projects);
      }
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
        canManageReceivables={canManageReceivables}
        canViewTracking={canViewTracking && mode === "db"}
        trackingManagerUserId={trackingManagerUserId}
        tracking={tracking}
        trackingLoading={trackingLoading}
        trackingError={trackingError}
        billingForm={billingForm}
        isPending={isPending}
        onTabChange={handleDetailTabChange}
        onClose={() => {
          setDetailProjectId(null);
          setTracking(null);
          setTrackingError(null);
          setTrackingLoading(false);
        }}
        onAddAllocation={addAllocation}
        onEditAllocation={editAllocation}
        onRemoveAllocation={deleteAllocation}
        onAddSaleRate={addSaleRate}
        onAddReceivable={addReceivable}
        onEditReceivable={editReceivable}
        onRemoveReceivable={removeReceivable}
        onChangePaymentType={changePaymentType}
        onChangeOpportunityType={changeOpportunityType}
        onAcceptTerm={acceptTerm}
        onAddSkill={addSkill}
        onRemoveSkill={removeSkill}
        onBillingChange={setBillingForm}
        onSaveBillingConfig={saveBillingConfig}
      />
    </div>
  );
}

/**
 * Operação cria/edita apenas os dados de ciclo de vida do projeto. Os campos
 * comerciais (tipo de cobrança, valor hora, budget) migraram para a superfície
 * Comercial; o valor de venda por vigência vive em ProjectSaleRate.
 */
function ProjectModal({
  open,
  value,
  clients,
  managers,
  isPending,
  onChange,
  onClose,
  onSave,
}: {
  open: boolean;
  value: ProjectInput;
  clients: ProjectClientOption[];
  managers: ProjectManagerOption[];
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
      description="Dados operacionais e período. Valores comerciais e regras de cobrança são definidos pelas áreas donas."
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
            {(
              [
                "PROPOSAL",
                "ACTIVE",
                "PAUSED",
                "CLOSED",
                "CANCELLED",
              ] as ProjectStatus[]
            ).map(
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
          Centro de custo
          <input
            value={value.costCenter ?? ""}
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
        <label className="flex items-start gap-2 text-sm font-medium text-medium md:col-span-2">
          <input
            type="checkbox"
            checked={value.requiresAcceptanceTerm ?? false}
            onChange={(event) =>
              onChange({ ...value, requiresAcceptanceTerm: event.target.checked })
            }
            className="mt-0.5 size-4 rounded border-border"
          />
          <span>
            Exige termo de aceite
            <span className="block text-xs font-normal text-soft">
              Informativo: sinaliza pendência até o aceite, mas não bloqueia
              lançamento nem faturamento.
            </span>
          </span>
        </label>
      </form>
    </Modal>
  );
}

/**
 * Detalhe 360 do projeto: leitura consolidada com edição por bloco conforme o
 * papel. Operação edita vínculos/skills; Comercial edita valores de venda;
 * Financeiro edita a regra de cobrança. As abas comerciais aparecem read-only
 * para quem não é dono, para ninguém trabalhar no escuro.
 */
function ProjectDetailModal({
  project,
  tab,
  consultants,
  skills,
  canViewCommercials,
  canManageProjects,
  canManageSaleRates,
  canEditBillingConfig,
  canManageReceivables,
  canViewTracking,
  trackingManagerUserId,
  tracking,
  trackingLoading,
  trackingError,
  billingForm,
  isPending,
  onTabChange,
  onClose,
  onAddAllocation,
  onEditAllocation,
  onRemoveAllocation,
  onAddSaleRate,
  onAddReceivable,
  onEditReceivable,
  onRemoveReceivable,
  onChangePaymentType,
  onChangeOpportunityType,
  onAcceptTerm,
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
  canManageReceivables: boolean;
  canViewTracking: boolean;
  trackingManagerUserId: string | null;
  tracking: ProjectTracking | null;
  trackingLoading: boolean;
  trackingError: string | null;
  billingForm: ProjectBillingConfigInput | null;
  isPending: boolean;
  onTabChange: (tab: DetailTab) => void;
  onClose: () => void;
  onAddAllocation: (value: AllocationInput) => void;
  onEditAllocation: (id: string, value: AllocationInput) => void;
  onRemoveAllocation: (allocation: ProjectAllocationItem) => void;
  onAddSaleRate: (value: SaleRateInput) => void;
  onAddReceivable: (value: ReceivableInput) => void;
  onEditReceivable: (id: string, value: ReceivableInput) => void;
  onRemoveReceivable: (receivable: ProjectReceivableItem) => void;
  onChangePaymentType: (
    projectId: string,
    paymentType: ProjectPaymentType | undefined,
  ) => void;
  onChangeOpportunityType: (
    projectId: string,
    opportunityType: ProjectOpportunityType | undefined,
  ) => void;
  onAcceptTerm: (projectId: string) => void;
  onAddSkill: (value: AllocationSkillInput) => void;
  onRemoveSkill: (value: AllocationSkillRemoveInput) => void;
  onBillingChange: (value: ProjectBillingConfigInput) => void;
  onSaveBillingConfig: () => void;
}) {
  const [allocation, setAllocation] = useState<AllocationInput | null>(null);
  // When set, the allocation modal is in edit mode for this allocation id.
  const [allocationEditId, setAllocationEditId] = useState<string | null>(null);
  const [rate, setRate] = useState<SaleRateInput | null>(null);
  const [receivable, setReceivable] = useState<ReceivableInput | null>(null);
  const [receivableEditId, setReceivableEditId] = useState<string | null>(null);
  const [receivableToDelete, setReceivableToDelete] =
    useState<ProjectReceivableItem | null>(null);
  const [skillFor, setSkillFor] = useState<ProjectAllocationItem | null>(null);

  if (!project) return null;
  const allocationOptions = project.allocations.map((item) => ({
    id: item.id,
    label: `${item.consultantName} - ${item.role}`,
  }));
  // D5: a aba de Acompanhamento aparece para Financeiro/Comercial (todos os
  // projetos) e para o PROJECT_MANAGER APENAS nos próprios projetos. O servidor
  // reforça o mesmo escopo na server action (defesa em profundidade).
  const showTracking =
    canViewTracking &&
    (trackingManagerUserId == null ||
      project.managerUserId === trackingManagerUserId);

  return (
    <Modal
      open={project !== null}
      onClose={onClose}
      title={project.name}
      description="Visão consolidada do projeto: vínculos, skills, valores de venda e cobrança."
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
          ) : tab === "RATES" && canManageSaleRates ? (
            <ActionButton
              icon={ReceiptText}
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
          ) : tab === "RECEIVABLES" && canManageReceivables ? (
            <ActionButton
              icon={CalendarClock}
              onClick={() => {
                setReceivableEditId(null);
                setReceivable({
                  projectId: project.id,
                  dueAt: project.startDate,
                  amount: 0,
                  label: "",
                  status: "FORECAST",
                  note: "",
                });
              }}
            >
              Novo recebimento
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
      {project.requiresAcceptanceTerm ? (
        <div
          className={cn(
            "mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm",
            project.acceptanceTermAcceptedAt
              ? "border-success/30 bg-success-soft text-success"
              : "border-warning/30 bg-warning-soft text-warning",
          )}
        >
          <span className="flex items-center gap-2 font-medium">
            {project.acceptanceTermAcceptedAt ? (
              <>
                <CheckCircle2 aria-hidden="true" className="size-4" />
                Termo de aceite registrado em{" "}
                {formatDate(project.acceptanceTermAcceptedAt.slice(0, 10))}.
              </>
            ) : (
              <>Termo de aceite pendente.</>
            )}
          </span>
          {!project.acceptanceTermAcceptedAt && canManageProjects ? (
            <ActionButton
              size="sm"
              variant="secondary"
              icon={CheckCircle2}
              disabled={isPending}
              onClick={() => onAcceptTerm(project.id)}
            >
              Marcar como aceito
            </ActionButton>
          ) : null}
        </div>
      ) : null}
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
          label="Aprovação"
          active={tab === "APPROVAL"}
          onClick={() => onTabChange("APPROVAL")}
        />
        <FilterChip
          label="Valores de venda"
          active={tab === "RATES"}
          onClick={() => onTabChange("RATES")}
        />
        <FilterChip
          label="Recebimentos previstos"
          active={tab === "RECEIVABLES"}
          onClick={() => onTabChange("RECEIVABLES")}
        />
        {canEditBillingConfig ? (
          <FilterChip
            label="Cobrança"
            active={tab === "BILLING"}
            onClick={() => onTabChange("BILLING")}
          />
        ) : null}
        {showTracking ? (
          <FilterChip
            label="Acompanhamento"
            active={tab === "TRACKING"}
            onClick={() => onTabChange("TRACKING")}
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
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-medium text-medium">
                Tipo de pagamento
                <select
                  value={project.paymentType ?? ""}
                  disabled={!canManageSaleRates}
                  onChange={(event) =>
                    onChangePaymentType(
                      project.id,
                      (event.target.value as ProjectPaymentType) || undefined,
                    )
                  }
                  className={cn(
                    fieldClass(),
                    !canManageSaleRates && "opacity-70",
                  )}
                >
                  <option value="">Não definido</option>
                  {(
                    [
                      "ONE_TIME",
                      "INSTALLMENTS",
                      "MONTHLY",
                      "ON_MILESTONE",
                    ] as ProjectPaymentType[]
                  ).map((item) => (
                    <option key={item} value={item}>
                      {paymentTypeLabels[item]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-medium">
                Tipo de projeto
                <select
                  value={project.opportunityType ?? ""}
                  disabled={!canManageSaleRates}
                  onChange={(event) =>
                    onChangeOpportunityType(
                      project.id,
                      (event.target.value as ProjectOpportunityType) ||
                        undefined,
                    )
                  }
                  className={cn(
                    fieldClass(),
                    !canManageSaleRates && "opacity-70",
                  )}
                >
                  <option value="">Não classificado</option>
                  {opportunityTypeOptions.map((item) => (
                    <option key={item} value={item}>
                      {opportunityTypeLabels[item]}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-normal text-soft">
                  Vem do CRM na integração; pode ser sobrescrito manualmente.
                </span>
              </label>
            </div>
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
          </div>
        ) : (
          <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-soft">
            Valores comerciais restritos por perfil.
          </p>
        )
      ) : tab === "RECEIVABLES" ? (
        canViewCommercials ? (
          <DataTable
            columns={[
              {
                key: "dueAt",
                header: "Data",
                cell: (item) => (
                  <span className="tabular-nums">{formatDate(item.dueAt)}</span>
                ),
              },
              {
                key: "label",
                header: "Rótulo",
                cell: (item) => item.label,
              },
              {
                key: "amount",
                header: "Valor",
                align: "right",
                cell: (item) => (
                  <span className="tabular-nums">
                    {item.amount === undefined
                      ? MASKED_VALUE
                      : formatCurrencyPrecise(item.amount)}
                  </span>
                ),
              },
              {
                key: "status",
                header: "Situação",
                cell: (item) => receivableStatusLabels[item.status],
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
                      disabled={!canManageReceivables}
                      aria-label={`Editar recebimento ${item.label}`}
                      onClick={() => {
                        setReceivableEditId(item.id);
                        setReceivable({
                          projectId: item.projectId,
                          dueAt: item.dueAt,
                          amount: item.amount ?? 0,
                          label: item.label,
                          status: item.status,
                          note: item.note ?? "",
                        });
                      }}
                    >
                      Editar
                    </ActionButton>
                    <ActionButton
                      size="sm"
                      variant="danger"
                      icon={Trash2}
                      disabled={!canManageReceivables}
                      aria-label={`Remover recebimento ${item.label}`}
                      onClick={() => setReceivableToDelete(item)}
                    >
                      Remover
                    </ActionButton>
                  </div>
                ),
              },
            ]}
            rows={project.receivables ?? []}
            rowKey={(item) => item.id}
            empty={
              <p className="text-center text-sm text-soft">
                Sem recebimentos previstos.
              </p>
            }
          />
        ) : (
          <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-soft">
            Valores comerciais restritos por perfil.
          </p>
        )
      ) : tab === "APPROVAL" ? (
        <AutoApprovalConfigPanel
          project={project}
          canManageProjects={canManageProjects}
        />
      ) : tab === "TRACKING" ? (
        showTracking ? (
          <ProjectTrackingPanel
            tracking={tracking}
            loading={trackingLoading}
            error={trackingError}
          />
        ) : (
          <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-soft">
            Acompanhamento financeiro restrito por perfil.
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
      {receivable ? (
        <ReceivableModal
          value={receivable}
          isEditing={receivableEditId !== null}
          isPending={isPending}
          onChange={setReceivable}
          onClose={() => {
            setReceivable(null);
            setReceivableEditId(null);
          }}
          onSave={() => {
            if (receivableEditId) {
              onEditReceivable(receivableEditId, receivable);
            } else {
              onAddReceivable(receivable);
            }
            setReceivable(null);
            setReceivableEditId(null);
          }}
        />
      ) : null}
      {receivableToDelete ? (
        <Modal
          open
          onClose={() => setReceivableToDelete(null)}
          title="Remover recebimento"
          description={`Remover a parcela "${receivableToDelete.label}" de ${formatDate(receivableToDelete.dueAt)}? Esta ação não pode ser desfeita.`}
          footer={
            <>
              <ActionButton
                variant="secondary"
                onClick={() => setReceivableToDelete(null)}
              >
                Cancelar
              </ActionButton>
              <ActionButton
                variant="danger"
                disabled={isPending}
                onClick={() => {
                  onRemoveReceivable(receivableToDelete);
                  setReceivableToDelete(null);
                }}
              >
                Remover
              </ActionButton>
            </>
          }
        >
          <p className="text-sm text-medium">
            {receivableToDelete.amount === undefined
              ? MASKED_VALUE
              : formatCurrencyPrecise(receivableToDelete.amount)}{" "}
            — {receivableStatusLabels[receivableToDelete.status]}
          </p>
        </Modal>
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
