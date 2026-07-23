"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeDollarSign,
  Building2,
  CreditCard,
  IdCard,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { ROLE_NAMES, roleLabels, type RoleName } from "@/lib/auth/roles";
import { createConsultant } from "@/app/app/consultores/actions";
import {
  CONSULTANT_STATUSES,
  CONTRACT_TYPES,
  SENIORITIES,
  type CreateConsultantInput,
} from "@/lib/consultants/schemas";
import {
  consultantStatusLabels,
  contractTypeLabels,
  seniorityLabels,
} from "@/lib/consultants/labels";

interface FormState {
  name: string;
  email: string;
  jobTitle: string;
  area: string;
  seniority: (typeof SENIORITIES)[number];
  status: (typeof CONSULTANT_STATUSES)[number];
  contractType: "" | (typeof CONTRACT_TYPES)[number];
  roles: RoleName[];
  cpf: string;
  birthDate: string;
  phone: string;
  cnpj: string;
  legalName: string;
  tradeName: string;
  bankName: string;
  agency: string;
  accountNumber: string;
  pixKey: string;
  compensationStartsAt: string;
  cltAmount: string;
  pjAmount: string;
  benefitCardAmount: string;
}

const emptyForm: FormState = {
  name: "",
  email: "",
  jobTitle: "",
  area: "",
  seniority: "MID_LEVEL",
  status: "ACTIVE",
  contractType: "",
  roles: ["CONSULTANT"],
  cpf: "",
  birthDate: "",
  phone: "",
  cnpj: "",
  legalName: "",
  tradeName: "",
  bankName: "",
  agency: "",
  accountNumber: "",
  pixKey: "",
  compensationStartsAt: "",
  cltAmount: "",
  pjAmount: "",
  benefitCardAmount: "",
};

export interface NewConsultantFormProps {
  /** Habilita a secao de remuneracao acordada (dado financeiro). */
  canManageFinancials?: boolean;
  /** Permite conceder o perfil Administrador (somente ADMIN). */
  canGrantAdmin?: boolean;
}

/**
 * Formulario completo de criacao de consultor. Captura de uma vez a identidade,
 * os perfis de acesso (RBAC), os dados pessoais essenciais, empresa/CNPJ, uma
 * conta bancaria/PIX e — para papeis financeiros — a remuneracao acordada. A
 * validacao definitiva e no servidor (Zod + RBAC); aqui fazemos as checagens
 * minimas de UX. Ao concluir, redireciona para o diretorio com o perfil recem
 * criado aberto para completar os demais dados.
 */
export function NewConsultantForm({
  canManageFinancials = false,
  canGrantAdmin = false,
}: NewConsultantFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleOptions = ROLE_NAMES.filter(
    (role) => role !== "ADMIN" || canGrantAdmin,
  );

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleRole(role: RoleName) {
    setForm((prev) => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter((r) => r !== role)
        : [...prev.roles, role],
    }));
  }

  function num(value: string): number | undefined {
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function txt(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }

  async function submit() {
    setError(null);
    if (form.name.trim().length < 2) {
      setError("Informe o nome completo do consultor.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Informe um e-mail valido.");
      return;
    }
    if (form.roles.length === 0) {
      setError("Selecione ao menos um perfil de acesso.");
      return;
    }

    const payload: CreateConsultantInput = {
      name: form.name.trim(),
      email: form.email.trim(),
      jobTitle: txt(form.jobTitle),
      area: txt(form.area),
      seniority: form.seniority,
      status: form.status,
      contractType: form.contractType === "" ? undefined : form.contractType,
      roles: form.roles,
      cpf: txt(form.cpf),
      birthDate: txt(form.birthDate),
      phone: txt(form.phone),
      cnpj: txt(form.cnpj),
      legalName: txt(form.legalName),
      tradeName: txt(form.tradeName),
      bankName: txt(form.bankName),
      agency: txt(form.agency),
      accountNumber: txt(form.accountNumber),
      pixKey: txt(form.pixKey),
      compensationStartsAt: canManageFinancials
        ? txt(form.compensationStartsAt)
        : undefined,
      cltAmount: canManageFinancials ? num(form.cltAmount) : undefined,
      pjAmount: canManageFinancials ? num(form.pjAmount) : undefined,
      benefitCardAmount: canManageFinancials
        ? num(form.benefitCardAmount)
        : undefined,
    };

    setSaving(true);
    const result = await createConsultant(payload);
    setSaving(false);
    if (result.ok) {
      // Redireciona para o diretorio ja abrindo o perfil recem-criado, para
      // completar os demais dados do cadastro.
      router.push(`/app/consultores?novo=${result.data.id}`);
    } else {
      setError(result.message);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p
          role="alert"
          className="rounded-md border-2 border-danger bg-danger-soft px-3 py-2 text-sm font-medium text-danger"
        >
          {error}
        </p>
      ) : null}

      <FormSection icon={IdCard} title="Identidade">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Nome completo" required>
            <input
              className={fieldClass()}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field label="E-mail" required>
            <input
              type="email"
              className={fieldClass()}
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field label="Cargo">
            <input
              className={fieldClass()}
              value={form.jobTitle}
              onChange={(e) => set("jobTitle", e.target.value)}
            />
          </Field>
          <Field label="Área">
            <input
              className={fieldClass()}
              value={form.area}
              onChange={(e) => set("area", e.target.value)}
            />
          </Field>
          <Field label="Senioridade" required>
            <select
              className={fieldClass()}
              value={form.seniority}
              onChange={(e) =>
                set("seniority", e.target.value as FormState["seniority"])
              }
            >
              {SENIORITIES.map((value) => (
                <option key={value} value={value}>
                  {seniorityLabels[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Situação">
            <select
              className={fieldClass()}
              value={form.status}
              onChange={(e) =>
                set("status", e.target.value as FormState["status"])
              }
            >
              {CONSULTANT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {consultantStatusLabels[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo de contratação">
            <select
              className={fieldClass()}
              value={form.contractType}
              onChange={(e) =>
                set("contractType", e.target.value as FormState["contractType"])
              }
            >
              <option value="">Não definido</option>
              {CONTRACT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {contractTypeLabels[value]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </FormSection>

      <FormSection icon={ShieldCheck} title="Perfis de acesso">
        <p className="mb-3 text-xs text-soft">
          Define o que a pessoa poderá ver e fazer na plataforma. Padrão:
          Consultor.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {roleOptions.map((role) => (
            <label
              key={role}
              className="flex items-center gap-2 rounded-md border border-border bg-surface-muted/40 px-3 py-2 text-sm font-medium text-medium"
            >
              <input
                type="checkbox"
                checked={form.roles.includes(role)}
                onChange={() => toggleRole(role)}
              />
              {roleLabels[role]}
            </label>
          ))}
        </div>
      </FormSection>

      <FormSection icon={IdCard} title="Dados pessoais">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="CPF">
            <input
              className={fieldClass()}
              value={form.cpf}
              onChange={(e) => set("cpf", e.target.value)}
            />
          </Field>
          <Field label="Data de nascimento">
            <input
              type="date"
              className={fieldClass()}
              value={form.birthDate}
              onChange={(e) => set("birthDate", e.target.value)}
            />
          </Field>
          <Field label="Telefone">
            <input
              className={fieldClass()}
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection icon={Building2} title="Empresa (PJ)">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="CNPJ">
            <input
              className={fieldClass()}
              value={form.cnpj}
              onChange={(e) => set("cnpj", e.target.value)}
            />
          </Field>
          <Field label="Razão social">
            <input
              className={fieldClass()}
              value={form.legalName}
              onChange={(e) => set("legalName", e.target.value)}
            />
          </Field>
          <Field label="Nome fantasia">
            <input
              className={fieldClass()}
              value={form.tradeName}
              onChange={(e) => set("tradeName", e.target.value)}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection icon={CreditCard} title="Dados bancários / PIX">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Banco">
            <input
              className={fieldClass()}
              value={form.bankName}
              onChange={(e) => set("bankName", e.target.value)}
            />
          </Field>
          <Field label="Agência">
            <input
              className={fieldClass()}
              value={form.agency}
              onChange={(e) => set("agency", e.target.value)}
            />
          </Field>
          <Field label="Conta corrente">
            <input
              className={fieldClass()}
              value={form.accountNumber}
              onChange={(e) => set("accountNumber", e.target.value)}
            />
          </Field>
          <Field label="Chave PIX">
            <input
              className={fieldClass()}
              value={form.pixKey}
              onChange={(e) => set("pixKey", e.target.value)}
            />
          </Field>
        </div>
      </FormSection>

      {canManageFinancials ? (
        <FormSection icon={BadgeDollarSign} title="Remuneração acordada">
          <p className="mb-3 text-xs text-soft">
            Valores acordados por vigência. Você poderá detalhar benefícios,
            encargos e descontos no perfil depois de criar.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Início da vigência">
              <input
                type="date"
                className={fieldClass()}
                value={form.compensationStartsAt}
                onChange={(e) => set("compensationStartsAt", e.target.value)}
              />
            </Field>
            <Field label="Valor CLT (R$)">
              <input
                type="number"
                className={fieldClass()}
                value={form.cltAmount}
                onChange={(e) => set("cltAmount", e.target.value)}
              />
            </Field>
            <Field label="Valor PJ (R$)">
              <input
                type="number"
                className={fieldClass()}
                value={form.pjAmount}
                onChange={(e) => set("pjAmount", e.target.value)}
              />
            </Field>
            <Field label="Cartão benefício (R$)">
              <input
                type="number"
                className={fieldClass()}
                value={form.benefitCardAmount}
                onChange={(e) => set("benefitCardAmount", e.target.value)}
              />
            </Field>
          </div>
        </FormSection>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <ActionButton icon={UserPlus} disabled={saving} onClick={submit}>
          {saving ? "Criando..." : "Criar consultor"}
        </ActionButton>
        <ActionButton
          variant="secondary"
          disabled={saving}
          onClick={() => router.push("/app/consultores")}
        >
          Cancelar
        </ActionButton>
      </div>
    </div>
  );
}

function FormSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof UserPlus;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-md border border-border p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-strong">
        <Icon aria-hidden="true" className="size-4" />
        {title}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="w-full space-y-1 text-sm font-medium text-medium">
      <span>
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function fieldClass() {
  return cn(
    "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm",
    focusRingInput,
  );
}
