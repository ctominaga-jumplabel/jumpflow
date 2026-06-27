# Nathal.IA — Especificação do arquivo Rive (`.riv`)

Este documento é o **contrato** entre o `.riv` autorado no editor do Rive
(rive.app) e a integração de runtime já pronta no código
([`NathaliaAvatarRive.tsx`](../../packages/character-nathalia/src/NathaliaAvatarRive.tsx)
+ [`nathaliaRive.ts`](../../packages/character-nathalia/src/nathaliaRive.ts)).

> O `.riv` **não** pode ser gerado por código — é arte vetorial + rig + state
> machine criados no editor do Rive. Esta spec diz exatamente o que o arquivo
> precisa expor para "encaixar" sem mudar código.
>
> **Como construir o arquivo passo a passo:** veja
> [`RIVE_AUTHORING_GUIDE.md`](./RIVE_AUTHORING_GUIDE.md). Esta spec é o *contrato*;
> o guia é o *passo a passo* no editor (rive.app).

## Por que Rive

Os assets atuais são bustos de rosto inteiro (`.webp`), sem camada de olhos/boca,
então blink e visemas em CSS ou achatam o círculo ou criam "olhos fantasma". No
Rive a personagem é vetorial e *rigada*: pálpebras, boca e olhar viram peças
controladas por uma **state machine** — blink de verdade e lip-sync limpo.

## Entrega

- Arquivo: **`nathalia.riv`** em `apps/web/public/nathalia/rive/nathalia.riv`
  (servido como `/nathalia/rive/nathalia.riv`).
- Otimizado para leitura em ~40–160px (o launcher usa ~80px).
- Idle blink/olhar **internos** à state machine (não dependem do React).
- Respeitar leveza; sem dependências externas no `.riv`.

## Artboard e State Machine

| Item | Nome exato | Constante |
| ---- | ---------- | --------- |
| Artboard | `Nathalia` | `NATHALIA_RIVE_ARTBOARD` |
| State Machine | `Nathalia` | `NATHALIA_RIVE_STATE_MACHINE` |

> Se preferir outros nomes no editor, ajuste as constantes em `nathaliaRive.ts`
> (não é preciso tocar no resto do código).

## Inputs da State Machine

| Input | Tipo | Constante | Significado |
| ----- | ---- | --------- | ----------- |
| `mood` | Number | `NATHALIA_RIVE_INPUTS.mood` | Índice do estado/humor (ver tabela) |
| `speaking` | Boolean | `NATHALIA_RIVE_INPUTS.speaking` | `true` enquanto fala (abre/move a boca) |
| `viseme` | Number | `NATHALIA_RIVE_INPUTS.viseme` | Índice da forma de boca (ver tabela) |

O React seta esses inputs; a state machine decide as transições/poses. O **blink
e o olhar do idle são responsabilidade do `.riv`** (timers internos), não do React.

### `mood` → índice (ordem de `NATHALIA_RIVE_MOODS`)

| 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|----|----|
| idle | welcome | listening | thinking | searching | explaining | pointing | happy | warning | error | success | celebrate |

### `viseme` → índice (ordem de `NATHALIA_RIVE_VISEMES`)

| 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|----|
| rest | a | e | i | o | u | m | l | fv | r | tdn |

> `rest` (0) = boca fechada/neutra. Quando `speaking=false`, o React mantém
> `viseme=0`. Os índices são a **fonte de verdade**; mantenha a state machine
> alinhada a esta ordem (ou edite os arrays em `nathaliaRive.ts`).

## Como ligar

1. Exporte o `.riv` e coloque em `apps/web/public/nathalia/rive/nathalia.riv`.
2. Garanta os nomes/inputs acima (ou ajuste `nathaliaRive.ts`).
3. Ligue a flag: `NEXT_PUBLIC_NATHALIA_RIVE=true`.
4. Valide no Lab (`/app/dev/nathalia`) e no widget: trocar humores deve animar a
   personagem; "falar" deve mover a boca pelos visemas.

## Comportamento sem o `.riv`

Com a flag ligada mas sem o arquivo (ou erro de decode), o runtime dispara
`onLoadError` e renderizamos o **avatar 2D** atual como fallback — nada quebra.
Primeiro paint é sempre 2D (decisão de renderer após mount), sem surpresa de SSR.

## Sugestão de arte (rig)

Reaproveite a direção visual atual (camiseta preta, logo laranja, cabelo escuro
ondulado). Peças mínimas para rigar: pálpebras (blink), boca (visemas A/E/I/O/U/
M/L/F-V/R/T-D-N/rest), sobrancelhas (humor), leve respiro/olhar. Ver
[`ASSET_GUIDE.md`](./ASSET_GUIDE.md) para paleta/identidade.
