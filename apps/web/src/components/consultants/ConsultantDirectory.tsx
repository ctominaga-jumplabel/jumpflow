"use client";

import { useMemo, useState } from "react";
import { BadgeDollarSign, Building2, CreditCard, Edit, UserPlus, Users } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { FilterChip } from "@/components/ui/FilterChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
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
  loadConsultantProfile,
  saveBankAccount,
  saveCompensation,
  saveConsultantIdentity,
  saveVoucherBenefits,
} from "@/app/app/consultores/actions";
import {
  CONTRACT_TYPES,
  type BankAccountInput,
  type CompensationInput,
  type ConsultantIdentityInput,
  type VoucherBenefitsInput,
} from "@/lib/consultants/schemas";
import { contractTypeLabels } from "@/lib/consultants/labels";
import type { ConsultantProfile } from "@/lib/db/consultants";
import { computeCompensation } from "@/lib/consultants/compensation";
import { ConsultantAvailabilityBadge } from "./ConsultantAvailabilityBadge";
import { ConsultantProfileSections } from "./ConsultantProfileSections";
import { ConsultantSkillChips } from "./ConsultantSkillChips";

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
}

/**
 * Searchable consultant directory. Search by name/title/area, filter by
 * seniority and skill. Dense card grid so each consultant reads as a unit.
 */
export function ConsultantDirectory({
  consultants = allConsultants,
  canManagePeople = false,
  canManageFinancials = false,
}: ConsultantDirectoryProps) {
  const [search, setSearch] = useState("");
  const [seniority, setSeniority] = useState<Seniority | "ALL">("ALL");
  const [skillId, setSkillId] = useState<string>("ALL");
  const [selected, setSelected] = useState<Consultant | null>(null);
  const [profile, setProfile] = useState<ConsultantProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Carrega o perfil completo sob demanda (evita puxar todos os perfis na
  // listagem). Disparado no clique de "Detalhes", nunca em useEffect.
  async function openDetails(consultant: Consultant) {
    setSelected(consultant);
    setProfile(null);
    setMessage(null);
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

  function closeDetails() {
    setSelected(null);
    setProfile(null);
  }

  const skillOptions = useMemo(
    () => distinctSkills(consultants),
    [consultants],
  );

  const rows = useMemo(
    () => filterConsultants(consultants, { search, seniority, skillId }),
    [consultants, search, seniority, skillId],
  );

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
          <ActionButton variant="primary" size="sm" icon={UserPlus}>
            Novo consultor
          </ActionButton>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum consultor encontrado"
          description="Ajuste a busca ou os filtros para encontrar outros perfis."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((consultant) => (
            <li
              key={consultant.id}
              className="rounded-[var(--radius-card)] border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_var(--color-ink)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-strong">
                    {consultant.name}
                  </p>
                  <p className="truncate text-xs text-soft">
                    {consultant.jobTitle} · {consultant.area}
                  </p>
                </div>
                {consultant.status === "INACTIVE" ? (
                  <StatusBadge tone="neutral">Inativo</StatusBadge>
                ) : (
                  <StatusBadge tone="info">
                    {seniorityLabels[consultant.seniority]}
                  </StatusBadge>
                )}
              </div>

              <div className="mt-3">
                <ConsultantAvailabilityBadge
                  allocationPercent={consultant.allocationPercent}
                />
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <ConsultantSkillChips skills={consultant.topSkills} />
              </div>
              <div className="mt-4 flex justify-end">
                <ActionButton
                  variant="secondary"
                  size="sm"
                  icon={Edit}
                  onClick={() => void openDetails(consultant)}
                >
                  Detalhes
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConsultantDetailModal
        consultant={selected}
        profile={profile}
        loadingProfile={loadingProfile}
        canManagePeople={canManagePeople}
        canManageFinancials={canManageFinancials}
        message={message}
        onMessage={setMessage}
        onReload={reloadProfile}
        onClose={closeDetails}
      />
    </div>
  );
}

function ConsultantDetailModal({
  consultant,
  profile,
  loadingProfile,
  canManagePeople,
  canManageFinancials,
  message,
  onMessage,
  onReload,
  onClose,
}: {
  consultant: Consultant | null;
  profile: ConsultantProfile | null;
  loadingProfile: boolean;
  canManagePeople: boolean;
  canManageFinancials: boolean;
  message: string | null;
  onMessage: (message: string | null) => void;
  onReload: () => void;
  onClose: () => void;
}) {
  const [identity, setIdentity] = useState<ConsultantIdentityInput | null>(null);
  const [bankKind, setBankKind] = useState<"CLT" | "PJ">("CLT");
  const [pixKey, setPixKey] = useState("");
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

  async function saveBank(kind: "CLT" | "PJ") {
    const input: BankAccountInput = {
      id: undefined,
      consultantId,
      kind,
      bankCode: undefined,
      bankName: undefined,
      agency: undefined,
      accountNumber: undefined,
      accountDigit: undefined,
      pixKey: pixKey || undefined,
      holderDocument: undefined,
      active: true,
    };
    const result = await saveBankAccount(input);
    onMessage(result.ok ? `Conta ${kind} criada.` : result.message);
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

        <section className="space-y-3 rounded-md border border-border p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-strong">
            <CreditCard aria-hidden="true" className="size-4" />
            Contas bancarias por contrato
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Tipo de conta"
              value={bankKind}
              onChange={(event) => setBankKind(event.target.value as "CLT" | "PJ")}
              className={fieldClass()}
            >
              <option value="CLT">CLT</option>
              <option value="PJ">PJ</option>
            </select>
            <input
              aria-label="Chave Pix"
              value={pixKey}
              onChange={(event) => setPixKey(event.target.value)}
              placeholder="Chave Pix"
              className={fieldClass()}
            />
            <ActionButton
              size="sm"
              disabled={!canManagePeople || pixKey.trim().length === 0}
              onClick={() => saveBank(bankKind)}
              icon={CreditCard}
            >
              Criar conta
            </ActionButton>
          </div>
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
      </div>
    </Modal>
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
  return cn("h-10 rounded-md border border-border bg-surface px-3 text-sm", focusRingInput);
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
