# Nathal.IA — Próximas Fases

> Roadmap a partir da Fase 4 (concluída). Estado atual em
> [`CURRENT_STATE.md`](./CURRENT_STATE.md).

## Resumo

| Fase | Tema | Status | Entregável-chave |
| --- | --- | --- | --- |
| 3A | Asset Intake & Validation | ✅ | bancada de intake + decisão |
| 3B | Character Sheet Premium visual | ✅ | review, sheet premium, expressões, gestos, acessórios, blueprint, prompts |
| 4 | Master Character Pipeline | ✅ | fábrica Blender: build plan, config, validadores, blueprints |
| 5 | Master Character canônico (`master.blend`) | ✅ | `master.blend` + `master_preview.glb` validados |
| 6 | React Three Fiber | ✅ | avatar 3D híbrido, lazy e opt-in por flag |
| 7 | Artistic Refinement Pass | ✅ | `master_v2`, rosto/cabelo/roupa, 10 shape keys, 9 actions, idle intelligence, acessórios, estados visuais por tela |
| **8** | **Tool Calling + LLM** | ⏳ | tools reais + LLM + memória + proatividade |

---

## Fase 3 — Character Sheet (concluída)

**Fase 3A (✅):** intake e validação técnica dos `.glb` recebidos (ADR-010);
v01 rejeitado.

**Fase 3B (✅):** documentação visual definitiva da personagem —
[`CHARACTER_REVIEW.md`](./CHARACTER_REVIEW.md),
[`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md),
[`EXPRESSIONS.md`](./EXPRESSIONS.md), [`GESTURES.md`](./GESTURES.md),
[`ACCESSORIES.md`](./ACCESSORIES.md),
[`MASTER_GLB_BLUEPRINT.md`](./MASTER_GLB_BLUEPRINT.md),
[`GENERATION_PROMPTS.md`](./GENERATION_PROMPTS.md). **v02 aprovado como
referência visual**.

---

## Fase 4 — Master Character Pipeline (concluída)

**Objetivo (atingido):** construir a **fábrica** que transforma a referência
(v02) no `master.glb`, sem ainda gerar o binário.

- [`MASTER_CHARACTER_BUILD_PLAN.md`](./MASTER_CHARACTER_BUILD_PLAN.md) — 9 etapas.
- Blueprints: [`RIG_BLUEPRINT.md`](./RIG_BLUEPRINT.md),
  [`SHAPE_KEYS_BLUEPRINT.md`](./SHAPE_KEYS_BLUEPRINT.md),
  [`ACTIONS_BLUEPRINT.md`](./ACTIONS_BLUEPRINT.md),
  [`ACCESSORY_PIPELINE.md`](./ACCESSORY_PIPELINE.md).
- Fábrica Blender em [`scripts/nathalia/blender/`](../../scripts/nathalia/blender/README.md):
  `build_master.py`, validadores (`validate_master/rig/shape_keys/actions`),
  `report_master.py`, `export_master_glb.py`, `export_preview_images.py`,
  `master_character_config.json`, `pipeline_common.py`.
- Modelo de relatório em
  [`reports/MASTER_VALIDATION_TEMPLATE.md`](./reports/MASTER_VALIDATION_TEMPLATE.md).

**Saída:** infraestrutura completa, validadores rodando (degradam sem Blender),
**nenhum `master.glb` gerado** — isso é a Fase 5.

---

## Fase 5 — Master Character canônico (concluída)

**Objetivo (atingido):** construir o **primeiro `master.blend` canônico** rodando
a fábrica no Blender 5.1.2, usando a **v02 como referência** (não como geometria).

- **Reconstrução paramétrica low-poly** (não decimate da v02): 7 objetos
  nomeados, 7 materiais `MAT_*` da paleta oficial, wordmark `jump` no peito.
- **Rig** de 16 bones + skinning automático ([`RIG_BLUEPRINT.md`](./RIG_BLUEPRINT.md)).
- **7 shape keys** ([`SHAPE_KEYS_BLUEPRINT.md`](./SHAPE_KEYS_BLUEPRINT.md)) e
  **3 actions MVP** (`Idle`/`Wave`/`Thinking`) — as 5 restantes ficam para a Fase 7.
- Escala/origem/orientação normalizadas; **validação automática** (`report_master`)
  → [`reports/MASTER_VALIDATION_REPORT.md`](./reports/MASTER_VALIDATION_REPORT.md).
- Exportado **`master_preview.glb`** (~154 KB, ~8,5k tris) + thumbnails.
- Builder versionado: `scripts/nathalia/blender/construct_master.py`
  (`blender --background --python construct_master.py -- --apply`).

**Saída:** `master.blend` (fonte oficial) + preview + thumbnails. Detalhes em
[`MASTER_CHARACTER_RELEASE.md`](./MASTER_CHARACTER_RELEASE.md),
[`MASTER_CHARACTER_STRATEGY.md`](./MASTER_CHARACTER_STRATEGY.md) e
[`reports/REFERENCE_ANALYSIS.md`](./reports/REFERENCE_ANALYSIS.md). A promoção a
`master.glb` (runtime) segue o
[`MASTER_GLB_ACCEPTANCE_CHECKLIST.md`](./MASTER_GLB_ACCEPTANCE_CHECKLIST.md) (ADR-010).

---

## Fase 6 — React Three Fiber (integração 3D) — concluída

**Objetivo (atingido):** ligar o 3D ao app de forma progressiva e segura, com o
fallback 2D intacto.

- Adicionadas as dependências `three` + `@react-three/fiber` + `@react-three/drei`
  (peer deps opcionais do pacote; deps de `apps/web`).
- Avatar **híbrido** `NathaliaAvatar` (`variant="auto"|"2d"|"3d"`) + extração do
  2D para `NathaliaAvatar2D`.
- `NathaliaModel.tsx` (`useGLTF` + `useAnimations`, clipe por estado + shape keys
  de repouso) e `NathaliaCanvas.tsx` (luzes, câmera, fundo transparente,
  reduced-motion, error boundary).
- Carregamento **lazy** via `next/dynamic` (`ssr:false`) em
  `NathaliaAvatar3DLazy` — **three fora do bundle inicial**.
- **Feature flag** `NEXT_PUBLIC_ENABLE_NATHALIA_3D` (default `false`) +
  `shouldAttempt3D` (flag + WebGL + reduced motion); `canRender3D()` atualizado.
- Mapas `stateToClip` / `morphTargetsForState` em `nathaliaAnimations.ts`.

**Saída:** avatar 3D opt-in no app, com fallback 2D garantido. Detalhes em
[`REACT_THREE_FIBER_INTEGRATION.md`](./REACT_THREE_FIBER_INTEGRATION.md).

---

## Fase 7 — Artistic Refinement Pass (concluída)

**Objetivo (atingido):** transformar a personagem técnica MVP em um personagem
visualmente marcante, expressivo e consistente com o JumpFlow — **sem** quebrar o
contrato, o pipeline, os validadores nem a compatibilidade da Fase 6.

- **`master_v2.blend` + `master_v2_preview.glb`** (`construct_master_v2.py`):
  rosto (sobrancelhas/íris/boca), cabelo (volume/mechas/franja), roupa
  (gola/punhos/solado/logo), materiais refinados — mantendo 7 objetos / 7
  materiais / 16 bones. Validação `report_master` **PASS**.
- **Expressões:** 10 shape keys (+ `Curious`, `Greeting`, `Celebrate`).
  **Animações:** 9 actions (+ `Pointing`/`Explaining`/`Celebrate`/`Typing`/
  `Alert`/`Greeting`) e `Idle` mais vivo.
- **Idle Intelligence** (piscar aleatório + smile pulse), **6 acessórios**
  oficiais como GLBs próprios (`construct_accessories.py`) anexados em runtime, e
  **estados visuais por tela** (`nathaliaVisualStates.ts`).
- Docs: [`ARTISTIC_REVIEW.md`](./ARTISTIC_REVIEW.md),
  [`ART_DIRECTION_GUIDE.md`](./ART_DIRECTION_GUIDE.md),
  [`FACE_REFINEMENT_PLAN.md`](./FACE_REFINEMENT_PLAN.md),
  [`HAIR_REFINEMENT_PLAN.md`](./HAIR_REFINEMENT_PLAN.md),
  [`CLOTHING_REFINEMENT_PLAN.md`](./CLOTHING_REFINEMENT_PLAN.md),
  [`MATERIAL_REFINEMENT_PLAN.md`](./MATERIAL_REFINEMENT_PLAN.md),
  [`EXPRESSION_EVOLUTION.md`](./EXPRESSION_EVOLUTION.md),
  [`ANIMATION_REFINEMENT_PLAN.md`](./ANIMATION_REFINEMENT_PLAN.md),
  [`IDLE_BEHAVIOR.md`](./IDLE_BEHAVIOR.md),
  [`ACCESSORY_RUNTIME.md`](./ACCESSORY_RUNTIME.md),
  [`CONTEXTUAL_VISUAL_STATES.md`](./CONTEXTUAL_VISUAL_STATES.md),
  [`reports/MASTER_V2_VALIDATION.md`](./reports/MASTER_V2_VALIDATION.md).

**Pendências herdadas (não bloqueiam):** bone-follow real dos acessórios na mão,
brow/eyelid como deformadores próprios, LODs via `export_variants.py`, e a
promoção formal a `master.glb` de runtime (ADR-010).

**Saída:** Nathal.IA V2 — biblioteca de expressões, animações, acessórios e
comportamento de vida consistentes, mais próxima do conceito original.

---

## Fase 8 — Tool Calling + LLM (tools reais e memória)

**Objetivo:** tornar a Nathal.IA realmente inteligente, com segurança.

- Rota server (ex.: `app/api/nathalia/route.ts`) recebendo mensagem + contexto +
  dados autorizados.
- Trocar o mock de `sendMessage` por `fetch` à rota, mantendo `thinking`/`searching`.
- Expor `nathaliaActions` como **tools** do modelo, sempre via `canExecuteAction`.
- Autorização **no servidor** (CLAUDE.md); confirmação para ações sensíveis.
- Memória/contexto persistente do usuário (com consentimento e RBAC).
- **Proatividade** governada: a Nathal.IA sugere ações pertinentes ao contexto
  (pendências, prazos, fechamentos) usando os estados visuais e acessórios da
  Fase 7 — sempre opt-in e sem expor dado sensível sem permissão.

**Saída:** assistente com LLM real, tools governadas, memória e proatividade.

---

## Regras transversais (valem para todas as fases)

- **Sem regressão do fallback 2D** (D-007).
- **Binários pesados fora do Git comum** (D-004) até definição de LFS/storage.
- **Validação antes de integrar** qualquer `.glb` (D-009).
- **RBAC e autorização no servidor** antes de qualquer dado real ou ação sensível.
