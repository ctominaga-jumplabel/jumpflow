# Nathal.IA — Master Character Strategy

> Estratégia de construção do **primeiro `master.blend` canônico** da Nathal.IA
> (Fase 5). Decide e justifica como o master é construído a partir da referência
> aprovada `nathalia_tripo_v02.glb` sem promovê-la.
>
> Insumos: [`reports/REFERENCE_ANALYSIS.md`](./reports/REFERENCE_ANALYSIS.md),
> [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md),
> [`MASTER_GLB_BLUEPRINT.md`](./MASTER_GLB_BLUEPRINT.md),
> [`RIG_BLUEPRINT.md`](./RIG_BLUEPRINT.md),
> [`SHAPE_KEYS_BLUEPRINT.md`](./SHAPE_KEYS_BLUEPRINT.md),
> [`ACTIONS_BLUEPRINT.md`](./ACTIONS_BLUEPRINT.md),
> [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md).
>
> Última atualização: **2026-06-16**.

---

## 1. Decisão central

**Reconstrução completa, paramétrica e modular no Blender.** O master **não**
reaproveita a malha da v02. A referência atua como guia de likeness/proporção/
silhueta/roupa; a geometria do master é gerada do zero, low-poly, já normalizada,
separada, riggada e com expressões.

### Por quê (justificativa técnica)

1. **Orçamento.** A v02 tem **1,93 M triângulos / 57 MB** — ~77× acima do MVP
   (25k tris) e ~38× acima do orçamento de arquivo (1,5 MB). Nenhum *decimate*
   chega lá sem destruir a silhueta; e decimate não cria topologia animável.
2. **Topologia para deformar.** Rig e shape keys exigem *edge loops* limpos em
   boca, pálpebras, cotovelo, joelho. A v02 é uma "casca" triangulada sem loops —
   imprópria para skinning e blend shapes. Reconstruir é mais barato que retopo
   manual de 1,9 M tris.
3. **Modularidade.** O contrato pede **7 objetos** e **7 materiais** nomeados
   (Body/Hair/Eyes/Shirt/Pants/Shoes/Logo). A v02 é blob único de 1 material;
   separá-la seria mais trabalhoso que modelar partes já separadas.
4. **Reprodutibilidade.** Um build **script-driven** (código versionado) é
   reproduzível, revisável e evolutivo — alinhado a D-001 (master é fonte única)
   e ao princípio de "Blender como fábrica de ativos" (`BLENDER_AUTOMATION.md`).
   Cada regeneração parte do mesmo código, não de uma sessão manual irrepetível.

---

## 2. O que é reaproveitado vs. reconstruído

| Item | Origem | Decisão |
| --- | --- | --- |
| Likeness / vibe | v02 (visual) | **referência** — guia, não geometria |
| Proporções (4,5 cabeças) | Sheet + v02 | **parametrizado** no build (HU → metros) |
| Silhueta / roupa | v02 + Sheet | **reconstruída** seguindo o canon |
| Malha (vértices/faces) | v02 | **descartada** — gerada do zero |
| Materiais / cores | Paleta oficial | **canônicos** (`MAT_*`, hex exatos) |
| Rig / shape keys / actions | Blueprints | **construídos** (não existem na v02) |

---

## 3. Estratégia de malha

- **Geração paramétrica por primitivas** (esferas/cilindros/cones) combinadas e
  unidas por parte. Cada parte vira **um objeto** com um material.
- **Low-poly desde a origem**, dentro do alvo MVP (≤ 25k tris) — sem etapa de
  redução posterior.
- **Régua de proporção** vinda do `CHARACTER_SHEET_PREMIUM` (HU = head unit;
  4,5 HU = 1,60 m), aplicada em metros: pés em `(0,0,0)`, topo do cabelo ~1,60 m.
- **A-Pose leve (~30°)** na bind pose para skinning previsível.
- **Orientação canônica:** +Z up no Blender → exportador glTF converte para +Y
  up; personagem olhando para **-Y** no Blender (→ -Z no glb).

> Esta é a **v1 estrutural** do master: geometria estilizada, correta em
> proporção/separação/rig/expressão, priorizando **arquitetura sobre escultura**
> (regra da Fase 5: "a fidelidade visual nunca deve comprometer a arquitetura").
> O refino escultural de superfície (forma fina do rosto, dobras de pano) é
> evolução incremental sobre a **mesma** base modular, sem trocar a arquitetura.

---

## 4. Separação de objetos (7)

| Objeto | Conteúdo | Material |
| --- | --- | --- |
| `Body` | cabeça, pescoço, braços, mãos (pele) — porta as shape keys faciais | `MAT_Body` |
| `Hair` | calota + volume traseiro + franja + mechas laterais | `MAT_Hair` |
| `Eyes` | 2 globos oculares | `MAT_Eyes` |
| `Shirt` | tronco + mangas curtas | `MAT_Shirt` |
| `Pants` | quadril + duas pernas | `MAT_Pants` |
| `Shoes` | 2 tênis apoiados no chão | `MAT_Shoes` |
| `Logo` | wordmark `jump` (decal no peito) | `MAT_Logo` |

---

## 5. Estratégia de rig

- **Armature único** com os **16 bones** canônicos do `RIG_BLUEPRINT.md`
  (Pelvis → Spine → Neck → Head; braços e pernas `.L`/`.R`).
- **Skinning automático** (bone heat / *automatic weights*); fallback para
  *envelope* se o heat falhar (geometria separada em primitivas).
- `Logo` acompanha o tronco (parent ao `Body`/`Shirt`); olhos seguem a `Head`.
- Cabelo majoritariamente **rígido** preso à cabeça (sem bones de cabelo no MVP).
- Máx. 4 influências por vértice (limite glTF).

## 6. Estratégia de shape keys

- 7 shape keys faciais no `Body` (`Smile`, `Blink_L`, `Blink_R`, `Thinking`,
  `Surprised`, `Sad`, `OpenMouth`) + `Basis`.
- Deformações **regionais** (deslocam vértices da face por região) — não
  destrutivas em `1.0`. Na v1 estrutural são **expressões funcionais** sobre a
  topologia paramétrica; ganham refino quando a face for esculpida.

## 7. Estratégia de actions (MVP)

- **Apenas 3** nesta fase: `Idle` (loop), `Wave` (once), `Thinking` (loop) —
  conforme escopo da Fase 5. As outras 5 (`Pointing`, `Explaining`, `Celebrate`,
  `Typing`, `Alert`) ficam para fase posterior e aparecem como **WARNING
  tolerante** (D-009) na validação até então.
- Keyframes em pose-bones do armature; cada action começa/termina perto da
  neutra para blend suave.

---

## 8. Fluxo de produção (script-driven)

```
construct_master.py  (blender --background --python … -- --apply)
  ├─ 1. cena limpa + unidades (metros, fps 24)
  ├─ 2. materiais canônicos (MAT_*)
  ├─ 3. geometria das 7 partes (paramétrica, low-poly)
  ├─ 4. armature (16 bones) + skinning
  ├─ 5. shape keys (7) no Body
  ├─ 6. actions MVP (Idle/Wave/Thinking)
  ├─ 7. salva master.blend (fonte oficial)
  ├─ 8. validação na cena viva (report_master) → MASTER_VALIDATION_REPORT.md
  ├─ 9. export master_preview.glb (NÃO substitui o .blend)
  └─ 10. thumbnails (front/side/back/three_quarter)
```

- **Fonte oficial:** `master.blend`. Todo `.glb` futuro **nasce dele**.
- O `.blend`/`.glb`/PNGs binários **não vão para o Git** (D-004/ADR-010);
  são gerados localmente pela fábrica e guardados em storage.
- Caminho do `.blend`: definido em
  [`master_character_config.json`](../../scripts/nathalia/blender/master_character_config.json)
  → `paths.masterBlend` (`packages/character-nathalia/assets/blender/master.blend`).
  Este é a "estrutura equivalente definida pelo projeto" referida na Fase 5.

---

## 9. Riscos & mitigação

| Risco | Mitigação |
| --- | --- |
| Skinning automático ruim em primitivas separadas | fallback envelope; geometria alinhada aos bones |
| Expressões pobres sem topologia facial esculpida | deformação regional funcional + refino futuro sobre a mesma base |
| Fidelidade visual da v1 < escultura da v02 | arquitetura primeiro (regra da fase); refino incremental não troca a estrutura |
| Binários no Git | `.gitignore` + storage (ADR-010) |
