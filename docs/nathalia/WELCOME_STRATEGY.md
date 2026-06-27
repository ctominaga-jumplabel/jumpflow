# Nathal.IA — Estratégia de Boas-vindas (Fase 8.1, Etapa 4)

## Problema

A mensagem inicial era genérica:

> "Oi! Sou a Nathal.IA. Posso te ajudar a navegar pelo JumpFlow."

Não usava nome, nem contexto, nem percepção da tela atual.

## Objetivo

Usar **Context Awareness** + o nome do usuário para uma abertura calorosa e
útil, que reconhece onde a pessoa está.

## Comportamento

Módulo puro `nathaliaWelcome.ts`:

```ts
nathaliaWelcome(context, user) → { greeting, body, full }
```

- `greeting`: `Olá, {primeiroNome}!` (ou `Olá!` quando o nome é desconhecido).
- `body`: frase contextual da tela atual (uma frase, humana, sem jargão).
- `full`: `greeting + body` (usado como headline do painel).

A mensagem é aplicada pela store em `openNathalia()` (e ao trocar de contexto com
o log vazio), então **não** depende do cérebro/LLM e é barata.

### Exemplos

**Home / Geral**

> Olá, Ana! Posso ajudar você a navegar pelo JumpFlow, lançar horas, acompanhar
> aprovações e encontrar informações rapidamente.

**Horas**

> Olá, Ana! Vejo que você está em Horas. Posso ajudar com lançamentos, status ou
> envio dos apontamentos.

**Projetos**

> Olá, Ana! Posso ajudar a entender os projetos, vínculos e indicadores desta
> tela.

## Regras de tom

- Uma frase de corpo, curta e direta (alinhado à Etapa 7).
- Telas específicas reconhecem a localização ("Vejo que você está em …").
- Home e Dashboard descrevem o valor amplo, sem "Vejo que você está…".
- Sem nome → continua calorosa ("Olá!"), nunca quebra.

## RBAC

A boas-vindas não revela nada sensível: é só copy de orientação por tela. As
**sugestões** e **perguntas relacionadas** continuam filtradas por perfil (FAQ +
`canExecuteAction`), então a abertura nunca oferece algo que o perfil não pode
fazer.

## Código

- `packages/character-nathalia/src/nathaliaWelcome.ts`
- `packages/character-nathalia/src/nathaliaStore.ts` (`openNathalia`,
  `setNathaliaContext`)
- Testes: `apps/web/src/components/nathalia/__tests__/ux-polish.test.ts`
