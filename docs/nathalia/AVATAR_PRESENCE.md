# Nathal.IA — Presença do Avatar (Fase 8.1, Etapa 3)

## Problema

O avatar tinha pouca presença visual. Ao olhar para a tela, o usuário não
percebia a Nathal imediatamente.

## Objetivo

Ao olhar para a tela, o usuário deve perceber a Nathal **imediatamente** — sem
aumentar agressivamente a área ocupada.

## Mudanças

### Launcher flutuante (`NathaliaWidget`)

- **Bust maior**: avatar de `64px` → `72px`, com `padding` interno um pouco
  maior e sombra mais marcada (`5px` em vez de `4px`).
- **Anel de intenção**: `withRing` agora ativo no launcher — o anel colorido
  segue o `intent` do estado atual (neutro, positivo, atenção…), reforçando a
  leitura da expressão.
- **Halo de atenção**: quando há um nudge não visto (`hasNotification`), um halo
  suave pulsa atrás do botão. É puramente decorativo, `aria-hidden`, e **não**
  aparece sob `prefers-reduced-motion`.
- O ponto de notificação (marker) foi mantido.

### Cabeçalho do painel (`NathaliaChatPanel`)

- Avatar do cabeçalho de `44px` → `52px`, com pop de entrada sutil (Etapa 6).
- O rosto fica mais evidente e a expressão mais legível, pois o enquadramento
  `bubble` já recorta para o busto (face + ombros).

## Restrição respeitada

A área ocupada cresce de forma contida: o launcher continua sendo um botão
circular no canto; o ganho de presença vem de **tamanho do busto + anel + halo**,
não de um elemento maior na tela.

## Acessibilidade / Motion

- Toda animação de presença (halo, pop) é desligada sob
  `prefers-reduced-motion` via `useReducedMotion`.
- `aria-label` da assistente e do ponto de notificação preservados.
- Fallback 2D permanece o avatar padrão; o 3D continua opt-in por flag.

## Referências de código

- `packages/character-nathalia/src/NathaliaWidget.tsx`
- `packages/character-nathalia/src/NathaliaChatPanel.tsx`
- `packages/character-nathalia/src/NathaliaAvatar2D.tsx` (expressões/enquadramento)
