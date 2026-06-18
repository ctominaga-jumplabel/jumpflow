"use client";

import { useState } from "react";
import { Building2, FileSpreadsheet, Search, UserCog } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import {
  lookupConsultantCnpj,
  saveCompanyInfo,
  saveLegalRepresentative,
  savePjInfo,
} from "@/app/app/consultores/actions";
import type {
  CompanyInfoInput,
  LegalRepresentativeInput,
  PjInfoInput,
} from "@/lib/consultants/schemas";
import { invoiceTypeLabels } from "@/lib/consultants/labels";
import type { ConsultantProfile } from "@/lib/db/consultants";
import { SelectField, TextField } from "./fields";

export interface ConsultantPjSectionProps {
  consultantId: string;
  company: ConsultantProfile["company"];
  pjInfo: ConsultantProfile["pjInfo"];
  legalRep: ConsultantProfile["legalRep"];
  canManagePeople: boolean;
  onMessage: (message: string | null) => void;
  onReload: () => void;
}

/**
 * Trilha PJ (Story 4): empresa (com lookup de CNPJ), responsavel legal,
 * contratacao e faturamento. Renderizada quando o tipo de contratacao e PJ ou
 * CLT_FLEX. Empresa reusa ConsultantCompanyInfo + lookupConsultantCnpj.
 */
export function ConsultantPjSection({
  consultantId,
  company,
  pjInfo,
  legalRep,
  canManagePeople,
  onMessage,
  onReload,
}: ConsultantPjSectionProps) {
  return (
    <div className="space-y-4">
      <CompanyBlock
        consultantId={consultantId}
        company={company}
        disabled={!canManagePeople}
        onMessage={onMessage}
        onReload={onReload}
      />
      <LegalRepBlock
        consultantId={consultantId}
        legalRep={legalRep}
        disabled={!canManagePeople}
        onMessage={onMessage}
        onReload={onReload}
      />
      <PjContractBlock
        consultantId={consultantId}
        pjInfo={pjInfo}
        disabled={!canManagePeople}
        onMessage={onMessage}
        onReload={onReload}
      />
    </div>
  );
}

function CompanyBlock({
  consultantId,
  company,
  disabled,
  onMessage,
  onReload,
}: {
  consultantId: string;
  company: ConsultantProfile["company"];
  disabled: boolean;
  onMessage: (message: string | null) => void;
  onReload: () => void;
}) {
  const [form, setForm] = useState<CompanyInfoInput>(() => ({
    consultantId,
    cnpj: company.cnpj ?? undefined,
    legalName: company.legalName ?? undefined,
    tradeName: company.tradeName ?? undefined,
    municipalRegistration: company.municipalRegistration ?? undefined,
    stateRegistration: company.stateRegistration ?? undefined,
    cnaePrimary: company.cnaePrimary ?? undefined,
    taxRegime: company.taxRegime ?? undefined,
  }));
  const [busy, setBusy] = useState(false);

  function patch(values: Partial<CompanyInfoInput>) {
    setForm((prev) => ({ ...prev, ...values }));
  }

  async function save() {
    const result = await saveCompanyInfo(form);
    onMessage(result.ok ? "Dados da empresa salvos." : result.message);
    if (result.ok) onReload();
  }

  async function lookup() {
    if (!form.cnpj) return;
    setBusy(true);
    const result = await lookupConsultantCnpj({ consultantId, value: form.cnpj });
    setBusy(false);
    onMessage(
      result.ok ? "CNPJ consultado e aplicado." : result.message,
    );
    if (result.ok) {
      patch({
        cnpj: result.data.company.cnpj,
        legalName: result.data.company.legalName ?? undefined,
        tradeName: result.data.company.tradeName ?? undefined,
      });
      onReload();
    }
  }

  return (
    <section className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-strong">
        <Building2 aria-hidden="true" className="size-4" />
        Empresa (PJ)
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <TextField
              label="CNPJ"
              value={form.cnpj}
              onChange={(value) => patch({ cnpj: value })}
            />
          </div>
          <ActionButton
            size="sm"
            variant="secondary"
            icon={Search}
            disabled={disabled || busy || !form.cnpj}
            onClick={lookup}
          >
            Buscar
          </ActionButton>
        </div>
        <TextField
          label="Razao social"
          value={form.legalName}
          onChange={(value) => patch({ legalName: value })}
        />
        <TextField
          label="Nome fantasia"
          value={form.tradeName}
          onChange={(value) => patch({ tradeName: value })}
        />
        <TextField
          label="CNAE principal"
          value={form.cnaePrimary}
          onChange={(value) => patch({ cnaePrimary: value })}
        />
        <TextField
          label="Inscricao municipal"
          value={form.municipalRegistration}
          onChange={(value) => patch({ municipalRegistration: value })}
        />
        <TextField
          label="Inscricao estadual"
          value={form.stateRegistration}
          onChange={(value) => patch({ stateRegistration: value })}
        />
        <TextField
          label="Regime tributario"
          value={form.taxRegime}
          onChange={(value) => patch({ taxRegime: value })}
        />
      </div>
      <ActionButton size="sm" icon={Building2} disabled={disabled} onClick={save}>
        Salvar empresa
      </ActionButton>
    </section>
  );
}

function LegalRepBlock({
  consultantId,
  legalRep,
  disabled,
  onMessage,
  onReload,
}: {
  consultantId: string;
  legalRep: ConsultantProfile["legalRep"];
  disabled: boolean;
  onMessage: (message: string | null) => void;
  onReload: () => void;
}) {
  const [form, setForm] = useState<LegalRepresentativeInput>(() => ({
    consultantId,
    name: legalRep.name ?? undefined,
    cpf: legalRep.cpf ?? undefined,
    email: legalRep.email ?? undefined,
    phone: legalRep.phone ?? undefined,
  }));

  function patch(values: Partial<LegalRepresentativeInput>) {
    setForm((prev) => ({ ...prev, ...values }));
  }

  async function save() {
    const result = await saveLegalRepresentative(form);
    onMessage(result.ok ? "Responsavel legal salvo." : result.message);
    if (result.ok) onReload();
  }

  return (
    <section className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-strong">
        <UserCog aria-hidden="true" className="size-4" />
        Responsavel legal
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextField
          label="Nome"
          value={form.name}
          onChange={(value) => patch({ name: value })}
        />
        <TextField
          label="CPF"
          value={form.cpf}
          onChange={(value) => patch({ cpf: value })}
        />
        <TextField
          label="E-mail"
          type="email"
          value={form.email}
          onChange={(value) => patch({ email: value })}
        />
        <TextField
          label="Telefone"
          value={form.phone}
          onChange={(value) => patch({ phone: value })}
        />
      </div>
      <ActionButton size="sm" icon={UserCog} disabled={disabled} onClick={save}>
        Salvar responsavel legal
      </ActionButton>
    </section>
  );
}

function PjContractBlock({
  consultantId,
  pjInfo,
  disabled,
  onMessage,
  onReload,
}: {
  consultantId: string;
  pjInfo: ConsultantProfile["pjInfo"];
  disabled: boolean;
  onMessage: (message: string | null) => void;
  onReload: () => void;
}) {
  const [form, setForm] = useState<PjInfoInput>(() => ({
    consultantId,
    contractStart: pjInfo.contractStart ?? undefined,
    contractEnd: pjInfo.contractEnd ?? undefined,
    contractTermMonths: pjInfo.contractTermMonths ?? undefined,
    autoRenew: pjInfo.autoRenew,
    issuesInvoice: pjInfo.issuesInvoice,
    invoiceType: (pjInfo.invoiceType as PjInfoInput["invoiceType"]) ?? undefined,
    issuingMunicipality: pjInfo.issuingMunicipality ?? undefined,
    issRate: pjInfo.issRate ?? undefined,
  }));

  function patch(values: Partial<PjInfoInput>) {
    setForm((prev) => ({ ...prev, ...values }));
  }

  async function save() {
    const result = await savePjInfo(form);
    onMessage(result.ok ? "Contratacao e faturamento salvos." : result.message);
    if (result.ok) onReload();
  }

  return (
    <section className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-strong">
        <FileSpreadsheet aria-hidden="true" className="size-4" />
        Contratacao e faturamento
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TextField
          label="Data de inicio"
          type="date"
          value={form.contractStart}
          onChange={(value) => patch({ contractStart: value })}
        />
        <TextField
          label="Data de termino"
          type="date"
          value={form.contractEnd}
          onChange={(value) => patch({ contractEnd: value })}
        />
        <TextField
          label="Vigencia (meses)"
          type="number"
          value={
            form.contractTermMonths != null
              ? String(form.contractTermMonths)
              : undefined
          }
          onChange={(value) =>
            patch({
              contractTermMonths: value === undefined ? undefined : Number(value),
            })
          }
        />
        <label className="flex items-center gap-2 self-end text-sm font-medium text-medium">
          <input
            type="checkbox"
            checked={form.autoRenew}
            onChange={(event) => patch({ autoRenew: event.target.checked })}
          />
          Renovacao automatica
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-medium">
          <input
            type="checkbox"
            checked={form.issuesInvoice}
            onChange={(event) => patch({ issuesInvoice: event.target.checked })}
          />
          Emite NF?
        </label>
        <SelectField
          label="Tipo de nota"
          value={form.invoiceType ?? ""}
          options={invoiceTypeLabels}
          onChange={(value) =>
            patch({ invoiceType: (value || undefined) as PjInfoInput["invoiceType"] })
          }
        />
        <TextField
          label="Municipio de emissao"
          value={form.issuingMunicipality}
          onChange={(value) => patch({ issuingMunicipality: value })}
        />
        <TextField
          label="Aliquota ISS (%)"
          type="number"
          value={form.issRate != null ? String(form.issRate) : undefined}
          onChange={(value) =>
            patch({ issRate: value === undefined ? undefined : Number(value) })
          }
        />
      </div>
      <ActionButton
        size="sm"
        icon={FileSpreadsheet}
        disabled={disabled}
        onClick={save}
      >
        Salvar contratacao e faturamento
      </ActionButton>
    </section>
  );
}
