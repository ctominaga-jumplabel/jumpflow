# Nathal.IA — FAQ Guide (Fase 8)

> Como escrever e curar FAQs. Código em
> `packages/character-nathalia/src/intelligence/faq/`. **Sem LLM** — o match é
> por sobreposição de palavras-chave.

## Estrutura

Cada tópico tem um arquivo (`hours.ts`, `projects.ts`, `approvals.ts`,
`reports.ts`, `settings.ts`) que exporta um array de `NathaliaFaqEntry`. Todos são
agregados em `entries.ts` (`nathaliaFaqEntries`).

```ts
interface NathaliaFaqEntry {
  id: string;            // "faq-<topico>-<slug>"
  question: string;      // pergunta canônica (pt-BR)
  variations: string[];  // outras formas de perguntar / palavras-chave
  answer: string;        // resposta curada, conceitual
  context: NathaliaContextKey;
  roles?: string[];      // RBAC: perfis que podem ver (vazio = todos)
  action?: NathaliaActionId;  // tool segura opcional a oferecer
  relatedDocId?: string;      // documento de "saiba mais"
}
```

## Como o match funciona

`NathaliaFAQEngine.match(query, { context, roles, minScore })`:

1. **RBAC** — entradas cujo `roles` o usuário não tem nunca casam.
2. Score = melhor sobreposição entre os tokens da pergunta e
   `question`/`variations`, com bônus por frase exata e por contexto atual.
3. `best()` devolve a melhor acima de `minScore` (default 0.34) ou `null`.

## Boas práticas

- **Escreva variações reais** — como as pessoas realmente perguntam ("apontar
  horas", "registrar tempo"). Isso é o que melhora o recall sem LLM.
- **Respostas conceituais** — passo a passo e significado, nunca dados reais nem
  valores.
- **Uma pergunta por entrada** — não junte tópicos; o score fica mais preciso.
- **Ofereça uma tool segura** quando fizer sentido (`action`), p.ex. `navigateToHours`
  ou `startHoursTour`. Nunca uma ação sensível.
- **Tópico restrito?** Declare `roles` (mesmos papéis usados na tela). Ver
  [`INTELLIGENCE_SECURITY.md`](./INTELLIGENCE_SECURITY.md).
- **Ligue ao conhecimento** via `relatedDocId` quando houver um documento mais
  longo em [`KNOWLEDGE_BASE.md`](./KNOWLEDGE_BASE.md).

## Adicionando uma FAQ

1. Edite o arquivo do tópico (ou crie a entrada no arquivo correto).
2. Use um `id` único com prefixo do tópico.
3. Rode `npm run typecheck` e teste no Lab (`/app/dev/nathalia`) simulando o
   perfil-alvo **e** um perfil sem acesso (deve cair no fallback).

## Checklist

- [ ] `question` clara + 3–5 `variations` realistas
- [ ] resposta conceitual, sem dado real
- [ ] `roles` se restrito
- [ ] `action` apenas se segura (navegação/tour)
- [ ] testado no Lab com perfil com e sem acesso
