"use client";

import { useMemo, useState, useTransition } from "react";
import { ReceiptText, Wallet } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { Modal } from "@/components/ui/Modal";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { upsertProjectBillingConfig } from "@/app/app/projetos/actions";
import type { ProjectBillingConfigInput } from "@/lib/projects/schemas";
import { isMissingBillingConfig } from "@/lib/projects/pending";
import type { ProjectItem, ProjectStatus } from "@/lib/projects/types";
import { formatCurrencyPrecise } from "@/lib/format";
import {
  ProjectStatusBadge,
  projectStatusLabels,
} from "@/components/projects/ProjectStatusBadge";
import { ProjectContextCard } from "@/components/projects/shared/ProjectContextCard";
import { BillingConfigPanel } from "@/components/projects/shared/BillingConfigPanel";
import {
  billingConfigToForm,
  formToBillingConfigItem,
} from "@/components/projects/shared/billing-form";

type Mode = "demo" | "db";

interface ProjectBillingViewProps {
  mode: Mode;
  projects: ProjectItem[];
}

const statusFilters: (ProjectStatus | "ALL")[] = [
  "ALL",
  "PROPOSAL",
  "ACTIVE",
  "PAUSED",
  "CLOSED",
];

/** Project-level (base) sale rate, shown read-only for margin context. */
function baseRateLabel(project: ProjectItem): string {
  const base = project.saleRates.find(
    (rate) => !rate.consultantId && !rate.allocationId,
  );
  if (!base || base.hourlyRate === undefined) return "não definido";
  return formatCurrencyPrecise(base.hourlyRate);
}

export function ProjectBillingView({ mode, projects }: ProjectBillingViewProps) {
  const [localItems, setLocalItems] = useState(projects);
  const items = mode === "db" ? projects : localItems;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "ALL">("ALL");
  const [onlyPending, setOnlyPending] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [billingForm, setBillingForm] =
    useState<ProjectBillingConfigInput | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const configProject = configId
    ? (items.find((project) => project.id === configId) ?? null)
    : null;

  const pendingCount = useMemo(
    () => items.filter(isMissingBillingConfig).length,
    [items],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((project) => {
      const matchesSearch =
        term.length === 0 ||
        `${project.name} ${project.clientName}`.toLowerCase().includes(term);
      const matchesStatus = status === "ALL" || project.status === status;
      const matchesPending = !onlyPending || isMissingBillingConfig(project);
      return matchesSearch && matchesStatus && matchesPending;
    });
  }, [items, search, status, onlyPending]);

  function openConfig(project: ProjectItem) {
    setBillingForm(billingConfigToForm(project));
    setConfigId(project.id);
  }

  function saveBillingConfig() {
    if (!billingForm) return;
    if (mode === "demo") {
      setLocalItems((current) =>
        current.map((project) =>
          project.id === billingForm.projectId
            ? {
                ...project,
                billingConfig: formToBillingConfigItem(billingForm),
                hasBillingConfig: true,
              }
            : project,
        ),
      );
      setFeedback("Regra de cobrança salva localmente.");
      return;
    }
    startTransition(async () => {
      const result = await upsertProjectBillingConfig(billingForm);
      setFeedback(result.ok ? "Regra de cobrança salva." : result.message);
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
      key: "model",
      header: "Modelo de cobrança",
      cell: (project) => project.billingChargeType ?? "não definido",
      className: "hidden md:table-cell",
    },
    {
      key: "saleRate",
      header: "Valor de venda",
      align: "right",
      cell: (project) => (
        <span className="tabular-nums">{baseRateLabel(project)}</span>
      ),
      className: "hidden lg:table-cell",
    },
    {
      key: "pending",
      header: "Situação",
      align: "right",
      cell: (project) =>
        isMissingBillingConfig(project) ? (
          <span className="rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
            Sem regra de cobrança
          </span>
        ) : (
          <span className="text-xs text-soft">Configurado</span>
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
          onClick={() => openConfig(project)}
        >
          Configurar
        </ActionButton>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {mode === "demo" ? (
        <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
          Modo demonstração: as regras de cobrança ficam apenas nesta sessão.
        </p>
      ) : null}
      {feedback ? (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-medium">
          {feedback}
        </p>
      ) : null}

      <SectionPanel
        title="Fila de cobrança"
        description="Projetos ativos sem regra de cobrança configurada."
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-medium">
            <span className="text-2xl font-semibold text-strong tabular-nums">
              {pendingCount}
            </span>{" "}
            {pendingCount === 1
              ? "projeto ativo aguardando regra de cobrança"
              : "projetos ativos aguardando regra de cobrança"}
          </p>
          <ActionButton
            size="sm"
            variant={onlyPending ? "primary" : "secondary"}
            icon={Wallet}
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
          caption="Cobrança de projetos"
          empty={
            <EmptyState
              icon={Wallet}
              title="Nenhum projeto encontrado"
              description="Ajuste a busca ou os filtros."
            />
          }
        />
      </SectionPanel>

      {configProject && billingForm ? (
        <Modal
          open
          onClose={() => setConfigId(null)}
          title={`Cobrança — ${configProject.name}`}
          description="Regra de cobrança (motor parametrizável) deste projeto."
          className="max-w-4xl"
          footer={
            <>
              <ActionButton variant="secondary" onClick={() => setConfigId(null)}>
                Fechar
              </ActionButton>
              <ActionButton
                icon={ReceiptText}
                disabled={isPending}
                onClick={saveBillingConfig}
              >
                Salvar configuração
              </ActionButton>
            </>
          }
        >
          <div className="space-y-5">
            <ProjectContextCard
              project={configProject}
              extra={
                <p className="text-xs text-medium">
                  Valor de venda (base):{" "}
                  <span className="font-semibold text-strong">
                    {baseRateLabel(configProject)}
                  </span>{" "}
                  <span className="text-soft">— definido pelo Comercial</span>
                </p>
              }
            />
            <BillingConfigPanel
              chargeType={configProject.billingChargeType}
              value={billingForm}
              onChange={setBillingForm}
            />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
