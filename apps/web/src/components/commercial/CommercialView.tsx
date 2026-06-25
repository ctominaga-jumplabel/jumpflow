"use client";

import { useMemo, useState, useTransition } from "react";
import { Edit, ReceiptText, TrendingUp } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { Modal } from "@/components/ui/Modal";
import { SectionPanel } from "@/components/ui/SectionPanel";
import {
  createSaleRate,
  updateProjectCommercial,
  updateSaleRate,
} from "@/app/app/projetos/actions";
import type { SaleRateInput } from "@/lib/projects/schemas";
import {
  isMissingSaleRate,
  projectItemHasSaleValue,
} from "@/lib/projects/pending";
import type {
  ProjectAllocationItem,
  ProjectBillingTypeOption,
  ProjectConsultantOption,
  ProjectItem,
  ProjectSaleRateItem,
  ProjectStatus,
} from "@/lib/projects/types";
import { formatCurrencyPrecise, formatDate, formatHours } from "@/lib/format";
import { ProjectStatusBadge, projectStatusLabels } from "@/components/projects/ProjectStatusBadge";
import { ProjectContextCard } from "@/components/projects/shared/ProjectContextCard";
import { NumberField, fieldClass } from "@/components/projects/shared/fields";
import { SaleRateModal } from "@/components/projects/shared/SaleRateModal";

type Mode = "demo" | "db";

interface CommercialViewProps {
  mode: Mode;
  projects: ProjectItem[];
  consultants: ProjectConsultantOption[];
  billingTypes: ProjectBillingTypeOption[];
}

const statusFilters: (ProjectStatus | "ALL")[] = [
  "ALL",
  "PROPOSAL",
  "ACTIVE",
  "PAUSED",
  "CLOSED",
];

/** Base (project-level) sale rate currently shown, if any. */
function baseRateLabel(project: ProjectItem): string {
  const base = project.saleRates.find(
    (rate) => !rate.consultantId && !rate.allocationId,
  );
  if (!base || base.hourlyRate === undefined) return "-";
  return formatCurrencyPrecise(base.hourlyRate);
}

export function CommercialView({
  mode,
  projects,
  consultants,
  billingTypes,
}: CommercialViewProps) {
  const [localItems, setLocalItems] = useState(projects);
  const items = mode === "db" ? projects : localItems;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "ALL">("ALL");
  const [onlyPending, setOnlyPending] = useState(false);
  const [pricingId, setPricingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pricingProject = pricingId
    ? (items.find((project) => project.id === pricingId) ?? null)
    : null;

  const pendingCount = useMemo(
    () => items.filter(isMissingSaleRate).length,
    [items],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((project) => {
      const matchesSearch =
        term.length === 0 ||
        `${project.name} ${project.clientName}`.toLowerCase().includes(term);
      const matchesStatus = status === "ALL" || project.status === status;
      const matchesPending = !onlyPending || isMissingSaleRate(project);
      return matchesSearch && matchesStatus && matchesPending;
    });
  }, [items, search, status, onlyPending]);

  function saveCommercial(
    projectId: string,
    billingTypeId: string | undefined,
    budgetHours: number | undefined,
    commercialContractRef: string | undefined,
  ) {
    if (mode === "demo") {
      const billingType = billingTypes.find((type) => type.id === billingTypeId);
      setLocalItems((current) =>
        current.map((project) =>
          project.id === projectId
            ? {
                ...project,
                billingTypeId,
                billingTypeName: billingType?.name,
                billingChargeType: billingType?.chargeType,
                budgetHours,
                commercialContractRef,
              }
            : project,
        ),
      );
      setFeedback("Dados comerciais salvos localmente.");
      return;
    }
    startTransition(async () => {
      const result = await updateProjectCommercial({
        id: projectId,
        billingTypeId,
        budgetHours,
        commercialContractRef,
      });
      setFeedback(result.ok ? "Dados comerciais salvos." : result.message);
    });
  }

  function addSaleRate(value: SaleRateInput) {
    if (mode === "demo") {
      const consultant = consultants.find((item) => item.id === value.consultantId);
      const today = new Date().toISOString().slice(0, 10);
      setLocalItems((current) =>
        current.map((project) => {
          if (project.id !== value.projectId) return project;
          const allocation = project.allocations.find(
            (a) => a.id === value.allocationId,
          );
          const nextRate = {
            ...value,
            id: `rate-local-${Date.now()}`,
            consultantName: consultant?.name ?? allocation?.consultantName,
            allocationLabel: allocation
              ? `${allocation.consultantName} - ${allocation.role}`
              : undefined,
          };
          const updated = {
            ...project,
            saleRates: [...project.saleRates, nextRate],
          };
          return {
            ...updated,
            hasActiveSaleRate: projectItemHasSaleValue(updated, today),
          };
        }),
      );
      setFeedback("Valor de venda salvo localmente.");
      return;
    }
    startTransition(async () => {
      const result = await createSaleRate(value);
      setFeedback(result.ok ? "Valor de venda salvo." : result.message);
    });
  }

  function editSaleRate(id: string, value: SaleRateInput) {
    if (mode === "demo") {
      const consultant = consultants.find((item) => item.id === value.consultantId);
      const today = new Date().toISOString().slice(0, 10);
      setLocalItems((current) =>
        current.map((project) => {
          if (project.id !== value.projectId) return project;
          const saleRates = project.saleRates.map((rate) =>
            rate.id === id
              ? {
                  ...rate,
                  consultantId: value.consultantId,
                  consultantName: consultant?.name,
                  allocationId: value.allocationId,
                  startsAt: value.startsAt,
                  endsAt: value.endsAt,
                  hourlyRate: value.hourlyRate,
                  note: value.note,
                }
              : rate,
          );
          const updated = { ...project, saleRates };
          return {
            ...updated,
            // Recompute coverage (base rate OU todos os consultores) após editar.
            hasActiveSaleRate: projectItemHasSaleValue(updated, today),
          };
        }),
      );
      setFeedback("Valor de venda atualizado localmente.");
      return;
    }
    startTransition(async () => {
      const result = await updateSaleRate({ id, ...value });
      setFeedback(result.ok ? "Valor de venda atualizado." : result.message);
    });
  }

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
      key: "billingType",
      header: "Tipo de cobrança",
      cell: (project) => project.billingTypeName ?? "Herdar do cliente",
      className: "hidden md:table-cell",
    },
    {
      key: "baseRate",
      header: "Valor base",
      align: "right",
      cell: (project) => (
        <span className="tabular-nums">{baseRateLabel(project)}</span>
      ),
    },
    {
      key: "budget",
      header: "Budget",
      align: "right",
      cell: (project) => (
        <span className="tabular-nums">
          {project.budgetHours ? formatHours(project.budgetHours) : "-"}
        </span>
      ),
      className: "hidden lg:table-cell",
    },
    {
      key: "pending",
      header: "Situação",
      align: "right",
      cell: (project) =>
        isMissingSaleRate(project) ? (
          <span className="rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
            Sem valor de venda
          </span>
        ) : (
          <span className="text-xs text-soft">-</span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (project) => (
        <ActionButton
          size="sm"
          variant="secondary"
          icon={ReceiptText}
          onClick={() => setPricingId(project.id)}
        >
          Precificar
        </ActionButton>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {mode === "demo" ? (
        <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
          Modo demonstração: a precificação fica apenas nesta sessão.
        </p>
      ) : null}
      {feedback ? (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-medium">
          {feedback}
        </p>
      ) : null}

      <SectionPanel
        title="Fila de precificação"
        description="Projetos ativos sem valor de venda cadastrado."
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-medium">
            <span className="text-2xl font-semibold text-strong tabular-nums">
              {pendingCount}
            </span>{" "}
            {pendingCount === 1
              ? "projeto ativo aguardando precificação"
              : "projetos ativos aguardando precificação"}
          </p>
          <ActionButton
            size="sm"
            variant={onlyPending ? "primary" : "secondary"}
            icon={TrendingUp}
            onClick={() => setOnlyPending((value) => !value)}
          >
            {onlyPending ? "Mostrar todos" : "Ver apenas pendentes"}
          </ActionButton>
        </div>
      </SectionPanel>

      <DataToolbar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "Buscar projeto ou cliente",
        }}
        filters={statusFilters.map((item) => (
          <FilterChip
            key={item}
            label={item === "ALL" ? "Todos" : projectStatusLabels[item]}
            active={status === item}
            onClick={() => setStatus(item)}
          />
        ))}
      />

      <SectionPanel title="Projetos" description={`${rows.length} projetos`}>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(project) => project.id}
          caption="Precificação de projetos"
          empty={
            <EmptyState
              icon={TrendingUp}
              title="Nenhum projeto encontrado"
              description="Ajuste a busca ou os filtros."
            />
          }
        />
      </SectionPanel>

      {pricingProject ? (
        <PricingModal
          project={pricingProject}
          consultants={consultants}
          billingTypes={billingTypes}
          isPending={isPending}
          onClose={() => setPricingId(null)}
          onSaveCommercial={saveCommercial}
          onAddSaleRate={addSaleRate}
          onEditSaleRate={editSaleRate}
        />
      ) : null}
    </div>
  );
}

function PricingModal({
  project,
  consultants,
  billingTypes,
  isPending,
  onClose,
  onSaveCommercial,
  onAddSaleRate,
  onEditSaleRate,
}: {
  project: ProjectItem;
  consultants: ProjectConsultantOption[];
  billingTypes: ProjectBillingTypeOption[];
  isPending: boolean;
  onClose: () => void;
  onSaveCommercial: (
    projectId: string,
    billingTypeId: string | undefined,
    budgetHours: number | undefined,
    commercialContractRef: string | undefined,
  ) => void;
  onAddSaleRate: (value: SaleRateInput) => void;
  onEditSaleRate: (id: string, value: SaleRateInput) => void;
}) {
  const [billingTypeId, setBillingTypeId] = useState(project.billingTypeId ?? "");
  const [budgetHours, setBudgetHours] = useState<number | undefined>(
    project.budgetHours,
  );
  const [contractRef, setContractRef] = useState(
    project.commercialContractRef ?? "",
  );
  const [rate, setRate] = useState<SaleRateInput | null>(null);
  // When set, the sale-rate modal edits this existing rate; null = creating.
  const [editingRateId, setEditingRateId] = useState<string | null>(null);

  const allocationOptions = project.allocations.map((item) => ({
    id: item.id,
    label: `${item.consultantName} - ${item.role}`,
  }));

  function rateToInput(item: ProjectSaleRateItem): SaleRateInput {
    return {
      projectId: project.id,
      consultantId: item.consultantId,
      allocationId: item.allocationId,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      hourlyRate: item.hourlyRate ?? 0,
      currency: item.currency,
      note: item.note,
    };
  }

  // Consultores vinculados na Operação aparecem aqui automaticamente para o
  // Comercial precificar. Casa cada alocação com seu valor de venda (escopo
  // alocação) — quando ainda não há, exibe "Sem valor" e abre o modal zerado.
  const rateByAllocation = new Map(
    project.saleRates
      .filter((rate) => rate.allocationId)
      .map((rate) => [rate.allocationId as string, rate]),
  );
  const priceableAllocations = project.allocations.filter(
    (alloc) => alloc.status === "ACTIVE" || alloc.status === "PLANNED",
  );

  function priceAllocation(alloc: ProjectAllocationItem) {
    const existing = rateByAllocation.get(alloc.id);
    if (existing) {
      setEditingRateId(existing.id);
      setRate(rateToInput(existing));
      return;
    }
    setEditingRateId(null);
    setRate({
      projectId: project.id,
      consultantId: undefined,
      allocationId: alloc.id,
      startsAt: project.startDate,
      endsAt: undefined,
      hourlyRate: 0,
      currency: "BRL",
      note: "",
    });
  }

  // Tabela única de Valores de venda: os valores já cadastrados + uma linha
  // "Sem valor" para cada consultor vinculado ainda sem rate (a menos que um
  // valor base do projeto já cubra todos). Assim o consultor aparece
  // automaticamente para precificar, sem duplicar uma seção separada.
  const hasBaseRate = project.saleRates.some(
    (rate) => !rate.consultantId && !rate.allocationId,
  );
  const uncoveredAllocations = hasBaseRate
    ? []
    : priceableAllocations.filter(
        (alloc) =>
          !project.saleRates.some(
            (rate) =>
              rate.allocationId === alloc.id ||
              (!rate.allocationId && rate.consultantId === alloc.consultantId),
          ),
      );
  type PricingRow =
    | { kind: "rate"; key: string; rate: ProjectSaleRateItem }
    | { kind: "alloc"; key: string; alloc: ProjectAllocationItem };
  const pricingRows: PricingRow[] = [
    ...project.saleRates.map(
      (rate): PricingRow => ({ kind: "rate", key: `rate:${rate.id}`, rate }),
    ),
    ...uncoveredAllocations.map(
      (alloc): PricingRow => ({ kind: "alloc", key: `alloc:${alloc.id}`, alloc }),
    ),
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title={`Precificar — ${project.name}`}
      description="Tipo de cobrança, budget e valores de venda por vigência."
      className="max-w-3xl"
      footer={
        <ActionButton variant="secondary" onClick={onClose}>
          Fechar
        </ActionButton>
      }
    >
      <div className="space-y-5">
        <ProjectContextCard project={project} />

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-strong">Cobrança e budget</h3>
          <form className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-medium">
              Tipo de cobrança
              <select
                value={billingTypeId}
                onChange={(event) => setBillingTypeId(event.target.value)}
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
              label="Budget de horas"
              value={budgetHours}
              onChange={setBudgetHours}
            />
            <label className="space-y-1 text-sm font-medium text-medium md:col-span-2">
              Contrato comercial (referência)
              <input
                type="text"
                value={contractRef}
                onChange={(event) => setContractRef(event.target.value)}
                placeholder="Nº/identificador do contrato (vazio = sem contrato)"
                className={fieldClass()}
              />
            </label>
          </form>
          <div className="flex justify-end">
            <ActionButton
              size="sm"
              disabled={isPending}
              onClick={() =>
                onSaveCommercial(
                  project.id,
                  billingTypeId || undefined,
                  budgetHours,
                  contractRef.trim() || undefined,
                )
              }
            >
              Salvar cobrança e budget
            </ActionButton>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-strong">
              Valores de venda
            </h3>
            <ActionButton
              size="sm"
              variant="secondary"
              icon={ReceiptText}
              onClick={() => {
                setEditingRateId(null);
                setRate({
                  projectId: project.id,
                  consultantId: undefined,
                  allocationId: undefined,
                  startsAt: project.startDate,
                  endsAt: undefined,
                  hourlyRate: 0,
                  currency: "BRL",
                  note: "",
                });
              }}
            >
              Novo valor
            </ActionButton>
          </div>
          <p className="text-xs text-soft">
            Consultores vinculados na Operação aparecem aqui automaticamente como
            &quot;Sem valor&quot; até serem precificados.
          </p>
          <DataTable
            columns={[
              {
                key: "scope",
                header: "Escopo",
                cell: (row) =>
                  row.kind === "rate"
                    ? (row.rate.allocationLabel ??
                      row.rate.consultantName ??
                      "Projeto")
                    : `${row.alloc.consultantName} - ${row.alloc.role}`,
              },
              {
                key: "period",
                header: "Vigência",
                cell: (row) =>
                  row.kind === "rate"
                    ? `${formatDate(row.rate.startsAt)} - ${
                        row.rate.endsAt ? formatDate(row.rate.endsAt) : "em aberto"
                      }`
                    : "-",
              },
              {
                key: "rate",
                header: "Valor",
                align: "right",
                cell: (row) =>
                  row.kind === "rate" ? (
                    row.rate.hourlyRate === undefined ? (
                      "-"
                    ) : (
                      <span className="tabular-nums">
                        {formatCurrencyPrecise(row.rate.hourlyRate)}
                      </span>
                    )
                  ) : (
                    <span className="text-xs font-medium text-warning">
                      Sem valor
                    </span>
                  ),
              },
              {
                key: "note",
                header: "Nota",
                cell: (row) =>
                  row.kind === "rate" ? (row.rate.note ?? "-") : "-",
              },
              {
                key: "actions",
                header: "",
                align: "right",
                cell: (row) =>
                  row.kind === "rate" ? (
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      icon={Edit}
                      aria-label={`Editar valor de ${row.rate.allocationLabel ?? row.rate.consultantName ?? "projeto"}`}
                      onClick={() => {
                        setEditingRateId(row.rate.id);
                        setRate(rateToInput(row.rate));
                      }}
                    >
                      Editar
                    </ActionButton>
                  ) : (
                    <ActionButton
                      size="sm"
                      variant="secondary"
                      icon={ReceiptText}
                      aria-label={`Definir valor de ${row.alloc.consultantName}`}
                      onClick={() => priceAllocation(row.alloc)}
                    >
                      Definir valor
                    </ActionButton>
                  ),
              },
            ]}
            rows={pricingRows}
            rowKey={(row) => row.key}
            empty={
              <p className="text-center text-sm text-soft">
                Sem valores e sem consultores vinculados. Vincule na tela
                Projetos (Operação) ou cadastre um valor a nível de projeto.
              </p>
            }
          />
        </section>
      </div>

      {rate ? (
        <SaleRateModal
          value={rate}
          consultants={consultants}
          allocations={allocationOptions}
          isPending={isPending}
          onChange={setRate}
          onClose={() => {
            setRate(null);
            setEditingRateId(null);
          }}
          onSave={() => {
            if (editingRateId) {
              onEditSaleRate(editingRateId, rate);
            } else {
              onAddSaleRate(rate);
            }
            setRate(null);
            setEditingRateId(null);
          }}
        />
      ) : null}
    </Modal>
  );
}
