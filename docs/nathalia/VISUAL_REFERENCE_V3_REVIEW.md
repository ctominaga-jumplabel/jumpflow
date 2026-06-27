# Nathal.IA — Visual Reference V3 Review (Fase 8.3)

> Análise comparativa da **referência visual V3** (Tripo3D) contra a versão atual
> do personagem (`master_v2` + fallback 2D), para guiar o alinhamento visual.
>
> Gerado: **2026-06-17**. Fonte das medições: importação headless no Blender 5.1.2.

## Artefatos analisados

| Artefato | Papel | Medições reais |
| --- | --- | --- |
| `assets/raw/nathalia_tripo_v03.glb` | **Referência visual V3** (não-runtime) | 55.0 MB · 1 mesh · **1.847.223 tris** · 1.002.702 verts · 1 material · 3 texturas 1024² (basecolor/normal/rm) · **sem rig, sem shape keys, sem actions** |
| `docs/nathalia/Avatar_NathIA_v03_reference.png` | Render/turnaround V3 | front · 3/4 · side · back + 5 closes de rosto/cabelo |
| `docs/nathalia/Avatar_NathIA.png` | Sheet original (chibi premium) | folha de marca v1 |
| `assets/models/master_v2_preview.glb` | Runtime atual | 260 KB · 7 objetos · **11.336 tris** · 10 shape keys · 9 actions · 7 materiais `MAT_*` |
| `assets/blender/master_v2.blend` | Fonte do runtime atual | reconstrução paramétrica (Fase 7) |

> **Regra firme:** a V3 do Tripo é **~163× mais pesada** que o runtime atual
> (1.85M vs 11.3k tris) e não tem rig/shapes/actions. Ela **nunca** entra na
> aplicação — serve só como alvo de aparência. O `master_v2_preview.glb` continua
> sendo o runtime; o `master_v3` será uma **reconstrução leve** que se aproxima da
> V3 preservando o contrato (7 objetos / 7 materiais / 16 bones / shape keys / actions).

## Comparação dimensão a dimensão

### Rosto
- **V3:** rosto arredondado e suave, bochechas cheias, proporção mais "gente real
  estilizada" (menos chibi que a sheet original), expressão acolhedora em repouso.
- **Atual (v2/2D):** rosto rounded ok, mas mais chapado; faltam bochecha/volume e a
  leitura amigável imediata. O 2D tem rosto bom, porém olhos/sorriso menos calorosos
  que a V3.
- **Gap:** suavizar e arredondar; reforçar bochechas; postura facial mais amigável.

### Olhos
- **V3:** olhos grandes, castanhos quentes, com brilho (catchlight) e cílios
  definidos; bem espaçados, muito expressivos.
- **Atual:** 3D usa esclera branca (`MAT_Eyes`) + íris/sobrancelha no Body (slot
  `MAT_Hair`); olhos **pequenos** para o tamanho do rosto. 2D já tem olhos grandes
  com catchlight, mas pode abrir mais.
- **Gap (prioridade alta):** **aumentar olhos** (esclera + íris), manter catchlight,
  cílio superior marcado.

### Cabelo
- **V3:** **muito volumoso**, longo, ondulado, castanho-escuro/espresso, com mechas
  emoldurando o rosto e franja suave; é o maior marcador de silhueta.
- **Atual:** cabelo com volume médio, franja assimétrica e mechas laterais — bom,
  porém menos cheio/largo que a V3.
- **Gap (prioridade alta):** **mais volume** (largura + profundidade da massa),
  mantendo a franja e as mechas.

### Sorriso
- **V3:** sorriso fechado, caloroso e claramente visível em repouso.
- **Atual:** repouso com micro-sorriso discreto (boca quase reta no 3D); shape keys
  `Smile`/`Greeting` existem mas só aparecem em estados.
- **Gap (prioridade alta):** sorriso **mais visível em repouso** — fácil no 2D; no
  3D, viés positivo de `Smile` no estado idle (sem mexer na geometria do Body).

### Camiseta
- **V3:** camiseta **preta** lisa, gola careca, com **wordmark `jumpflow` laranja**
  no peito (+ chevron). Preto profundo.
- **Atual:** `MAT_Shirt = #111814` (quase preto esverdeado) — perto, mas não "preto
  de verdade"; `MAT_Logo = #ffffff` (branco) com texto `jump`. Logo branco diverge
  da referência laranja.
- **Gap:** preto mais puro (`~#0e0e10`); **logo laranja** (`#ff7a18`) e melhor
  posicionado/escala no peito.

### Calça e tênis (silhueta)
- **V3:** calça **creme/bege**, tênis **preto** cano baixo.
- **Atual:** `MAT_Pants = #2b3340` (azul-ardósia escuro) e `MAT_Shoes = #ece9e0`
  (quase branco) — **invertido** em relação à referência.
- **Gap:** calça creme (`~#e6ddc8`), tênis preto (`~#1b1b1f`). Não aparece no bubble,
  mas corrige a silhueta no painel/Lab e nos thumbnails.

### Proporções e postura
- **V3:** proporção mais natural (cabeça um pouco menor relativa ao corpo que a
  sheet chibi), postura ereta e relaxada, peso neutro.
- **Atual:** ~4.5 cabeças, pés no chão, ~1.6 m, frente para `-Y/-Z`. Postura idle viva.
- **Gap:** manter o contrato de proporção/altura (não quebra rig); ganho vem de
  rosto/olhos/cabelo, não de re-rig.

### Estilo
- **V3:** 3D estilizado premium realista-fofo, materiais foscos, paleta quente.
- **Atual:** estilizado paramétrico, materiais Principled foscos. Paleta um pouco
  fria (cabelo arroxeado `#241f2b`, calça azul).
- **Gap:** **aquecer a paleta** (pele mais bronzeada, cabelo espresso quente).

### Presença no bubble (close-up)
- **V3:** rosto + cabelo cheios dominam — leitura ótima em tamanho pequeno.
- **Atual:** crop `bubble` já fecha no rosto (Fase 8.2), mas olhos pequenos e sorriso
  discreto reduzem o impacto em ~80px.
- **Gap:** olhos maiores + sorriso visível + cabelo cheio = leitura muito melhor no
  launcher.

## Diferenças-chave (resumo)

| Aspecto | V3 (alvo) | Atual | Ação |
| --- | --- | --- | --- |
| Pele | bronzeada quente | `#f3c6a3` clara | aquecer → `~#e8b189` |
| Cabelo | espresso, **muito volume** | `#241f2b`, volume médio | aquecer + **+volume** |
| Olhos | grandes, expressivos | pequenos | **aumentar** esclera + íris |
| Sorriso | visível em repouso | discreto | reforçar (2D + viés idle 3D) |
| Camiseta | preto puro | quase-preto | `~#0e0e10` |
| Logo | **laranja** `jumpflow` | branco `jump` | laranja + reposição |
| Calça | creme | azul-ardósia | creme `~#e6ddc8` |
| Tênis | preto | quase-branco | preto `~#1b1b1f` |
| Peso/risco | 1.85M tris | 11.3k tris | manter leve (não importar Tripo) |

## Conclusão

A V3 é uma **referência de aparência**, não um asset de runtime. O caminho de
alinhamento é **paleta + olhos + cabelo + sorriso + logo** sobre a base `master_v2`,
preservando contrato técnico, rig, shape keys, actions e o fallback 2D. Plano
priorizado em [`V3_ALIGNMENT_PLAN.md`](./V3_ALIGNMENT_PLAN.md).
