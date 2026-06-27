# Nathal.IA — V2 vs V3 Comparison (Fase 8.3)

> Comparação entre o runtime atual (`master_v2`) e a reconstrução leve alinhada à
> referência V3 (`master_v3`). Lembrete: o **GLB Tripo V3** (1.85M tris / 55 MB) é
> só **referência visual** — `master_v3` é uma reconstrução leve, não o Tripo.

## Quadro comparativo

| Dimensão | `master_v2` (atual) | `master_v3` (novo) | Tripo V3 (referência, NÃO-runtime) |
| --- | --- | --- | --- |
| **Tamanho GLB** | 266 KB | **260 KB** | 55.0 MB |
| **Polycount** | ~11.3k tris | **~11.3k tris** (inalterado) | 1.847.223 tris |
| **Objetos** | 7 | 7 | 1 |
| **Materiais** | 7 `MAT_*` | 7 `MAT_*` (recolor) | 1 (+3 texturas) |
| **Rig** | 16 bones | 16 bones | — |
| **Shape keys** | 10 | 10 | — |
| **Actions** | 9 | 9 | — |
| **Pele** | `#f3c6a3` clara | **`#e8b189` quente** | bronzeada (textura) |
| **Cabelo** | `#241f2b` (arroxeado) | **`#2a2320` espresso**, +volume | espresso, muito volume |
| **Olhos** | esclera pequena | **~1.2× maiores** | grandes, expressivos |
| **Camiseta** | `#111814` quase-preto | **`#0e0e10` preto** | preto |
| **Logo** | `#ffffff` branco | **`#ff7a18` laranja** | laranja `jumpflow` |
| **Calça** | `#2b3340` azul-ardósia | **`#e6ddc8` creme** | creme |
| **Tênis** | `#ece9e0` quase-branco | **`#1b1b1f` preto** | preto |

## Avaliação por critério

### Visual
- **V2:** correto, mas paleta fria e silhueta divergente da marca (calça azul, tênis
  branco, logo branco).
- **V3:** paleta quente e silhueta fiel à referência (camiseta preta + logo laranja,
  calça creme, tênis preto). Ganho claro de identidade.

### Tamanho
- Praticamente idêntico (260 vs 266 KB). O recolor não muda geometria; a escala de
  `Eyes/Hair/Logo` move vértices sem adicioná-los. **Sem custo de download.**

### Polycount
- **Inalterado** (~11.3k tris). Continua muito abaixo do MVP (25k) e do ideal (40k).

### Expressividade
- Olhos maiores melhoram a leitura de expressão; shape keys (10) e actions (9)
  preservados, então piscar/sorrir/acenar/explicar seguem funcionando igual.
- Sorriso em repouso: reforçado **no 2D**; no 3D depende das shape keys de estado
  (refino de viés idle fica para um pass futuro — ver `V3_ALIGNMENT_PLAN.md` B-itens).

### Leitura em bubble (~80px)
- **V3 melhor:** olhos maiores + cabelo mais volumoso + contraste camiseta preta vs
  pele quente aumentam o impacto no close-up do launcher.

### Aderência à referência
- **V3 muito mais próximo** em paleta e silhueta. O que ainda separa do Tripo
  (rosto esculpido, bochechas, fios de cabelo, normal maps) exigiria geometria/
  texturas pesadas — fora do orçamento e por isso adiado.

### Riscos
- **Baixo.** Mudança não-destrutiva; contrato 100% preservado (validação **PASS**).
  `master_v3` é **opt-in**: V2 segue como fallback e o 2D como fallback principal.
- Regressão de runtime improvável (mesmas malhas/rig/animações; só materiais + escala).

## Recomendação

**Promover `master_v3_preview.glb` a modelo de runtime padrão** quando o flag 3D
estiver ligado, mantendo:
- `master_v2_preview.glb` como **fallback 3D**,
- o avatar **2D/CSS** como **fallback principal** (sempre presente),
- a **feature flag** `NEXT_PUBLIC_ENABLE_NATHALIA_3D` e o override por
  `NEXT_PUBLIC_NATHALIA_3D_MODEL_URL`.

Detalhes da validação: [`reports/MASTER_V3_VALIDATION.md`](./reports/MASTER_V3_VALIDATION.md).
