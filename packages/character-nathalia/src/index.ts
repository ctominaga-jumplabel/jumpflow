/**
 * @jumpflow/character-nathalia
 *
 * Nathal.IA — the JumpFlow contextual **2D animated** work companion.
 * No LLM is wired up; replies come from a local, LLM-free brain and the avatar
 * is the hand-illustrated expression face (no WebGL/3D — see ROADMAP for Rive).
 *
 * Typical wiring in the authenticated layout:
 *
 *   <NathaliaProvider user={user}>
 *     {children}
 *     <NathaliaWidget />
 *     <NathaliaTour />
 *   </NathaliaProvider>
 *
 * Imperative "emotion engine" (callable anywhere on the client):
 *
 *   setNathaliaState("thinking");
 *   setNathaliaMessage("Estou analisando seus lançamentos...");
 *   setNathaliaContext("hours");
 *   openNathalia(); closeNathalia(); toggleNathalia();
 */

// Components
export { NathaliaProvider, useNathalia, useNathaliaActions, useNathaliaActionsOptional, useNathaliaSnapshot } from "./NathaliaProvider";
export type { NathaliaProviderProps } from "./NathaliaProvider";
export { NathaliaRoot, NATHALIA_ROOT_Z_INDEX } from "./NathaliaRoot";
export type { NathaliaRootProps } from "./NathaliaRoot";
export { NathaliaWidget } from "./NathaliaWidget";
export type { NathaliaWidgetProps } from "./NathaliaWidget";
export { NathaliaChatPanel } from "./NathaliaChatPanel";
export type { NathaliaChatPanelProps } from "./NathaliaChatPanel";
// Spec-named aliases for the launcher (the minimized floating widget) and the
// expanded panel. Same components, the vocabulary used in the product spec/docs.
export { NathaliaWidget as NathaliaLauncher } from "./NathaliaWidget";
export type { NathaliaWidgetProps as NathaliaLauncherProps } from "./NathaliaWidget";
export { NathaliaChatPanel as NathaliaPanel } from "./NathaliaChatPanel";
export type { NathaliaChatPanelProps as NathaliaPanelProps } from "./NathaliaChatPanel";
export { NathaliaAvatar } from "./NathaliaAvatar";
export type { NathaliaAvatarProps } from "./NathaliaAvatar";
export { NathaliaVideoAvatar } from "./NathaliaVideoAvatar";
export type { NathaliaVideoAvatarProps } from "./NathaliaVideoAvatar";
export { Nathalia2DApp } from "./Nathalia2DApp";
export type { Nathalia2DAppProps } from "./Nathalia2DApp";
export {
  nathaliaVideoClips,
  nathaliaVideoStageTransform,
  videoClipForNathalia,
} from "./nathaliaVideo";
export type { NathaliaVideoClip, NathaliaVideoClipKey } from "./nathaliaVideo";
export { NathaliaAvatar2D } from "./NathaliaAvatar2D";
export type { NathaliaAvatar2DProps } from "./NathaliaAvatar2D";

export { NathaliaAvatar2DExpr } from "./NathaliaAvatar2DExpr";
export type { NathaliaAvatar2DExprProps } from "./NathaliaAvatar2DExpr";

// Layered, catalog-driven 2D avatar (opt-in via NEXT_PUBLIC_NATHALIA_2D_LAYERED).
// Composes body → face → mouth → object layers and plays named animation states.
export { Nathalia2DAvatar } from "./Nathalia2DAvatar";
export type { Nathalia2DAvatarProps } from "./Nathalia2DAvatar";
export { NathaliaAnimationController } from "./NathaliaAnimationController";
export type { NathaliaAnimationControllerProps } from "./NathaliaAnimationController";
export { NathaliaLayer } from "./NathaliaLayer";
export type { NathaliaLayerProps } from "./NathaliaLayer";
export {
  NATHALIA_ANIMATION_STATES,
  layeredAnimationFor,
  getAnimationDef,
  motionKeyframes,
} from "./nathaliaAnimationRegistry";
export type {
  NathaliaAnimationState,
  NathaliaAnimationDef,
  NathaliaMotionProfile,
  NathaliaMotionKeyframes,
} from "./nathaliaAnimationRegistry";
export {
  nathaliaSprites,
  nathaliaLayersPresent,
  nathaliaSpriteCounts,
  spritesByCategory,
  spriteFor,
  spriteUrl,
  hasLayer,
} from "./nathaliaSpriteCatalog";
export type {
  NathaliaSprite,
  NathaliaSpriteCategory,
  NathaliaLayerPresence,
} from "./nathaliaSpriteCatalog";

// Presentational building blocks (static face / mouth shape).
export { NathaliaExpression } from "./NathaliaExpression";
export type { NathaliaExpressionProps } from "./NathaliaExpression";
export { NathaliaVisemePreview, NATHALIA_VISEME_LIST } from "./NathaliaVisemePreview";
export type { NathaliaVisemePreviewProps } from "./NathaliaVisemePreview";

// Rive avatar (interactive vector, opt-in). The lazy boundary keeps the Rive
// runtime out of the initial bundle — `NathaliaAvatarRive` is NOT exported here.
export { NathaliaAvatarRiveLazy } from "./NathaliaAvatarRiveLazy";
export type { NathaliaAvatarRiveProps } from "./NathaliaAvatarRiveLazy";
export {
  NATHALIA_RIVE_ARTBOARD,
  NATHALIA_RIVE_INPUTS,
  NATHALIA_RIVE_MOODS,
  NATHALIA_RIVE_SRC,
  NATHALIA_RIVE_STATE_MACHINE,
  NATHALIA_RIVE_VISEMES,
  isNathaliaRiveEnabled,
  moodToRiveIndex,
  visemeToRiveIndex,
} from "./nathaliaRive";

export {
  isSpeechSupported,
  isNathaliaMuted,
  setNathaliaMuted,
  speakNathalia,
  speakNathaliaAudio,
  speakNathaliaAudioWithCallbacks,
  voiceNathalia,
  voiceNathaliaReply,
  voiceNathaliaCue,
  voiceNathaliaCached,
  voiceNathaliaCachedWithCallbacks,
  cancelNathaliaSpeech,
  setNathaliaVoiceProvider,
} from "./nathaliaSpeech";
export type {
  NathaliaVoiceProvider,
  NathaliaVoiceCue,
  NathaliaReplyVoiceHint,
} from "./nathaliaSpeech";
export {
  NATHALIA_VOICE_CLIPS,
  NATHALIA_WELCOME_VOICE,
  audioForVoiceText,
  clipForVoiceKey,
} from "./nathaliaVoiceLibrary";
export type { NathaliaVoiceClip } from "./nathaliaVoiceLibrary";
export {
  nathaliaVoiceReference,
  preferredNathaliaVoiceReferenceAsset,
} from "./nathaliaVoiceReference";
export type {
  NathaliaVoiceReference,
  NathaliaVoiceReferenceAsset,
} from "./nathaliaVoiceReference";

export {
  NATHALIA_EXPRESSIONS,
  NATHALIA_VISEMES,
  NATHALIA_EXPRESSIONS_BASE_URL,
  expressionFor,
  expressionImageUrl,
  visemeImageUrl,
  reachableExpressions,
  isActiveExpressionState,
  isExpressive2DEnabled,
} from "./nathaliaExpressions";
export type { NathaliaExpressionKey, NathaliaVisemeKey } from "./nathaliaExpressions";
export { NathaliaBubble } from "./NathaliaBubble";
export type { NathaliaBubbleProps } from "./NathaliaBubble";
export { NathaliaContextCard } from "./NathaliaContextCard";
export type { NathaliaContextCardProps } from "./NathaliaContextCard";
export { NathaliaConfetti } from "./NathaliaConfetti";
export type { NathaliaConfettiProps } from "./NathaliaConfetti";
export { NathaliaTooltip } from "./NathaliaTooltip";
export type { NathaliaTooltipProps } from "./NathaliaTooltip";
export { NathaliaTour, nathaliaTours } from "./NathaliaTour";
export type { NathaliaTourDefinition, NathaliaTourStep } from "./NathaliaTour";
export {
  nathaliaSpeechPoints,
  audioForSpeechPoint,
  speechPointForTourStep,
  speechPointsForContext,
  textToVoice,
} from "./nathaliaSpeechCatalog";
export type { NathaliaSpeechPoint } from "./nathaliaSpeechCatalog";

// Emotion engine (imperative store API)
export { isNathaliaActive, setNathaliaActive } from "./nathaliaRuntime";
export {
  advanceNathaliaTour,
  celebrateNathalia,
  closeNathalia,
  dismissNudge,
  getNathaliaSnapshot,
  notifyNathalia,
  openNathalia,
  presentNudge,
  resetNathalia,
  sayNathalia,
  setNathaliaAccessory,
  setNathaliaContext,
  setNathaliaFollowUps,
  setNathaliaMessage,
  setNathaliaSpeaking,
  setNathaliaState,
  setNathaliaUser,
  setNathaliaViseme,
  setNathaliaVisual,
  setNathaliaWidgetMode,
  startNathaliaSpeaking,
  startNathaliaTour,
  stopNathaliaSpeaking,
  stopNathaliaTour,
  subscribeNathalia,
  toggleNathalia,
} from "./nathaliaStore";

// Behavior facade (spec-shaped state engine) + spec-named vocabulary aliases.
export { NathaliaStateEngine, nathaliaEngine } from "./nathaliaEngine";
export type { NathaliaSpeakOptions } from "./nathaliaEngine";
export {
  moodToState,
  stateToMood,
  specVisemeToKey,
  keyToSpecViseme,
  specContextToKey,
  keyToSpecContext,
} from "./nathaliaSpecAliases";
export type {
  NathaliaMood,
  NathaliaViseme,
  NathaliaContext,
} from "./nathaliaSpecAliases";

// Data / config
export {
  getNathaliaState,
  intentAccent,
  nathaliaStateList,
  nathaliaStates,
} from "./nathaliaStates";
export {
  animationForState,
  clipForState,
  clipLoop,
  isOneShotClip,
  morphTargetsForState,
  nathaliaAnimations,
  stateToClip,
  stateToMorphTargets,
} from "./nathaliaAnimations";
export type {
  Nathalia3DClip,
  NathaliaAnimationDefinition,
  NathaliaMorphTarget,
} from "./nathaliaAnimations";

// Idle Intelligence (Etapa 8)
export {
  blinkWeightAt,
  nathaliaIdleConfig,
  nextBlinkDelaySec,
} from "./nathaliaIdle";
export type {
  NathaliaBlinkConfig,
  NathaliaIdleConfig,
  NathaliaMicroMotionConfig,
} from "./nathaliaIdle";

// Accessory system (Etapa 9)
export {
  accessoryFileName,
  accessoryForContext,
  accessoryUrl,
  DEFAULT_NATHALIA_ACCESSORIES_BASE_URL,
  isAccessoryKey,
  nathaliaAccessories,
  nathaliaAccessoriesBaseUrl,
  nathaliaAccessoryKeys,
} from "./nathaliaAccessories";
export type {
  NathaliaAccessoryAttach,
  NathaliaAccessoryDefinition,
  NathaliaAccessoryKey,
} from "./nathaliaAccessories";

// Contextual visual states (Etapa 10)
export { visualStateForContext } from "./nathaliaVisualStates";
export type { NathaliaVisualState } from "./nathaliaVisualStates";

// Avatar framing (2D presets: bubble / panel / lab). Pure + three-free.
export {
  nathalia2DFraming,
  nathalia2DFramingPresets,
  nathalia2DTransform,
  nathaliaFramingPresets,
  resolveNathaliaFraming,
} from "./nathaliaFraming";
export type {
  Nathalia2DFraming,
  NathaliaFramingOverrides,
  NathaliaViewMode,
  ResolvedNathaliaFraming,
} from "./nathaliaFraming";
export {
  contextForPath,
  getNathaliaContext,
  nathaliaContexts,
} from "./nathaliaContext";
export { nathaliaCopy } from "./nathaliaCopy";
export type { NathaliaCopy } from "./nathaliaCopy";

// Welcome experience (Fase 8.1, Etapa 4)
export { nathaliaFirstName, nathaliaWelcome } from "./nathaliaWelcome";
export type { NathaliaWelcome } from "./nathaliaWelcome";

// Panel layout / positioning (Fase 8.1, Etapas 1–2)
export {
  NATHALIA_PANEL_DEFAULTS,
  resolveNathaliaPanelLayout,
} from "./nathaliaPanelLayout";
export type {
  NathaliaPanelPlacement,
  PanelLayout,
  PanelLayoutInput,
} from "./nathaliaPanelLayout";
export { useNathaliaPanelLayout } from "./useNathaliaPanelLayout";
export type { UseNathaliaPanelLayoutOptions } from "./useNathaliaPanelLayout";

// Actions
export {
  createNathaliaActions,
  nathaliaActions,
  nathaliaRoutes,
} from "./nathaliaActions";
export type {
  NathaliaActionContext,
  NathaliaActionRuntime,
  NathaliaActionRunner,
} from "./nathaliaActions";

// Permissions (RBAC)
export {
  canAccessContext,
  canAnswerTopic,
  canAskAboutApprovals,
  canAskAboutFinance,
  canAskAboutHours,
  canExecuteAction,
  canUseNathalia,
} from "./nathaliaPermissions";
export type { ActionPermission } from "./nathaliaPermissions";

// Intelligence Layer (Fase 8) — local, LLM-free brain.
export {
  NathaliaBrain,
  defaultNathaliaBrain,
  detectIntent,
  KnowledgeRegistry,
  searchKnowledge,
  LocalKnowledgeProvider,
  defaultKnowledgeProvider,
  knowledgeDocuments,
  NathaliaFAQEngine,
  defaultFaqEngine,
  nathaliaFaqEntries,
  ToolRegistry,
  defaultToolRegistry,
  nathaliaTools,
  awarenessForContext,
  awarenessForPath,
  visualForIntent,
  ProactiveEngine,
  defaultProactiveEngine,
  EMPTY_SIGNALS,
  normalizeText,
  tokenize,
  overlapScore,
} from "./intelligence";
export type {
  BrainAnswerSource,
  BrainRequest,
  BrainResponse,
  NathaliaBrainDeps,
  DetectedIntent,
  IntentOptions,
  NathaliaIntentKind,
  KnowledgeDocument,
  KnowledgeHit,
  KnowledgeProvider,
  KnowledgeSearchOptions,
  FaqQueryOptions,
  NathaliaFaqEntry,
  NathaliaFaqMatch,
  NathaliaTool,
  NathaliaToolKind,
  ContextAwareness,
  AwarenessOptions,
  VisualIntelligence,
  VisualIntelOptions,
  NathaliaSignals,
  ProactiveCta,
  ProactiveNudge,
  ProactiveSignal,
  ProactiveTrigger,
} from "./intelligence";

// Types
export type {
  NathaliaActionDefinition,
  NathaliaActionId,
  NathaliaActionSensitivity,
  NathaliaContextDefinition,
  NathaliaContextKey,
  NathaliaIntent,
  NathaliaMessage,
  NathaliaMessageRole,
  NathaliaState,
  NathaliaStateDefinition,
  NathaliaStateKey,
  NathaliaSuggestion,
  NathaliaUser,
  NathaliaWidgetMode,
} from "./nathaliaTypes";
