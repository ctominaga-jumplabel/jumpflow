# Nathal.IA — Assistente do JumpFlow

Nathal.IA é a assistente virtual contextual do JumpFlow. Inspirada na Nathalia
(assistente administrativa de horas), tem estilo 3D caricaturado, amigável e
corporativo: camiseta preta com o logo **jump**, cabelo longo escuro e expressões
simpáticas — algo próximo de "Pixar/Disney corporativo" adaptado a um produto
B2B com linguagem **Neo Brutalism controlado** (Playful Ops).

> **Fase atual: Fase 7 concluída (Artistic Refinement Pass).** Não há LLM
> conectado (Fase 8). O avatar é **híbrido**: o 2D/CSS é o fallback permanente e
> o **3D (WebGL)** pode ser ativado por _feature flag_
> (`NEXT_PUBLIC_ENABLE_NATHALIA_3D=true`), carregando agora o **`master_v2_preview.glb`**
> (Fase 7, com `master_preview.glb` da Fase 5 como fallback via env) de forma
> _lazy_, com os estados emocionais controlando animação, expressões, **piscar
> automático** e **acessórios contextuais**. As respostas seguem sendo _mocks_
> controlados. Ver [`ARTISTIC_REVIEW.md`](./ARTISTIC_REVIEW.md),
> [`ART_DIRECTION_GUIDE.md`](./ART_DIRECTION_GUIDE.md) e
> [`CURRENT_STATE.md`](./CURRENT_STATE.md).

## Documentação da personagem e do pipeline 3D

| Documento | Conteúdo |
| --- | --- |
| [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md) | Personagem canônica: identidade, personalidade, tom de voz, direção visual |
| [`CHARACTER_SHEET_SPEC.md`](./CHARACTER_SHEET_SPEC.md) | Spec da folha de personagem (vistas, closes, expressões, pose-base) |
| [`CHARACTER_REVIEW.md`](./CHARACTER_REVIEW.md) | Review crítico da personagem (forças, riscos, o que preservar/evoluir) — Fase 3B |
| [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md) | **Folha visual definitiva** (vistas, proporções, rosto, cabelo, roupa, paleta, materiais) — Fase 3B |
| [`EXPRESSIONS.md`](./EXPRESSIONS.md) | 10 expressões → shape keys — Fase 3B |
| [`GESTURES.md`](./GESTURES.md) | 8 gestos → Actions canônicas — Fase 3B |
| [`ACCESSORIES.md`](./ACCESSORIES.md) | Acessórios oficiais (clipboard, clock, kanban, report, chart, approval_stamp) — Fase 3B |
| [`MASTER_GLB_BLUEPRINT.md`](./MASTER_GLB_BLUEPRINT.md) | Planta de montagem do `master.glb` (hierarquia, objetos, materiais, rig, shapes, actions) — Fase 3B |
| [`GENERATION_PROMPTS.md`](./GENERATION_PROMPTS.md) | Prompts de geração (Tripo, Meshy, Rodin, Blender AI, imagem) — Fase 3B |
| [`REACT_THREE_FIBER_INTEGRATION.md`](./REACT_THREE_FIBER_INTEGRATION.md) | **Integração 3D no app** (R3F, avatar híbrido, lazy, flag, fallback 2D) — Fase 6 |
| [`MASTER_CHARACTER_BUILD_PLAN.md`](./MASTER_CHARACTER_BUILD_PLAN.md) | Roteiro das 9 etapas de produção do `master.glb` — Fase 4 |
| [`RIG_BLUEPRINT.md`](./RIG_BLUEPRINT.md) | Esqueleto: 16 bones, hierarquia, convenções, bind pose — Fase 4 |
| [`SHAPE_KEYS_BLUEPRINT.md`](./SHAPE_KEYS_BLUEPRINT.md) | 7 shape keys: uso, intensidade, combinações permitidas/proibidas — Fase 4 |
| [`ACTIONS_BLUEPRINT.md`](./ACTIONS_BLUEPRINT.md) | 8 actions: objetivo, duração, loop, blend, contextos — Fase 4 |
| [`ACCESSORY_PIPELINE.md`](./ACCESSORY_PIPELINE.md) | Pipeline técnico dos acessórios (nomenclatura, materiais, escala, encaixe) — Fase 4 |
| [`reports/MASTER_VALIDATION_TEMPLATE.md`](./reports/MASTER_VALIDATION_TEMPLATE.md) | Modelo de relatório de validação do `master.glb` — Fase 4 |
| [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md) | Contrato técnico do `master.glb` (escala, polycount, materiais, rig, shape keys, actions) |
| [`THREE_D_PIPELINE.md`](./THREE_D_PIPELINE.md) | Pipeline conceito → Tripo → Blender → `master.glb` → integração |
| [`BLENDER_AUTOMATION.md`](./BLENDER_AUTOMATION.md) | Blender como fábrica de ativos (comandos de validação/export) |
| [`ANIMATION_GUIDE.md`](./ANIMATION_GUIDE.md) | Movimento, estados → clipes, shape keys, fallback 2D |
| [`ASSET_GUIDE.md`](./ASSET_GUIDE.md) | Guia de produção dos `.glb` |
| [`ASSET_INTAKE_REPORT.md`](./ASSET_INTAKE_REPORT.md) | Intake & validação técnica de `.glb` recebidos + decisões (Fase 3A) |
| [`MASTER_GLB_ACCEPTANCE_CHECKLIST.md`](./MASTER_GLB_ACCEPTANCE_CHECKLIST.md) | Critérios de aceite antes de promover a `master.glb` |
| [`TRIPO_REGENERATION_PROMPT.md`](./TRIPO_REGENERATION_PROMPT.md) | Prompt melhorado para regenerar o base no Tripo |
| [`ARTISTIC_REVIEW.md`](./ARTISTIC_REVIEW.md) | Review crítico conceito vs. modelo V2 (Crítico/Importante/Opcional) — Fase 7 |
| [`ART_DIRECTION_GUIDE.md`](./ART_DIRECTION_GUIDE.md) | **Guia de direção de arte** (o que é / não é, paleta, materiais, leitura) — Fase 7 |
| [`FACE_REFINEMENT_PLAN.md`](./FACE_REFINEMENT_PLAN.md) | Refino do rosto (olhos, sobrancelhas, boca, proporções) — Fase 7 |
| [`HAIR_REFINEMENT_PLAN.md`](./HAIR_REFINEMENT_PLAN.md) | Refino do cabelo (silhueta, volume, mechas) — Fase 7 |
| [`CLOTHING_REFINEMENT_PLAN.md`](./CLOTHING_REFINEMENT_PLAN.md) | Refino da roupa (camiseta/logo, calça, tênis) — Fase 7 |
| [`MATERIAL_REFINEMENT_PLAN.md`](./MATERIAL_REFINEMENT_PLAN.md) | Refino dos 7 materiais (Stylized Premium) — Fase 7 |
| [`EXPRESSION_EVOLUTION.md`](./EXPRESSION_EVOLUTION.md) | Evolução das expressões — 10 shape keys — Fase 7 |
| [`ANIMATION_REFINEMENT_PLAN.md`](./ANIMATION_REFINEMENT_PLAN.md) | Refino de animação — 9 actions (objetivo/duração/loop/blend/contexto) — Fase 7 |
| [`IDLE_BEHAVIOR.md`](./IDLE_BEHAVIOR.md) | Idle Intelligence (piscar, smile pulse, respiração, reduced-motion) — Fase 7 |
| [`ACCESSORY_RUNTIME.md`](./ACCESSORY_RUNTIME.md) | Sistema de acessórios em runtime (build, URL, attach, soft-fail) — Fase 7 |
| [`CONTEXTUAL_VISUAL_STATES.md`](./CONTEXTUAL_VISUAL_STATES.md) | Estado visual por tela (acessório, pose, expressão) — Fase 7 |
| [`reports/MASTER_V2_VALIDATION.md`](./reports/MASTER_V2_VALIDATION.md) | Validação + comparação V1 vs V2 — Fase 7 |
| [`DECISIONS.md`](./DECISIONS.md) | Decisões arquiteturais (ADR leve) |
| [`CURRENT_STATE.md`](./CURRENT_STATE.md) | Estado atual e riscos |
| [`NEXT_PHASES.md`](./NEXT_PHASES.md) | Roadmap das próximas fases |

Scripts do pipeline: [`scripts/nathalia/`](../../scripts/nathalia/) (intake/validação
do `.glb`) e [`scripts/nathalia/blender/`](../../scripts/nathalia/blender/README.md)
(fábrica do `master.glb` — Fase 4).

## Onde fica o código

Pacote: [`packages/character-nathalia`](../../packages/character-nathalia).

```text
packages/character-nathalia/
  src/
    index.ts               # barrel de exportação
    nathaliaTypes.ts       # tipos (estados, contextos, ações, usuário, store)
    nathaliaStates.ts      # catálogo de estados emocionais + acentos por intenção
    nathaliaAnimations.ts  # clipes 3D esperados + fallback 2D (bob/tilt/pulse)
    nathaliaContext.ts     # Context Engine: rota → contexto + config por tela
    nathaliaCopy.ts        # textos pt-BR centralizados (tom de voz)
    nathaliaActions.ts     # "tools" internas mockadas + runtime/binding
    nathaliaPermissions.ts # camada RBAC (canUseNathalia, canExecuteAction, ...)
    nathaliaStore.ts       # emotion engine (store externo + setters imperativos)
    nathalia3D.ts          # config 3D: flag, URL do modelo, probe WebGL, shouldAttempt3D
    NathaliaProvider.tsx   # liga store ↔ React, sincroniza rota/usuário, ações
    NathaliaAvatar.tsx     # avatar HÍBRIDO (variant auto|2d|3d) — decide 2D vs 3D
    NathaliaAvatar2D.tsx   # avatar 2D/CSS (SVG) — fallback permanente
    NathaliaAvatar3DLazy.tsx # fronteira next/dynamic (ssr:false) do 3D
    NathaliaCanvas.tsx     # <Canvas> R3F: luzes, câmera, error boundary (lazy)
    NathaliaModel.tsx      # useGLTF + useAnimations: clipe por estado + shape keys (lazy)
    NathaliaErrorBoundary.tsx # garante o fallback 2D em qualquer erro 3D
    NathaliaBubble.tsx     # balão de fala do widget minimizado
    NathaliaTooltip.tsx    # callout ancorado (tours/dicas)
    NathaliaWidget.tsx     # widget flutuante (canto inferior direito)
    NathaliaChatPanel.tsx  # painel expandido (header, sugestões, log, input)
    NathaliaTour.tsx       # registro e runner de tours
  assets/
    blender/     # master.blend (fonte oficial, Fase 5) — gitignored
    models/      # master_preview.glb (export runtime MVP, Fase 5) — gitignored
    textures/    # texturas
    thumbnails/  # previews 2D
```

> O `.glb` de runtime é servido por `apps/web/public/nathalia/master_preview.glb`
> (sync: `node scripts/nathalia/sync_runtime_model.mjs`). three.js só é importado
> em `NathaliaCanvas`/`NathaliaModel` e carregado via `import()` dinâmico — fora
> do bundle inicial.

Integração no app web:

- `apps/web/src/components/nathalia/NathaliaApp.tsx` — monta provider + widget + tour.
- `apps/web/src/components/nathalia/NathaliaMount.tsx` — `dynamic(..., { ssr:false })` (lazy).
- `apps/web/src/app/app/layout.tsx` — renderiza `<NathaliaMount>` **apenas na área autenticada** (`/app/*`). Não aparece no `/login`.

## Arquitetura

### Emotion Engine (store imperativo)

`nathaliaStore.ts` é um store externo mínimo (compatível com
`useSyncExternalStore`) — sem dependência nova (o projeto não usa Zustand). A API
imperativa pode ser chamada de qualquer lugar no client:

```ts
import {
  setNathaliaState,
  setNathaliaMessage,
  setNathaliaContext,
  openNathalia,
  closeNathalia,
  toggleNathalia,
  notifyNathalia,
} from "@jumpflow/character-nathalia";

setNathaliaState("thinking");
setNathaliaMessage("Estou analisando seus lançamentos...");
setNathaliaContext("hours");
openNathalia();
```

Em componentes React, use o hook `useNathalia()` (estado reativo + ações ligadas
ao host) ou `useNathaliaSnapshot()` (somente estado).

### Context Engine (rota → contexto)

`nathaliaContext.ts` mapeia a rota atual para um contexto estável e define, por
contexto: **mensagem inicial**, **estado visual padrão**, **sugestões rápidas** e
**ações disponíveis**. O `NathaliaProvider` chama `setNathaliaContext(contextForPath(pathname))`
a cada mudança de rota.

| Rota                  | Contexto      |
| --------------------- | ------------- |
| `/app/horas`          | `hours`       |
| `/app/despesas`       | `expenses`    |
| `/app/projetos`       | `projects`    |
| `/app/clientes`       | `clients`     |
| `/app/consultores`    | `consultants` |
| `/app/aprovacoes`     | `approvals`   |
| `/app/relatorios`     | `reports`     |
| `/app/financeiro`     | `finance`     |
| `/app/pagamentos`     | `finance`     |
| `/app/admin`          | `settings`    |
| `/app/dashboard`      | `dashboard`   |
| _fallback_            | `general`     |

### Estados emocionais

`idle, welcome, listening, thinking, searching, explaining, pointing, happy,
warning, error, success, celebrate`. Cada um declara rótulo, descrição, pose 3D
esperada, clipe de animação, mensagem padrão, intenção visual e contexto
recomendado (`nathaliaStates.ts`). A intenção (`neutral/positive/info/attention/negative`)
controla o acento de cor via tokens do tema Playful Ops.

## Como adicionar coisas

### Novo estado

1. Adicione a chave em `NathaliaStateKey` (`nathaliaTypes.ts`).
2. Descreva-o em `nathaliaStates.ts` (pose, animação, mensagem, intenção).
3. Se necessário, adicione o clipe em `nathaliaAnimations.ts` (e o mapa
   `stateToClip` / `morphTargetsForState` para o 3D) e a expressão 2D em
   `NathaliaAvatar2D.tsx` (`expressionFor`).

### Novo contexto

1. Adicione a chave em `NathaliaContextKey` (`nathaliaTypes.ts`).
2. Mapeie a rota em `contextRoutes` (`nathaliaContext.ts`).
3. Defina greeting, estado padrão, sugestões e ações em `nathaliaContexts`.

### Nova ação ("tool")

1. Adicione o id em `NathaliaActionId` (`nathaliaTypes.ts`).
2. Descreva metadados + sensibilidade em `nathaliaActions.ts`.
3. Implemente o binding em `createNathaliaActions` usando o `runtime` (nunca
   importe o router direto no pacote).
4. Garanta a checagem em `canExecuteAction` (`nathaliaPermissions.ts`).

### Novo tour

Adicione uma entrada em `nathaliaTours` (`NathaliaTour.tsx`) com passos
(`targetId`, título, mensagem, estado). Para o highlight funcionar, a tela alvo
deve expor `id`s correspondentes (ex.: `horas-grade`). Sem o `id`, o passo cai em
um callout central, sem quebrar.

## Como conectar uma LLM no futuro

Nada aqui chama OpenAI/Anthropic/etc. Para evoluir:

1. Crie uma rota server (ex.: `app/api/nathalia/route.ts`) que recebe a mensagem
   + contexto + (futuramente) dados autorizados e responde.
2. No `NathaliaProvider`, troque o mock em `sendMessage` por um `fetch` para essa
   rota, mantendo os estados `thinking`/`searching` durante a chamada.
3. Exponha as ações (`nathaliaActions`) como _tools_ para o modelo, **sempre**
   passando por `canExecuteAction` antes de executar.
4. Mantenha a checagem de autorização **no servidor** (ver CLAUDE.md) e nunca
   confie no gating de UI como fronteira de segurança.

## Segurança e RBAC

`nathaliaPermissions.ts` é a camada inicial. Postura desta fase:

- ❌ Não consulta dados reais.
- ❌ Não expõe valores financeiros (apenas explica conceitos).
- ❌ Não aprova, edita ou envia nada automaticamente.
- ✅ Toda ação passa por `canExecuteAction`; ações `sensitive` ficam **bloqueadas**
  e, quando habilitadas, exigirão confirmação explícita.
- ✅ Sugestões/contextos restritos (`approvals`, `finance`, `settings`) são
  ocultados conforme o perfil (`canAccessContext`).

Interface pública: `canUseNathalia`, `canAskAboutHours`, `canAskAboutApprovals`,
`canAskAboutFinance`, `canAccessContext`, `canExecuteAction`.

## Performance

- Carregamento **lazy** via `next/dynamic` com `ssr:false` (`NathaliaMount`).
- Avatar 2D/CSS leve por padrão; o 3D (WebGL) é **opt-in por flag**.
- **three.js fora do bundle inicial:** importado só em `NathaliaCanvas`/
  `NathaliaModel` e alcançado por `import()` dinâmico em `NathaliaAvatar3DLazy`.
- O 3D só é tentado quando `shouldAttempt3D` aprova (flag + WebGL + motion);
  qualquer falha cai para o 2D via `NathaliaErrorBoundary`.
- `prefers-reduced-motion` é respeitado: no modo `auto` cai para 2D; no `3d`
  explícito a animação corporal congela.

## Roadmap sugerido

1. **Refino 3D (Fase 7)** — completar actions, blink/lip-sync animados, combinar
   shape keys × clipes, acessórios e variantes/LODs; promover a `master.glb`.
2. **Dados reais (read-only)** — pendências de horas/aprovações por perfil,
   ainda sem escrita.
3. **LLM** — rota server + tools sob RBAC, com confirmação para ações sensíveis.
4. **Proatividade** — `notifyNathalia` disparado por eventos (prazo de horas,
   reprovação) com controle de frequência.
5. **Acessibilidade & i18n** — externalizar `nathaliaCopy`, revisar leitura por
   leitores de tela e foco.
