# Nathal.IA — V3 Alignment Plan (Fase 8.3)

> Plano priorizado para aproximar a Nathal.IA da **referência visual V3** (Tripo3D)
> mantendo a arquitetura leve, modular, animável e com fallback 2D.
> Base de análise: [`VISUAL_REFERENCE_V3_REVIEW.md`](./VISUAL_REFERENCE_V3_REVIEW.md).

## Princípios (não-negociáveis)

- **Não** importar o GLB Tripo (1.85M tris / 55 MB) no app.
- **Não** substituir `master_v2_preview.glb` pelo Tripo.
- **Não** remover o fallback 2D, nem quebrar R3F, nem tocar na Intelligence Layer/LLM.
- Preservar o contrato: **7 objetos, 7 materiais `MAT_*`, 16 bones, 10 shape keys,
  9 actions**, ~1.6 m, pés no chão, orçamento web (≤ ~25k tris / ≤ 1.5 MB).
- 2D é o **fallback principal** e deve ficar bonito sozinho; 3D é progressivo.

## Estratégia em 2 frentes

1. **Fallback 2D primeiro** (SVG/CSS) — maior ROI, ship imediato, sem WebGL.
2. **`master_v3` leve no Blender** — abre `master_v2.blend` como base e refina por
   **paleta + escala de olhos/cabelo + logo**, sem mexer na geometria do Body
   (preserva shape keys/rig/actions). Exporta `master_v3_preview.glb`.

## Prioridades

### 🔴 CRÍTICO (leitura no bubble + fidelidade imediata)
- **C1. Olhos maiores e mais expressivos.** 2D: aumentar esclera/íris e cílio.
  3D: escalar a malha do objeto `Eyes` ~1.2× em torno do centro de cada olho.
- **C2. Sorriso mais visível em repouso.** 2D: boca de sorriso mais aberta por
  padrão. 3D: viés positivo de `Smile` no estado idle (runtime), sem alterar Body.
- **C3. Cabelo mais volumoso.** 2D: massa traseira/lateral mais larga. 3D: escalar
  a malha do objeto `Hair` (~+10% largura/profundidade) em torno do centroide.
- **C4. Camiseta preta de verdade + logo laranja.** `MAT_Shirt → ~#0e0e10`,
  `MAT_Logo → #ff7a18` (laranja jumpflow), logo melhor posicionado no peito.

### 🟠 ALTO (paleta quente + silhueta)
- **A1. Pele mais quente/bronzeada.** `MAT_Body #f3c6a3 → ~#e8b189`; 2D idem.
- **A2. Cabelo espresso quente.** `MAT_Hair #241f2b → ~#2a2320` (menos arroxeado).
- **A3. Silhueta da referência.** Calça creme (`MAT_Pants → ~#e6ddc8`) e tênis preto
  (`MAT_Shoes → ~#1b1b1f`) — corrige inversão atual (calça azul / tênis branco).
- **A4. Rosto mais amigável.** 2D: rosto levemente mais arredondado, bochecha.

### 🟡 MÉDIO (acabamento)
- **M1. Sobrancelhas um pouco mais marcadas** (2D já tem; manter).
- **M2. Catchlight/brilho do olho** consistente entre 2D e 3D.
- **M3. Thumbnails `v3/*`** atualizados (front/side/back/three_quarter).
- **M4. Lab:** seletor V2/V3 + preset `visual-reference-v03` + comparação.

### 🟢 BAIXO (futuro / opcional)
- **B1. Íris castanha dedicada no 3D** — exigiria 8º material (quebraria contrato);
  adiado. Hoje a íris compartilha `MAT_Hair` (escuro), aceitável.
- **B2. Esculpir bochechas/queixo no Body** — exige edição de vértices com shape
  keys; risco alto, ganho marginal. Adiado para um pass dedicado.
- **B3. Mechas/fios extras de cabelo** (mais geometria) — só se couber no orçamento.
- **B4. Normal/roughness maps estilo V3** — fora do escopo leve atual.

## Mapeamento prioridade → entrega

| Item | 2D (`NathaliaAvatar2D.tsx`) | 3D (`refine_master_v3.py`) |
| --- | --- | --- |
| C1 olhos | maior `rx/ry`, íris maior | escala malha `Eyes` ~1.2× |
| C2 sorriso | `smile` mais aberto no idle | viés idle (runtime, fase futura) |
| C3 cabelo | massa mais larga | escala malha `Hair` +10% |
| C4 camiseta/logo | preto puro + chevron laranja | `MAT_Shirt`/`MAT_Logo` |
| A1–A3 paleta | hex quentes | recolor `MAT_*` |
| A4 rosto | face arredondada | (sem mexer no Body) |

## Riscos & mitigação

- **Quebrar shape keys/rig** ao editar o Body → **mitigação:** só editar objetos
  **sem** shape keys (`Eyes`, `Hair`, `Logo`) + materiais; Body intacto.
- **Estourar orçamento** → escalas não adicionam geometria; tris ~constantes (~11k).
- **Regressão de runtime** → `master_v3` é **opt-in**; V2 permanece como fallback e
  o 2D segue como fallback principal.
- **Divergência do contrato** → validadores (`validate_*` + `report_master`) rodam
  sobre a cena viva antes de promover (ver `reports/MASTER_V3_VALIDATION.md`).

## Definição de pronto

- 2D visivelmente mais próximo da V3 e legível em ~80px.
- `master_v3.blend` + `master_v3_preview.glb` gerados, **PASS** nos validadores,
  contrato preservado, dentro do orçamento.
- Runtime e Lab atualizados sem quebrar fallback; docs atualizadas.
- `typecheck`/`lint`/`test`/`build` verdes.
