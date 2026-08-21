/**
 * Contrato de dados do Painel de Talentos (Skills & Certificações).
 *
 * Fonte única de tipos compartilhada entre a camada de leitura
 * (`apps/web/src/lib/db/talent-dashboard.ts`, servidor/Prisma) e as sub-views
 * client (`apps/web/src/components/talent-dashboard/*`). Sem imports do Prisma
 * aqui — é seguro importar `import type` no client.
 *
 * Todo indicador é DERIVADO destes dados em tempo de execução; nada é escrito à
 * mão. Diferente do painel white-label de referência, o JumpFlow tem NÍVEL de
 * proficiência (SkillLevel), VALIDAÇÃO (ValidationStatus) e VIGÊNCIA real de
 * certificado (via `expiresAt`), então as visões usam dados reais, não
 * derivação por texto.
 */

export type ConsultantStatusDto = "ACTIVE" | "INACTIVE" | "ON_LEAVE";

/** Contratação operacional; NAO_INFORMADO cobre `contractType` nulo. */
export type ContractTypeDto = "CLT" | "PJ" | "CLT_FLEX" | "NAO_INFORMADO";

export type SeniorityDto =
  | "INTERN"
  | "TRAINEE"
  | "JUNIOR"
  | "MID_LEVEL"
  | "SENIOR"
  | "SPECIALIST"
  | "TECH_LEAD"
  | "ARCHITECT"
  | "COORDINATOR"
  | "MANAGER"
  | "PRINCIPAL";

export type SkillLevelDto = "BASIC" | "INTERMEDIATE" | "ADVANCED" | "SPECIALIST";
export type SkillTypeDto = "TECHNICAL" | "BEHAVIORAL";
export type ValidationStatusDto = "PENDING" | "VALIDATED" | "REJECTED";

/**
 * Vigência derivada do certificado. EXPIRING = vence em até 90 dias.
 * NO_EXPIRY = `expiresAt` nulo (credencial sem validade declarada).
 */
export type CertExpiryDto = "VALID" | "EXPIRING" | "EXPIRED" | "NO_EXPIRY";

export interface DashSkill {
  name: string;
  category: string; // "Não informado" quando nulo
  type: SkillTypeDto;
  level: SkillLevelDto;
  validation: ValidationStatusDto;
}

export interface DashCert {
  name: string;
  issuer: string; // "Não informado" quando vazio
  issuedAt: string | null; // ISO date (YYYY-MM-DD)
  expiresAt: string | null; // ISO date
  expiry: CertExpiryDto;
  validation: ValidationStatusDto;
}

/** Um consultor com skills e certificados achatados para filtragem no client. */
export interface DashConsultant {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  seniority: SeniorityDto | null;
  area: string; // "Não informado" quando nulo
  contractType: ContractTypeDto;
  status: ConsultantStatusDto;
  skills: DashSkill[];
  certs: DashCert[];
  coursesCompleted: number;
  // Derivados (pré-calculados no servidor para ordenação barata no client)
  skillCount: number;
  validatedSkillCount: number;
  certCount: number;
  certValidCount: number;
  lastCertAt: string | null; // ISO date do certificado mais recente
}

export interface BarDatum {
  label: string;
  value: number;
}

/** Linha do catálogo de skills (agregado por skill do catálogo). */
export interface SkillCatalogRow {
  name: string;
  category: string;
  type: SkillTypeDto;
  consultants: number; // consultores distintos com a skill
  activeConsultants: number;
  validated: number; // vínculos VALIDATED
  byLevel: Record<SkillLevelDto, number>;
}

/** Linha do catálogo de certificações (agregado por nome de credencial). */
export interface CertCatalogRow {
  name: string;
  issuers: string[]; // instituições distintas que emitiram esta credencial
  consultants: number;
  total: number; // total de lançamentos
  valid: number;
  expiring: number;
  expired: number;
  noExpiry: number;
  lastIssued: string | null;
}

/** Item de governança (pendência/atenção) — natureza indicada por `kind`. */
export interface GovItem {
  label: string; // consultor ou credencial
  detail: string;
  consultantId: string | null;
}

export interface TalentSummary {
  totalConsultants: number;
  active: number;
  inactive: number;
  onLeave: number;

  skillLinks: number; // total de ConsultantSkill
  validatedSkillLinks: number;
  consultantsWithSkill: number;

  certs: number;
  certsValid: number; // VALID + EXPIRING (ainda vigentes)
  certsExpired: number;
  consultantsWithCert: number;

  coursesCompleted: number;

  distinctSkills: number; // skills distintas no catálogo com ao menos 1 vínculo
  distinctIssuers: number;

  byContract: BarDatum[];
  bySeniority: BarDatum[];
  byArea: BarDatum[];
  bySkillCategory: BarDatum[]; // por categoria de skill (registros)
  byIssuer: BarDatum[]; // top emissores de certificado
  bySkillLevel: BarDatum[]; // distribuição de níveis de skill
}

export interface TalentGovernance {
  /** Skills do consultor aguardando validação (validationStatus PENDING). */
  pendingSkills: GovItem[];
  /** Certificados vencidos ou vencendo em até 90 dias. */
  expiringCerts: GovItem[];
  /** Lacunas de cadastro: consultor sem skill, sem contratação, cert sem emissor/data. */
  missingData: GovItem[];
  /**
   * Totais REAIS de cada categoria, calculados ANTES do corte das listas acima.
   * As listas (`pendingSkills`/`expiringCerts`/`missingData`) são truncadas para
   * renderização; os KPIs devem usar estes totais para não sub-reportar a base.
   */
  pendingSkillsTotal: number;
  expiringCertsTotal: number;
  missingDataTotal: number;
}

/** Payload completo entregue pela camada de dados à view do painel. */
export interface TalentDashboardData {
  summary: TalentSummary;
  consultants: DashConsultant[];
  skillCatalog: SkillCatalogRow[];
  certCatalog: CertCatalogRow[];
  governance: TalentGovernance;
  generatedAt: string; // ISO datetime
  databaseReady: boolean; // false => estado de demonstração/sem banco
}

/** Abas do painel, na ordem de exibição. */
export const TALENT_TABS = [
  { id: "visao", label: "Visão Executiva" },
  { id: "talent", label: "Talent Finder" },
  { id: "skills", label: "Skills" },
  { id: "certificacoes", label: "Certificações" },
  { id: "consultores", label: "Consultores" },
  { id: "matriz", label: "Matriz de Skills" },
  { id: "inativos", label: "Banco de Inativos" },
  { id: "governanca", label: "Governança" },
] as const;

export type TalentTabId = (typeof TALENT_TABS)[number]["id"];

// ---- Rótulos pt-BR reutilizados pelas sub-views ----

export const SENIORITY_LABEL: Record<SeniorityDto, string> = {
  INTERN: "Estagiário",
  TRAINEE: "Trainee",
  JUNIOR: "Júnior",
  MID_LEVEL: "Pleno",
  SENIOR: "Sênior",
  SPECIALIST: "Especialista",
  TECH_LEAD: "Tech Lead",
  ARCHITECT: "Arquiteto",
  COORDINATOR: "Coordenador",
  MANAGER: "Gerente",
  PRINCIPAL: "Principal",
};

export const CONTRACT_LABEL: Record<ContractTypeDto, string> = {
  CLT: "CLT",
  PJ: "PJ",
  CLT_FLEX: "CLT Flex",
  NAO_INFORMADO: "Não informado",
};

export const STATUS_LABEL: Record<ConsultantStatusDto, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  ON_LEAVE: "Afastado",
};

export const LEVEL_LABEL: Record<SkillLevelDto, string> = {
  BASIC: "Básico",
  INTERMEDIATE: "Intermediário",
  ADVANCED: "Avançado",
  SPECIALIST: "Especialista",
};

export const LEVEL_ORDER: SkillLevelDto[] = [
  "BASIC",
  "INTERMEDIATE",
  "ADVANCED",
  "SPECIALIST",
];

export const VALIDATION_LABEL: Record<ValidationStatusDto, string> = {
  PENDING: "Pendente",
  VALIDATED: "Validada",
  REJECTED: "Rejeitada",
};

export const CERT_EXPIRY_LABEL: Record<CertExpiryDto, string> = {
  VALID: "Vigente",
  EXPIRING: "Vence em breve",
  EXPIRED: "Vencida",
  NO_EXPIRY: "Sem validade",
};

export const NAO_INFORMADO = "Não informado";
