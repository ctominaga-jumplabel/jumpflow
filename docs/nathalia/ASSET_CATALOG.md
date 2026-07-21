# Nathal.IA — Catálogo de Assets 2D

> Como os assets 2D estão organizados, o schema do catálogo e como adicionar
> novas expressões, visemas e orientações. Complementa
> [2D_ANIMATION_ARCHITECTURE.md](./2D_ANIMATION_ARCHITECTURE.md).

## Estrutura de pastas

```
packages/character-nathalia/assets/2d/
  source/        folhas originais (preservadas, nunca apagadas)
  processed/     recortes/limpezas intermediárias
  layers/
    body/{front,left,right,back}/   corpo por orientação  (PENDENTE de arte)
    face/
      expressions/   bustos de expressão        (17 .webp)
      eyes/          olhos por estado           (PENDENTE)
      mouths/        bocas neutras              (PENDENTE)
      visemes/       bocas de fala (vis-*.webp) (12 .webp)
    arms/  hands/  poses/                       (PENDENTE)
    accessories/objects/  ícones de contexto    (4 .webp)
  spritesheets/  folhas geradas (generate_spritesheet.py)
  animations/    preview.html (preview_animations.py)
  exports/       variantes web normalizadas (optimize_images.py)
  catalog.json   inventário completo (gerado)
```

Os originais servidos pelo avatar atual continuam em
`apps/web/public/nathalia/expressions/` (intactos). As pastas em `layers/` são a
biblioteca organizada por camada (cópias rastreáveis). Pastas sem arte têm um
`README.md` explicando o que entra.

## Catálogo (`catalog.json`)

Gerado por `scripts/nathalia/2d/catalog_assets.py`. Campos por asset:

| Campo | Descrição |
|-------|-----------|
| `fileName`     | nome do arquivo |
| `path`         | caminho relativo ao repo (rastreabilidade) |
| `webUrl`       | URL servida (`/nathalia/expressions/x.webp`) ou `null` |
| `rootLabel`    | origem da varredura (production/curated/sheets/...) |
| `category`     | `expression` \| `viseme` \| `object` \| `body` \| `face` \| `source` |
| `subCategory`  | chave fina (ex.: expressão `pensativa`, visema `a`) |
| `orientation`  | `front`/`left`/`right`/`back`/`side` ou `null` |
| `expression`   | chave de expressão quando aplicável |
| `suggestedUse` | uso sugerido (texto) |
| `width`,`height` | dimensão em px |
| `hasAlpha`     | tem transparência real (validado pixel a pixel) |
| `bytes`        | tamanho em bytes |
| `notes`        | observações |

Além disso, `layersPresent` resume quais camadas têm arte hoje — é o que o
frontend usa (via `hasLayer()`) para decidir compositing vs. fallback.

### Consumo no frontend

`nathaliaSpriteCatalog.ts` expõe helpers puros e SSR-safe:
`nathaliaSprites`, `spritesByCategory(cat)`, `spriteFor(cat, sub)`,
`spriteUrl(sprite)`, `hasLayer(layer)`, `nathaliaSpriteCounts`,
`nathaliaLayersPresent`. O módulo gerado embute **apenas os sprites servidos**
(33), para não inflar o bundle; o `catalog.json` mantém o inventário completo.

## Convenção de nomes

- Expressões: `<expressao>.webp` (ex.: `pensativa.webp`). Chaves válidas em
  `NATHALIA_EXPRESSIONS` (`nathaliaExpressions.ts`).
- Visemas: `vis-<v>.webp` (`vis-a`, `vis-rest`, …). Chaves em `NATHALIA_VISEMES`.
- Objetos de contexto: `icon-<obj>.webp` (`icon-horas`, …). Chaves em
  `NATHALIA_OBJECTS`.
- Corpo (futuro): nome contendo a orientação (`...front...`, `...costas...`).

## Como adicionar

### Nova expressão
1. Adicione a chave em `NATHALIA_EXPRESSIONS` (`nathaliaExpressions.ts`) e,
   se for ativada por um estado/contexto, em `STATE_EXPRESSION`/`CONTEXT_EXPRESSION`.
2. Coloque `<expressao>.webp` (transparente, quadrado, rosto centralizado) em
   `apps/web/public/nathalia/expressions/`.
3. Rode `python scripts/nathalia/2d/prepare_layers.py` (copia p/ a camada) e
   `python scripts/nathalia/2d/catalog_assets.py` (recataloga).

### Novo visema
1. Adicione a chave em `NATHALIA_VISEMES` e mapeie graphemas em `visemeForChar`.
2. Coloque `vis-<v>.webp` em `public/nathalia/expressions/`.
3. Rode `prepare_layers.py` + `catalog_assets.py`.

### Nova orientação de corpo (PENDENTE de arte)
1. Gere PNGs transparentes em `layers/body/{front,left,right,back}/`.
2. Rode `catalog_assets.py` → `hasLayer("body")` vira `true`.
3. O `NathaliaAnimationController` passa a compor o corpo como base
   automaticamente. Ver [NEXT_STEPS_LIVE2D.md](./NEXT_STEPS_LIVE2D.md).

## Validação

`python scripts/nathalia/2d/optimize_images.py --validate-only` lista imagens de
camada **sem transparência** ou **não quadradas** (sai com código 1 em violação
— nunca passa em silêncio).

## Camadas de rosto derivadas

`scripts/nathalia/2d/generate_face_overlays.py` gera uma primeira implementacao
de `face/base`, `face/eyes` e `face/mouths` a partir dos visemas servidos em
`apps/web/public/nathalia/expressions/`.

Saidas servidas pelo browser:

- `apps/web/public/nathalia/layers/face/base/base-front.webp`
- `apps/web/public/nathalia/layers/face/eyes/eyes-open.webp`
- `apps/web/public/nathalia/layers/face/eyes/eyes-closed.webp`
- `apps/web/public/nathalia/layers/face/mouths/mouth-*.webp`

O script espelha as mesmas imagens em
`packages/character-nathalia/assets/2d/layers/face/` para manter a biblioteca de
assets organizada. O catalogador evita contar esse espelho em duplicidade e
mantem no modulo gerado apenas as imagens servidas.
