# Nathal.IA — Estado Atual

> Snapshot de onde a Nathal.IA está. Atualize ao concluir cada fase.
>
> Última atualização: **2026-06-17** (Fase 8.2 — Visual Parity & Placement; + Fase 8.1 — UX Polish; + Fase 8 — Intelligence Layer).

## Linha do tempo

| Fase | Tema | Status |
| --- | --- | --- |
| **Fase 1** | Fundação de software (pacote, widget, engines, RBAC, fallback 2D) | ✅ Concluída |
| **Fase 2** | Character Bible + Pipeline 3D (docs, specs, automação Blender) | ✅ Concluída |
| **Fase 3A** | Asset Intake & Technical Validation (bancada de intake, validação, decisão) | ✅ Concluída |
| **Fase 3B** | Character Sheet Premium visual (review, sheet, expressões, gestos, acessórios, blueprint, prompts) | ✅ Concluída |
| **Fase 4** | Master Character Pipeline (infraestrutura Blender: build plan, config, validadores, blueprints) | ✅ Concluída |
| **Fase 5** | Master Character canônico (`master.blend` + preview, via reconstrução paramétrica) | ✅ Concluída |
| **Fase 6** | Integração React Three Fiber (avatar 3D híbrido, lazy, opt-in por flag) | ✅ Concluída |
| **Fase 7** | Artistic Refinement Pass (`master_v2`, rosto/cabelo/roupa, expressões, animações, idle, acessórios, estados visuais por tela) | ✅ Concluída |
| **Fase 7.1** | Enquadramento do avatar (`viewMode` bubble/panel/lab, câmera por framing, normalização, crop 2D consistente, controles no Lab) | ✅ Concluída |
| **Fase 8** | Intelligence Layer — cérebro **local sem LLM** (knowledge, FAQ, context awareness V2, tools mockadas, intent engine, visual intelligence, proativo, chat funcional, RBAC, Lab) | ✅ Concluída |
| **Fase 8.1** | UX Polish conversacional (painel seguro por viewport, boas-vindas nominal, presença do launcher) | ✅ Concluída |
| **Fase 8.2** | Visual Parity & Placement (portal `document.body` + `z-[9999]`, bubble forte, rosto protagonista, fallback 2D fiel à referência, Lab com presets) | ✅ Concluída |
| **Fase 8.3** | Visual Reference V3 Alignment (`master_v3` leve alinhado à referência Tripo V3, paleta/olhos/cabelo, 2D fiel, runtime+Lab V2/V3) | ✅ Concluída |
| Fase 9 | Tool Calling + LLM generativo (tools reais, memória, IA generativa) | ⏳ Pendente |

Detalhes das próximas fases: [`NEXT_PHASES.md`](./NEXT_PHASES.md).

## Modelos brutos do Tripo (Fases 3A–3B)

| Modelo | Papel | Medições (modo estrutural) |
| --- | --- | --- |
| `nathalia_tripo_raw.glb` (**v01**) | **Rejeitado** | 54.5 MB · 1 obj · 1 mesh · 1 mat · 3 tex · sem rig/shapes/anim |
| `nathalia_tripo_v02.glb` (**v02**) | **Referência visual oficial aprovada** | 57.1 MB · 1 obj · 1 mesh · 1 mat · 3 tex · sem rig/shapes/anim |

- Ambos em `packages/character-nathalia/assets/raw/` (binários **não versionados** — D-004).
- **v02 aprovado como referência de likeness/silhueta** (direção visual), **não**
  como `master.glb`: continua sendo blob único de ~57 MB, fora do orçamento web
  (≤ 1.5 MB), sem partes separadas, rig ou expressões.
- **Caminho confirmado:** Caminho 1 do intake — **retopo + split + rig + shape
  keys no Blender** (Fase 4), usando a **v02 como guia de forma**. Polycount/
  escala exatos ainda exigem Blender.
- **Detalhes:** [`CHARACTER_REVIEW.md`](./CHARACTER_REVIEW.md) ·
  [`ASSET_INTAKE_REPORT.md`](./ASSET_INTAKE_REPORT.md) · relatório técnico em
  [`../../assets/nathalia/reports/nathalia_tripo_raw.glb.report.md`](../../assets/nathalia/reports/nathalia_tripo_raw.glb.report.md).

## O que já existe

### Software (Fase 1)

- Pacote `@jumpflow/character-nathalia` com:
  - Tipos, estados emocionais, animações (3D esperado + fallback 2D).
  - Context Engine (rota → contexto) e Emotion Engine (store imperativo).
  - Copy pt-BR centralizada (`nathaliaCopy.ts`).
  - Ações ("tools") mockadas + runtime/binding.
  - Camada RBAC conservadora (`nathaliaPermissions.ts`).
  - Widget, balão, tooltip, painel de chat e tours.
  - Avatar **2D/CSS** com seam pronto para 3D (`canRender3D()`).
- Integração no app: `NathaliaApp`, `NathaliaMount` (lazy, `ssr:false`),
  montado só em `/app/*`.
- Slots de assets vazios (`assets/models`, `assets/textures`, `assets/thumbnails`).

### Documentação (Fase 2)

- [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md) — personagem canônica.
- [`CHARACTER_SHEET_SPEC.md`](./CHARACTER_SHEET_SPEC.md) — folha de personagem premium.
- [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md) — contrato técnico do `master.glb`.
- [`THREE_D_PIPELINE.md`](./THREE_D_PIPELINE.md) — pipeline conceito → integração.
- [`BLENDER_AUTOMATION.md`](./BLENDER_AUTOMATION.md) — Blender como fábrica de ativos.
- [`ANIMATION_GUIDE.md`](./ANIMATION_GUIDE.md) — movimento e expressões.
- [`DECISIONS.md`](./DECISIONS.md) — decisões arquiteturais.
- [`NEXT_PHASES.md`](./NEXT_PHASES.md) — roadmap das próximas fases.
- Este `CURRENT_STATE.md`.

### Documentação visual premium (Fase 3B)

- [`CHARACTER_REVIEW.md`](./CHARACTER_REVIEW.md) — review crítico (forças, riscos, o que preservar/evoluir).
- [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md) — **folha visual definitiva** (vistas, proporções, rosto, cabelo, roupa, paleta, materiais).
- [`EXPRESSIONS.md`](./EXPRESSIONS.md) — 10 expressões → shape keys.
- [`GESTURES.md`](./GESTURES.md) — 8 gestos → Actions canônicas.
- [`ACCESSORIES.md`](./ACCESSORIES.md) — acessórios oficiais (clipboard, clock, kanban, report, chart, approval_stamp).
- [`MASTER_GLB_BLUEPRINT.md`](./MASTER_GLB_BLUEPRINT.md) — planta de montagem do `master.glb`.
- [`GENERATION_PROMPTS.md`](./GENERATION_PROMPTS.md) — prompts (Tripo, Meshy, Rodin, Blender AI, imagem).

### Documentação e fábrica Blender (Fase 4)

- [`MASTER_CHARACTER_BUILD_PLAN.md`](./MASTER_CHARACTER_BUILD_PLAN.md) — roteiro das 9 etapas (importar→...→export).
- [`RIG_BLUEPRINT.md`](./RIG_BLUEPRINT.md) — esqueleto (16 bones, hierarquia, convenções, bind pose).
- [`SHAPE_KEYS_BLUEPRINT.md`](./SHAPE_KEYS_BLUEPRINT.md) — 7 shape keys (uso, intensidade, combinações).
- [`ACTIONS_BLUEPRINT.md`](./ACTIONS_BLUEPRINT.md) — 8 actions (objetivo, duração, loop, blend, contextos).
- [`ACCESSORY_PIPELINE.md`](./ACCESSORY_PIPELINE.md) — pipeline técnico dos acessórios (nomenclatura, materiais, escala, encaixe).
- [`reports/MASTER_VALIDATION_TEMPLATE.md`](./reports/MASTER_VALIDATION_TEMPLATE.md) — modelo de relatório de validação.

### Pipeline (Fases 2 e 4)

- `scripts/nathalia/` (Fase 2/3A) — intake/validação do `.glb`:
  - `validate_glb.py`, `inspect_glb.py`, `generate_asset_report.py` (operam sobre `.glb` reais).
  - `normalize_master.py`, `export_variants.py`, `generate_thumbnails.py` (stubs seguros).
  - `nathalia_assets.config.json` (contrato único de caminhos/limites/listas).
- `scripts/nathalia/blender/` (Fase 4) — **fábrica do `master.glb`**:
  - `build_master.py` (orquestrador das 9 etapas).
  - `validate_master.py`, `validate_rig.py`, `validate_shape_keys.py`, `validate_actions.py` (validadores independentes).
  - `report_master.py` (consolida PASS/WARNING/FAIL; grava `.md`).
  - `export_master_glb.py`, `export_preview_images.py` (export/preview; só com `--apply`).
  - `pipeline_common.py` (helper compartilhado), `master_character_config.json` (contrato de build).
  - Tudo degrada sem Blender e não escreve sem `--apply`/`--write`.

### Master Character canônico (Fase 5)

- **`master.blend` construído** (`packages/character-nathalia/assets/blender/`) —
  fonte oficial reconstruída por código (`construct_master.py`): 7 objetos, 7
  materiais `MAT_*`, rig de 16 bones, 7 shape keys, 3 actions MVP.
- **`master_preview.glb`** (`.../assets/models/`, ~154 KB, ~8,5k tris) + thumbnails
  (`assets/nathalia/thumbnails/{front,side,back,three_quarter}.png`).
- Validação automática: [`reports/MASTER_VALIDATION_REPORT.md`](./reports/MASTER_VALIDATION_REPORT.md)
  (objetos/materiais/rig/shape keys **PASS**; actions WARNING pelas 5 adiadas).
- Docs: [`MASTER_CHARACTER_RELEASE.md`](./MASTER_CHARACTER_RELEASE.md),
  [`MASTER_CHARACTER_STRATEGY.md`](./MASTER_CHARACTER_STRATEGY.md),
  [`reports/REFERENCE_ANALYSIS.md`](./reports/REFERENCE_ANALYSIS.md).

### Integração 3D no app (Fase 6)

- **Avatar híbrido** (`NathaliaAvatar` com prop `variant="auto"|"2d"|"3d"`):
  decide 2D vs 3D em runtime via `shouldAttempt3D` (flag + WebGL + reduced motion).
- **Stack R3F lazy** (`three` + `@react-three/fiber` + `@react-three/drei`),
  isolada em `NathaliaCanvas.tsx`/`NathaliaModel.tsx` e carregada por
  `next/dynamic` (`ssr:false`) — **three fora do bundle inicial**.
- **Feature flag** `NEXT_PUBLIC_ENABLE_NATHALIA_3D` (default `false`) e URL
  configurável `NEXT_PUBLIC_NATHALIA_3D_MODEL_URL`.
- **Estados → clipes** (`Idle`/`Wave`/`Thinking`) e **shape keys de repouso** por
  estado; **fallback 2D garantido** por error boundary (D-007).
- GLB servido em `apps/web/public/nathalia/` (sync: `scripts/nathalia/sync_runtime_model.mjs`).
- Detalhes: [`REACT_THREE_FIBER_INTEGRATION.md`](./REACT_THREE_FIBER_INTEGRATION.md).

### Refinamento artístico V2 (Fase 7)

- **`master_v2.blend` + `master_v2_preview.glb`** (~260 KB, ~11k tris, 9 anims, 10
  shape keys) construídos por `scripts/nathalia/blender/construct_master_v2.py`,
  **preservando o contrato** (7 objetos, 7 materiais, 16 bones). V1 permanece
  intacto. Validação `report_master` **PASS** em tudo — relatório polido em
  [`reports/MASTER_V2_VALIDATION.md`](./reports/MASTER_V2_VALIDATION.md).
- **Rosto** com sobrancelhas, íris e boca (embutidos no Body via slot `MAT_Hair`,
  deformáveis pelas shape keys); **cabelo** com mais volume/mechas e franja
  assimétrica; **roupa** com gola, punhos, solado/biqueira e wordmark redimensionado.
- **Expressões:** 10 shape keys (+ `Curious`, `Greeting`, `Celebrate`).
  **Animações:** 9 actions (+ `Pointing`, `Explaining`, `Celebrate`, `Typing`,
  `Alert`, `Greeting`) com `Idle` mais vivo.
- **6 acessórios** (`clipboard`, `clock`, `kanban`, `report`, `chart`,
  `approval_stamp`) como GLBs próprios (`construct_accessories.py`), anexados em
  runtime e sincronizados para `public/nathalia/accessories/`.
- **Idle Intelligence** (piscar aleatório + smile pulse via `useFrame`),
  **sistema de acessórios** e **estados visuais por tela** no pacote
  (`nathaliaIdle.ts`, `nathaliaAccessories.ts`, `nathaliaVisualStates.ts`); avatar
  3D default aponta para o `master_v2_preview.glb` (V1 via env como fallback).
- Docs: [`ARTISTIC_REVIEW.md`](./ARTISTIC_REVIEW.md),
  [`FACE_REFINEMENT_PLAN.md`](./FACE_REFINEMENT_PLAN.md),
  [`HAIR_REFINEMENT_PLAN.md`](./HAIR_REFINEMENT_PLAN.md),
  [`CLOTHING_REFINEMENT_PLAN.md`](./CLOTHING_REFINEMENT_PLAN.md),
  [`MATERIAL_REFINEMENT_PLAN.md`](./MATERIAL_REFINEMENT_PLAN.md),
  [`EXPRESSION_EVOLUTION.md`](./EXPRESSION_EVOLUTION.md),
  [`ANIMATION_REFINEMENT_PLAN.md`](./ANIMATION_REFINEMENT_PLAN.md),
  [`IDLE_BEHAVIOR.md`](./IDLE_BEHAVIOR.md),
  [`ACCESSORY_RUNTIME.md`](./ACCESSORY_RUNTIME.md),
  [`CONTEXTUAL_VISUAL_STATES.md`](./CONTEXTUAL_VISUAL_STATES.md),
  [`ART_DIRECTION_GUIDE.md`](./ART_DIRECTION_GUIDE.md).

### Enquadramento do avatar (Fase 7.1)

- **Problema:** no widget flutuante a Nathal.IA aparecia minúscula (a câmera fazia
  _auto-fit_ do corpo inteiro), com rosto/expressão/acessório ilegíveis.
- **`viewMode`** em `NathaliaAvatar`/`NathaliaCanvas` (default `"bubble"`):
  - `bubble` → close-up/busto (rosto + ombros + tronco superior, ~75–90% do
    círculo; **nunca** corpo inteiro) — botão flutuante e header do painel.
  - `panel` → meio corpo (cintura para cima).
  - `lab` → corpo completo, livre, com controles.
- **Normalização** no `NathaliaModel`: o `.glb` é medido e normalizado para
  altura unitária centrado na origem — enquadramento independe dos metros reais;
  acessórios escalam junto. Props novas `modelScale`/`modelPosition`.
- **Câmera por framing** (`nathaliaFraming.ts`, puro/_three-free_):
  `resolveNathaliaFraming` (preset + `zoom`/`cameraY`/`modelScale`/`modelPosition`
  com _clamp_) alimenta o `NathaliaCameraRig` (`position`/`lookAt`/`fov`).
- **Fallback 2D consistente:** o avatar SVG aplica o mesmo crop por `viewMode`
  (`nathalia2DTransform`), então alternar 3D↔2D (flag off, sem WebGL, _reduced
  motion_, erro) não muda o enquadramento. Wrapper 3D com `overflow-hidden
  rounded-full`.
- **Lab** (`/app/dev/nathalia`): seletor de `viewMode` + _sliders_ de zoom,
  câmera Y e escala, com preview ampliado.
- **Sem mudança** em RBAC, Intelligence Layer, LLM/tooling ou no GLB.
- Detalhes: [`REACT_THREE_FIBER_INTEGRATION.md`](./REACT_THREE_FIBER_INTEGRATION.md) §10.

### Camada de inteligência local (Fase 8)

- **Cérebro local sem LLM** em `packages/character-nathalia/src/intelligence/`
  (puro, SSR-safe, sem React/`window`/`three`):
  - **Knowledge Layer** — `KnowledgeDocument`/`KnowledgeRegistry`/
    `KnowledgeProvider`/`KnowledgeSearch` + base curada (`documents.ts`).
  - **FAQ Engine** — `hours/projects/approvals/reports/settings` +
    `NathaliaFAQEngine` (match por palavras-chave, RBAC).
  - **Context Awareness V2** — mensagem específica por tela + capacidades +
    perguntas sugeridas (`contextAwareness.ts`).
  - **Tool Registry** — tools **mockadas** (navegação/UI/tour), **sem escrita**,
    sobre as actions existentes (`tools/ToolRegistry.ts`).
  - **Intent Engine** — regras determinísticas (navegar/explicar/ensinar/tour/
    dúvida/saudação) (`intent/IntentEngine.ts`).
  - **Visual Intelligence** — intenção → estado → acessório → clipe
    (`visual/visualIntelligence.ts`).
  - **Proactive Engine** — nudges seguros e de-duplicados (`proactive/`).
  - **Orquestrador** `NathaliaBrain.ask` (`brain/NathaliaBrain.ts`).
- **Chat funcional** — `NathaliaProvider.sendMessage` agora usa o cérebro local
  (intent → FAQ/knowledge → resposta + estado visual + tool segura); painel
  reflete acessório do cérebro e follow-ups dinâmicos.
- **RBAC ampliado** — `canAnswerTopic`; documentos/FAQs/tools filtrados por perfil;
  navegação a tela restrita bloqueada na origem.
- **Nathal.IA Lab** — rota dev `/app/dev/nathalia` (404 em produção) para testar
  contexto, estado, acessório, intents, respostas e nudges sob perfil simulado.
- **Sem dependência de LLM.** Documentação:
  [`INTELLIGENCE_ARCHITECTURE.md`](./INTELLIGENCE_ARCHITECTURE.md),
  [`KNOWLEDGE_BASE.md`](./KNOWLEDGE_BASE.md),
  [`INTELLIGENCE_GUIDE.md`](./INTELLIGENCE_GUIDE.md),
  [`FAQ_GUIDE.md`](./FAQ_GUIDE.md), [`TOOLING_GUIDE.md`](./TOOLING_GUIDE.md),
  [`PROACTIVE_GUIDE.md`](./PROACTIVE_GUIDE.md),
  [`INTELLIGENCE_SECURITY.md`](./INTELLIGENCE_SECURITY.md).

### Visual Parity & Placement (Fase 8.2)

- **Problema:** em várias telas autenticadas o avatar não aparecia, aparecia
  pequeno demais, ou o painel abria parcialmente fora da viewport — porque o
  widget `position: fixed` ficava preso em containers de página com
  `transform`/`overflow`/`will-change` (ex.: wrappers `motion.div`), que viram
  bloco de contenção e recortam/escondem o `fixed`.
- **Camada raiz própria (`NathaliaRoot`)** — o launcher, painel e tour são
  renderizados via **portal em `document.body`**, numa camada dedicada
  `z-[9999]` (host `position: relative`, zero-size, `pointer-events: none` para
  não bloquear cliques). Isso escapa de qualquer stacking/overflow/transform que
  cada tela introduza, então a Nathal.IA **aparece em todas as telas** e nunca é
  coberta por cards/tabelas. O `NathaliaProvider` fica fora do portal — o context
  continua fluindo (portais preservam a posição na árvore React).
- **Bubble forte** — launcher ~88px (avatar 80px, ~90% do círculo), com disco
  suave por estado (`accent.chip`) ecoando os badges “Sempre com você” da
  referência. Posicionamento `fixed` com **safe-area insets**.
- **Rosto protagonista** — preset `bubble` mais agressivo (câmera 3D mais perto e
  mirando o rosto; crop 2D mais fechado) mostrando rosto + ombros + tronco
  superior, **nunca corpo inteiro**.
- **Fallback 2D fiel à referência** — olhos grandes com cílios, sobrancelhas
  marcadas, cabelo castanho-escuro, **camiseta preta com a marca chevron laranja
  da jumpflow** e disco colorido por estado.
- **Lab** (`/app/dev/nathalia`) — comparação bubble/panel/lab lado a lado, preset
  **“Avatar_NathIA reference”**, botão **“Copiar preset atual”** e nota sobre a
  camada `z-[9999]`/portal.
- **Preservado:** fallback 2D, feature flag 3D, RBAC e Intelligence Layer; **sem
  LLM**. Relatório: [`VISUAL_PARITY_REPORT.md`](./VISUAL_PARITY_REPORT.md);
  detalhes em [`REACT_THREE_FIBER_INTEGRATION.md`](./REACT_THREE_FIBER_INTEGRATION.md) §11
  e [`UX_POLISH_REPORT.md`](./UX_POLISH_REPORT.md).

### Visual Reference V3 Alignment (Fase 8.3)

- **Referência V3 (Tripo):** novo modelo `assets/raw/nathalia_tripo_v03.glb`
  (1.85M tris / 55 MB, sem rig/shapes/anim) adotado como **referência visual** —
  **nunca** como runtime. Análise em [`VISUAL_REFERENCE_V3_REVIEW.md`](./VISUAL_REFERENCE_V3_REVIEW.md),
  plano priorizado em [`V3_ALIGNMENT_PLAN.md`](./V3_ALIGNMENT_PLAN.md).
- **`master_v3` (reconstrução leve):** `scripts/nathalia/blender/refine_master_v3.py`
  abre `master_v2.blend` e refina por **recolor + escala** (olhos maiores, cabelo
  mais volumoso, paleta quente, camiseta preta, logo laranja, calça creme, tênis
  preto), preservando o contrato (7 obj / 7 mat / 16 bones / 10 shape keys / 9
  actions). Gera `master_v3.blend` + `master_v3_preview.glb` (~260 KB, ~11.3k tris)
  + thumbnails `v3/*`. Validação **PASS** — [`reports/MASTER_V3_VALIDATION.md`](./reports/MASTER_V3_VALIDATION.md);
  comparação em [`V2_VS_V3_COMPARISON.md`](./V2_VS_V3_COMPARISON.md).
- **Fallback 2D alinhado à V3** (`NathaliaAvatar2D.tsx`): olhos maiores, cabelo mais
  cheio, sorriso de repouso mais visível, pele quente, camiseta preta + chevron laranja.
- **Runtime:** `master_v3_preview.glb` vira o **modelo padrão**
  (`DEFAULT_NATHALIA_3D_MODEL_URL`); `master_v2_preview.glb` é o fallback 3D
  (`NATHALIA_3D_MODEL_FALLBACK_URL`); 2D segue como fallback principal e a feature
  flag 3D continua valendo. Nova prop `modelUrl` em `NathaliaAvatar`. Sync atualizado.
- **Lab** (`/app/dev/nathalia`): seletor de modelo **V2/V3** + preset
  **“visual-reference-v03”**.
- **Preservado:** Intelligence Layer, RBAC, R3F e fallback 2D; **sem LLM**. O GLB
  Tripo pesado **não entra no app**.

## O que ainda falta

- **Promoção a `master.glb` de runtime** — o `master_preview.glb` é derivado; a
  promoção segue o `MASTER_GLB_ACCEPTANCE_CHECKLIST.md` (ADR-010) + `validate_glb.py`.
- **Refino visual** (face esculpida, junções, dobras) sobre a mesma base modular,
  e **completar as 5 actions** + enriquecer shape keys (Fase 7).
- **Character Sheet Premium textual concluída** (Fase 3B); faltam as **imagens**
  (turnaround, closes, expressões) — produzir a partir dos prompts em
  [`GENERATION_PROMPTS.md`](./GENERATION_PROMPTS.md).
- **Refino de animação 3D** — só 3 clipes; shape keys estáticas; sem blink/lip-sync
  animado; acessórios/interatividade são slots reservados — Fase 7.
- **Sem LLM generativa conectada** — Fase 9 (a Fase 8 entregou o cérebro local
  determinístico; falta a IA generativa, tools reais e memória).
- Os scripts da fábrica (`scripts/nathalia/blender/`) rodam como **estrutura
  preparada**: validam a cena/`.glb` no Blender e degradam fora dele, mas só
  geram `master.glb`/previews com `--apply` (Fase 5). `normalize_master.py`,
  `export_variants.py` e `generate_thumbnails.py` (Fase 2) seguem stubs até haver
  um `master.glb`.

## Riscos

- **Binários pesados:** `.glb` e texturas não devem ir para o Git comum (usar
  LFS/storage). Risco de inchar o repositório se ignorado.
- **Consistência de personagem:** geração assistida (Tripo) pode divergir do
  Character Bible — mitigado por revisão obrigatória contra a Bible/Sheet.
- **Mapeamento de animações:** nomes de clipe do pacote ≠ nomes canônicos do
  `master.glb`; precisa reconciliar na Fase 5 (validação é tolerante por isso).
- **Performance web:** orçamento de polígonos/texturas apertado para manter o
  avatar leve; validar cedo.
- **Dependência de ferramenta externa (Tripo):** usar só para o modelo base
  reduz o lock-in.

## Próximos passos imediatos

1. (Opcional) Produzir as **imagens** da Character Sheet (turnaround/closes/
   expressões) a partir de [`GENERATION_PROMPTS.md`](./GENERATION_PROMPTS.md),
   usando a **v02** como likeness-alvo — para alimentar o Blender com referência.
2. **Fase 5 — rodar a fábrica:** seguir o
   [`MASTER_CHARACTER_BUILD_PLAN.md`](./MASTER_CHARACTER_BUILD_PLAN.md)
   (importar v02 como referência → retopo → split → rig → shape keys → actions),
   conforme os blueprints e [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md).
3. **Instalar Blender** e rodar os validadores (`scripts/nathalia/blender/*` e
   `validate_glb.py`) no resultado antes de promover.
4. Promover a `master.glb` somente após cumprir o
   [`MASTER_GLB_ACCEPTANCE_CHECKLIST.md`](./MASTER_GLB_ACCEPTANCE_CHECKLIST.md) (ADR-010).

(ver [`NEXT_PHASES.md`](./NEXT_PHASES.md) para detalhes.)
