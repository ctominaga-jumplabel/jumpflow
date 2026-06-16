"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  Building2,
  Edit,
  ImageIcon,
  Plus,
  Search,
  Settings2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { Modal } from "@/components/ui/Modal";
import { SectionPanel } from "@/components/ui/SectionPanel";
import {
  createBillingType,
  createClient,
  lookupCnpj,
  updateBillingType,
  updateClient,
  uploadClientLogo,
} from "@/app/app/clientes/actions";
import type {
  BillingTypeInput,
  ClientInput,
} from "@/lib/clients/schemas";
import type {
  BillingChargeType,
  BillingTypeItem,
  ClientItem,
} from "@/lib/clients/types";
import { demoBillingTypes, demoClients } from "@/lib/clients/mock-data";
import { formatCurrencyPrecise, MASKED_VALUE } from "@/lib/format";
import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { ClientStatusBadge } from "./ClientStatusBadge";

type Mode = "demo" | "db";
type Tab = "CLIENTS" | "BILLING_TYPES";

const chargeTypeLabels = {
  HOURLY: "Hora trabalhada",
  MONTHLY: "Mensalidade fixa",
  CONSULTANT_HOURLY: "Hora por consultor",
  FIXED: "Fixo",
  HOURLY_PLUS_FIXED: "Hora + Fixo",
  HOUR_PACKAGE: "Pacote de horas (Franquia)",
  PER_ALLOCATED_CONSULTANT: "Preço por consultor alocado",
  PER_PROJECT: "Preço por projeto",
  MILESTONE: "Por entrega (Milestone)",
  PER_SPRINT: "Por sprint",
  TIME_AND_MATERIAL: "T&M (Time & Material)",
  ON_DEMAND: "Sob demanda",
  SUBSCRIPTION: "Assinatura (Subscription)",
  PAY_AS_YOU_GO: "Consumo (Pay as you go)",
  SUCCESS_FEE: "Sucesso (Success Fee)",
  MIXED: "Misto",
} satisfies Record<BillingChargeType, string>;

const roundingLabels = {
  NONE: "Sem arredondar",
  NEAREST_15_MINUTES: "Mais proximo 15min",
  NEAREST_30_MINUTES: "Mais proximo 30min",
  NEAREST_HOUR: "Mais proxima hora",
  CEIL_15_MINUTES: "Teto 15min",
  CEIL_30_MINUTES: "Teto 30min",
  CEIL_HOUR: "Teto hora",
} as const;

interface ClientsViewProps {
  mode: Mode;
  clients?: ClientItem[];
  billingTypes?: BillingTypeItem[];
  canManageClients: boolean;
  canViewFinancials: boolean;
  canManageBillingTypes: boolean;
  cnpjLookupAvailable: boolean;
  logoUploadAvailable: boolean;
}

const emptyClient: ClientInput = {
  name: "",
  document: "",
  contactEmail: "",
  logoUrl: "",
  billingTypeId: "",
  defaultHourlyRate: undefined,
  monthlyFee: undefined,
  hourLimit: undefined,
  roundingRule: "NONE",
  billingDay: undefined,
  dueDay: undefined,
  invoiceKind: "SERVICE",
  municipality: "",
  issRate: undefined,
  taxRules: "",
  status: "ACTIVE",
};

const emptyBillingType: BillingTypeInput = {
  name: "",
  chargeType: "HOURLY",
  roundingRule: "NONE",
  description: "",
  active: true,
};

function clientToInput(client: ClientItem): ClientInput {
  return {
    name: client.name,
    document: client.document ?? "",
    contactEmail: client.contactEmail ?? "",
    // Persisted value (storage key or plain URL), not the signed display URL.
    logoUrl: client.logoRef ?? client.logoUrl ?? "",
    billingTypeId: client.billingTypeId ?? "",
    defaultHourlyRate: client.defaultHourlyRate,
    monthlyFee: client.monthlyFee,
    hourLimit: client.hourLimit,
    roundingRule: client.roundingRule,
    billingDay: client.billingDay,
    dueDay: client.dueDay,
    invoiceKind: client.invoiceKind,
    municipality: client.municipality ?? "",
    issRate: client.issRate,
    taxRules: client.taxRules ?? "",
    status: client.status,
  };
}

function billingTypeToInput(item: BillingTypeItem): BillingTypeInput {
  return {
    name: item.name,
    chargeType: item.chargeType,
    roundingRule: item.roundingRule,
    description: item.description ?? "",
    active: item.active,
  };
}

function financial(value: number | undefined, canView: boolean): string {
  if (!canView) return MASKED_VALUE;
  return value === undefined ? "-" : formatCurrencyPrecise(value);
}

export function ClientsView({
  mode,
  clients = demoClients,
  billingTypes = demoBillingTypes,
  canManageClients,
  canViewFinancials,
  canManageBillingTypes,
  cnpjLookupAvailable,
  logoUploadAvailable,
}: ClientsViewProps) {
  // In db mode `items`/`types` derive straight from props, so data revalidated
  // by a server action shows up immediately without a reload. Demo mode keeps
  // local optimistic state since there is no server to refetch.
  const [localItems, setLocalItems] = useState(clients);
  const [localTypes, setLocalTypes] = useState(billingTypes);
  const items = mode === "db" ? clients : localItems;
  const types = mode === "db" ? billingTypes : localTypes;
  const [tab, setTab] = useState<Tab>("CLIENTS");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [editingClient, setEditingClient] = useState<ClientItem | null>(null);
  const [clientForm, setClientForm] = useState<ClientInput>(emptyClient);
  const [clientOpen, setClientOpen] = useState(false);
  // Display-only logo preview (signed URL from the server, or a plain URL).
  // Kept apart from clientForm.logoUrl, which carries the PERSISTED value.
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<BillingTypeItem | null>(null);
  const [typeForm, setTypeForm] = useState<BillingTypeInput>(emptyBillingType);
  const [typeOpen, setTypeOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((client) => {
      const matchesStatus = status === "ALL" || client.status === status;
      const matchesSearch =
        term.length === 0 ||
        client.name.toLowerCase().includes(term) ||
        (client.document ?? "").toLowerCase().includes(term) ||
        (client.billingTypeName ?? "").toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [items, search, status]);

  const clientColumns: DataTableColumn<ClientItem>[] = [
    {
      key: "client",
      header: "Cliente",
      cell: (client) => (
        <div className="flex min-w-[220px] items-center gap-3">
          {client.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              src={client.logoUrl}
              className="size-9 rounded-md border border-border object-cover"
            />
          ) : (
            <div className="grid size-9 place-items-center rounded-md border border-border bg-surface-muted">
              <Building2 aria-hidden="true" className="size-4 text-soft" />
            </div>
          )}
          <div>
            <p className="font-medium text-strong">{client.name}</p>
            <p className="text-xs text-soft">{client.document ?? "Sem CNPJ"}</p>
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (client) => <ClientStatusBadge status={client.status} />,
    },
    {
      key: "billing",
      header: "Cobranca",
      cell: (client) => (
        <div className="text-sm">
          <p className="text-medium">{client.billingTypeName ?? "-"}</p>
          <p className="text-xs text-soft">{roundingLabels[client.roundingRule]}</p>
        </div>
      ),
    },
    {
      key: "financial",
      header: "Valores",
      cell: (client) => (
        <div className="text-sm tabular-nums">
          <p>{financial(client.defaultHourlyRate, canViewFinancials)}</p>
          <p className="text-xs text-soft">
            Mensal {financial(client.monthlyFee, canViewFinancials)}
          </p>
        </div>
      ),
      align: "right",
    },
    {
      key: "fiscal",
      header: "Fiscal",
      cell: (client) => (
        <span className="text-sm text-medium">
          {client.municipality ?? "-"} {client.issRate ? `- ISS ${client.issRate}%` : ""}
        </span>
      ),
      className: "hidden lg:table-cell",
    },
    {
      key: "projects",
      header: "Projetos",
      cell: (client) => (
        <span className="text-sm tabular-nums">{client.projectCount}</span>
      ),
      align: "right",
      className: "hidden sm:table-cell",
    },
    {
      key: "actions",
      header: "",
      cell: (client) =>
        canManageClients ? (
          <button
            type="button"
            aria-label={`Editar ${client.name}`}
            onClick={() => openClient(client)}
            className="rounded-md p-2 text-medium hover:bg-surface-muted"
          >
            <Edit aria-hidden="true" className="size-4" />
          </button>
        ) : null,
      align: "right",
    },
  ];

  const typeColumns: DataTableColumn<BillingTypeItem>[] = [
    {
      key: "name",
      header: "Tipo",
      cell: (item) => (
        <div>
          <p className="font-medium text-strong">{item.name}</p>
          <p className="text-xs text-soft">{item.description ?? "Sem descricao"}</p>
        </div>
      ),
    },
    {
      key: "chargeType",
      header: "Regra",
      cell: (item) => chargeTypeLabels[item.chargeType],
    },
    {
      key: "rounding",
      header: "Arredondamento",
      cell: (item) => roundingLabels[item.roundingRule],
    },
    {
      key: "active",
      header: "Status",
      cell: (item) => (item.active ? "Ativo" : "Inativo"),
    },
    {
      key: "actions",
      header: "",
      cell: (item) =>
        canManageBillingTypes ? (
          <button
            type="button"
            aria-label={`Editar tipo ${item.name}`}
            onClick={() => openType(item)}
            className="rounded-md p-2 text-medium hover:bg-surface-muted"
          >
            <Edit aria-hidden="true" className="size-4" />
          </button>
        ) : null,
      align: "right",
    },
  ];

  function openClient(client?: ClientItem) {
    setEditingClient(client ?? null);
    setClientForm(client ? clientToInput(client) : emptyClient);
    setLogoPreview(client?.logoUrl ?? null);
    setClientOpen(true);
  }

  function handleLogoUpload(file: File) {
    if (mode === "demo") {
      // No server in demo mode: preview locally and store the object URL so the
      // optimistic row shows the picked image for the session.
      const objectUrl = URL.createObjectURL(file);
      setLogoPreview(objectUrl);
      setClientForm((current) => ({ ...current, logoUrl: objectUrl }));
      setFeedback("Logo aplicada localmente.");
      return;
    }
    const data = new FormData();
    data.set("file", file);
    if (editingClient) data.set("clientId", editingClient.id);
    startTransition(async () => {
      const result = await uploadClientLogo(data);
      if (result.ok) {
        setLogoPreview(result.data.previewUrl);
        setClientForm((current) => ({
          ...current,
          logoUrl: result.data.logoKey,
        }));
        setFeedback(
          editingClient
            ? "Logo atualizada."
            : "Logo enviada. Salve o cliente para concluir.",
        );
      } else {
        setFeedback(result.message);
      }
    });
  }

  function openType(item?: BillingTypeItem) {
    setEditingType(item ?? null);
    setTypeForm(item ? billingTypeToInput(item) : emptyBillingType);
    setTypeOpen(true);
  }

  function saveClient() {
    if (!clientForm.name.trim()) {
      setFeedback("Informe o nome do cliente.");
      return;
    }
    if (mode === "demo") {
      const billingType = types.find((item) => item.id === clientForm.billingTypeId);
      const next: ClientItem = {
        ...clientForm,
        id: editingClient?.id ?? `cli-local-${Date.now()}`,
        billingTypeName: billingType?.name,
        projectCount: editingClient?.projectCount ?? 0,
      };
      setLocalItems((current) =>
        editingClient
          ? current.map((item) => (item.id === editingClient.id ? next : item))
          : [next, ...current],
      );
      setClientOpen(false);
      setFeedback("Cliente salvo localmente.");
      return;
    }
    startTransition(async () => {
      const result = editingClient
        ? await updateClient({ id: editingClient.id, ...clientForm })
        : await createClient(clientForm);
      if (result.ok) {
        setClientOpen(false);
        setFeedback("Cliente salvo.");
      } else {
        setFeedback(result.message);
      }
    });
  }

  function saveType() {
    if (!typeForm.name.trim()) {
      setFeedback("Informe o nome do tipo de cobranca.");
      return;
    }
    if (mode === "demo") {
      const next: BillingTypeItem = {
        ...typeForm,
        id: editingType?.id ?? `bt-local-${Date.now()}`,
      };
      setLocalTypes((current) =>
        editingType
          ? current.map((item) => (item.id === editingType.id ? next : item))
          : [next, ...current],
      );
      setTypeOpen(false);
      setFeedback("Tipo de cobranca salvo localmente.");
      return;
    }
    startTransition(async () => {
      const result = editingType
        ? await updateBillingType({ id: editingType.id, ...typeForm })
        : await createBillingType(typeForm);
      if (result.ok) {
        setTypeOpen(false);
        setFeedback("Tipo de cobranca salvo.");
      } else {
        setFeedback(result.message);
      }
    });
  }

  function handleLookupCnpj() {
    if (!clientForm.document) return;
    startTransition(async () => {
      const result = await lookupCnpj({ document: clientForm.document ?? "" });
      if (result.ok) {
        setClientForm((current) => ({
          ...current,
          name: result.data.tradeName || result.data.legalName,
          document: result.data.document,
          municipality: result.data.municipality ?? current.municipality,
        }));
        setFeedback("Dados de CNPJ aplicados.");
      } else {
        setFeedback(result.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      {mode === "demo" ? (
        <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
          Modo demonstracao: cadastros ficam apenas nesta sessao.
        </p>
      ) : null}
      {feedback ? (
        <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-medium">
          {feedback}
        </p>
      ) : null}

      <DataToolbar
        search={
          tab === "CLIENTS"
            ? {
                value: search,
                onChange: setSearch,
                placeholder: "Buscar cliente, CNPJ ou cobranca",
              }
            : undefined
        }
        filters={
          <>
            <FilterChip
              label="Clientes"
              active={tab === "CLIENTS"}
              onClick={() => setTab("CLIENTS")}
            />
            <FilterChip
              label="Tipos de cobranca"
              active={tab === "BILLING_TYPES"}
              onClick={() => setTab("BILLING_TYPES")}
            />
            {tab === "CLIENTS" ? (
              <>
                {(["ALL", "ACTIVE", "INACTIVE"] as const).map((item) => (
                  <FilterChip
                    key={item}
                    label={
                      item === "ALL"
                        ? "Todos"
                        : item === "ACTIVE"
                          ? "Ativos"
                          : "Inativos"
                    }
                    active={status === item}
                    onClick={() => setStatus(item)}
                  />
                ))}
              </>
            ) : null}
          </>
        }
        actions={
          tab === "CLIENTS" ? (
            <ActionButton
              variant="primary"
              size="sm"
              icon={Plus}
              disabled={!canManageClients}
              onClick={() => openClient()}
            >
              Novo cliente
            </ActionButton>
          ) : (
            <ActionButton
              variant="primary"
              size="sm"
              icon={Settings2}
              disabled={!canManageBillingTypes}
              onClick={() => openType()}
            >
              Novo tipo
            </ActionButton>
          )
        }
      />

      {tab === "CLIENTS" ? (
        <SectionPanel
          title="Clientes"
          description={`${filteredClients.length} clientes`}
        >
          <DataTable
            columns={clientColumns}
            rows={filteredClients}
            rowKey={(client) => client.id}
            caption="Lista de clientes"
            empty={
              <EmptyState
                icon={Building2}
                title="Nenhum cliente encontrado"
                description="Ajuste a busca ou crie um novo cadastro."
              />
            }
          />
        </SectionPanel>
      ) : (
        <SectionPanel
          title="Tipos de cobranca"
          description={`${types.length} tipos configurados`}
        >
          <DataTable
            columns={typeColumns}
            rows={types}
            rowKey={(item) => item.id}
            caption="Tipos de cobranca"
            empty={
              <EmptyState
                icon={Settings2}
                title="Nenhum tipo de cobranca"
                description="Crie uma regra para associar aos clientes."
              />
            }
          />
        </SectionPanel>
      )}

      <ClientModal
        open={clientOpen}
        onClose={() => setClientOpen(false)}
        value={clientForm}
        onChange={setClientForm}
        billingTypes={types}
        canViewFinancials={canViewFinancials}
        cnpjLookupAvailable={cnpjLookupAvailable}
        logoUploadAvailable={logoUploadAvailable}
        logoPreview={logoPreview}
        onLogoUpload={handleLogoUpload}
        isPending={isPending}
        onLookup={handleLookupCnpj}
        onSave={saveClient}
      />
      <BillingTypeModal
        open={typeOpen}
        onClose={() => setTypeOpen(false)}
        value={typeForm}
        onChange={setTypeForm}
        isPending={isPending}
        onSave={saveType}
      />
    </div>
  );
}

interface ClientModalProps {
  open: boolean;
  onClose: () => void;
  value: ClientInput;
  onChange: (value: ClientInput) => void;
  billingTypes: BillingTypeItem[];
  canViewFinancials: boolean;
  cnpjLookupAvailable: boolean;
  logoUploadAvailable: boolean;
  logoPreview: string | null;
  onLogoUpload: (file: File) => void;
  isPending: boolean;
  onLookup: () => void;
  onSave: () => void;
}

function fieldClass() {
  return cn("h-10 rounded-md border border-border bg-surface px-3 text-sm", focusRingInput);
}

function ClientModal({
  open,
  onClose,
  value,
  onChange,
  billingTypes,
  canViewFinancials,
  cnpjLookupAvailable,
  logoUploadAvailable,
  logoPreview,
  onLogoUpload,
  isPending,
  onLookup,
  onSave,
}: ClientModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cliente"
      description="Cadastro comercial, fiscal e de faturamento."
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
          Nome
          <input
            value={value.name}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
            className={fieldClass()}
          />
        </label>
        <LogoField
          value={value}
          onChange={onChange}
          uploadAvailable={logoUploadAvailable}
          preview={logoPreview}
          onUpload={onLogoUpload}
          isPending={isPending}
        />
        <label className="space-y-1 text-sm font-medium text-medium">
          CNPJ
          <div className="flex gap-2">
            <input
              value={value.document ?? ""}
              onChange={(event) =>
                onChange({ ...value, document: event.target.value })
              }
              className={cn(fieldClass(), "min-w-0 flex-1")}
            />
            <button
              type="button"
              aria-label="Buscar CNPJ"
              disabled={!cnpjLookupAvailable || isPending}
              onClick={onLookup}
              className="grid size-10 place-items-center rounded-md border border-border bg-surface disabled:opacity-50"
            >
              <Search aria-hidden="true" className="size-4" />
            </button>
          </div>
        </label>
        <label className="space-y-1 text-sm font-medium text-medium">
          E-mail de contato
          <input
            type="email"
            inputMode="email"
            placeholder="financeiro@cliente.com"
            value={value.contactEmail ?? ""}
            onChange={(event) =>
              onChange({ ...value, contactEmail: event.target.value })
            }
            className={fieldClass()}
          />
        </label>
        <label className="space-y-1 text-sm font-medium text-medium">
          Status
          <select
            value={value.status}
            onChange={(event) =>
              onChange({ ...value, status: event.target.value as ClientInput["status"] })
            }
            className={fieldClass()}
          >
            <option value="ACTIVE">Ativo</option>
            <option value="INACTIVE">Inativo</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-medium">
          Tipo de cobranca
          <select
            value={value.billingTypeId ?? ""}
            disabled={!canViewFinancials}
            onChange={(event) =>
              onChange({ ...value, billingTypeId: event.target.value })
            }
            className={fieldClass()}
          >
            <option value="">Sem tipo</option>
            {billingTypes
              .filter((item) => item.active)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-medium">
          Arredondamento
          <select
            value={value.roundingRule}
            disabled={!canViewFinancials}
            onChange={(event) =>
              onChange({
                ...value,
                roundingRule: event.target.value as ClientInput["roundingRule"],
              })
            }
            className={fieldClass()}
          >
            {Object.entries(roundingLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="Valor hora padrao"
          value={value.defaultHourlyRate}
          disabled={!canViewFinancials}
          onChange={(next) => onChange({ ...value, defaultHourlyRate: next })}
        />
        <NumberField
          label="Mensalidade"
          value={value.monthlyFee}
          disabled={!canViewFinancials}
          onChange={(next) => onChange({ ...value, monthlyFee: next })}
        />
        <NumberField
          label="Limite de horas"
          value={value.hourLimit}
          disabled={!canViewFinancials}
          onChange={(next) => onChange({ ...value, hourLimit: next })}
        />
        <NumberField
          label="ISS (%)"
          value={value.issRate}
          disabled={!canViewFinancials}
          onChange={(next) => onChange({ ...value, issRate: next })}
        />
        <NumberField
          label="Dia de faturamento"
          value={value.billingDay}
          disabled={!canViewFinancials}
          onChange={(next) => onChange({ ...value, billingDay: next })}
        />
        <NumberField
          label="Dia de vencimento"
          value={value.dueDay}
          disabled={!canViewFinancials}
          onChange={(next) => onChange({ ...value, dueDay: next })}
        />
        <label className="space-y-1 text-sm font-medium text-medium">
          Tipo de nota
          <select
            value={value.invoiceKind}
            disabled={!canViewFinancials}
            onChange={(event) =>
              onChange({
                ...value,
                invoiceKind: event.target.value as ClientInput["invoiceKind"],
              })
            }
            className={fieldClass()}
          >
            <option value="SERVICE">Servico</option>
            <option value="PRODUCT">Produto</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-medium">
          Municipio
          <input
            value={value.municipality ?? ""}
            disabled={!canViewFinancials}
            onChange={(event) =>
              onChange({ ...value, municipality: event.target.value })
            }
            className={fieldClass()}
          />
        </label>
        <label className="space-y-1 text-sm font-medium text-medium md:col-span-2">
          Regras fiscais
          <textarea
            value={value.taxRules ?? ""}
            disabled={!canViewFinancials}
            onChange={(event) => onChange({ ...value, taxRules: event.target.value })}
            className={cn(fieldClass(), "min-h-24 py-2")}
          />
        </label>
      </form>
    </Modal>
  );
}

const ACCEPTED_LOGO_ATTR = ".png,.jpg,.jpeg,.webp,.svg";

function LogoField({
  value,
  onChange,
  uploadAvailable,
  preview,
  onUpload,
  isPending,
}: {
  value: ClientInput;
  onChange: (value: ClientInput) => void;
  uploadAvailable: boolean;
  preview: string | null;
  onUpload: (file: File) => void;
  isPending: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-1 text-sm font-medium text-medium">
      <span className="block">Logo</span>
      <div className="flex items-center gap-3">
        <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-surface-muted">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt="Pre-visualizacao da logo"
              src={preview}
              className="size-full object-cover"
            />
          ) : (
            <ImageIcon aria-hidden="true" className="size-5 text-soft" />
          )}
        </div>

        {uploadAvailable ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold text-medium transition-colors hover:border-brand hover:text-strong disabled:opacity-50",
              focusRingInput,
            )}
          >
            <Upload aria-hidden="true" className="size-4" />
            {preview ? "Trocar logo" : "Enviar logo"}
          </button>
        ) : null}
      </div>

      {uploadAvailable ? (
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_LOGO_ATTR}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(file);
            event.target.value = "";
          }}
        />
      ) : (
        // Honest fallback when storage is not configured: keep the URL input.
        <>
          <p className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning-soft px-2 py-1 text-xs font-medium text-warning">
            <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
            Upload indisponivel: storage nao configurado. Informe uma URL.
          </p>
          <input
            aria-label="Logo URL"
            placeholder="https://..."
            value={value.logoUrl ?? ""}
            onChange={(event) =>
              onChange({ ...value, logoUrl: event.target.value })
            }
            className={fieldClass()}
          />
        </>
      )}
    </div>
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

function BillingTypeModal({
  open,
  onClose,
  value,
  onChange,
  isPending,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  value: BillingTypeInput;
  onChange: (value: BillingTypeInput) => void;
  isPending: boolean;
  onSave: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tipo de cobranca"
      description="Regra reutilizavel para contratos e fechamento."
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
      <form className="space-y-4">
        <label className="space-y-1 text-sm font-medium text-medium">
          Nome
          <input
            value={value.name}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
            className={fieldClass()}
          />
        </label>
        <label className="space-y-1 text-sm font-medium text-medium">
          Regra
          <select
            value={value.chargeType}
            onChange={(event) =>
              onChange({
                ...value,
                chargeType: event.target.value as BillingTypeInput["chargeType"],
              })
            }
            className={fieldClass()}
          >
            {Object.entries(chargeTypeLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-medium">
          Arredondamento
          <select
            value={value.roundingRule}
            onChange={(event) =>
              onChange({
                ...value,
                roundingRule: event.target.value as BillingTypeInput["roundingRule"],
              })
            }
            className={fieldClass()}
          >
            {Object.entries(roundingLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-medium">
          Descricao
          <textarea
            value={value.description ?? ""}
            onChange={(event) =>
              onChange({ ...value, description: event.target.value })
            }
            className={cn(fieldClass(), "min-h-24 py-2")}
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-medium">
          <input
            type="checkbox"
            checked={value.active}
            onChange={(event) => onChange({ ...value, active: event.target.checked })}
          />
          Ativo
        </label>
      </form>
    </Modal>
  );
}
