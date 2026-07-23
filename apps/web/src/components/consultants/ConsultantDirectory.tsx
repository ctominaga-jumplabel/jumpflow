"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeDollarSign,
  Building2,
  CreditCard,
  Edit,
  Gift,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FilterChip } from "@/components/ui/FilterChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  consultants as allConsultants,
  distinctSkills,
  filterConsultants,
  seniorityLabels,
  type Consultant,
  type Seniority,
} from "@/lib/mock-data/consultants";
import {
  deleteConsultantAdHocPayment,
  loadConsultantAdHocPayments,
  loadConsultantProfile,
  saveBankAccount,
  saveCompensation,
  saveConsultantAdHocPayment,
  saveConsultantIdentity,
  saveVoucherBenefits,
  type AdHocPaymentsView,
  type AdHocPaymentView,
} from "@/app/app/consultores/actions";
import {
  AD_HOC_PAYMENT_KINDS,
  AD_HOC_PAYMENT_STATUSES,
  CONTRACT_TYPES,
  type AdHocPaymentInput,
  type AdHocPaymentKind,
  type AdHocPaymentStatus,
  type BankAccountInput,
  type CompensationInput,
  type ConsultantIdentityInput,
  type VoucherBenefitsInput,
} from "@/lib/consultants/schemas";
import { contractTypeLabels } from "@/lib/consultants/labels";
import type {
  ConsultantBankAccountView,
  ConsultantProfile,
} from "@/lib/db/consultants";
import { computeCompensation } from "@/lib/consultants/compensation";
import { ConsultantAvailabilityBadge } from "./ConsultantAvailabilityBadge";
import { ConsultantCurriculumSection } from "./ConsultantCurriculumSection";
import { ConsultantProfileSections } from "./ConsultantProfileSections";

const SENIORITY_FILTERS: (Seniority | "ALL")[] = [
  "ALL",
  "JUNIOR",
  "PLENO",
  "SENIOR",
  "ESPECIALISTA",
];

export interface ConsultantDirectoryProps {
  consultants?: Consultant[];
  canManagePeople?: boolean;
  canManageFinancials?: boolean;
  /**
   * Consultor a abrir automaticamente ao montar (ex.: retorno da criacao em
   * `/app/consultores/novo?...`). Abre o perfil para completar os dados.
   */
  initialConsultantId?: string;
}

/**
 * Searchable consultant directory. Search by name/title/area, filter by
 * seniority and skill. Presented as a clean, scannable LIST (DataTable): one
 * row per consultant with the key operational columns, and a "Detalhes" action
 * that opens the full profile view (ConsultantDetailModal). Gating (People /
 * Financeiro) is preserved end to end.
 */
export function ConsultantDirectory({
  consultants = allConsultants,
  canManagePeople = false,
  canManageFinancials = false,
  initialConsultantId,
}: ConsultantDirectoryProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [seniority, setSeniority] = useState<Seniority | "ALL">("ALL");
  const [skillId, setSkillId] = useState<string>("ALL");
  const [selected, setSelected] = useState<Consultant | null>(null);
  const [profile, setProfile] = useState<ConsultantProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [adHoc, setAdHoc] = useState<AdHocPaymentsView | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Carrega o perfil completo sob demanda (evita puxar todos os perfis na
  // listagem). Disparado no clique de "Detalhes", nunca em useEffect.
  async function openDetails(consultant: Consultant) {
    setSelected(consultant);
    setProfile(null);
    setAdHoc(null);
    setMessage(null);
    // Remuneracoes pontuais sao dado financeiro: carregadas sob demanda para
    // quem pode gerenciar valores (independe de People). Leitura tambem gated
    // server-side em loadConsultantAdHocPayments.
    if (canManageFinancials) {
      const adHocResult = await loadConsultantAdHocPayments(consultant.id);
      if (adHocResult.ok) setAdHoc(adHocResult.data);
    }
    // O perfil (dados pessoais/documentos) so e visivel/gerenciavel por People.
    // Usuarios apenas-financeiro ainda editam compensacao/VA-VR-VT abaixo.
    if (!canManagePeople) return;
    setLoadingProfile(true);
    const result = await loadConsultantProfile(consultant.id);
    setLoadingProfile(false);
    if (result.ok) setProfile(result.data);
    else setMessage(result.message);
  }

  async function reloadProfile() {
    if (!selected || !canManagePeople) return;
    const result = await loadConsultantProfile(selected.id);
    if (result.ok) setProfile(result.data);
  }

  async function reloadAdHoc() {
    if (!selected || !canManageFinancials) return;
    const result = await loadConsultantAdHocPayments(selected.id);
    if (result.ok) setAdHoc(result.data);
  }

  function closeDetails() {
    setSelected(null);
    setProfile(null);
    setAdHoc(null);
  }

  // Abre o perfil do consultor recem-criado (retorno de /novo) uma unica vez. O
  // openDetails e disparado num microtask para nao chamar setState de forma
  // sincrona dentro do efeito (react-hooks/set-state-in-effect).
  const autoOpenedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialConsultantId || autoOpenedRef.current === initialConsultantId) {
      return;
    }
    const target = consultants.find((c) => c.id === initialConsultantId);
    if (!target) return;
    autoOpenedRef.current = initialConsultantId;
    const timer = setTimeout(() => {
      void openDetails(target);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConsultantId, consultants]);

  const skillOptions = useMemo(
    () => distinctSkills(consultants),
    [consultants],
  );

  const rows = useMemo(
    () => filterConsultants(consultants, { search, seniority, skillId }),
    [consultants, search, seniority, skillId],
  );

  const columns: DataTableColumn<Consultant>[] = [
    {
      key: "name",
      header: "Nome",
      cell: (c) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-strong">{c.name}</p>
          {c.topSkills.length > 0 ? (
            <p className="truncate text-xs text-soft">
              {c.topSkills.map((s) => s.name).join(" · ")}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "role",
      header: "Cargo · Área",
      cell: (c) => (
        <span className="text-medium">
          {[c.jobTitle, c.area].filter(Boolean).join(" · ") || "—"}
        </span>
      ),
    },
    {
      key: "seniority",
      header: "Senioridade",
      cell: (c) => seniorityLabels[c.seniority],
    },
    {
      key: "availability",
      header: "Disponibilidade",
      cell: (c) => (
        <ConsultantAvailabilityBadge allocationPercent={c.allocationPercent} />
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (c) =>
        c.status === "INACTIVE" ? (
          <StatusBadge tone="neutral">Inativo</StatusBadge>
        ) : (
          <StatusBadge tone="success">Ativo</StatusBadge>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (c) => (
        <ActionButton
          variant="secondary"
          size="sm"
          icon={Edit}
          onClick={() => void openDetails(c)}
        >
          Detalhes
        </ActionButton>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <DataToolbar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "Buscar por nome, cargo ou área",
        }}
        filters={
          <>
            {SENIORITY_FILTERS.map((s) => (
              <FilterChip
                key={s}
                label={s === "ALL" ? "Todas" : seniorityLabels[s]}
                active={seniority === s}
                onClick={() => setSeniority(s)}
              />
            ))}
            <label className="sr-only" htmlFor="consultant-skill-filter">
              Filtrar por skill
            </label>
            <select
              id="consultant-skill-filter"
              value={skillId}
              onChange={(e) => setSkillId(e.target.value)}
              className={cn(
                "h-9 rounded-md border border-border bg-surface px-2 text-xs font-semibold text-medium",
                focusRingInput,
              )}
            >
              <option value="ALL">Todas as skills</option>
              {skillOptions.map((s) => (
                <option key={s.skillId} value={s.skillId}>
                  {s.name}
                </option>
              ))}
            </select>
          </>
        }
        actions={
          canManagePeople ? (
            <ActionButton
              variant="primary"
              size="sm"
              icon={UserPlus}
              onClick={() => router.push("/app/consultores/novo")}
            >
              Novo consultor
            </ActionButton>
          ) : null
        }
      />

      <SectionPanel
        title="Consultores"
        description={`${rows.length} ${rows.length === 1 ? "consultor" : "consultores"} no filtro atual`}
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          caption="Lista de consultores"
          empty={
            <EmptyState
              icon={Users}
              title="Nenhum consultor encontrado"
              description="Ajuste a busca ou os filtros para encontrar outros perfis."
            />
          }
        />
      </SectionPanel>
      <ConsultantDetailModal
        consultant={selected}
        profile={profile}
        loadingProfile={loadingProfile}
        adHoc={adHoc}
        canManagePeople={canManagePeople}
        canManageFinancials={canManageFinancials}
        message={message}
        onMessage={setMessage}
        onReload={reloadProfile}
        onReloadAdHoc={reloadAdHoc}
        onClose={closeDetails}
      />
    </div>
  );
}

function ConsultantDetailModal({
  consultant,
  profile,
  loadingProfile,
  adHoc,
  canManagePeople,
  canManageFinancials,
  message,
  onMessage,
  onReload,
  onReloadAdHoc,
  onClose,
}: {
  consultant: Consultant | null;
  profile: ConsultantProfile | null;
  loadingProfile: boolean;
  adHoc: AdHocPaymentsView | null;
  canManagePeople: boolean;
  canManageFinancials: boolean;
  message: string | null;
  onMessage: (message: string | null) => void;
  onReload: () => void;
  onReloadAdHoc: () => void;
  onClose: () => void;
}) {
  const [identity, setIdentity] = useState<ConsultantIdentityInput | null>(null);
  const [compensation, setCompensation] = useState<CompensationInput | null>(null);
  const [vouchers, setVouchers] = useState<{
    vr?: number;
    va?: number;
    vt?: number;
  }>({});
  const [dependents, setDependents] = useState<number>(0);
  const [autoCltCharges, setAutoCltCharges] = useState<boolean>(true);
  if (!consultant) return null;
  const consultantId = consultant.id;

  const currentIdentity =
    identity ??
    ({
      id: consultant.id,
      name: consultant.name,
      email: consultant.email,
      jobTitle: consultant.jobTitle,
      seniority:
        consultant.seniority === "PLENO"
          ? "MID_LEVEL"
          : consultant.seniority === "ESPECIALISTA"
            ? "SPECIALIST"
            : consultant.seniority,
      area: consultant.area,
      status: consultant.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
      contractType:
        (profile?.contractType as ConsultantIdentityInput["contractType"]) ??
        undefined,
    } satisfies ConsultantIdentityInput);
  const currentCompensation =
    compensation ??
    ({
      consultantId: consultant.id,
      contractType: "CLT_FLEX",
      id: undefined,
      startsAt: new Date().toISOString().slice(0, 10),
      endsAt: undefined,
      cltAmount: undefined,
      pjAmount: undefined,
      benefitCardAmount: undefined,
      discountRulesJson: '{"version":1,"fixedDiscounts":[],"percentDiscounts":[]}',
      note: undefined,
    } satisfies CompensationInput);

  async function saveIdentity() {
    const result = await saveConsultantIdentity(currentIdentity);
    onMessage(result.ok ? "Identidade salva." : result.message);
  }

  async function saveFlex() {
    const result = await saveCompensation(currentCompensation);
    onMessage(result.ok ? "Compensacao salva." : result.message);
  }

  async function saveVouchers() {
    const input: VoucherBenefitsInput = {
      consultantId,
      startsAt: currentCompensation.startsAt,
      vr: vouchers.vr,
      va: vouchers.va,
      vt: vouchers.vt,
    };
    const result = await saveVoucherBenefits(input);
    onMessage(result.ok ? "Beneficios VA/VR/VT salvos." : result.message);
  }

  // Live preview of agreed value + benefits + automatic CLT charges. Mirrors
  // computeCompensation so the operator sees INSS/IRRF/FGTS and the net before
  // saving. FGTS is shown as employer cost only and never reduces the net.
  const preview = computeCompensation(
    {
      contractType: currentCompensation.contractType,
      cltAmount: currentCompensation.cltAmount,
      pjAmount: currentCompensation.pjAmount,
      benefitCardAmount: currentCompensation.benefitCardAmount,
      cltCharges:
        currentCompensation.contractType === "PJ"
          ? null
          : { autoApplyDeductions: autoCltCharges, dependents },
    },
    [vouchers.vr, vouchers.va, vouchers.vt]
      .filter((value): value is number => typeof value === "number" && value > 0)
      .map((amount) => ({ amount })),
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={consultant.name}
      description="Cadastro operacional, bancario e contratual."
      className="max-w-3xl"
      footer={
        <ActionButton variant="secondary" onClick={onClose}>
          Fechar
        </ActionButton>
      }
    >
      <div className="space-y-4">
        {message ? (
          <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-medium">
            {message}
          </p>
        ) : null}
        <section className="space-y-3 rounded-md border border-border p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-strong">
            <Building2 aria-hidden="true" className="size-4" />
            Identidade sincronizavel
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              aria-label="Nome do consultor"
              value={currentIdentity.name}
              onChange={(event) =>
                setIdentity({ ...currentIdentity, name: event.target.value })
              }
              className={fieldClass()}
            />
            <input
              aria-label="Email do consultor"
              value={currentIdentity.email}
              onChange={(event) =>
                setIdentity({ ...currentIdentity, email: event.target.value })
              }
              className={fieldClass()}
            />
            <input
              aria-label="Cargo do consultor"
              value={currentIdentity.jobTitle ?? ""}
              onChange={(event) =>
                setIdentity({ ...currentIdentity, jobTitle: event.target.value })
              }
              className={fieldClass()}
            />
            <input
              aria-label="Area do consultor"
              value={currentIdentity.area ?? ""}
              onChange={(event) =>
                setIdentity({ ...currentIdentity, area: event.target.value })
              }
              className={fieldClass()}
            />
            <label className="space-y-1 text-sm font-medium text-medium">
              Tipo de contratacao
              <select
                aria-label="Tipo de contratacao"
                value={currentIdentity.contractType ?? ""}
                onChange={(event) =>
                  setIdentity({
                    ...currentIdentity,
                    contractType:
                      (event.target.value ||
                        undefined) as ConsultantIdentityInput["contractType"],
                  })
                }
                className={fieldClass()}
              >
                <option value="">Nao definido</option>
                {CONTRACT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {contractTypeLabels[type]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ActionButton
            size="sm"
            disabled={!canManagePeople}
            onClick={saveIdentity}
            icon={Edit}
          >
            Salvar identidade
          </ActionButton>
        </section>

        {loadingProfile ? (
          <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-medium">
            Carregando cadastro...
          </p>
        ) : profile ? (
          <ConsultantProfileSections
            consultantId={consultantId}
            profile={profile}
            contractType={currentIdentity.contractType}
            canManagePeople={canManagePeople}
            onMessage={onMessage}
            onReload={onReload}
          />
        ) : null}

        {canManagePeople ? (
          <ConsultantCurriculumSection
            consultantId={consultantId}
            canManagePeople={canManagePeople}
            onMessage={onMessage}
          />
        ) : null}

        <section className="space-y-3 rounded-md border border-border p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-strong">
            <CreditCard aria-hidden="true" className="size-4" />
            Contas bancárias
          </div>
          <BankAccountsSection
            consultantId={consultantId}
            contractType={currentIdentity.contractType}
            accounts={profile?.bankAccounts ?? []}
            canManagePeople={canManagePeople}
            onMessage={onMessage}
            onReload={onReload}
          />
        </section>

        <section className="space-y-3 rounded-md border border-border p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-strong">
            <BadgeDollarSign aria-hidden="true" className="size-4" />
            Valor acordado
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <NumberInput
              label="Valor CLT"
              value={currentCompensation.cltAmount}
              onChange={(value) =>
                setCompensation({ ...currentCompensation, cltAmount: value })
              }
            />
            <NumberInput
              label="Valor PJ"
              value={currentCompensation.pjAmount}
              onChange={(value) =>
                setCompensation({ ...currentCompensation, pjAmount: value })
              }
            />
            <NumberInput
              label="Cartao beneficio"
              value={currentCompensation.benefitCardAmount}
              onChange={(value) =>
                setCompensation({
                  ...currentCompensation,
                  benefitCardAmount: value,
                })
              }
            />
            <NumberInput
              label="VR (Vale Refeicao)"
              value={vouchers.vr}
              onChange={(value) => setVouchers({ ...vouchers, vr: value })}
            />
            <NumberInput
              label="VA (Vale Alimentacao)"
              value={vouchers.va}
              onChange={(value) => setVouchers({ ...vouchers, va: value })}
            />
            <NumberInput
              label="VT (Vale Transporte)"
              value={vouchers.vt}
              onChange={(value) => setVouchers({ ...vouchers, vt: value })}
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <NumberInput
              label="Dependentes (IRRF)"
              value={dependents}
              onChange={(value) => setDependents(value ?? 0)}
            />
            <label className="flex items-center gap-2 text-sm font-medium text-medium">
              <input
                type="checkbox"
                checked={autoCltCharges}
                onChange={(event) => setAutoCltCharges(event.target.checked)}
              />
              Aplicar encargos CLT (INSS/IRRF) ao liquido
            </label>
          </div>

          {currentCompensation.contractType !== "PJ" &&
          preview.cltCharges ? (
            <dl className="grid gap-2 rounded-md border border-border bg-surface-muted p-3 text-sm text-medium md:grid-cols-2">
              <div className="flex justify-between gap-2">
                <dt>INSS (desconto)</dt>
                <dd className="font-semibold text-strong">
                  {formatBRL(preview.cltCharges.inss)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>IRRF (desconto)</dt>
                <dd className="font-semibold text-strong">
                  {formatBRL(preview.cltCharges.irrf)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>FGTS (encargo patronal, informativo)</dt>
                <dd className="font-semibold text-strong">
                  {formatBRL(preview.cltCharges.fgts)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Beneficios</dt>
                <dd className="font-semibold text-strong">
                  {formatBRL(preview.benefitAmount)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-border pt-2 md:col-span-2">
                <dt className="font-semibold text-strong">
                  Liquido estimado (sem FGTS)
                </dt>
                <dd className="font-semibold text-strong">
                  {formatBRL(preview.netAmount)}
                </dd>
              </div>
            </dl>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <ActionButton
              size="sm"
              disabled={!canManageFinancials}
              onClick={saveFlex}
              icon={BadgeDollarSign}
            >
              Salvar compensacao
            </ActionButton>
            <ActionButton
              size="sm"
              variant="secondary"
              disabled={!canManageFinancials}
              onClick={saveVouchers}
              icon={CreditCard}
            >
              Salvar VA/VR/VT
            </ActionButton>
          </div>
        </section>

        {canManageFinancials ? (
          <section className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-strong">
              <Gift aria-hidden="true" className="size-4" />
              Remuneracoes pontuais
            </div>
            <p className="text-xs text-soft">
              Bonus, acertos e outros pagamentos avulsos. Cada pontual e
              vinculada a um projeto e entra no custo realizado da margem daquele
              projeto (aba Acompanhamento).
            </p>
            <AdHocPaymentsSection
              consultantId={consultantId}
              data={adHoc}
              onMessage={onMessage}
              onReload={onReloadAdHoc}
            />
          </section>
        ) : null}
      </div>
    </Modal>
  );
}

const ADHOC_KIND_LABELS: Record<AdHocPaymentKind, string> = {
  BONUS: "Bonus",
  ADJUSTMENT: "Acerto",
  OTHER: "Outro",
};

const ADHOC_STATUS_LABELS: Record<AdHocPaymentStatus, string> = {
  PLANNED: "Prevista",
  PAID: "Paga",
  CANCELLED: "Cancelada",
};

const ADHOC_STATUS_TONE: Record<
  AdHocPaymentStatus,
  "info" | "success" | "neutral"
> = {
  PLANNED: "info",
  PAID: "success",
  CANCELLED: "neutral",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyAdHocDraft(consultantId: string): AdHocPaymentInput {
  return {
    id: undefined,
    consultantId,
    projectId: "",
    allocationId: undefined,
    amount: 0,
    payAt: todayIso(),
    reason: "",
    kind: "BONUS",
    status: "PLANNED",
  };
}

/**
 * Remuneracoes pontuais do consultor (Onda D / D2). Lista as pontuais existentes
 * e um formulario para criar/editar (seletor de projeto OBRIGATORIO). Exclusao
 * confirmada por Modal do design system (nunca window.confirm). Toda escrita
 * passa por Server Action com RBAC financeiro + AuditEvent.
 */
function AdHocPaymentsSection({
  consultantId,
  data,
  onMessage,
  onReload,
}: {
  consultantId: string;
  data: AdHocPaymentsView | null;
  onMessage: (message: string | null) => void;
  onReload: () => void;
}) {
  const [draft, setDraft] = useState<AdHocPaymentInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdHocPaymentView | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  if (!data) {
    return (
      <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-medium">
        Carregando remuneracoes pontuais...
      </p>
    );
  }

  const projects = data.projects;

  function startCreate() {
    onMessage(null);
    setDraft(emptyAdHocDraft(consultantId));
  }

  function startEdit(payment: AdHocPaymentView) {
    onMessage(null);
    setDraft({
      id: payment.id,
      consultantId,
      projectId: payment.projectId,
      allocationId: payment.allocationId ?? undefined,
      amount: payment.amount,
      payAt: payment.payAt,
      reason: payment.reason,
      kind: payment.kind,
      status: payment.status,
    });
  }

  async function save() {
    if (!draft) return;
    if (!draft.projectId) {
      onMessage("Selecione o projeto da remuneracao pontual.");
      return;
    }
    if (!(draft.amount > 0)) {
      onMessage("Informe um valor maior que zero.");
      return;
    }
    if (draft.reason.trim() === "") {
      onMessage("Informe o motivo da remuneracao pontual.");
      return;
    }
    setSaving(true);
    const result = await saveConsultantAdHocPayment(draft);
    setSaving(false);
    if (result.ok) {
      setDraft(null);
      onMessage("Remuneracao pontual salva.");
      onReload();
    } else {
      onMessage(result.message);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const result = await deleteConsultantAdHocPayment({ id: pendingDelete.id });
    setDeleting(false);
    setPendingDelete(null);
    if (result.ok) {
      onMessage("Remuneracao pontual excluida.");
      onReload();
    } else {
      onMessage(result.message);
    }
  }

  return (
    <div className="space-y-3">
      {data.payments.length === 0 ? (
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-medium">
          Nenhuma remuneracao pontual registrada.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.payments.map((payment) => (
            <li
              key={payment.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-muted/40 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-strong">
                    {formatBRL(payment.amount)}
                  </span>
                  <StatusBadge tone="neutral">
                    {ADHOC_KIND_LABELS[payment.kind]}
                  </StatusBadge>
                  <StatusBadge tone={ADHOC_STATUS_TONE[payment.status]}>
                    {ADHOC_STATUS_LABELS[payment.status]}
                  </StatusBadge>
                </div>
                <p className="truncate text-xs text-soft">
                  {payment.projectName} · {payment.payAt} · {payment.reason}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <ActionButton
                  size="sm"
                  variant="secondary"
                  icon={Edit}
                  onClick={() => startEdit(payment)}
                >
                  Editar
                </ActionButton>
                <ActionButton
                  size="sm"
                  variant="danger"
                  icon={Trash2}
                  onClick={() => {
                    onMessage(null);
                    setPendingDelete(payment);
                  }}
                >
                  Excluir
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-medium">
              Projeto
              <select
                aria-label="Projeto da remuneracao pontual"
                value={draft.projectId}
                onChange={(event) =>
                  setDraft({ ...draft, projectId: event.target.value })
                }
                className={fieldClass()}
              >
                <option value="">Selecione o projeto</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} ({project.clientName})
                  </option>
                ))}
              </select>
            </label>
            <NumberInput
              label="Valor (R$)"
              value={draft.amount || undefined}
              onChange={(value) => setDraft({ ...draft, amount: value ?? 0 })}
            />
            <label className="space-y-1 text-sm font-medium text-medium">
              Data de pagamento
              <input
                type="date"
                aria-label="Data de pagamento"
                value={draft.payAt}
                onChange={(event) =>
                  setDraft({ ...draft, payAt: event.target.value })
                }
                className={fieldClass()}
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-medium">
              Natureza
              <select
                aria-label="Natureza"
                value={draft.kind}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    kind: event.target.value as AdHocPaymentKind,
                  })
                }
                className={fieldClass()}
              >
                {AD_HOC_PAYMENT_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {ADHOC_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium text-medium">
              Status
              <select
                aria-label="Status"
                value={draft.status}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    status: event.target.value as AdHocPaymentStatus,
                  })
                }
                className={fieldClass()}
              >
                {AD_HOC_PAYMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {ADHOC_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium text-medium md:col-span-2">
              Motivo
              <input
                aria-label="Motivo"
                value={draft.reason}
                onChange={(event) =>
                  setDraft({ ...draft, reason: event.target.value })
                }
                className={fieldClass()}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              size="sm"
              icon={BadgeDollarSign}
              disabled={saving}
              onClick={save}
            >
              {draft.id ? "Salvar alteracoes" : "Adicionar pontual"}
            </ActionButton>
            <ActionButton
              size="sm"
              variant="secondary"
              disabled={saving}
              onClick={() => setDraft(null)}
            >
              Cancelar
            </ActionButton>
          </div>
        </div>
      ) : (
        <ActionButton size="sm" icon={Plus} onClick={startCreate}>
          Adicionar remuneracao pontual
        </ActionButton>
      )}

      <Modal
        open={pendingDelete !== null}
        onClose={() => (deleting ? undefined : setPendingDelete(null))}
        title="Excluir remuneracao pontual"
        description="Esta acao remove o registro financeiro e sera auditada."
        footer={
          <>
            <ActionButton
              variant="secondary"
              disabled={deleting}
              onClick={() => setPendingDelete(null)}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              variant="danger"
              icon={Trash2}
              disabled={deleting}
              onClick={confirmDelete}
            >
              Excluir
            </ActionButton>
          </>
        }
      >
        {pendingDelete ? (
          <p className="text-sm text-medium">
            Confirmar a exclusao de{" "}
            <span className="font-semibold text-strong">
              {formatBRL(pendingDelete.amount)}
            </span>{" "}
            ({ADHOC_KIND_LABELS[pendingDelete.kind]}) vinculada a{" "}
            <span className="font-semibold text-strong">
              {pendingDelete.projectName}
            </span>
            ?
          </p>
        ) : null}
      </Modal>
    </div>
  );
}

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatBRL(value: number) {
  return brlFormatter.format(value);
}

function fieldClass() {
  return cn("h-10 w-full rounded-md border border-border bg-surface px-3 text-sm", focusRingInput);
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-medium">
      {label}
      <input
        type="number"
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value === "" ? undefined : Number(event.target.value))
        }
        className={fieldClass()}
      />
    </label>
  );
}

/**
 * Bank accounts driven by the contract type: CLT or PJ get a single account;
 * CLT FLEX gets two clearly labelled accounts (one CLT, one PJ). Each account
 * exposes Banco, Agência, Conta Corrente and PIX, prefilled from existing data.
 */
function BankAccountsSection({
  consultantId,
  contractType,
  accounts,
  canManagePeople,
  onMessage,
  onReload,
}: {
  consultantId: string;
  contractType: ConsultantIdentityInput["contractType"];
  accounts: ConsultantBankAccountView[];
  canManagePeople: boolean;
  onMessage: (message: string | null) => void;
  onReload: () => void;
}) {
  if (!contractType) {
    return (
      <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-medium">
        Defina o tipo de contratação na identidade para cadastrar as contas
        bancárias.
      </p>
    );
  }

  const cards =
    contractType === "CLT_FLEX"
      ? ([
          { kind: "CLT", label: "Conta CLT" },
          { kind: "PJ", label: "Conta PJ" },
        ] as const)
      : ([{ kind: contractType, label: `Conta ${contractType}` }] as const);

  // Exact kind match; for single-account contracts, fall back to a legacy
  // PRIMARY account so previously saved data keeps showing.
  const findAccount = (
    kind: "CLT" | "PJ",
  ): ConsultantBankAccountView | null => {
    const exact = accounts.find((account) => account.kind === kind);
    if (exact) return exact;
    if (contractType !== "CLT_FLEX") {
      return accounts.find((account) => account.kind === "PRIMARY") ?? null;
    }
    return null;
  };

  return (
    <div className={cn("grid gap-3", cards.length > 1 && "md:grid-cols-2")}>
      {cards.map((card) => (
        <BankAccountFormCard
          key={card.kind}
          consultantId={consultantId}
          kind={card.kind}
          label={card.label}
          existing={findAccount(card.kind)}
          canManagePeople={canManagePeople}
          onMessage={onMessage}
          onReload={onReload}
        />
      ))}
    </div>
  );
}

function BankAccountFormCard({
  consultantId,
  kind,
  label,
  existing,
  canManagePeople,
  onMessage,
  onReload,
}: {
  consultantId: string;
  kind: "CLT" | "PJ";
  label: string;
  existing: ConsultantBankAccountView | null;
  canManagePeople: boolean;
  onMessage: (message: string | null) => void;
  onReload: () => void;
}) {
  const [bankName, setBankName] = useState(existing?.bankName ?? "");
  const [agency, setAgency] = useState(existing?.agency ?? "");
  const [accountNumber, setAccountNumber] = useState(
    existing?.accountNumber ?? "",
  );
  const [pixKey, setPixKey] = useState(existing?.pixKey ?? "");
  const [saving, setSaving] = useState(false);

  const empty =
    bankName.trim() === "" &&
    agency.trim() === "" &&
    accountNumber.trim() === "" &&
    pixKey.trim() === "";

  async function save() {
    setSaving(true);
    const input: BankAccountInput = {
      id: existing?.id,
      consultantId,
      kind,
      bankCode: undefined,
      bankName: bankName.trim() || undefined,
      agency: agency.trim() || undefined,
      accountNumber: accountNumber.trim() || undefined,
      accountDigit: undefined,
      pixKey: pixKey.trim() || undefined,
      holderDocument: undefined,
      active: true,
    };
    const result = await saveBankAccount(input);
    setSaving(false);
    onMessage(result.ok ? `Conta ${kind} salva.` : result.message);
    if (result.ok) onReload();
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface-muted/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-medium">
          {label}
        </span>
        <StatusBadge tone={kind === "CLT" ? "info" : "neutral"}>
          {kind}
        </StatusBadge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <BankField label="Banco" value={bankName} onChange={setBankName} />
        <BankField label="Agência" value={agency} onChange={setAgency} />
        <BankField
          label="Conta Corrente"
          value={accountNumber}
          onChange={setAccountNumber}
        />
        <BankField label="PIX" value={pixKey} onChange={setPixKey} />
      </div>
      <ActionButton
        size="sm"
        icon={CreditCard}
        disabled={!canManagePeople || empty || saving}
        onClick={save}
      >
        {existing ? "Salvar conta" : "Criar conta"}
      </ActionButton>
    </div>
  );
}

function BankField({
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
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(fieldClass(), "w-full")}
      />
    </label>
  );
}
