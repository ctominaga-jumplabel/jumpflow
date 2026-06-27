# Nathal.IA — Proactive Guide (Fase 8)

> Eventos proativos **seguros**. Código em
> `packages/character-nathalia/src/intelligence/proactive/ProactiveEngine.ts`.

## Princípio

A Nathal.IA pode **sugerir ajuda**, nunca **interromper**. Sem alertas
agressivos, sem abrir o painel sozinha, sem agir sem consentimento. O engine só
**sinaliza** (via `notifyNathalia`, que mostra um ponto no widget minimizado).

## Como funciona

`ProactiveEngine` é uma **função de decisão pura** — não lê relógio, DOM nem
rede. O host dispara sinais explícitos e o engine decide se um **único nudge,
de-duplicado** é cabível.

```ts
const nudge = engine.evaluate({
  trigger: "first-visit",
  context: "hours",
  user,
  isOpen: false,   // nunca interrompe painel aberto
  roles: user.roles,
});
if (nudge) notifyNathalia(nudge.message);
```

Regras embutidas: nada quando `isOpen` é `true`, nada sem `user`, e cada `id` de
nudge dispara **no máximo uma vez por instância** (≈ uma sessão).

## Gatilhos seguros

| Trigger | Quando | Nudge |
| --- | --- | --- |
| `first-visit` | primeira vez na sessão | boas-vindas leve |
| `first-screen-visit` | primeira vez numa tela | mensagem de Context Awareness |
| `user-lost` | usuário parece perdido (host decide) | oferta gentil de ajuda |
| `tour-available` | tela tem tour disponível | oferta de tour |

## Wiring atual no app

O `NathaliaProvider` dispara **apenas** `first-visit`, uma vez por sessão, e usa
`notifyNathalia` (ponto discreto). Conservador de propósito. Outros gatilhos
existem no engine e podem ser ligados quando houver sinal confiável de UX — sempre
gentis.

## Adicionando um nudge

1. Adicione o `trigger` ao union `ProactiveTrigger` e um `case` em `build()`.
2. Mensagem curta e amigável; `priority: "gentle"`.
3. Se oferecer uma tool, use só ações seguras (ex.: `startHoursTour`).
4. Garanta um `id` estável para a de-duplicação.
5. Dispare a partir de um sinal **confiável** no host; nunca em loop/timer
   agressivo. Teste no Lab (`/app/dev/nathalia`).

## Anti-padrões (não faça)

- Abrir o painel automaticamente.
- Repetir o mesmo nudge na mesma sessão.
- Disparar em cada navegação (ruído).
- Sugerir ação sensível ou que exija escrita.
