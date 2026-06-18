"use client";

import { useRef, useState } from "react";
import {
  FileText,
  IdCard,
  MapPin,
  Paperclip,
  Phone,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { focusRing, focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  deleteConsultantDocument,
  lookupConsultantCep,
  saveAddress,
  savePersonalInfo,
  uploadConsultantDocument,
  uploadConsultantPhoto,
} from "@/app/app/consultores/actions";
import type {
  AddressInput,
  ConsultantContractType,
  ConsultantDocumentType,
  PersonalInfoInput,
} from "@/lib/consultants/schemas";
import {
  CLT_DOCUMENT_TYPES,
  COMMON_DOCUMENT_TYPES,
  documentTypeLabels,
  genderLabels,
  maritalStatusLabels,
  PJ_DOCUMENT_TYPES,
} from "@/lib/consultants/labels";
import type { ConsultantProfile } from "@/lib/db/consultants";
import { ConsultantCltSection } from "./ConsultantCltSection";
import { ConsultantCompetenciasSection } from "./ConsultantCompetenciasSection";
import { ConsultantPjSection } from "./ConsultantPjSection";

const ACCEPT_DOC = ".pdf,.jpg,.jpeg,.png,.webp";
const ACCEPT_IMG = ".jpg,.jpeg,.png,.webp";

export interface ConsultantProfileSectionsProps {
  consultantId: string;
  profile: ConsultantProfile;
  /** Tipo de contrato selecionado no momento (orienta os documentos exibidos). */
  contractType?: ConsultantContractType;
  canManagePeople: boolean;
  onMessage: (message: string | null) => void;
  /** Recarrega o perfil (URLs assinadas, lista de documentos) apos mutacoes. */
  onReload: () => void;
}

/**
 * Secoes do cadastro de consultor introduzidas na Story 1: Dados Pessoais (com
 * foto), Contato e Documentos. Os valores iniciais vem do perfil carregado sob
 * demanda; cada secao salva via Server Action e a area pai recarrega o perfil.
 */
export function ConsultantProfileSections({
  consultantId,
  profile,
  contractType,
  canManagePeople,
  onMessage,
  onReload,
}: ConsultantProfileSectionsProps) {
  const [personal, setPersonal] = useState<PersonalInfoInput>(() => ({
    consultantId,
    cpf: profile.personal.cpf ?? undefined,
    birthDate: profile.personal.birthDate ?? undefined,
    phone: profile.personal.phone ?? undefined,
    socialName: profile.personal.socialName ?? undefined,
    rg: profile.personal.rg ?? undefined,
    gender: (profile.personal.gender as PersonalInfoInput["gender"]) ?? undefined,
    maritalStatus:
      (profile.personal.maritalStatus as PersonalInfoInput["maritalStatus"]) ??
      undefined,
    nationality: profile.personal.nationality ?? undefined,
    personalEmail: profile.personal.personalEmail ?? undefined,
    corporateEmail: profile.personal.corporateEmail ?? undefined,
    mobilePhone: profile.personal.mobilePhone ?? undefined,
    emergencyPhone: profile.personal.emergencyPhone ?? undefined,
    emergencyContact: profile.personal.emergencyContact ?? undefined,
  }));

  function patch(values: Partial<PersonalInfoInput>) {
    setPersonal((prev) => ({ ...prev, ...values }));
  }

  async function savePersonal() {
    const result = await savePersonalInfo(personal);
    onMessage(result.ok ? "Dados pessoais salvos." : result.message);
    if (result.ok) onReload();
  }

  const [address, setAddress] = useState<AddressInput>(() => ({
    consultantId,
    postalCode: profile.address.postalCode ?? undefined,
    street: profile.address.street ?? undefined,
    district: profile.address.district ?? undefined,
    city: profile.address.city ?? undefined,
    state: profile.address.state ?? undefined,
    number: profile.address.number ?? undefined,
    complement: profile.address.complement ?? undefined,
  }));
  const [cepBusy, setCepBusy] = useState(false);

  function patchAddress(values: Partial<AddressInput>) {
    setAddress((prev) => ({ ...prev, ...values }));
  }

  async function saveConsultantAddress() {
    const result = await saveAddress(address);
    onMessage(result.ok ? "Endereco salvo." : result.message);
    if (result.ok) onReload();
  }

  async function lookupCep() {
    if (!address.postalCode) return;
    setCepBusy(true);
    const result = await lookupConsultantCep({
      consultantId,
      value: address.postalCode,
    });
    setCepBusy(false);
    onMessage(result.ok ? "CEP consultado e aplicado." : result.message);
    if (result.ok) {
      patchAddress({
        postalCode: result.data.address.postalCode,
        street: result.data.address.street ?? undefined,
        district: result.data.address.district ?? undefined,
        city: result.data.address.city ?? undefined,
        state: result.data.address.state ?? undefined,
      });
      onReload();
    }
  }

  // Tipos de slot unico (um anexo por tipo). OTHER e tratado a parte porque
  // pode repetir: lista todos os existentes + um slot para adicionar mais.
  const documentTypes: ConsultantDocumentType[] = [
    ...COMMON_DOCUMENT_TYPES,
    ...(contractType === "CLT" || contractType === "CLT_FLEX"
      ? CLT_DOCUMENT_TYPES
      : []),
    ...(contractType === "PJ" || contractType === "CLT_FLEX"
      ? PJ_DOCUMENT_TYPES
      : []),
  ];
  const otherDocuments = profile.documents.filter((doc) => doc.type === "OTHER");

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-md border border-border p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-strong">
          <IdCard aria-hidden="true" className="size-4" />
          Dados pessoais
        </div>
        <PhotoField
          consultantId={consultantId}
          photoUrl={profile.personal.photoUrl}
          disabled={!canManagePeople}
          onMessage={onMessage}
          onReload={onReload}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            label="Nome social"
            value={personal.socialName}
            onChange={(value) => patch({ socialName: value })}
          />
          <TextField
            label="Nacionalidade"
            value={personal.nationality}
            onChange={(value) => patch({ nationality: value })}
          />
          <TextField
            label="CPF"
            value={personal.cpf}
            onChange={(value) => patch({ cpf: value })}
          />
          <TextField
            label="RG"
            value={personal.rg}
            onChange={(value) => patch({ rg: value })}
          />
          <TextField
            label="Data de nascimento"
            type="date"
            value={personal.birthDate}
            onChange={(value) => patch({ birthDate: value })}
          />
          <SelectField
            label="Sexo"
            value={personal.gender ?? ""}
            options={genderLabels}
            onChange={(value) =>
              patch({ gender: (value || undefined) as PersonalInfoInput["gender"] })
            }
          />
          <SelectField
            label="Estado civil"
            value={personal.maritalStatus ?? ""}
            options={maritalStatusLabels}
            onChange={(value) =>
              patch({
                maritalStatus: (value ||
                  undefined) as PersonalInfoInput["maritalStatus"],
              })
            }
          />
        </div>
      </section>

      <section className="space-y-3 rounded-md border border-border p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-strong">
          <Phone aria-hidden="true" className="size-4" />
          Contato
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            label="E-mail pessoal"
            type="email"
            value={personal.personalEmail}
            onChange={(value) => patch({ personalEmail: value })}
          />
          <TextField
            label="E-mail corporativo"
            type="email"
            value={personal.corporateEmail}
            onChange={(value) => patch({ corporateEmail: value })}
          />
          <TextField
            label="Telefone celular"
            value={personal.mobilePhone}
            onChange={(value) => patch({ mobilePhone: value })}
          />
          <TextField
            label="Telefone (fixo)"
            value={personal.phone}
            onChange={(value) => patch({ phone: value })}
          />
          <TextField
            label="Telefone de emergencia"
            value={personal.emergencyPhone}
            onChange={(value) => patch({ emergencyPhone: value })}
          />
          <TextField
            label="Contato de emergencia"
            value={personal.emergencyContact}
            onChange={(value) => patch({ emergencyContact: value })}
          />
        </div>
        <ActionButton
          size="sm"
          icon={IdCard}
          disabled={!canManagePeople}
          onClick={savePersonal}
        >
          Salvar dados pessoais e contato
        </ActionButton>
      </section>

      <section className="space-y-3 rounded-md border border-border p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-strong">
          <MapPin aria-hidden="true" className="size-4" />
          Endereco
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <TextField
                label="CEP"
                value={address.postalCode}
                onChange={(value) => patchAddress({ postalCode: value })}
              />
            </div>
            <ActionButton
              size="sm"
              variant="secondary"
              icon={Search}
              disabled={!canManagePeople || cepBusy || !address.postalCode}
              onClick={lookupCep}
            >
              Buscar
            </ActionButton>
          </div>
          <TextField
            label="Logradouro"
            value={address.street}
            onChange={(value) => patchAddress({ street: value })}
          />
          <TextField
            label="Numero"
            value={address.number}
            onChange={(value) => patchAddress({ number: value })}
          />
          <TextField
            label="Complemento"
            value={address.complement}
            onChange={(value) => patchAddress({ complement: value })}
          />
          <TextField
            label="Bairro"
            value={address.district}
            onChange={(value) => patchAddress({ district: value })}
          />
          <TextField
            label="Cidade"
            value={address.city}
            onChange={(value) => patchAddress({ city: value })}
          />
          <TextField
            label="Estado (UF)"
            value={address.state}
            onChange={(value) => patchAddress({ state: value })}
          />
        </div>
        <ActionButton
          size="sm"
          icon={MapPin}
          disabled={!canManagePeople}
          onClick={saveConsultantAddress}
        >
          Salvar endereco
        </ActionButton>
      </section>

      <ConsultantCompetenciasSection
        consultantId={consultantId}
        languages={profile.languages}
        educations={profile.educations}
        canManagePeople={canManagePeople}
        onMessage={onMessage}
        onReload={onReload}
      />

      {contractType === "CLT" || contractType === "CLT_FLEX" ? (
        <ConsultantCltSection
          consultantId={consultantId}
          cltInfo={profile.cltInfo}
          vacations={profile.vacations}
          hourBank={profile.hourBank}
          canManagePeople={canManagePeople}
          onMessage={onMessage}
          onReload={onReload}
        />
      ) : null}

      {contractType === "PJ" || contractType === "CLT_FLEX" ? (
        <ConsultantPjSection
          consultantId={consultantId}
          company={profile.company}
          pjInfo={profile.pjInfo}
          legalRep={profile.legalRep}
          canManagePeople={canManagePeople}
          onMessage={onMessage}
          onReload={onReload}
        />
      ) : null}

      <section className="space-y-3 rounded-md border border-border p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-strong">
          <FileText aria-hidden="true" className="size-4" />
          Documentos
        </div>
        {!contractType ? (
          <p className="text-xs text-soft">
            Defina o tipo de contratacao na identidade para ver os documentos
            especificos de CLT/PJ. Os documentos comuns ja estao disponiveis
            abaixo.
          </p>
        ) : null}
        <ul className="space-y-2">
          {documentTypes.map((type) => (
            <DocumentRow
              key={type}
              consultantId={consultantId}
              type={type}
              document={profile.documents.find((doc) => doc.type === type) ?? null}
              disabled={!canManagePeople}
              onMessage={onMessage}
              onReload={onReload}
            />
          ))}
        </ul>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-medium">Outros documentos</p>
          <ul className="space-y-2">
            {otherDocuments.map((doc) => (
              <ExistingOtherRow
                key={doc.id}
                document={doc}
                disabled={!canManagePeople}
                onMessage={onMessage}
                onReload={onReload}
              />
            ))}
            {/* Slot de adicao: document=null sempre cria um novo OTHER. */}
            <DocumentRow
              consultantId={consultantId}
              type="OTHER"
              document={null}
              disabled={!canManagePeople}
              onMessage={onMessage}
              onReload={onReload}
            />
          </ul>
        </div>
      </section>
    </div>
  );
}

function PhotoField({
  consultantId,
  photoUrl,
  disabled,
  onMessage,
  onReload,
}: {
  consultantId: string;
  photoUrl: string | null;
  disabled: boolean;
  onMessage: (message: string | null) => void;
  onReload: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    const formData = new FormData();
    formData.set("consultantId", consultantId);
    formData.set("file", file);
    const result = await uploadConsultantPhoto(formData);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    onMessage(result.ok ? "Foto atualizada." : result.message);
    if (result.ok) onReload();
  }

  return (
    <div className="flex items-center gap-3">
      <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-ink bg-surface-muted">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL assinada de curta duracao; otimizacao do Next nao se aplica.
          <img src={photoUrl} alt="Foto do consultor" className="size-full object-cover" />
        ) : (
          <IdCard aria-hidden="true" className="size-6 text-soft" />
        )}
      </div>
      <div>
        <label
          htmlFor={`photo-${consultantId}`}
          className={cn(
            "inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-medium transition-colors hover:border-brand hover:text-strong",
            disabled && "pointer-events-none opacity-50",
            focusRing,
          )}
        >
          <Upload aria-hidden="true" className="size-3.5" />
          {busy ? "Enviando..." : photoUrl ? "Trocar foto" : "Adicionar foto"}
        </label>
        <p className="mt-1 text-[11px] text-soft">JPG, PNG ou WEBP, ate 2 MB.</p>
        <input
          ref={inputRef}
          id={`photo-${consultantId}`}
          type="file"
          accept={ACCEPT_IMG}
          className="sr-only"
          disabled={disabled || busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>
    </div>
  );
}

function DocumentRow({
  consultantId,
  type,
  document,
  disabled,
  onMessage,
  onReload,
}: {
  consultantId: string;
  type: ConsultantDocumentType;
  document: ConsultantProfile["documents"][number] | null;
  disabled: boolean;
  onMessage: (message: string | null) => void;
  onReload: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    const formData = new FormData();
    formData.set("consultantId", consultantId);
    formData.set("type", type);
    formData.set("file", file);
    const result = await uploadConsultantDocument(formData);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    onMessage(
      result.ok ? `${documentTypeLabels[type]} anexado.` : result.message,
    );
    if (result.ok) onReload();
  }

  async function remove() {
    if (!document) return;
    setBusy(true);
    const result = await deleteConsultantDocument({ documentId: document.id });
    setBusy(false);
    onMessage(result.ok ? `${documentTypeLabels[type]} removido.` : result.message);
    if (result.ok) onReload();
  }

  return (
    <li className="flex items-center gap-3 rounded-md border border-border bg-surface-muted/40 px-3 py-2">
      <span className="w-44 shrink-0 text-sm font-medium text-strong">
        {documentTypeLabels[type]}
      </span>
      <div className="min-w-0 flex-1">
        {document ? (
          <a
            href={document.url ?? undefined}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "inline-flex max-w-full items-center gap-1.5 truncate text-sm text-brand hover:underline",
              !document.url && "pointer-events-none text-medium",
            )}
          >
            <FileText aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">{document.fileName}</span>
          </a>
        ) : (
          <span className="text-xs text-soft">Nenhum arquivo anexado.</span>
        )}
      </div>
      <label
        htmlFor={`doc-${type}-${consultantId}`}
        className={cn(
          "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-brand transition-colors hover:bg-surface",
          disabled && "pointer-events-none opacity-50",
          focusRing,
        )}
      >
        <Paperclip aria-hidden="true" className="size-3.5" />
        {busy ? "..." : document ? "Substituir" : "Anexar"}
      </label>
      {document ? (
        <button
          type="button"
          onClick={remove}
          disabled={disabled || busy}
          aria-label={`Remover ${documentTypeLabels[type]}`}
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-md text-medium transition-colors hover:bg-surface hover:text-danger disabled:opacity-50",
            focusRing,
          )}
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      ) : null}
      <input
        ref={inputRef}
        id={`doc-${type}-${consultantId}`}
        type="file"
        accept={ACCEPT_DOC}
        className="sr-only"
        disabled={disabled || busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </li>
  );
}

function ExistingOtherRow({
  document,
  disabled,
  onMessage,
  onReload,
}: {
  document: ConsultantProfile["documents"][number];
  disabled: boolean;
  onMessage: (message: string | null) => void;
  onReload: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const result = await deleteConsultantDocument({ documentId: document.id });
    setBusy(false);
    onMessage(result.ok ? "Documento removido." : result.message);
    if (result.ok) onReload();
  }

  return (
    <li className="flex items-center gap-3 rounded-md border border-border bg-surface-muted/40 px-3 py-2">
      <div className="min-w-0 flex-1">
        <a
          href={document.url ?? undefined}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 truncate text-sm text-brand hover:underline",
            !document.url && "pointer-events-none text-medium",
          )}
        >
          <FileText aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{document.fileName}</span>
        </a>
      </div>
      <button
        type="button"
        onClick={remove}
        disabled={disabled || busy}
        aria-label={`Remover ${document.fileName}`}
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-md text-medium transition-colors hover:bg-surface hover:text-danger disabled:opacity-50",
          focusRing,
        )}
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </button>
    </li>
  );
}

function fieldClass() {
  return cn(
    "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm",
    focusRingInput,
  );
}

function TextField({
  label,
  value,
  type = "text",
  onChange,
}: {
  label: string;
  value?: string;
  type?: string;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-medium">
      {label}
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value === "" ? undefined : event.target.value)
        }
        className={fieldClass()}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-medium">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass()}
      >
        <option value="">-</option>
        {Object.entries(options).map(([key, optionLabel]) => (
          <option key={key} value={key}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
