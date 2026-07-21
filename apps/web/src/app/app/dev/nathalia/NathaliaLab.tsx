"use client";

import { useMemo, useState } from "react";
import {
  awarenessForContext,
  closeNathalia,
  defaultNathaliaBrain,
  detectIntent,
  NATHALIA_ANIMATION_STATES,
  NATHALIA_EXPRESSIONS,
  NATHALIA_VISEMES,
  Nathalia2DApp,
  Nathalia2DAvatar,
  NathaliaExpression,
  nathaliaVoiceReference,
  nathaliaContexts,
  nathaliaEngine,
  nathaliaLayersPresent,
  NathaliaVisemePreview,
  nathaliaStateList,
  openNathalia,
  ProactiveEngine,
  resolveNathaliaPanelLayout,
  sayNathalia,
  setNathaliaContext,
  setNathaliaFollowUps,
  setNathaliaState,
  useNathaliaSnapshot,
  type BrainResponse,
  type DetectedIntent,
  type NathaliaAnimationState,
  type NathaliaContextKey,
  type NathaliaExpressionKey,
  type NathaliaStateKey,
  type NathaliaViewMode,
  type NathaliaVisemeKey,
  type ProactiveNudge,
  type ProactiveTrigger,
} from "@jumpflow/character-nathalia";

/** Viewport presets exercised by the panel-positioning section. */
const VIEWPORT_PRESETS: { label: string; width: number; height: number }[] = [
  { label: "Pequena (360×640)", width: 360, height: 640 },
  { label: "Paisagem curta (820×420)", width: 820, height: 420 },
  { label: "Média (768×1024)", width: 768, height: 1024 },
  { label: "Grande (1440×900)", width: 1440, height: 900 },
  { label: "Ultrawide (1920×1080)", width: 1920, height: 1080 },
];

const VIEW_MODES: NathaliaViewMode[] = ["bubble", "panel", "lab"];

const FLOW_VIDEO_CLIPS = [
  "idle_loop",
  "welcome_wave",
  "listening",
  "thinking",
  "explaining",
  "pointing",
  "success_thumbs_up",
  "warning_attention",
  "celebrate",
  "goodbye",
  "hours_clipboard",
  "projects_kanban",
  "approvals_badge",
  "reports_chart",
] as const;

/** Roles available in the simulator (mirrors the host RoleName catalog). */
const ALL_ROLES = [
  "ADMIN",
  "CONSULTANT",
  "PROJECT_MANAGER",
  "AREA_MANAGER",
  "FINANCE",
  "PEOPLE",
  "SALES",
] as const;

const PROACTIVE_TRIGGERS: ProactiveTrigger[] = [
  "first-visit",
  "first-screen-visit",
  "user-lost",
  "tour-available",
];

const contextKeys = Object.keys(nathaliaContexts) as NathaliaContextKey[];

export interface NathaliaLabProps {
  initialRoles: string[];
}

/**
 * Nathal.IA Lab — a development-only playground for the **2D** companion. Drive
 * the visual state/mood, exercise expressions and visemes (simulated lip-sync),
 * preview the display modes (launcher / bubble / panel), trigger the animations,
 * and test the local brain (intent, FAQ/knowledge, tools, proactive nudges)
 * under a simulated profile. Uses only the public package API + the imperative
 * store/engine; no LLM, no 3D.
 */
export function NathaliaLab({ initialRoles }: NathaliaLabProps) {
  const snapshot = useNathaliaSnapshot();
  const [roles, setRoles] = useState<string[]>(initialRoles);
  const simUser = useMemo(() => ({ id: "lab-user", name: "Lab", roles }), [roles]);

  const [question, setQuestion] = useState("");
  const [intent, setIntent] = useState<DetectedIntent | null>(null);
  const [response, setResponse] = useState<BrainResponse | null>(null);

  const [viewMode, setViewMode] = useState<NathaliaViewMode>("bubble");
  const [cycleVisemes, setCycleVisemes] = useState(false);

  // Layered avatar (opt-in Nathalia2DAvatar) testbed — independent of the store.
  const [layAnimation, setLayAnimation] = useState<NathaliaAnimationState>("idle");
  const [layContext, setLayContext] = useState<NathaliaContextKey>("general");
  const [layViewMode, setLayViewMode] = useState<NathaliaViewMode>("lab");
  const [laySpeaking, setLaySpeaking] = useState(false);
  const [layScale, setLayScale] = useState(180);
  const [layDark, setLayDark] = useState(false);

  const proactiveEngine = useMemo(() => new ProactiveEngine(), []);
  const [nudge, setNudge] = useState<ProactiveNudge | null>(null);
  const [nudgeNote, setNudgeNote] = useState<string>("");

  const awareness = awarenessForContext(snapshot.context, { roles });

  function toggleRole(role: string) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  function runBrain() {
    if (!question.trim()) return;
    setIntent(detectIntent(question, { context: snapshot.context }));
    const res = defaultNathaliaBrain.ask({
      question,
      context: snapshot.context,
      user: simUser,
    });
    setResponse(res);
  }

  function applyToWidget() {
    if (!response) return;
    setNathaliaState(response.visual.state);
    sayNathalia(question, "user");
    nathaliaEngine.speak(response.answer, { mood: "speaking" });
    setNathaliaFollowUps(response.followUps);
    openNathalia();
  }

  function fireProactive(trigger: ProactiveTrigger) {
    const result = proactiveEngine.evaluate({
      trigger,
      context: snapshot.context,
      user: simUser,
      isOpen: false,
      roles,
    });
    setNudge(result);
    setNudgeNote(result ? "" : "Nenhum nudge (já disparado, sem regra ou sem permissão).");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-black text-strong">Nathal.IA Lab</h1>
        <p className="text-sm text-medium">
          Ambiente de desenvolvimento da companheira <b>2D</b>. Teste humores,
          expressões, visemas (fala simulada), modos de exibição, animações,
          contexto e o cérebro local — tudo sem LLM e sem 3D.
        </p>
      </header>

      {/* Role simulator */}
      <section className="rounded-card border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_var(--color-ink)]">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-soft">
          Perfil simulado (RBAC)
        </h2>
        <div className="flex flex-wrap gap-2">
          {ALL_ROLES.map((role) => (
            <ControlChip
              key={role}
              active={roles.includes(role)}
              onClick={() => toggleRole(role)}
            >
              {role}
            </ControlChip>
          ))}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Live preview + display modes + animations */}
        <section className="rounded-card border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_var(--color-ink)]">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-soft">
            Pré-visualização ao vivo
          </h2>
          <div className="flex items-center gap-4">
            <Nathalia2DApp
              state={snapshot.state}
              context={snapshot.context}
              size={180}
              viewMode={viewMode}
              showSafeArea
            />
            <dl className="space-y-1 text-sm text-strong">
              <div>
                <dt className="inline font-semibold">Estado: </dt>
                <dd className="inline">{snapshot.state}</dd>
              </div>
              <div>
                <dt className="inline font-semibold">Contexto: </dt>
                <dd className="inline">{snapshot.context}</dd>
              </div>
              <div>
                <dt className="inline font-semibold">Falando: </dt>
                <dd className="inline">{snapshot.speaking ? "sim" : "não"}</dd>
              </div>
            </dl>
          </div>

          {/* Display modes */}
          <p className="mb-1 mt-4 text-xs font-semibold text-soft">
            Modo de exibição (enquadramento)
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            {VIEW_MODES.map((m) => (
              <ControlChip key={m} active={viewMode === m} onClick={() => setViewMode(m)}>
                {m}
              </ControlChip>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openNathalia()}
              className="rounded-md border-2 border-ink bg-brand px-3 py-1 text-xs font-semibold text-white shadow-[2px_2px_0_0_var(--color-ink)]"
            >
              Abrir painel
            </button>
            <button
              type="button"
              onClick={() => closeNathalia()}
              className="rounded-md border border-border bg-canvas px-3 py-1 text-xs font-medium text-medium hover:border-brand hover:text-brand"
            >
              Fechar (launcher)
            </button>
          </div>

          {/* Animations */}
          <p className="mb-1 mt-4 text-xs font-semibold text-soft">Animações</p>
          <div className="flex flex-wrap gap-2">
            <ControlChip onClick={() => nathaliaEngine.speak("Deixa comigo, estou explicando…")}>
              falar (lip-sync)
            </ControlChip>
            <ControlChip onClick={() => nathaliaEngine.celebrate("Boa! 🎉")}>
              comemorar
            </ControlChip>
            <ControlChip onClick={() => nathaliaEngine.alert("Atenção por aqui!")}>
              alerta
            </ControlChip>
            <ControlChip onClick={() => nathaliaEngine.setMood("thinking")}>
              pensando
            </ControlChip>
            <ControlChip onClick={() => nathaliaEngine.setMood("idle")}>
              idle
            </ControlChip>
          </div>
        </section>

        <section className="rounded-card border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_var(--color-ink)]">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-soft">
            Voz da Nath
          </h2>
          <p className="mb-3 text-sm text-medium">
            Amostra oficial para validar a identidade vocal antes de gerar falas
            novas com um provedor de voz personalizada.
          </p>
          <audio controls preload="metadata" className="w-full">
            {nathaliaVoiceReference.assets.map((asset) => (
              <source key={asset.format} src={asset.src} type={asset.mimeType} />
            ))}
          </audio>
          <dl className="mt-3 grid gap-2 text-xs text-medium sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-strong">Amostra</dt>
              <dd>{nathaliaVoiceReference.displayName}</dd>
            </div>
            <div>
              <dt className="font-semibold text-strong">Duracao</dt>
              <dd>{(nathaliaVoiceReference.durationMs / 1000).toFixed(1)}s</dd>
            </div>
            <div>
              <dt className="font-semibold text-strong">Origem</dt>
              <dd className="break-all">{nathaliaVoiceReference.sourceFile}</dd>
            </div>
            <div>
              <dt className="font-semibold text-strong">Uso</dt>
              <dd>Amostra de referencia, com consentimento obrigatorio.</dd>
            </div>
          </dl>
        </section>

        {/* Context awareness */}
        <section className="rounded-card border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_var(--color-ink)]">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-soft">
            Context Awareness
          </h2>
          <p className="text-sm font-medium text-strong">{awareness.message}</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-soft">
            Capacidades
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm text-medium">
            {awareness.capabilities.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-card border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_var(--color-ink)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-soft">
            Google Flow videos
          </h2>
          <span className="rounded-full border border-border bg-canvas px-2 py-0.5 text-[11px] font-medium text-medium">
            WebM alpha + MP4 fallback
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW_VIDEO_CLIPS.map((clip) => (
            <div key={clip} className="rounded-card border border-border bg-canvas p-2">
              <div className="grid aspect-[9/16] place-items-center overflow-hidden rounded-md bg-[linear-gradient(45deg,#e5e7eb_25%,transparent_25%),linear-gradient(-45deg,#e5e7eb_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e5e7eb_75%),linear-gradient(-45deg,transparent_75%,#e5e7eb_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0]">
                <video
                  className="h-full w-full object-contain"
                  controls
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  poster={`/nathalia/videos/flow/${clip}-poster.png`}
                >
                  <source src={`/nathalia/videos/flow/${clip}.webm`} type="video/webm" />
                  <source src={`/nathalia/videos/flow/${clip}.mp4`} type="video/mp4" />
                </video>
              </div>
              <p className="mt-2 break-words text-xs font-semibold text-strong">{clip}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Layered avatar testbed (Nathalia2DAvatar) */}
      <section className="rounded-card border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_var(--color-ink)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-soft">
            Avatar em camadas (Nathalia2DAvatar)
          </h2>
          <span className="rounded-full border border-border bg-canvas px-2 py-0.5 text-[11px] font-medium text-medium">
            flag: NEXT_PUBLIC_NATHALIA_2D_LAYERED
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-[auto_1fr]">
          {/* Stage */}
          <div
            className={[
              "grid place-items-center rounded-card border-2 border-ink p-6",
              layDark ? "bg-ink" : "bg-canvas",
            ].join(" ")}
            style={{ minWidth: 260 }}
          >
            <Nathalia2DAvatar
              animation={layAnimation}
              context={layContext}
              speaking={laySpeaking}
              size={layScale}
              viewMode={layViewMode}
            />
          </div>

          {/* Controls */}
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-soft">Estado de animação</p>
              <div className="flex flex-wrap gap-2">
                {NATHALIA_ANIMATION_STATES.map((a) => (
                  <ControlChip key={a} active={layAnimation === a} onClick={() => setLayAnimation(a)}>
                    {a}
                  </ControlChip>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold text-soft">Contexto (rosto de repouso + objeto)</p>
              <div className="flex flex-wrap gap-2">
                {contextKeys.map((c) => (
                  <ControlChip key={c} active={layContext === c} onClick={() => setLayContext(c)}>
                    {c}
                  </ControlChip>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="mb-1 text-xs font-semibold text-soft">Enquadramento</p>
                <div className="flex flex-wrap gap-2">
                  {VIEW_MODES.map((m) => (
                    <ControlChip key={m} active={layViewMode === m} onClick={() => setLayViewMode(m)}>
                      {m}
                    </ControlChip>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <ControlChip active={laySpeaking} onClick={() => setLaySpeaking((s) => !s)}>
                  {laySpeaking ? "parar fala" : "falar (lip-sync)"}
                </ControlChip>
                <ControlChip active={layDark} onClick={() => setLayDark((d) => !d)}>
                  {layDark ? "fundo claro" : "fundo escuro"}
                </ControlChip>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-soft" htmlFor="lay-scale">
                Escala: {layScale}px
              </label>
              <input
                id="lay-scale"
                type="range"
                min={48}
                max={320}
                step={4}
                value={layScale}
                onChange={(e) => setLayScale(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <p className="text-xs text-medium">
              Camadas com arte hoje:{" "}
              {Object.entries(nathaliaLayersPresent)
                .map(([k, v]) => `${k}=${v ? "sim" : "não"}`)
                .join(" · ")}
              . Sem corpo/poses, o avatar compõe rosto + boca + objeto e cai para o
              busto expressivo (ver NEXT_STEPS_LIVE2D.md).
            </p>
          </div>
        </div>
      </section>

      {/* Visual controls: state / context */}
      <section className="rounded-card border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_var(--color-ink)]">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-soft">
          Estados (humores)
        </h2>
        <div className="mb-4 flex flex-wrap gap-2">
          {nathaliaStateList.map((s) => (
            <ControlChip
              key={s.key}
              active={snapshot.state === s.key}
              onClick={() => setNathaliaState(s.key as NathaliaStateKey)}
            >
              {s.key}
            </ControlChip>
          ))}
        </div>

        <p className="mb-1 text-xs font-semibold text-soft">Contexto</p>
        <div className="flex flex-wrap gap-2">
          {contextKeys.map((c) => (
            <ControlChip
              key={c}
              active={snapshot.context === c}
              onClick={() => setNathaliaContext(c)}
            >
              {c}
            </ControlChip>
          ))}
        </div>
      </section>

      {/* Expressions grid */}
      <section className="rounded-card border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_var(--color-ink)]">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-soft">
          Expressões ({NATHALIA_EXPRESSIONS.length})
        </h2>
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 md:grid-cols-6">
          {NATHALIA_EXPRESSIONS.map((expr: NathaliaExpressionKey) => (
            <figure key={expr} className="flex flex-col items-center gap-1">
              <NathaliaExpression expression={expr} size={72} />
              <figcaption className="text-[11px] font-medium text-medium">{expr}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Visemes grid + simulated speech */}
      <section className="rounded-card border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_var(--color-ink)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-soft">
            Visemas ({NATHALIA_VISEMES.length}) — fala simulada
          </h2>
          <ControlChip active={cycleVisemes} onClick={() => setCycleVisemes((v) => !v)}>
            {cycleVisemes ? "parar ciclo" : "tocar fala (ciclar)"}
          </ControlChip>
        </div>
        <div className="mb-4 flex items-center gap-4">
          <NathaliaVisemePreview cycle={cycleVisemes} size={96} />
          <p className="text-sm text-medium">
            O avatar troca a boca entre visemas para simular fala. Em runtime isso
            é disparado por <code className="rounded bg-canvas px-1">speak()</code>{" "}
            ou pelo TTS futuro (ver <code className="rounded bg-canvas px-1">LIPSYNC_PLAN.md</code>).
          </p>
        </div>
        <div className="grid grid-cols-4 gap-4 sm:grid-cols-6 md:grid-cols-12">
          {NATHALIA_VISEMES.map((v: NathaliaVisemeKey) => (
            <figure key={v} className="flex flex-col items-center gap-1">
              <NathaliaVisemePreview viseme={v} size={52} />
              <figcaption className="text-[11px] font-medium text-medium">{v}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Brain / intent tester */}
      <section className="rounded-card border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_var(--color-ink)]">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-soft">
          Cérebro local (intent + resposta)
        </h2>
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runBrain();
            }}
            placeholder="Ex.: Como lançar horas?"
            className="min-w-0 flex-1 rounded-md border border-border bg-canvas px-3 py-2 text-sm text-strong outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={runBrain}
            className="rounded-md border-2 border-ink bg-brand px-4 py-2 text-sm font-semibold text-white shadow-[2px_2px_0_0_var(--color-ink)]"
          >
            Perguntar
          </button>
        </div>

        {intent ? (
          <p className="mt-3 text-sm text-medium">
            <span className="font-semibold text-strong">Intent:</span>{" "}
            {intent.kind} · conf. {intent.confidence.toFixed(2)}
            {intent.targetContext ? ` · alvo: ${intent.targetContext}` : ""}
            {intent.matched ? ` · gatilho: "${intent.matched}"` : ""}
          </p>
        ) : null}

        {response ? (
          <div className="mt-3 space-y-2 rounded-card border border-border bg-canvas p-3 text-sm">
            <p className="text-strong">{response.answer}</p>
            <p className="text-xs text-soft">
              fonte: <b>{response.source}</b> · estado: <b>{response.visual.state}</b>
              {response.tool ? (
                <>
                  {" "}
                  · tool: <b>{response.tool.id}</b>
                </>
              ) : null}
            </p>
            {response.followUps.length > 0 ? (
              <p className="text-xs text-medium">
                follow-ups: {response.followUps.join(" · ")}
              </p>
            ) : null}
            <button
              type="button"
              onClick={applyToWidget}
              className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-semibold text-strong hover:border-brand hover:text-brand"
            >
              Aplicar no widget
            </button>
          </div>
        ) : null}
      </section>

      {/* Proactive tester */}
      <section className="rounded-card border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_var(--color-ink)]">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-soft">
          Proativo (eventos seguros)
        </h2>
        <div className="flex flex-wrap gap-2">
          {PROACTIVE_TRIGGERS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => fireProactive(t)}
              className="rounded-full border-2 border-ink bg-surface px-3 py-1 text-xs font-semibold text-strong hover:-translate-y-px"
            >
              {t}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              proactiveEngine.reset();
              setNudge(null);
              setNudgeNote("Engine resetada.");
            }}
            className="rounded-full border border-border bg-canvas px-3 py-1 text-xs font-medium text-medium"
          >
            reset
          </button>
        </div>
        {nudge ? (
          <p className="mt-3 text-sm text-strong">
            <b>{nudge.trigger}:</b> {nudge.message}
            {nudge.action ? ` (tool: ${nudge.action})` : ""}
          </p>
        ) : nudgeNote ? (
          <p className="mt-3 text-sm text-medium">{nudgeNote}</p>
        ) : null}
      </section>

      {/* Panel positioning */}
      <section className="rounded-card border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_var(--color-ink)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-soft">
            Posicionamento do painel
          </h2>
          <button
            type="button"
            onClick={() => openNathalia()}
            className="rounded-md border-2 border-ink bg-brand px-3 py-1 text-xs font-semibold text-white shadow-[2px_2px_0_0_var(--color-ink)]"
          >
            Abrir painel ao vivo
          </button>
        </div>
        <p className="mb-3 text-sm text-medium">
          Resolução do tamanho/ancoragem por viewport. Em telas estreitas ou
          baixas o painel vira uma folha quase cheia; nunca ultrapassa a borda.
          O launcher e o painel são renderizados via portal em{" "}
          <code className="rounded bg-canvas px-1">document.body</code> numa
          camada dedicada <code className="rounded bg-canvas px-1">z-[9999]</code>.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-soft">
                <th className="border-b border-border py-2 pr-4">Viewport</th>
                <th className="border-b border-border py-2 pr-4">Ancoragem</th>
                <th className="border-b border-border py-2 pr-4">Largura</th>
                <th className="border-b border-border py-2 pr-4">Altura</th>
                <th className="border-b border-border py-2">Ajustado?</th>
              </tr>
            </thead>
            <tbody>
              {VIEWPORT_PRESETS.map((vp) => {
                const l = resolveNathaliaPanelLayout({
                  viewportWidth: vp.width,
                  viewportHeight: vp.height,
                });
                return (
                  <tr key={vp.label} className="text-strong">
                    <td className="border-b border-border py-2 pr-4">{vp.label}</td>
                    <td className="border-b border-border py-2 pr-4">
                      <span
                        className={[
                          "rounded-full border px-2 py-0.5 text-xs font-semibold",
                          l.placement === "sheet"
                            ? "border-marker bg-warning-soft text-warning"
                            : "border-ink bg-brand-soft text-brand-dark",
                        ].join(" ")}
                      >
                        {l.placement}
                      </span>
                    </td>
                    <td className="border-b border-border py-2 pr-4 font-mono">
                      {Math.round(l.width)}px
                    </td>
                    <td className="border-b border-border py-2 pr-4 font-mono">
                      {Math.round(l.height)}px
                    </td>
                    <td className="border-b border-border py-2 text-xs text-medium">
                      {l.constrainedWidth || l.constrainedHeight
                        ? [l.constrainedWidth ? "largura" : null, l.constrainedHeight ? "altura" : null]
                            .filter(Boolean)
                            .join(" + ")
                        : "não"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** Spec-named alias — the Debug Lab. */
export const NathaliaDebugLab = NathaliaLab;

function ControlChip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-ink bg-brand-soft text-brand-dark"
          : "border-border bg-canvas text-medium hover:border-brand hover:text-brand",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
