# Nathal.IA — Integração React Three Fiber (Fase 6)

> **Status: Fase 6 concluída.** A Nathal.IA 3D pode ser ativada por _feature
> flag_, carrega o `.glb` de forma _lazy_ e os estados emocionais controlam a
> animação. O avatar **2D/CSS continua sendo o fallback permanente** (D-007) e
> nenhuma dependência 3D entra no bundle inicial.

Esta fase é **integração técnica segura**, não refino artístico. O objetivo é
ligar o `master_preview.glb` (Fase 5) ao app com React Three Fiber, sem quebrar
SSR, sem tornar o 3D obrigatório e sem mexer em RBAC, LLM ou ações sensíveis.

---

## 1. Arquitetura

O avatar passou a ser **híbrido**. Um único componente público (`NathaliaAvatar`)
decide, em runtime, entre o avatar 2D/CSS e o avatar 3D WebGL.

```text
NathaliaWidget / NathaliaChatPanel / NathaliaTooltip
        │  <NathaliaAvatar state=… variant="auto" … />
        ▼
NathaliaAvatar (híbrido, SEM three)            ── src/NathaliaAvatar.tsx
        │
        ├── shouldAttempt3D(variant,{reducedMotion})  ── src/nathalia3D.ts
        │        (flag + WebGL + reduced motion)
        │
        ├── NÃO → NathaliaAvatar2D (SVG/CSS)    ── src/NathaliaAvatar2D.tsx
        │
        └── SIM → NathaliaAvatar3DLazy          ── src/NathaliaAvatar3DLazy.tsx
                     │  next/dynamic(import("./NathaliaCanvas"), { ssr:false })
                     ▼   ── fronteira de code-splitting (three entra só aqui) ──
                  NathaliaCanvas (R3F <Canvas>, luzes, câmera)  ── src/NathaliaCanvas.tsx
                     │   └── NathaliaErrorBoundary → fallback 2D
                     ▼
                  NathaliaModel (useGLTF + useAnimations)        ── src/NathaliaModel.tsx
                     └── clip por estado + shape keys (resting)
```

Pontos-chave da arquitetura:

- **`three` / `@react-three/fiber` / `@react-three/drei` só são importados em
  `NathaliaCanvas.tsx` e `NathaliaModel.tsx`.** Esses módulos **não** são
  reexportados do barrel (`index.ts`) e só são alcançados pelo `import()`
  dinâmico em `NathaliaAvatar3DLazy`. Resultado: o three.js fica num _chunk_
  separado, fora do bundle inicial.
- **A decisão 3D acontece depois do mount** (`useEffect` → `mounted`), então o
  primeiro paint é sempre o 2D — sem _hydration mismatch_ e sem _probe_ de WebGL
  no servidor.
- **SSR intacto:** todo o stack 3D é `ssr:false`. Além disso, o app já monta a
  Nathal.IA via `NathaliaMount` (`dynamic(..., { ssr:false })`).

---

## 2. Dependências

Adicionadas em `apps/web` (e declaradas como `peerDependencies` _opcionais_ do
pacote `@jumpflow/character-nathalia`):

| Pacote | Versão | Papel |
| --- | --- | --- |
| `three` | `^0.180.0` | engine WebGL |
| `@react-three/fiber` | `^9.x` | renderer React para three (React 19) |
| `@react-three/drei` | `^10.x` | helpers (`useGLTF`, `useAnimations`, `Bounds`, `Center`) |
| `@types/three` | `^0.180.0` | tipos (dev) |

As versões 9.x (fiber) / 10.x (drei) são as compatíveis com **React 19 / Next 16**.

---

## 3. Caminho do GLB (runtime)

- **Fonte oficial:** `packages/character-nathalia/assets/blender/master.blend` (Fase 5).
- **Export de runtime (MVP):** `packages/character-nathalia/assets/models/master_preview.glb`
  (~154 KB, ~8,5k tris) — derivado do `.blend`.
- **Servido por HTTP:** `apps/web/public/nathalia/master_preview.glb` →
  URL `"/nathalia/master_preview.glb"`.

Como os `.glb` são **gitignored** (`*.glb`), o arquivo público é populado por um
script de sync (não versionado):

```bash
node scripts/nathalia/sync_runtime_model.mjs
```

A URL é configurável por env var (default `/nathalia/master_preview.glb`):

```bash
NEXT_PUBLIC_NATHALIA_3D_MODEL_URL=/nathalia/master_preview.glb
# ou um CDN/bucket: https://.../nathalia/master.glb
```

> **Futuro `master.glb`:** quando o preview for promovido a `master.glb`
> (ADR-010 / `MASTER_GLB_ACCEPTANCE_CHECKLIST.md`), basta trocar o arquivo
> servido (ou a env var). **A API React não muda.**

---

## 4. Como ativar o 3D

O 3D é **opt-in**. Por padrão (`NEXT_PUBLIC_ENABLE_NATHALIA_3D` ausente) o app
usa o avatar 2D.

1. Garanta o GLB em `public/nathalia/` (`node scripts/nathalia/sync_runtime_model.mjs`).
2. Defina a env var e reinicie o dev server / rebuild:

   ```bash
   NEXT_PUBLIC_ENABLE_NATHALIA_3D=true
   ```

3. (Opcional) Force por componente, ignorando a flag global:

   ```tsx
   <NathaliaAvatar variant="3d" state="welcome" />   // tenta 3D se houver WebGL
   <NathaliaAvatar variant="2d" />                   // sempre 2D
   <NathaliaAvatar variant="auto" />                 // default: flag + WebGL + motion
   ```

Mesmo com a flag ligada, o 3D só roda se houver **WebGL** e o usuário **não**
estiver em _reduced motion_ (no modo `auto`).

---

## 5. Estados e animações suportados

O `master_preview.glb` MVP traz **3 clipes**: `Idle`, `Wave`, `Thinking`. O mapa
estado → clipe vive em `src/nathaliaAnimations.ts` (`stateToClip` / `clipForState`):

| Estado | Clipe 3D |
| --- | --- |
| `idle` | `Idle` |
| `welcome` | `Wave` |
| `listening` | `Idle` |
| `thinking` | `Thinking` |
| `searching` | `Thinking` |
| `explaining` | `Thinking` |
| `pointing` | `Thinking` |
| `happy` | `Idle` |
| `warning` | `Thinking` |
| `error` | `Thinking` |
| `success` | `Wave` |
| `celebrate` | `Wave` |

- Clipes `Idle`/`Thinking` fazem **loop**; `Wave` toca **uma vez** e retorna ao
  `Idle` (cross-fade de 0,3 s).
- A troca de estado (via Emotion Engine → `state` no `NathaliaAvatar`) dispara o
  cross-fade automaticamente.

### Shape keys (expressões)

O `Body_mesh` expõe os morph targets `Smile, Blink_L, Blink_R, Thinking,
Surprised, Sad, OpenMouth`. O `NathaliaModel` aplica **pesos de repouso** por
estado (`morphTargetsForState`), zerando ao sair do estado. Se a malha não
expuser morph targets, é **no-op** seguro.

> **TODO (Fase 7):** animar piscar (`Blink_L/R`) e fala (`OpenMouth`) ao longo
> do tempo (via `useFrame`), além de combinar shape keys com clipes corporais
> mais ricos. Ver `EXPRESSIONS.md` e `SHAPE_KEYS_BLUEPRINT.md`.

---

## 6. Fallback 2D e tratamento de erros (ETAPA 9)

O avatar 2D/CSS é usado, **sem quebrar**, em todos estes casos:

| Situação | Como cai para 2D |
| --- | --- |
| Flag desligada | `shouldAttempt3D("auto")` → false |
| WebGL indisponível | `hasWebGLSupport()` → false |
| `prefers-reduced-motion` (modo auto) | `shouldAttempt3D` → false |
| Antes do mount / SSR | `mounted` ainda false → 2D |
| GLB ausente / 404 | `useGLTF` lança → `NathaliaErrorBoundary` → fallback 2D |
| Erro de WebGL / animação / render | `NathaliaErrorBoundary` → fallback 2D |

No modo `variant="3d"` explícito a flag é ignorada (opt-in do chamador), mas o
fallback por WebGL/erro continua valendo. Em _reduced motion_ + 3D explícito, o
modelo congela a animação corporal (timeScale 0) em vez de animar.

---

## 7. Limitações do MVP

- Apenas 3 clipes (`Idle`/`Wave`/`Thinking`); vários estados compartilham clipe.
- Shape keys são **estáticas** (pesos de repouso), sem blink/lip-sync animado.
- Acessórios (`accessory`) e interatividade (`isInteractive`) são **slots
  reservados** — não fazem nada ainda.
- O `.glb` é o **preview** da Fase 5 (reconstrução paramétrica low-poly), não o
  `master.glb` final refinado.
- Os `.glb` não são versionados; o asset público depende do sync script (ou de
  LFS/CDN em produção).

---

## 8. Próximos refinamentos (Fase 7+)

- Completar as 5 actions restantes e enriquecer o `Idle`.
- Blink loop + lip-sync (`OpenMouth`) e combinação shape keys × clipes por estado.
- Acessórios oficiais derivados do `master.glb` (`ACCESSORY_PIPELINE.md`).
- Variantes/LODs (`export_variants.py`) e promoção a `master.glb` (ADR-010).
- _Preload_ inteligente do chunk + GLB ao abrir o painel.

---

## 9. Arquivos desta fase

| Arquivo | Papel |
| --- | --- |
| `src/nathalia3D.ts` | flag, URL do modelo, probe WebGL, `shouldAttempt3D` |
| `src/NathaliaAvatar.tsx` | híbrido 2D/3D com prop `variant` |
| `src/NathaliaAvatar2D.tsx` | avatar SVG/CSS (extraído, fallback permanente) |
| `src/NathaliaAvatar3DLazy.tsx` | fronteira `next/dynamic` (`ssr:false`) |
| `src/NathaliaCanvas.tsx` | `<Canvas>` R3F: luzes, câmera, error boundary |
| `src/NathaliaModel.tsx` | `useGLTF` + `useAnimations`, clip + shape keys |
| `src/NathaliaErrorBoundary.tsx` | garante o fallback 2D em erro |
| `src/nathaliaAnimations.ts` | `stateToClip`, `morphTargetsForState` (novos) |
| `apps/web/public/nathalia/` | GLB servido por HTTP (gitignored) |
| `scripts/nathalia/sync_runtime_model.mjs` | copia o GLB para `public/` |

---

## 10. Enquadramento do avatar — `viewMode` (Fase 7.1)

> **Problema corrigido:** no widget flutuante a Nathal.IA aparecia minúscula —
> a câmera fazia _auto-fit do corpo inteiro_ (`<Bounds fit>`), então rosto,
> expressão e acessório ficavam ilegíveis. O enquadramento agora é **explícito
> por contexto de uso**, priorizando rosto + ombros + tronco superior no bubble.

Esta fase mexe **somente em renderização/câmera/escala/crop** — não toca em
RBAC, Intelligence Layer, LLM/tooling nem no GLB.

### Normalização do modelo

O `NathaliaModel` mede a _bounding box_ do `.glb` uma vez e o **normaliza para
altura unitária, centrado na origem** (`y ∈ [-0.5, +0.5]`: pés em `-0.5`,
cintura ~`0`, ombros ~`+0.3`, rosto ~`+0.38`, topo da cabeça em `+0.5`). Assim o
enquadramento independe das dimensões reais (metros) do modelo, e os acessórios
— filhos do grupo normalizado — escalam junto, mantendo o encaixe.

### Presets de câmera (`src/nathaliaFraming.ts`, _three-free_)

| `viewMode` | Crop | `targetY` | `distance` | `fov` | Uso |
| --- | --- | --- | --- | --- | --- |
| `"bubble"` (default) | close-up / busto (rosto, ombros, tronco superior) | `0.34` | `0.85` | `30°` | botão flutuante, header do painel |
| `"panel"` | meio corpo (cintura para cima) | `0.16` | `1.55` | `32°` | painel expandido |
| `"lab"` | corpo completo, livre | `0.02` | `2.1` | `35°` | `/app/dev/nathalia`, com controles |

O bubble **nunca** tenta mostrar o corpo inteiro; o personagem ocupa ~75–90% do
círculo. O wrapper 3D usa `overflow-hidden rounded-full`, então o busto sangra
até a borda sem vazar do círculo.

### Props (em `NathaliaAvatar` → `NathaliaCanvas` → `NathaliaModel`)

```tsx
<NathaliaAvatar
  viewMode="bubble"        // "bubble" | "panel" | "lab"  (default "bubble")
  zoom={1}                 // >1 aproxima, <1 afasta (divide distance)
  cameraY={0}              // desloca o alvo da câmera (pan vertical)
  modelScale={1}           // multiplica a escala normalizada
  modelPosition={[0,0,0]}  // offset extra em espaço normalizado
/>
```

`resolveNathaliaFraming(viewMode, overrides)` combina preset + overrides (com
_clamp_ defensivo) e devolve `{ targetY, distance, fov, modelScale,
modelPosition }`. O `NathaliaCameraRig` posiciona a câmera (`position`/`lookAt`/
`fov`) e re-roda quando o enquadramento muda — é também o "controle de câmera"
usado pelos _sliders_ do Lab.

### Consistência do fallback 2D

O avatar 2D/CSS recebe o mesmo `viewMode` e aplica um _transform_ de escala com
pivô sobre o grupo do personagem dentro do clip circular
(`nathalia2DTransform`): bubble dá _zoom_ no rosto/busto, panel mostra um pouco
mais, lab fica 1:1. O fundo do círculo não escala. Resultado: 2D e 3D mostram o
**mesmo crop**, então alternar entre eles (flag off, sem WebGL, _reduced
motion_, erro de render) não muda o enquadramento percebido.

### Reduced motion / WebGL / flag

Inalterados: o `viewMode` só decide o _crop_. _Reduced motion_ continua
congelando a animação corporal; falha de WebGL e flag desligada continuam caindo
para o 2D — agora com o mesmo enquadramento.

### Lab — controles de câmera

`/app/dev/nathalia` ganhou seletor de `viewMode` + _sliders_ de **zoom**,
**câmera Y** e **escala do modelo** (com "Resetar enquadramento"), aplicados ao
preview ampliado (160 px). Útil para calibrar presets sem rebuild.

| Arquivo (Fase 7.1) | Papel |
| --- | --- |
| `src/nathaliaFraming.ts` | presets/overrides de enquadramento + `nathalia2DTransform` (puro, _three-free_) |
| `src/NathaliaModel.tsx` | normalização para altura unitária + `modelScale`/`modelPosition` |
| `src/NathaliaCanvas.tsx` | `NathaliaCameraRig` (câmera por framing), props de `viewMode`/`zoom`/… |
| `src/NathaliaAvatar.tsx` / `NathaliaAvatar2D.tsx` | repasse do `viewMode`; crop 2D consistente |
| `apps/web/.../dev/nathalia/NathaliaLab.tsx` | controles de zoom/câmera |
```

---

## §11 — Visual Parity & Placement (Fase 8.2)

> **Status: concluída.** Correção de visibilidade/posicionamento do avatar no app
> e aproximação visual da referência aprovada `Avatar_NathIA.png`. Sem mexer em
> RBAC, Intelligence Layer, LLM ou no GLB.

### Camada raiz via portal (`NathaliaRoot`)

O problema nº 1 desta fase: um launcher `position: fixed` **não** está sempre
ancorado à viewport. Qualquer ancestral com `transform`, `filter`, `perspective`,
`will-change` ou `contain` (muito comum em wrappers `motion.div` de página) vira
o **bloco de contenção** do `fixed` e o recorta pelo `overflow`, empurra para
fora da tela ou o esconde. Em telas diferentes isso fazia a Nathal.IA sumir.

`NathaliaRoot` resolve renderizando launcher + painel + tour por **portal em
`document.body`**:

- Host: `<div data-nathalia-root>` com `position: relative`, `z-index: 9999`,
  `pointer-events: none`, zero-size. Isso cria **um stacking context no topo**
  (acima de sidebar z-40, topbar z-30, modais z-50) sem virar bloco de contenção
  (só `transform`/etc. capturam `fixed`; `relative` não) e sem bloquear cliques.
- Os filhos `fixed` (launcher/tour) reabilitam `pointer-events: auto` em si
  mesmos e continuam ancorados à viewport.
- `NathaliaProvider` fica **fora** do portal; o React mantém a posição do portal
  na árvore de componentes, então o context flui normalmente para dentro dele.

```
<NathaliaProvider user={user}>
  <NathaliaRoot>            {/* portal → document.body, z-[9999] */}
    <NathaliaWidget />
    <NathaliaTour />
  </NathaliaRoot>
</NathaliaProvider>
```

### Bubble forte + rosto protagonista

- Launcher ~88px (avatar 80px, ~90% do círculo) com **safe-area insets**
  (`max(1rem, env(safe-area-inset-*))`).
- Disco suave por estado (`accent.chip`) atrás do canvas transparente (3D) e do
  SVG (2D) — ecoa os badges “Sempre com você” da referência.
- Preset `bubble` mais agressivo: 3D `distance 0.85→0.66`, `targetY 0.34→0.38`,
  `fov 30→28`; 2D `scale 1.5→1.85`, `originY 40→44`. Mostra rosto + ombros +
  tronco superior; **nunca** corpo inteiro. As relações com `panel`/`lab` (e os
  testes de `framing`) seguem válidas.

### Fallback 2D fiel à referência

`NathaliaAvatar2D` foi redesenhado para aproximar a personagem aprovada: olhos
grandes com cílios e _catchlight_, sobrancelhas marcadas, cabelo castanho-escuro,
**camiseta preta com a marca chevron laranja da jumpflow** e disco colorido por
estado. Continua dependency-free, SSR-safe e respeita _reduced motion_.

### Lab

`/app/dev/nathalia`: comparação **bubble/panel/lab** lado a lado, preset
**“Avatar_NathIA reference”**, **“Copiar preset atual”** (clipboard) e nota sobre
a camada `z-[9999]`/portal.

| Arquivo (Fase 8.2) | Papel |
| --- | --- |
| `src/NathaliaRoot.tsx` | portal `document.body` + camada `z-[9999]` (novo) |
| `src/NathaliaWidget.tsx` | bubble ~88px, safe-area, `pointer-events-auto`, `z-[9999]` |
| `src/NathaliaTour.tsx` | `pointer-events-auto` + `z-[9999]` (portado) |
| `src/nathaliaFraming.ts` | preset `bubble` mais fechado (3D + 2D) |
| `src/NathaliaAvatar2D.tsx` | redesign fiel à referência + disco por estado |
| `src/NathaliaAvatar.tsx` | disco `accent.chip` no wrapper 3D |
| `apps/web/.../dev/nathalia/NathaliaLab.tsx` | comparação + presets + copiar |

Ver [`VISUAL_PARITY_REPORT.md`](./VISUAL_PARITY_REPORT.md) para o comparativo
referência × estado atual × ajustes × limitações.

## §12 — Modelo V3 alinhado à referência (Fase 8.3)

- **Novo modelo de runtime padrão:** `master_v3_preview.glb` (≈260 KB), reconstrução
  leve do `master_v2` aproximada à referência visual V3 (Tripo). `DEFAULT_NATHALIA_3D_MODEL_URL`
  agora aponta para `/nathalia/master_v3_preview.glb`.
- **Fallbacks preservados:** `master_v2_preview.glb` continua servido e exposto como
  `NATHALIA_3D_MODEL_FALLBACK_URL`; o V1 `master_preview.glb` também é sincronizado.
  O avatar **2D/CSS** segue como fallback principal (D-007) e a feature flag
  `NEXT_PUBLIC_ENABLE_NATHALIA_3D` continua valendo.
- **Nova prop `modelUrl`** em `NathaliaAvatar` (encaminhada a `NathaliaCanvas`), para
  trocar o GLB em runtime — usada pelo seletor V2/V3 do Lab. `NEXT_PUBLIC_NATHALIA_3D_MODEL_URL`
  ainda sobrescreve o padrão globalmente.
- **O que mudou no GLB:** apenas materiais (paleta quente, camiseta preta, logo
  laranja, calça creme, tênis preto) e a escala das malhas `Eyes`/`Hair`/`Logo`
  (olhos maiores, cabelo mais volumoso). Contrato intacto: 7 objetos, 7 materiais,
  16 bones, 10 shape keys, 9 actions — validação **PASS** (`reports/MASTER_V3_VALIDATION.md`).
- **Pipeline:** `scripts/nathalia/blender/refine_master_v3.py` abre `master_v2.blend`
  e refina; o **GLB Tripo pesado (1.85M tris / 55 MB) nunca entra no app**.
- Detalhes: [`../V2_VS_V3_COMPARISON.md`](../V2_VS_V3_COMPARISON.md),
  [`../V3_ALIGNMENT_PLAN.md`](../V3_ALIGNMENT_PLAN.md).
