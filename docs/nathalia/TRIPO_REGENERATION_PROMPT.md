# Nathal.IA — Prompt de Regeneração no Tripo

> Prompt melhorado para gerar um **novo modelo base** da Nathal.IA no Tripo (ou
> gerador image-to-3D similar), caso o candidato atual seja rejeitado — ver
> [`ASSET_INTAKE_REPORT.md`](./ASSET_INTAKE_REPORT.md).
>
> Objetivo: sair de um _sculpt_ denso de blob único (problema do bruto atual,
> 54.5 MB) para uma malha **game/web-ready**, leve e separável, fiel ao
> [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md). O refinamento final (rig, shape
> keys, logo, normalização) continua sendo feito no **Blender** (D-002/D-003).

## Por que regenerar

O candidato atual é um objeto único, sem separação de partes, com texturas
pesadas e malha densa — inadequado para web. Um prompt melhor reduz o retrabalho
pedindo desde já: baixa/média poligonagem, partes separadas, A-Pose, sem props.

## Prompt (EN — recomendado para o Tripo)

```text
A stylized 3D female assistant character, friendly and approachable, Pixar/Disney
corporate cartoon style (not realistic). Slightly larger head, clean simple
features, readable at small sizes.

Hair: long, dark (almost black), soft fringe.
Top: plain black t-shirt, flat clean chest area left empty for a logo to be added
later (no text, no print, no graphics on the shirt).
Bottoms: light casual pants.
Shoes: light/white casual sneakers.

Pose: relaxed light A-Pose, arms slightly away from the body, standing straight,
neutral friendly expression, facing forward.

Technical requirements:
- game/web-ready optimized mesh
- low to medium polygon count
- clean topology suitable for rigging (riggable character)
- separate objects/parts where possible (body, hair, shirt, pants, shoes, eyes)
- no animations
- no rig needed
- no accessories or complex props
- no background
- no base, no pedestal, no ground plane
- no extra objects
- no high-poly sculpt
- no cinematic or dynamic pose
- single character only, centered, standing on the ground, full body
```

## Prompt (PT — alternativa)

```text
Personagem 3D feminina estilizada, simpática e acolhedora, estilo cartoon
corporativo (Pixar/Disney), não realista. Cabeça levemente maior, traços limpos,
legível em tamanho pequeno.

Cabelo: longo, escuro (quase preto), franja suave.
Parte de cima: camiseta preta lisa, com a área do peito limpa e plana, deixada
vazia para aplicar um logo depois (sem texto, sem estampa, sem gráficos).
Parte de baixo: calça casual clara.
Calçado: tênis casual claro/branco.

Pose: A-Pose leve e relaxada, braços levemente afastados do corpo, em pé, ereta,
expressão neutra e amigável, olhando para frente.

Requisitos técnicos:
- malha otimizada para jogo/web
- baixa/média contagem de polígonos
- topologia limpa, apropriada para rigging (riggable character)
- objetos/partes separados quando possível (corpo, cabelo, camiseta, calça, tênis, olhos)
- sem animações
- sem rig
- sem acessórios ou props complexos
- sem fundo (no background)
- sem base / sem pedestal (no base pedestal)
- sem objetos extras (no extra props)
- sem sculpt high-poly (no high-poly sculpt)
- sem pose cinematográfica (no cinematic pose)
- apenas um personagem, centralizado, em pé sobre o chão, corpo inteiro
```

## Checklist do prompt (todos os pedidos obrigatórios)

- [x] personagem 3D estilizada
- [x] A-Pose leve
- [x] sem animações
- [x] sem acessórios complexos
- [x] cabelo longo escuro
- [x] camiseta preta lisa
- [x] espaço limpo para aplicar logo depois
- [x] calça casual clara
- [x] tênis claro
- [x] malha otimizada para jogo/web
- [x] baixa/média contagem de polígonos
- [x] objetos separados quando possível
- [x] riggable character
- [x] clean topology
- [x] no background
- [x] no base pedestal
- [x] no extra props
- [x] no high-poly sculpt
- [x] no cinematic pose

## Configurações sugeridas no gerador

- Ativar, se disponível: **quad/low-poly topology**, **PBR texture** em **1024²**
  (evitar 4K), **symmetry** ligada, **remesh/decimate** para alvo de polígonos.
- Alvo de polígonos: mirar **≤ 40.000 triângulos** (ideal ≤ 25.000); o limite duro
  do projeto é 60.000.
- Exportar como **glTF 2.0 binário (`.glb`)** com texturas embutidas.

## Depois de gerar

1. Salvar o `.glb` em `assets/nathalia/raw/` (binário **não versionado**).
2. Rodar o intake (ver [`ASSET_INTAKE_REPORT.md`](./ASSET_INTAKE_REPORT.md)):
   ```bash
   python scripts/nathalia/generate_asset_report.py assets/nathalia/raw/<novo>.glb --date <YYYY-MM-DD>
   ```
3. Comparar com o [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md) e decidir.
4. Se aprovado para refinamento, seguir para o Blender (Fase 4) → `master.glb`.

> Lembrete: o gerador é usado **só para o base** (D-003). Rig, shape keys, logo
> jump, materiais nomeados e normalização são sempre feitos no Blender.
