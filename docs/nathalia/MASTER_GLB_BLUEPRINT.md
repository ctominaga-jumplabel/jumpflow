# Nathal.IA — Master GLB Blueprint

> **Planta definitiva do `master.glb`** — como o artefato canônico deve ser
> montado no Blender e exportado. Consolida, num único lugar visual+técnico, o
> contrato de [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md), a folha
> [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md), as
> [`EXPRESSIONS.md`](./EXPRESSIONS.md) e [`GESTURES.md`](./GESTURES.md).
>
> O `master.glb` é a **fonte única de verdade visual** (D-001). Tudo (LODs,
> thumbnails, bust, variantes) deriva dele por script, nunca à mão. Não gera
> código nem GLB nesta fase.
>
> A verificação automática vive em `scripts/nathalia/validate_glb.py` e o aceite
> formal em
> [`MASTER_GLB_ACCEPTANCE_CHECKLIST.md`](./MASTER_GLB_ACCEPTANCE_CHECKLIST.md)
> (ADR-010). Contrato espelhado em
> [`scripts/nathalia/nathalia_assets.config.json`](../../scripts/nathalia/nathalia_assets.config.json).
>
> Última atualização: **2026-06-16**.

---

## 0. Caminho de produção (resumo)

```
nathalia_tripo_v02.glb  →  Blender (Fase 4)  →  master.glb  →  validate_glb.py  →  promoção
(referência visual)        retopo + split        (este blueprint)   (aceite ADR-010)
                           + rig + shapes
                           + actions + normalize
```

A v02 é **referência de forma** (shrinkwrap/likeness), **não** geometria final.

---

## 1. Formato e transform (contrato)

| Item | Requisito |
| --- | --- |
| Formato | **glTF 2.0 binário (`.glb`)**, texturas embutidas |
| Escala | **1 unidade = 1 metro**; altura ~**1,60 m** |
| Origem | **Base no chão (entre os pés)**, em `(0, 0, 0)` |
| Orientação | Personagem olhando para **`-Z`** |
| Up axis | **+Y** |
| Câmeras / luzes | **Nenhuma** embutida |
| Compressão | **Draco** ou **Meshopt** |

Normalizar com `normalize_master.py --apply` antes de exportar.

---

## 2. Hierarquia final (scene graph)

```
Scene
└─ Nathalia                     (Empty / root da personagem)
   ├─ Armature                  (rig — ver §6)
   │   └─ (bones: Pelvis → ... → Foot.L/R)
   ├─ Body      [MAT_Body]      (corpo + cabeça + pescoço + braços + mãos)
   ├─ Hair      [MAT_Hair]      (cabelo)
   ├─ Eyes      [MAT_Eyes]      (olhos)
   ├─ Shirt     [MAT_Shirt]     (camiseta)
   ├─ Logo      [MAT_Logo]      (wordmark jump — decal/plano no peito)
   ├─ Pants     [MAT_Pants]     (calça)
   └─ Shoes     [MAT_Shoes]     (tênis)
```

- Todos os meshes são **filhos do rig** (skinned), exceto `Logo`, que pode ser
  parented ao `Body`/`Shirt` (segue o tronco).
- **Nomes exatos** dos objetos (a validação procura por eles; D-009 é tolerante,
  mas o canon são estes). Sem sufixos numéricos do Blender (`.001`).

---

## 3. Objetos (meshes)

| Objeto | Conteúdo | Material | Observações |
| --- | --- | --- | --- |
| `Body` | Corpo, cabeça, pescoço, braços, mãos | `MAT_Body` | **mãos sem dedos individuais** (mitten estilizada com polegar separado); face com loops limpos para shape keys |
| `Hair` | Cabelo (mechas como cards) | `MAT_Hair` | sem alpha de fios no MVP; longo abaixo dos ombros |
| `Eyes` | Globos/olhos | `MAT_Eyes` | íris escura grande + highlight; suportam `Blink_*` |
| `Shirt` | Camiseta preta | `MAT_Shirt` | área plana reservada no peito p/ o logo |
| `Logo` | Wordmark `jump` | `MAT_Logo` | plano fino/decal na área reservada; minúsculas, branco |
| `Pants` | Calça escura | `MAT_Pants` | até o tornozelo |
| `Shoes` | Tênis claros | `MAT_Shoes` | low-top; acento laranja opcional |

Separação de partes é **obrigatória** (o bruto do Tripo é blob único — split é
trabalho de Fase 4).

---

## 4. Materiais

Nomes **exatos** (consumidos pela validação e pelo runtime 3D). Especificação de
cor/roughness em [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md)
§Materiais.

```
MAT_Body    #f3c6a3  rough ~0.6   metal 0   (pele fosca)
MAT_Hair    #241f2b  rough ~0.45  metal 0   (cabelo acetinado, 1 highlight)
MAT_Shirt   #111814  rough ~0.7   metal 0   (algodão preto fosco)
MAT_Pants   #2b3340  rough ~0.75  metal 0   (jeans/sarja escuro)
MAT_Shoes   #ece9e0  rough ~0.6   metal 0   (sneaker claro)
MAT_Eyes    #ffffff/#3a2e2a rough ~0.2 metal 0 (olho, leve brilho)
MAT_Logo    #ffffff  rough ~0.7   metal 0   (wordmark branco)
```

- **7 materiais, nem mais nem menos** na base. Sem metais, sem emissão.
- Acessórios usam materiais próprios (`MAT_Acc_*`) e **não** entram no master
  (ver [`ACCESSORIES.md`](./ACCESSORIES.md)).

---

## 5. Texturas (limites técnicos)

| Item | Alvo | Máximo |
| --- | --- | --- |
| Resolução | **1024²** | 2048² |
| Formato | webp / KTX2 (Basis) | png como fallback |
| Estratégia | **atlas compartilhado**; evitar múltiplas texturas grandes | — |

---

## 6. Rig (esqueleto)

Ossos **mínimos e exatos** (sufixo `.L`/`.R` por lado):

```
Pelvis
 └─ Spine
     └─ Neck
         └─ Head
     ├─ UpperArm.L → LowerArm.L → Hand.L
     └─ UpperArm.R → LowerArm.R → Hand.R
 ├─ UpperLeg.L → LowerLeg.L → Foot.L
 └─ UpperLeg.R → LowerLeg.R → Foot.R
```

- **Sem bones de dedos** no MVP (mãos resolvem gesto pela forma + antebraço).
- **Opcional:** 1–2 bones de cabelo (`Hair.L`/`Hair.R` ou `Hair_01/02`) para
  movimento secundário leve em `Wave`/`Celebrate` — **não obrigatório**, fora do
  conjunto mínimo validado.
- Bind pose = **A-Pose leve** (braços ~30°), pés paralelos na origem.
- Skinning suave; pesos limpos (sobretudo ombro, cotovelo, quadril, joelho).

---

## 7. Shape keys (blend shapes faciais)

**7 shape keys canônicas** (combináveis; ver mapeamento expressão→shape key em
[`EXPRESSIONS.md`](./EXPRESSIONS.md)):

| Shape key | Efeito | Topologia exigida |
| --- | --- | --- |
| `Smile` | sorriso (cantos da boca + bochechas) | loops de boca limpos |
| `Blink_L` | piscar olho esquerdo | loops de pálpebra |
| `Blink_R` | piscar olho direito | loops de pálpebra |
| `Thinking` | sobrancelha/olhar pensativo | loops de sobrancelha |
| `Surprised` | olhos arregalados + boca "oh" | olhos + boca |
| `OpenMouth` | boca aberta (fala) | loops de boca |
| `Sad` | tristeza/alerta suave | sobrancelha + boca |

- Todas neutras em 0; valor 0–1. **Não** devem quebrar a malha em 1.0.
- Combinações canônicas testadas: `Smile`+`OpenMouth` (Happy/Celebrate),
  `Thinking`+`Smile` (Curious leve), `Sad`+`Thinking` (Warning).

---

## 8. Actions (clipes de animação)

**8 Actions canônicas** (ver detalhamento em [`GESTURES.md`](./GESTURES.md)):

| Action | Estado(s) | Loop | Duração |
| --- | --- | --- | --- |
| `Idle` | idle, listening | loop | ~4 s |
| `Wave` | welcome | once | ~1.3–2 s |
| `Thinking` | thinking, searching | loop | ~2–2.4 s |
| `Pointing` | pointing | once | ~1.2–1.8 s |
| `Explaining` | explaining | loop | ~1.2–2.4 s |
| `Celebrate` | celebrate | once | ~1.5–2 s |
| `Typing` | (execução/futuro) | loop | ~1.5–2 s |
| `Alert` | warning, error | once | ~1.2 s |

- Cada Action **começa e termina** próxima da pose neutra (blend suave).
- Nomes tolerantes na validação (D-009); reconciliação clip→estado na Fase 5
  (`nathaliaAnimations.ts`).
- Animações faciais usam as shape keys do §7 combinadas com a Action corporal.

---

## 9. Limites técnicos (orçamento)

| Métrica | MVP | Ideal | Máximo (reprova acima) |
| --- | --- | --- | --- |
| Triângulos | ≤ 25.000 | ≤ 40.000 | **60.000** |
| Texturas | 1024² | 1024² | 2048² |
| Arquivo `.glb` | < 1 MB | ≤ ~1 MB | **~1.5 MB** |

Maiores consumidores de polígono: **cabelo** e **tênis** — simplificar primeiro.

---

## 10. Convenções de nomes (resumo canônico)

```
Objeto raiz   : Nathalia
Rig           : Armature
Meshes        : Body, Hair, Eyes, Shirt, Logo, Pants, Shoes
Materiais     : MAT_Body, MAT_Hair, MAT_Eyes, MAT_Shirt, MAT_Logo, MAT_Pants, MAT_Shoes
Bones         : Pelvis, Spine, Neck, Head, UpperArm.L/R, LowerArm.L/R, Hand.L/R,
                UpperLeg.L/R, LowerLeg.L/R, Foot.L/R
Shape keys    : Smile, Blink_L, Blink_R, Thinking, Surprised, OpenMouth, Sad
Actions       : Idle, Wave, Thinking, Pointing, Explaining, Celebrate, Typing, Alert
```

- Sem espaços, sem acentos, sem sufixos `.001` do Blender.
- `.L`/`.R` para lados; `Snake_Case` para shape keys; `PascalCase` para Actions e
  objetos; `MAT_` prefixo para materiais.

---

## 11. Checklist de aceite (resumo — fonte plena no documento dedicado)

Um `master.glb` é aceito quando:

- [ ] glTF 2.0 válido; escala em metros; base em `(0,0,0)`; olhar `-Z`; +Y up.
- [ ] ≤ 60k triângulos (idealmente ≤ 40k); arquivo ≤ ~1.5 MB.
- [ ] Texturas ≤ 2048² (preferir 1024²), atlas compartilhado.
- [ ] **7 objetos** e **7 materiais** com os nomes do §3/§4.
- [ ] **Rig** com os bones do §6; bind pose A-Pose leve.
- [ ] **7 shape keys** do §7 presentes e não-quebram a malha.
- [ ] **8 Actions** do §8 presentes (nomes tolerantes).
- [ ] Wordmark `jump` legível em `MAT_Logo` na área reservada do peito.
- [ ] Personagem consistente com a Sheet Premium e o Character Bible.

> Aceite formal e promoção a `master.glb`:
> [`MASTER_GLB_ACCEPTANCE_CHECKLIST.md`](./MASTER_GLB_ACCEPTANCE_CHECKLIST.md).
