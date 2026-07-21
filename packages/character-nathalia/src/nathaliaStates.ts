/**
 * The emotion catalog for Nathal.IA.
 *
 * Each state declares the 3D pose/clip it *expects* (filenames live in
 * `assets/models/`) plus a CSS/2D fallback intent used until the real `.glb`
 * models are added. Keep this list in sync with `NathaliaStateKey`.
 */
import type {
  NathaliaIntent,
  NathaliaStateDefinition,
  NathaliaStateKey,
} from "./nathaliaTypes";

export const nathaliaStates: Record<
  NathaliaStateKey,
  NathaliaStateDefinition
> = {
  idle: {
    key: "idle",
    label: "Tranquila",
    description: "Repouso atento. Estado padrão quando nada acontece.",
    pose: "nathalia-idle",
    animation: "idleBreath",
    defaultMessage: "Oi! Sou a Nathal.IA. Posso ajudar quando precisar.",
    intent: "neutral",
    recommendedContext: "Qualquer tela, sem interação ativa.",
  },
  welcome: {
    key: "welcome",
    label: "Boas-vindas",
    description: "Recebe a pessoa ao abrir o painel ou entrar na plataforma.",
    pose: "nathalia-wave",
    animation: "wave",
    defaultMessage: "Bem-vindo(a) de volta! Vamos organizar o seu dia?",
    intent: "positive",
    recommendedContext: "Primeira abertura do painel na sessão.",
  },
  listening: {
    key: "listening",
    label: "Ouvindo",
    description: "Aguardando a pessoa digitar ou escolher uma sugestão.",
    pose: "nathalia-idle",
    animation: "nod",
    defaultMessage: "Pode falar, estou te ouvindo.",
    intent: "info",
    recommendedContext: "Campo de input com foco.",
  },
  thinking: {
    key: "thinking",
    label: "Pensando",
    description: "Processando uma solicitação (mock hoje, LLM no futuro).",
    pose: "nathalia-thinking",
    animation: "thinking",
    defaultMessage: "Deixa eu pensar um instante...",
    intent: "info",
    recommendedContext: "Após enviar uma pergunta.",
  },
  searching: {
    key: "searching",
    label: "Buscando",
    description: "Procurando informações ou itens relacionados.",
    pose: "nathalia-thinking",
    animation: "search",
    defaultMessage: "Estou procurando isso para você...",
    intent: "info",
    recommendedContext: "Consultas a dados (futuro) e buscas.",
  },
  explaining: {
    key: "explaining",
    label: "Explicando",
    description: "Apresentando um conceito ou um passo a passo.",
    pose: "nathalia-pointing",
    animation: "explain",
    defaultMessage: "Vou te explicar como isso funciona.",
    intent: "info",
    recommendedContext: "Tours, tooltips e respostas didáticas.",
  },
  pointing: {
    key: "pointing",
    label: "Apontando",
    description: "Direciona a atenção para um elemento da tela.",
    pose: "nathalia-pointing",
    animation: "point",
    defaultMessage: "Olha aqui, é por este caminho.",
    intent: "info",
    recommendedContext: "Destaque de elementos durante um tour.",
  },
  happy: {
    key: "happy",
    label: "Animada",
    description: "Reação leve e simpática a uma interação positiva.",
    pose: "nathalia-happy",
    animation: "happy",
    defaultMessage: "Boa! Estamos no caminho certo.",
    intent: "positive",
    recommendedContext: "Confirmações leves e feedback positivo.",
  },
  warning: {
    key: "warning",
    label: "Atenção",
    description: "Alerta amigável sobre algo que merece cuidado.",
    pose: "nathalia-warning",
    animation: "warn",
    defaultMessage: "Atenção: vale revisar isso antes de continuar.",
    intent: "attention",
    recommendedContext: "Pendências, prazos e validações.",
  },
  error: {
    key: "error",
    label: "Ops",
    description: "Algo deu errado; mantém o tom leve e prestativo.",
    pose: "nathalia-warning",
    animation: "shrug",
    defaultMessage: "Ops, algo não saiu como esperado. Vamos tentar de novo?",
    intent: "negative",
    recommendedContext: "Falhas de operação ou indisponibilidade.",
  },
  success: {
    key: "success",
    label: "Sucesso",
    description: "Conclusão bem-sucedida de uma ação.",
    pose: "nathalia-happy",
    animation: "thumbsUp",
    defaultMessage: "Prontinho! Tudo certo por aqui.",
    intent: "positive",
    recommendedContext: "Envio de horas, salvamentos e conclusões.",
  },
  celebrate: {
    key: "celebrate",
    label: "Comemorando",
    description: "Celebração de uma conquista relevante (marco, fechamento).",
    pose: "nathalia-celebrate",
    animation: "celebrate",
    defaultMessage: "Aêêê! Mais uma etapa concluída. 🎉",
    intent: "positive",
    recommendedContext: "Fechamentos, metas e marcos.",
  },
};

/** Ordered list of states (stable order for tooling and tests). */
export const nathaliaStateList: NathaliaStateDefinition[] =
  Object.values(nathaliaStates);

/** Lookup helper with a safe fallback to `idle`. */
export function getNathaliaState(
  key: NathaliaStateKey,
): NathaliaStateDefinition {
  return nathaliaStates[key] ?? nathaliaStates.idle;
}

/**
 * Tailwind-token color hints per intent. Tokens come from the host's Playful
 * Ops theme (`globals.css`), so the package stays themeable without bundling
 * its own palette.
 */
export const intentAccent: Record<
  NathaliaIntent,
  { ring: string; chip: string; text: string }
> = {
  neutral: { ring: "ring-border", chip: "bg-surface-muted", text: "text-medium" },
  positive: { ring: "ring-flow", chip: "bg-success-soft", text: "text-success" },
  info: { ring: "ring-brand", chip: "bg-brand-soft", text: "text-brand-dark" },
  attention: {
    ring: "ring-marker",
    chip: "bg-warning-soft",
    text: "text-warning",
  },
  negative: { ring: "ring-danger", chip: "bg-danger-soft", text: "text-danger" },
};
