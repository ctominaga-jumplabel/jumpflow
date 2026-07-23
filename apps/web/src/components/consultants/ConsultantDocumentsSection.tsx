"use client";

import { useRef, useState } from "react";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  deleteConsultantDocument,
  uploadConsultantDocument,
} from "@/app/app/consultores/actions";
import type {
  ConsultantContractType,
  ConsultantDocumentType,
} from "@/lib/consultants/schemas";
import {
  CLT_DOCUMENT_TYPES,
  COMMON_DOCUMENT_TYPES,
  documentTypeLabels,
  PJ_DOCUMENT_TYPES,
} from "@/lib/consultants/labels";
import type { ConsultantProfile } from "@/lib/db/consultants";

const ACCEPT_DOC = ".pdf,.jpg,.jpeg,.png,.webp";

export interface ConsultantDocumentsSectionProps {
  consultantId: string;
  documents: ConsultantProfile["documents"];
  /** Tipo de contrato selecionado (orienta os documentos específicos exibidos). */
  contractType?: ConsultantContractType;
  /** Quando false, os controles de anexar/remover ficam desabilitados. */
  canEdit: boolean;
  onMessage: (message: string | null) => void;
  onReload: () => void;
}

/**
 * Grupo "Documentações" do cadastro do consultor (M1): slots tipados por tipo de
 * contrato (CLT/PJ) + "Outros documentos" (múltiplos). Extraído de
 * `ConsultantProfileSections` para virar um grupo colapsável independente com
 * permissão própria na Matriz (`CONSULTORES_DOCUMENTOS`).
 */
export function ConsultantDocumentsSection({
  consultantId,
  documents,
  contractType,
  canEdit,
  onMessage,
  onReload,
}: ConsultantDocumentsSectionProps) {
  const documentTypes: ConsultantDocumentType[] = [
    ...COMMON_DOCUMENT_TYPES,
    ...(contractType === "CLT" || contractType === "CLT_FLEX"
      ? CLT_DOCUMENT_TYPES
      : []),
    ...(contractType === "PJ" || contractType === "CLT_FLEX"
      ? PJ_DOCUMENT_TYPES
      : []),
  ];
  const otherDocuments = documents.filter((doc) => doc.type === "OTHER");

  return (
    <div className="space-y-3">
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
            document={documents.find((doc) => doc.type === type) ?? null}
            disabled={!canEdit}
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
              disabled={!canEdit}
              onMessage={onMessage}
              onReload={onReload}
            />
          ))}
          {/* Slot de adicao: document=null sempre cria um novo OTHER. */}
          <DocumentRow
            consultantId={consultantId}
            type="OTHER"
            document={null}
            disabled={!canEdit}
            onMessage={onMessage}
            onReload={onReload}
          />
        </ul>
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
