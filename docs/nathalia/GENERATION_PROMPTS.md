# Nathal.IA — Prompts de Geração

> Prompts reutilizáveis para gerar a Nathal.IA de forma **consistente** em
> ferramentas de IA (3D image-to-model, 3D text-to-model, geração de imagem e
> assistentes de Blender). Derivados de
> [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md) e do
> [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md). Não gera código nem GLB.
>
> Objetivo: qualquer pessoa/IA recria a mesma personagem **sem conhecimento
> externo**, só com estes prompts. Sempre **revisar contra a Sheet Premium e o
> Bible antes de aprovar** (D-008, ADR-010).
>
> Complementa (não substitui) o
> [`TRIPO_REGENERATION_PROMPT.md`](./TRIPO_REGENERATION_PROMPT.md), que é o prompt
> operacional do Tripo. Aqui ficam os prompts por ferramenta + os blocos
> reutilizáveis.
>
> Última atualização: **2026-06-16**.

---

## Bloco canônico de descrição (reutilizar em TODOS os prompts)

> Cole este bloco em qualquer ferramenta. É a "verdade compartilhada".

```
CHARACTER: "Nathal.IA", a friendly stylized 3D female office assistant character.
STYLE: stylized 3D, clean shapes, "Pixar / Notion / Duolingo-like" but with its
own identity. Professional and approachable. NOT hyper-realistic, NOT anime, NOT
classic-Disney princess, NOT a portrait of a real person.
PROPORTIONS: ~4.5 heads tall, compact body, head slightly larger than realistic
(for friendliness), expressive but proportional eyes (NOT giant anime eyes),
simple hands (mitten-style with separate thumb, no individual fingers).
HAIR: long dark, almost-black (#241f2b), soft fringe/bangs, falls below the
shoulders, clean silhouette, hair as soft clumps (not individual strands).
FACE: soft oval, small simple nose, warm friendly resting micro-smile, attentive
eyes with a small highlight, well-defined medium eyebrows.
OUTFIT: black crew-neck t-shirt (#111814) with the lowercase wordmark "jump" in
white centered on the chest; dark casual pants (dark denim #2b3340); light
off-white low-top sneakers (#ece9e0) with an optional small Jump-orange accent.
SKIN: #f3c6a3, matte.
PALETTE: black/white base, Jump orange (#ff7a18) as the ONLY brand accent (small
details only). Keep it from looking colorful — character is a dark focal point
with one orange touch.
MOOD: friendly, light, organized, competent, welcoming. Never childish, never
cold, never sexy.
```

**Regras de consistência (todas as ferramentas):**

- Fixar **seed** quando possível e reutilizar entre renders/vistas.
- Repetir **cores (HEX), proporções e vestuário** em todo prompt.
- Gerar turnaround a partir da **mesma imagem hero** quando a ferramenta deixar.
- Manter a referência visual **`nathalia_tripo_v02.glb`** como likeness-alvo.

---

## 1. Tripo (image-to-3D / text-to-3D)

> Tripo é usado **apenas para o modelo base** (D-003). Pedir malha game-ready,
> partes separadas e A-Pose. Operação completa em
> [`TRIPO_REGENERATION_PROMPT.md`](./TRIPO_REGENERATION_PROMPT.md).

```
[colar BLOCO CANÔNICO acima]

3D GENERATION REQUIREMENTS (Tripo):
- Output: game-ready mesh, low-to-mid polycount (target ≤ 40k tris), clean-ish
  topology, NOT a dense sculpt blob.
- Pose: light A-pose (arms ~30° from body), feet parallel, neutral face, looking
  forward.
- Separate parts where possible: body, hair, shirt, pants, shoes, eyes.
- Single shared/atlas texture, 1024px, no 4K maps.
- Standing full body, centered, plain neutral background, even flat lighting.
- Scale ~1.6 m, base at feet, facing -Z, +Y up.
NEGATIVE: hyper-realistic skin/pores, anime, giant eyes, Disney princess, real
person likeness, heavy props, weapons, dramatic lighting, NSFW, dense blob mesh,
4K textures, T-pose.
```

## 2. Meshy (text/image-to-3D)

```
[colar BLOCO CANÔNICO acima]

MESHY SETTINGS:
- Art style: "stylized" / cartoon (NOT realistic).
- Topology: quad-dominant if available; target polycount ~25k–40k.
- Symmetry: on (except soft asymmetric fringe).
- Pose: light A-pose, neutral face.
- Texture: PBR, matte, 1024px, single set.
NEGATIVE: realism, anime, oversized eyes, princess dress, real-person face,
glossy skin, props, T-pose, multi-4K-textures.
```

## 3. Rodin (Hyper3D / image-to-3D)

```
[colar BLOCO CANÔNICO acima]

RODIN SETTINGS:
- Quality: standard (web budget), NOT max-detail sculpt.
- Target: clean stylized character, separable parts, ≤ 40k tris.
- Pose: light A-pose, feet parallel, neutral expression, facing camera.
- Texture: matte PBR, 1024px, atlas.
- Background: plain neutral, flat even lighting.
NEGATIVE: photorealism, skin pores, anime proportions, huge eyes, real likeness,
accessories, dramatic light, NSFW, T-pose, dense sculpt.
```

## 4. Blender AI tools (assistentes / add-ons de geração ou retopo)

> Usados na **Fase 4** para retopo/rig/shape keys assistidos. O prompt aqui é de
> **refinamento**, não de criação do zero.

```
CONTEXT: refining a stylized 3D character "Nathal.IA" into the canonical
master.glb. Source mesh is a dense reference sculpt (nathalia_tripo_v02) used
only for shape/likeness — DO NOT keep its topology.

TASKS:
- Retopologize to clean quad topology, target ≤ 40k tris (hard max 60k).
- Split into named objects: Body, Hair, Eyes, Shirt, Logo, Pants, Shoes.
- Assign named materials: MAT_Body, MAT_Hair, MAT_Eyes, MAT_Shirt, MAT_Logo,
  MAT_Pants, MAT_Shoes (matte, metallic 0, no emission).
- Build a simple humanoid rig (Pelvis, Spine, Neck, Head, UpperArm/LowerArm/Hand
  .L/.R, UpperLeg/LowerLeg/Foot .L/.R). NO finger bones.
- Add face loops to support shape keys: Smile, Blink_L, Blink_R, Thinking,
  Surprised, OpenMouth, Sad.
- Place the lowercase "jump" wordmark as a decal on a flat reserved chest area
  (MAT_Logo), no distortion.
- Normalize: scale to ~1.6 m, origin at feet (0,0,0), facing -Z, +Y up.
- Bake to a single 1024px atlas; export glb with Draco/Meshopt.
CONSTRAINTS: see docs/nathalia/MASTER_GLB_BLUEPRINT.md and GLB_REQUIREMENTS.md.
```

## 5. Image generation (concept art / Character Sheet / key art)

> Para produzir as **imagens** da Character Sheet (turnaround, closes,
> expressões) e key art — não para 3D. Útil para alimentar Tripo/Meshy/Rodin com
> uma imagem hero consistente.

**5a. Hero / key art (3/4 view):**

```
[colar BLOCO CANÔNICO acima]

SHOT: 3/4 hero view, full body, friendly open smile, light welcoming pose (one
hand in a small wave or open presenting gesture), looking at camera.
RENDER: clean stylized 3D render, soft even studio lighting, plain light
background (#f7f5ea), subtle contact shadow, no dramatic shadows.
FRAMING: centered, full character visible head-to-shoes.
NEGATIVE: realism, anime, giant eyes, princess dress, real person, busy
background, text artifacts, extra logos, watermark, NSFW.
```

**5b. Turnaround (model sheet):**

```
[colar BLOCO CANÔNICO acima]

LAYOUT: character turnaround / model sheet on one image: front, left side, right
side, back, all at the SAME height/scale, light A-pose, neutral resting
micro-smile, plain neutral background, flat even lighting, orthographic feel
(no perspective distortion).
NEGATIVE: perspective distortion, varying scale between views, dramatic light,
realism, anime, real person, props.
```

**5c. Expression sheet:**

```
[colar BLOCO CANÔNICO acima]

LAYOUT: face close-up expression sheet, same character, grid of expressions:
Neutral, Happy, Thinking, Explaining, Surprised, Warning, Celebrate, Curious,
Focused, Greeting. Consistent face, plain background, flat lighting.
(See docs/nathalia/EXPRESSIONS.md for each expression's eyes/brows/mouth.)
NEGATIVE: inconsistent face between cells, realism, anime, real person.
```

---

## 6. Checklist pós-geração (antes de aceitar qualquer saída)

- [ ] Cabelo longo escuro `#241f2b` com franja suave — silhueta certa?
- [ ] Camiseta preta `#111814` + wordmark `jump` branco minúsculo centralizado?
- [ ] Laranja Jump `#ff7a18` **só** como acento (não dominante)?
- [ ] ~4,5 cabeças, cabeça levemente maior, mãos simples, olhos proporcionais?
- [ ] Pele `#f3c6a3`, expressão de repouso com micro-sorriso?
- [ ] **Não** é hiper-realista / anime / Disney-princesa / retrato real?
- [ ] (3D) malha game-ready, partes separáveis, A-Pose, ~1,6 m, ≤ 40k tris?
- [ ] Lê bem reduzido a 40–64 px?
- [ ] Bate com a referência `nathalia_tripo_v02.glb` e com a Sheet Premium?

> Qualquer "não" → ajustar o prompt (reforçar o item no bloco canônico e no
> NEGATIVE) e regenerar. Saídas aprovadas passam pelo intake
> ([`ASSET_INTAKE_REPORT.md`](./ASSET_INTAKE_REPORT.md)) antes de virar base.
