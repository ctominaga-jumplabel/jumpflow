# Nathal.IA — Posicionamento do Painel (Fase 8.1, Etapa 1)

## Problema

O painel abria parcialmente fora da viewport. Em telas menores (ou com zoom do
navegador), o **topo** do painel saía da tela e o usuário precisava reduzir o
zoom para conseguir usar a assistente. Isso era inaceitável.

## Objetivo

O painel **nunca** pode ultrapassar nenhuma borda da viewport:

- topo
- base
- lateral esquerda
- lateral direita

## Regras

A âncora do widget é fixa no **canto inferior direito**. O painel cresce para
**cima e para a esquerda** a partir dela. O tamanho e a ancoragem são resolvidos
a cada render e a cada `resize`/`orientationchange` por uma função pura
(`resolveNathaliaPanelLayout`) — sem ler relógio, rede ou layout do DOM.

Algoritmo (`packages/character-nathalia/src/nathaliaPanelLayout.ts`):

1. **Margem de segurança** (`edgeMargin`, padrão `24px`) reservada de cada borda.
2. **Espaço disponível** = `viewport − 2 × margem`.
3. **Viewport folgada → ancoragem `"corner"`**: painel premium
   (`560 × 480`), reduzido **apenas** o necessário para caber, nunca abaixo dos
   mínimos utilizáveis (`300 × 380`).
4. **Viewport apertada → ancoragem `"sheet"`**: quando a tela é **estreita**
   (largura `< 480px`) **ou** baixa demais para o mínimo de altura, o painel vira
   uma folha quase cheia, com margem fina (`12px`). Assim celulares e janelas em
   paisagem curta ainda recebem um painel completo e rolável.

Como **os dois ramos dimensionam o painel para caber dentro do espaço
disponível** e ele é ancorado ao canto, **nenhuma borda pode vazar** — por
construção, não por tentativa e erro.

### Resumo "abrir acima / abrir ao lado"

- **Acima** (caso normal): há espaço vertical → o painel sobe a partir do canto
  (ancoragem `corner`). Esta é a direção padrão porque a âncora é inferior.
- **Ao lado / folha** (sem espaço): viewport baixa/estreita → o painel se
  expande para ocupar a tela como folha (`sheet`), reposicionando-se
  automaticamente em vez de transbordar.

## Reposicionamento automático

`useNathaliaPanelLayout` (client hook) mede `window.innerWidth/Height`, recalcula
no primeiro efeito e reassina em `resize` e `orientationchange`. Antes do mount
(SSR) devolve um padrão de desktop estável, então "encaixa" no viewport real no
primeiro efeito — sem surpresas de hidratação.

## Aplicação

`NathaliaChatPanel` aplica `style={{ width, height }}` resolvidos e expõe
`data-nathalia-placement="corner | sheet"` para depuração/QA. Não há mais
`h-[32rem]`/`max-h-[80vh]` fixos.

## Tamanhos (Etapa 2)

| Token             | Valor   | Faixa pedida |
| ----------------- | ------- | ------------ |
| `preferredWidth`  | `560px` | 520–600px    |
| `preferredHeight` | `480px` | 420–520px    |
| `minWidth`        | `300px` | —            |
| `minHeight`       | `380px` | —            |

## Testes

- `apps/web/src/components/nathalia/__tests__/ux-polish.test.ts`
  - desktop folgado → `corner` 560×480, sem ajuste;
  - celular estreito (360×640) → `sheet`;
  - paisagem curta (820×420) → `sheet`;
  - varredura de viewports: `width + 2·offset ≤ vw` e `height + 2·offset ≤ vh`
    para todos (garante "nunca fora da tela").
- Laboratório (`/app/dev/nathalia`): seção **Posicionamento do painel** mostra a
  resolução para presets de viewport e um botão "Abrir painel ao vivo".
