/**
 * Experience Pack — o subconjunto que o JumpFlow consome.
 *
 * Contrato: Jump Value / Jump Experience Registry, `schemaVersion` 1.x.
 * Fonte da verdade do formato: `docs/experience-registry/ARCHITECTURE.md` no
 * repositório do Jump Value.
 *
 * Estes tipos descrevem o que ESPERAMOS receber, não o que confiamos ter
 * recebido: tudo passa por `validate.ts` antes de virar estilo. O pack chega de
 * uma API que analisou o repositório de OUTRA aplicação — é dado de terceiro.
 */

export const SUPPORTED_SCHEMA_MAJOR = 1;

/** Referência a token: `{ token: "color.primary" }`. */
export interface TokenRef {
  token: string;
}

export type PackValue = string | number | TokenRef | ShadowValue | GradientValue;

export interface ShadowValue {
  offsetX: string;
  offsetY: string;
  blur: string;
  spread: string;
  color: string;
  inset?: boolean;
}

export interface GradientStop {
  color: string;
  position?: number | null;
}

export interface GradientValue {
  kind: "linear" | "radial";
  angle: number;
  stops: GradientStop[];
}

export interface BorderValue {
  width: string;
  style: string;
  color: string | TokenRef;
}

/** Grupo de tokens: `$type` + folhas (ou subgrupos com `$type` próprio). */
export type TokenGroup = {
  $type?: string;
  [name: string]: unknown;
};

export interface PackTokens {
  color?: TokenGroup;
  typography?: TokenGroup;
  spacing?: TokenGroup;
  radius?: TokenGroup;
  shadow?: TokenGroup;
  opacity?: TokenGroup;
  border?: TokenGroup;
  breakpoint?: TokenGroup;
}

export interface PackGlass {
  backdropBlur?: string;
  background?: string | TokenRef;
  borderColor?: string | TokenRef;
  innerHighlight?: ShadowValue;
  saturate?: number;
}

export interface PackEffects {
  glass?: PackGlass;
  blur?: TokenGroup;
  glow?: TokenGroup;
  gradient?: TokenGroup;
  overlay?: TokenGroup;
  innerShadow?: TokenGroup;
  depth?: { levels?: unknown[] };
}

export interface PackRecipe {
  background?: string | TokenRef;
  backgroundGradient?: GradientValue | TokenRef;
  text?: string | TokenRef;
  border?: BorderValue | TokenRef;
  borderColor?: string | TokenRef;
  radius?: string | TokenRef;
  shadow?: ShadowValue | ShadowValue[] | TokenRef;
  innerShadow?: ShadowValue | TokenRef;
  backdropBlur?: string | TokenRef;
  opacity?: number | TokenRef;
  effects?: string[];
  font?: Record<string, unknown>;
  states?: Record<string, PackRecipe>;
  /** Box-model existe no pack mas o JumpFlow NÃO aplica — ver `map.ts`. */
  paddingX?: string | TokenRef;
  paddingY?: string | TokenRef;
  width?: string | TokenRef;
  height?: string | TokenRef;
  gap?: string | TokenRef;
}

export interface PackComponent {
  default: string;
  variants: Record<string, PackRecipe>;
}

export interface PackMotion {
  duration?: TokenGroup;
  easing?: TokenGroup;
  transition?: Record<string, unknown>;
  states?: Record<string, Record<string, unknown>>;
  prefersReducedMotion?: boolean;
}

export interface PackManifest {
  id?: string;
  slug?: string;
  name?: string;
  description?: string;
  version?: number;
  status?: string;
  classification?: string[];
  source?: {
    provider?: string;
    repository?: string;
    branch?: string;
    commit?: string;
  };
  detected?: { framework?: string; styling?: string[] };
}

export interface ExperiencePack {
  schemaVersion: string;
  manifest?: PackManifest;
  tokens?: PackTokens;
  effects?: PackEffects;
  components?: Record<string, PackComponent>;
  motion?: PackMotion;
  layout?: { present?: boolean; shell?: Record<string, unknown> };
  assets?: unknown[];
  evidence?: unknown[];
}

/** Item da lista de experiências publicadas (resumo, sem o pack). */
export interface ExperienceSummary {
  id: number;
  slug: string;
  nome: string;
  descricao?: string | null;
  status: string;
  current_version: number;
  classification: string[];
  detected_framework?: string | null;
  source_repository?: string | null;
  preview?: {
    swatches?: { nome: string; valor: string }[];
    fontFamily?: string | null;
    classification?: string[];
  } | null;
}

/** O que o engine aplicou — usado pelo switcher e pelos testes. */
export interface AppliedExperience {
  experienceId: number;
  version: number;
  slug: string;
  name: string;
  /** Variáveis CSS escritas inline no <html>. */
  variables: Record<string, string>;
  /** Regras geradas (camada de efeitos/recipes). Vazio = só tokens. */
  rules: string;
  /** O que foi descartado por validação — alimenta a análise de gap. */
  dropped: string[];
}
