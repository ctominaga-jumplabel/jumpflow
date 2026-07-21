# Nathal.IA — Próximos passos (corpo, Live2D, Rive, spritesheet)

> O sistema atual anima a Nathal.IA como **busto de rosto em camadas** (rosto +
> visemas + objeto), com motion declarativo por estado. Este documento lista o
> que falta para evoluir para uma personagem **mais viva e de corpo inteiro**,
> em ordem de menor → maior esforço.

## ⚠️ Lacuna principal: arte de corpo/poses não existe

Hoje **não há** ilustrações de corpo inteiro (frente/lados/costas), braços, mãos
ou poses. As pastas existem e estão documentadas
([ASSET_CATALOG.md](./ASSET_CATALOG.md)), porém vazias. Enquanto não houver arte:

- `hasLayer("body")` / `hasLayer("poses")` = `false`;
- o `Nathalia2DAvatar` compõe **rosto + boca + objeto** e cai graciosamente para
  o busto expressivo — nenhuma tela quebra.

A arquitetura já está pronta para a arte: assim que os PNGs transparentes forem
gerados e catalogados, o compositing de corpo passa a acontecer **sem mudança de
código** (o controller já desenha a camada `body` como base quando presente).

## 1) Camadas de rosto separadas (esforço baixo, alto impacto)

Os visemas e expressões de hoje são **rostos inteiros**, então não dá para
piscar de verdade nem trocar só a boca. Gerar:

- `layers/face/eyes/` — olhos **aberto/fechado** transparentes → piscar real
  (em vez do side-glance atual);
- `layers/face/mouths/` — bocas neutras transparentes (sorriso/neutro)
  separadas do rosto.

Com isso o controller pode sobrepor olhos e boca sobre uma **face base** sem
trocar a imagem inteira — lip-sync e blink ficam muito mais naturais.

## 2) Corpo inteiro em 4 orientações (esforço médio)

Gerar `layers/body/{front,left,right,back}/` (transparentes, centralizados, mesmo
canvas — use `optimize_images.py` para normalizar). Permite:

- avatar de meio-corpo/corpo inteiro no painel expandido;
- poses contextuais (apontar para um número, segurar o objeto da tela).

## 3) Poses e gestos (esforço médio)

`layers/poses/` + `layers/arms/` + `layers/hands/` para acenar, comemorar,
apontar. O registro de animação (`nathaliaAnimationRegistry.ts`) já tem os
estados (`wave`, `celebrate`, `alert`); basta apontar cada estado às camadas de
pose quando existirem.

## 4) Spritesheets para runtime canvas (esforço baixo)

`generate_spritesheet.py` já empacota uma camada (ex.: visemas) em folha + JSON
de frames. Útil se quisermos lip-sync em `<canvas>` (um request, troca por
recorte) em vez de `<img>`. Caminho incremental, sem reescrever o avatar.

## 5) Rive (esforço médio) — já há trilho

O pacote já tem o caminho **opt-in** para Rive (`NathaliaAvatarRiveLazy`,
`NEXT_PUBLIC_NATHALIA_RIVE=true`, `docs/nathalia/RIVE_SPEC.md`). Um `.riv`
autoral daria blink/visemas/poses interpolados de verdade, mantendo o 2D em
camadas como fallback. A fronteira lazy mantém o runtime fora do bundle inicial.

## 6) Live2D (esforço alto) — só se necessário

Live2D (Cubism) traria deformação de malha (cabelo/roupa balançando, parallax de
cabeça). Exige pipeline de arte por partes + runtime próprio (licença/peso).
**Recomendação:** só considerar depois de (1)–(3); o ganho sobre Rive + camadas
provavelmente não compensa o custo para um widget operacional.

## Recomendação de ordem

1. Olhos/bocas separados (piscar + lip-sync reais) — melhor custo/benefício.
2. Corpo em 4 orientações + poses (acenar/comemorar/apontar).
3. Spritesheet canvas se a performance de lip-sync exigir.
4. Rive autoral para interpolação rica (fallback nas camadas).
5. Live2D apenas se houver necessidade artística clara.

Sempre que adicionar arte: rode `prepare_layers.py` + `catalog_assets.py` e
valide com `optimize_images.py --validate-only`.

## Atualizacao incremental: overlays tecnicos de rosto

Ja existe uma primeira leva regeneravel de camadas separadas derivadas dos
visemas atuais:

- `apps/web/public/nathalia/layers/face/base/base-front.webp`
- `apps/web/public/nathalia/layers/face/eyes/eyes-open.webp`
- `apps/web/public/nathalia/layers/face/eyes/eyes-closed.webp`
- `apps/web/public/nathalia/layers/face/mouths/mouth-*.webp`

Elas sao geradas por `scripts/nathalia/2d/generate_face_overlays.py`, copiadas
tambem para `packages/character-nathalia/assets/2d/layers/face/` e catalogadas
como `face_base`, `eye` e `mouth`. O runtime ja prefere a boca separada durante
fala e usa overlay de olhos fechados para blink quando a flag
`NEXT_PUBLIC_NATHALIA_2D_LAYERED=true` estiver ativa.

Importante: estas camadas sao uma ponte tecnica, nao arte autoral final de
Live2D/Rive. A proxima etapa visual continua sendo gerar olhos, bocas, cabelo,
corpo e poses ja desenhados como partes independentes.
