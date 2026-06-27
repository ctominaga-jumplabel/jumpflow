# Nathal.IA — Guia prático: criar o `.riv` no rive.app

Companion do [`RIVE_SPEC.md`](./RIVE_SPEC.md) (que define o **contrato**). Aqui é o
**passo a passo** de como produzir o arquivo no editor do Rive. Não precisa saber
programar — é a parte de design/animação. O código que consome o `.riv` já está
pronto; você só precisa que o arquivo respeite os nomes/inputs da spec.

> Conceitos do Rive que vamos usar: **Artboard** (a "tela" da personagem),
> **Animations** (timelines), **State Machine** (lógica), **Inputs** (Number /
> Boolean / Trigger que o nosso app seta), **Layers** (camadas independentes
> dentro da state machine) e **Export** (gerar o `.riv`).

---

## Etapa 0 — Conta e arquivo

1. Acesse https://rive.app e crie uma conta (tem plano grátis).
2. **Create → New File**. Abre o editor com um Artboard vazio.
3. Renomeie o Artboard para **`Nathalia`** (duplo clique no nome dele na árvore à
   esquerda / painel de hierarquia).

---

## Etapa 1 (recomendada) — `.riv` "fumaça" para validar o encaixe ANTES da arte

Antes de investir na arte final, faça um arquivo mínimo só para confirmar que a
integração liga. Isso te dá feedback em minutos.

1. No Artboard `Nathalia`, desenhe **um círculo** (ferramenta Ellipse) e **uma
   elipse pequena** no meio (vai ser a "boca").
2. Vá em **Animate** (alterna Design/Animate no topo) e crie 3 animações simples
   (botão + na lista de animations):
   - `mood_demo` — anime a cor do círculo mudando (1 keyframe diferente).
   - `mouth_open` — anime a "boca" esticando em Y.
   - `mouth_rest` — boca fechadinha (estado neutro).
3. Crie a **State Machine** (aba State Machine → +) e renomeie para **`Nathalia`**.
4. Adicione os **Inputs** (painel Inputs dentro da state machine):
   - `mood` → **Number**
   - `speaking` → **Boolean**
   - `viseme` → **Number**
5. Ligue grosseiramente: um estado tocando `mouth_rest`; quando `speaking = true`,
   transita para `mouth_open` (condição: `speaking is true`). Não precisa ficar
   bonito — é só pra ver mexer.
6. **Export** (menu do arquivo → **Download** / **Export for runtime** → `.riv`).
7. Salve como `apps/web/public/nathalia/rive/nathalia.riv`, ligue
   `NEXT_PUBLIC_NATHALIA_RIVE=true` e abra `/app/dev/nathalia`. Clique em "falar":
   a boca deve abrir. **Se isso funcionar, o pipeline está provado** — agora é só
   trocar o conteúdo pela arte real, mantendo nomes/inputs.

---

## Etapa 2 — A arte da personagem (rig)

Aqui mora o blink/visema "de verdade". A chave é a personagem ter **partes
separadas e editáveis**: olhos/pálpebras, boca, sobrancelhas.

Opções de origem da arte:

- **Importar vetor (melhor):** desenhe a Nathal.IA no Figma/Illustrator como
  camadas (olhos, pálpebras, boca, cabelo, corpo) e **importe o SVG** no Rive
  (File → Import). Cada camada vira um shape editável.
- **Desenhar no próprio Rive:** o editor tem ferramentas de vetor (Pen, shapes).
- **A partir das ilustrações atuais (`.webp`):** dá pra importar como imagem, mas
  imagem "chapada" não permite pálpebra separada — então, para blink real, os
  olhos/boca precisam ser **vetor** por cima (ou usar Mesh/ossos sobre a imagem).

Siga a identidade visual de [`ASSET_GUIDE.md`](./ASSET_GUIDE.md) (camiseta preta,
logo laranja, cabelo escuro ondulado). Estruture a hierarquia assim:

```
Nathalia (Artboard)
├─ Corpo / camiseta (com logo)
├─ Cabeça
│  ├─ Olhos
│  │  ├─ Olho_E / Olho_D (íris+branco)
│  │  └─ Pálpebra_E / Pálpebra_D   ← peça que fecha no blink
│  ├─ Sobrancelhas (humor)
│  └─ Boca   ← muda por visema
```

> Dica: pálpebra = uma forma na cor da pele que cobre o olho ao "descer"
> (ou escale o olho em Y até fechar). Boca = um shape cujo formato você anima por
> visema (ou várias bocas e troca a visível).

---

## Etapa 3 — Animations (timelines)

Crie, no modo **Animate**, uma timeline para cada coisa que muda. Sugestão de
divisão por **camadas** (a state machine vai tocar várias ao mesmo tempo):

**Camada corpo/humor** — uma animação curta por humor (pode começar com poucas e
ir crescendo). Use a ordem de índice da spec:

| `mood` | animação sugerida |
|---|---|
| 0 idle | `idle` (respiro leve em loop) |
| 1 welcome | `welcome` (aceno) |
| 2 listening | `listening` |
| 3 thinking | `thinking` |
| 4 searching | `searching` |
| 5 explaining | `explaining` |
| 6 pointing | `pointing` |
| 7 happy | `happy` |
| 8 warning | `warning` (atento) |
| 9 error | `error` (acolhedor) |
| 10 success | `success` |
| 11 celebrate | `celebrate` |

> Pode começar mapeando só `idle/thinking/happy/celebrate` e deixar os outros
> caindo no `idle` — funciona e você evolui depois.

**Camada boca/visema** — uma animação (ou pose) por forma de boca, na ordem:

| `viseme` | boca |
|---|---|
| 0 rest | fechada/neutra |
| 1 a | aberta "A" |
| 2 e | "E" |
| 3 i | "I" |
| 4 o | "O" |
| 5 u | "U" |
| 6 m | lábios juntos (M/B/P) |
| 7 l | "L" (língua) |
| 8 fv | lábio-dental (F/V) |
| 9 r | "R" |
| 10 tdn | "T/D/N" |

**Camada blink (idle)** — uma animação `blink` (pálpebra desce e sobe rápido,
~120ms). Essa roda **sozinha** dentro da state machine, em loop com intervalos —
o app **não** controla o blink.

---

## Etapa 4 — State Machine `Nathalia`

Use **camadas (layers)** para que humor, boca e blink rodem independentes:

1. **Inputs** (já criados na Etapa 1): `mood` (Number), `speaking` (Boolean),
   `viseme` (Number).

2. **Layer "Humor"**: um estado por humor, cada um tocando a animação
   correspondente. Transições a partir de "Any State" com condição de igualdade
   no número, ex.: `mood Equal 3` → estado `thinking`. Crie uma transição por
   índice que você suportar.

3. **Layer "Boca"**:
   - Estado padrão `rest`.
   - Quando `speaking is true`, entra no fluxo de visemas: um estado por visema
     com transição `viseme Equal N` → boca N. Quando `speaking is false`, volta
     pra `rest`.
   - Alternativa mais simples: um **1D Blend State** com a entrada `viseme`
     misturando as poses de boca (bom para suavizar). Comece pelo discreto se for
     mais fácil.

4. **Layer "Blink"**: estado `idle_eyes` que dispara `blink` em loop com um
   intervalo aleatório (use um "Blink loop" ou transições temporizadas). Não
   depende de input — é vida própria.

> Não precisamos de **Listeners** (clique/hover): quem dirige os inputs é o app
> React. É só expor os inputs corretamente.

---

## Etapa 5 — Exportar e ligar

1. No editor: menu do arquivo → **Export** / **Download** → formato **`.riv`**
   (runtime), não `.rev`.
2. Salve em `apps/web/public/nathalia/rive/nathalia.riv`.
3. `NEXT_PUBLIC_NATHALIA_RIVE=true` no `.env`.
4. Rode o app e abra `/app/dev/nathalia`:
   - Trocar humores deve animar a personagem.
   - "Falar (lip-sync)" deve mexer a boca pelos visemas.
   - Em idle, ela deve piscar sozinha.
5. Sem o `.riv` (ou com erro), o app cai no avatar 2D — então nada quebra durante
   a produção.

---

## Se algum nome ficar diferente

Se no editor você nomear o artboard, a state machine ou os inputs de outro jeito
(ou usar outra ordem de índice), me avise: eu ajusto as constantes em
[`nathaliaRive.ts`](../../packages/character-nathalia/src/nathaliaRive.ts)
(`NATHALIA_RIVE_ARTBOARD`, `NATHALIA_RIVE_STATE_MACHINE`, `NATHALIA_RIVE_INPUTS`,
`NATHALIA_RIVE_MOODS`, `NATHALIA_RIVE_VISEMES`) — sem mexer no resto do código.

## Caminhos se você não for desenhar

- **Comissionar** um designer Rive (há freelancers especializados) entregando
  este guia + a spec.
- **Partir de um template** da Rive Community (há personagens com blink/fala
  prontos) e re-skinar com a identidade da Nathal.IA, renomeando artboard/SM/inputs
  para o nosso contrato.
- Enquanto isso, o avatar **2D atual** segue funcionando normalmente.
