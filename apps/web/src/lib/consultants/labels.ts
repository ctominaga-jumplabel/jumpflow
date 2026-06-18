/**
 * Rotulos pt-BR para os enums de cadastro de consultor (Story 1). Mantidos
 * junto das tuplas de {@link schemas} para a UI exibir nomes amigaveis sem
 * espalhar switch/case pelos componentes.
 */
import type {
  CltContractKind,
  ConsultantContractType,
  ConsultantDocumentType,
  EducationDegree,
  Gender,
  HourBankEntryKind,
  InvoiceType,
  LanguageLevel,
  MaritalStatus,
} from "./schemas";

export const contractTypeLabels: Record<ConsultantContractType, string> = {
  CLT: "CLT",
  PJ: "PJ",
  CLT_FLEX: "CLT FLEX",
};

export const genderLabels: Record<Gender, string> = {
  FEMALE: "Feminino",
  MALE: "Masculino",
  NON_BINARY: "Nao binario",
  OTHER: "Outro",
  UNDISCLOSED: "Prefiro nao informar",
};

export const maritalStatusLabels: Record<MaritalStatus, string> = {
  SINGLE: "Solteiro(a)",
  MARRIED: "Casado(a)",
  STABLE_UNION: "Uniao estavel",
  DIVORCED: "Divorciado(a)",
  WIDOWED: "Viuvo(a)",
  SEPARATED: "Separado(a)",
  OTHER: "Outro",
};

/**
 * Rotulos de documento. A ordem desta lista tambem define a ordem de exibicao
 * dos campos de upload na secao de Documentos.
 */
export const documentTypeLabels: Record<ConsultantDocumentType, string> = {
  PROOF_OF_ADDRESS: "Comprovante de residencia",
  RG: "RG",
  CPF: "CPF",
  CTPS: "CTPS",
  CERTIFICATE: "Certificados",
  EMPLOYMENT_CONTRACT: "Contrato de trabalho",
  ASO_ADMISSIONAL: "ASO admissional",
  SERVICE_CONTRACT: "Contrato de prestacao",
  CNPJ_CARD: "Cartao CNPJ",
  ARTICLES_OF_ASSOCIATION: "Contrato social",
  NEGATIVE_CERTIFICATE: "Certidoes negativas",
  BANK_PROOF: "Comprovante bancario",
  OTHER: "Outro",
};

/** Documentos comuns a qualquer consultor (independem do tipo de contrato). */
export const COMMON_DOCUMENT_TYPES: ConsultantDocumentType[] = [
  "PROOF_OF_ADDRESS",
  "RG",
  "CPF",
  "CERTIFICATE",
];

/** Documentos exigidos no vinculo CLT. */
export const CLT_DOCUMENT_TYPES: ConsultantDocumentType[] = [
  "CTPS",
  "EMPLOYMENT_CONTRACT",
  "ASO_ADMISSIONAL",
];

/** Documentos exigidos no vinculo PJ. */
export const PJ_DOCUMENT_TYPES: ConsultantDocumentType[] = [
  "SERVICE_CONTRACT",
  "CNPJ_CARD",
  "ARTICLES_OF_ASSOCIATION",
  "NEGATIVE_CERTIFICATE",
  "BANK_PROOF",
];

export const languageLevelLabels: Record<LanguageLevel, string> = {
  BASIC: "Basico",
  INTERMEDIATE: "Intermediario",
  ADVANCED: "Avancado",
  FLUENT: "Fluente",
  NATIVE: "Nativo",
};

export const educationDegreeLabels: Record<EducationDegree, string> = {
  HIGH_SCHOOL: "Ensino medio",
  TECHNICAL: "Tecnico",
  UNDERGRADUATE: "Graduacao",
  POSTGRADUATE: "Pos-graduacao",
  MASTERS: "Mestrado",
  DOCTORATE: "Doutorado",
  OTHER: "Outro",
};

export const cltContractKindLabels: Record<CltContractKind, string> = {
  INDEFINITE: "Prazo indeterminado",
  FIXED_TERM: "Prazo determinado",
  INTERNSHIP: "Estagio",
  APPRENTICESHIP: "Aprendiz",
};

export const hourBankEntryKindLabels: Record<HourBankEntryKind, string> = {
  OVERTIME: "Hora extra (credito)",
  COMPENSATION: "Compensacao (debito)",
  ADJUSTMENT: "Ajuste",
};

export const invoiceTypeLabels: Record<InvoiceType, string> = {
  NFSE: "NFS-e (servicos)",
  NFE: "NF-e (produto)",
  RPA: "RPA (autonomo)",
  OTHER: "Outro",
};
