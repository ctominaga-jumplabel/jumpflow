# Nathal.IA — Knowledge Base (Fase 8)

> O conteúdo curado que alimenta as respostas da Nathal.IA. **Sem LLM**: a busca
> é local e determinística (palavras-chave + pontuação). Fonte de dados:
> `packages/character-nathalia/src/intelligence/knowledge/documents.ts`.

## O que é

A base de conhecimento é um conjunto de `KnowledgeDocument`s — pequenas peças de
ajuda em pt-BR extraídas da documentação do produto, das FAQs e dos textos das
telas. Cada documento tem:

| Campo | Papel |
| --- | --- |
| `id` | identificador estável |
| `title` | título curto (sinal forte de busca) |
| `body` | texto da resposta (conceitual, nunca dado real) |
| `tags` | sinônimos/palavras-chave extras |
| `context` | área do app (`hours`, `projects`, …) |
| `roles?` | perfis que podem ver (RBAC); vazio = todos |
| `source` | de onde veio o conteúdo (rastreabilidade) |

## Como a busca funciona

`searchKnowledge(registry, query, { context, roles, limit, minScore })`:

1. **RBAC primeiro** — documentos cujo `roles` o usuário não possui não são nem
   pontuados.
2. **Pontuação** (0–1): sobreposição de tokens com `title` (0.55) + `tags` (0.30)
   + `body` (0.15), bônus por conter a frase exata no título e por bater com o
   contexto atual.
3. Ordena por score e devolve os melhores acima de `minScore` (default 0.2).

Tokenização (`text.ts`): minúsculas, remove acentos e stop-words pt-BR — então
"Aprovação" e "aprovacao" são equivalentes.

## Cobertura atual

| Contexto | Documentos | Restrição |
| --- | --- | --- |
| general | o que é o JumpFlow, quem é a Nathal.IA | — |
| hours | lançar, enviar, status, corrigir reprovadas | — |
| projects | visão geral, alocação, meus projetos | — |
| approvals | fila de aprovação, aprovação automática | aprovadores/gestão |
| reports | quais existem, escopo dos dados | — |
| finance | fechamento financeiro (conceito) | ADMIN/AREA_MANAGER/FINANCE |
| settings | acessos/convites/perfis | ADMIN |

## Como adicionar conhecimento

1. Adicione um objeto a `knowledgeDocuments` em `documents.ts`.
2. Conteúdo **conceitual** — nunca exponha valores ou dados reais.
3. Tópico restrito? Declare `roles` (ver
   [`INTELLIGENCE_SECURITY.md`](./INTELLIGENCE_SECURITY.md)).
4. Inclua sinônimos em `tags` para melhorar o recall.
5. Para estender em runtime sem editar o pacote, use
   `new KnowledgeRegistry(knowledgeDocuments).addMany([...])` e injete um
   `LocalKnowledgeProvider(registry)` no `NathaliaBrain`.

## Seam para LLM (futuro)

`KnowledgeProvider` é a interface. Hoje há `LocalKnowledgeProvider`
(palavras-chave). Um provider com embeddings/LLM implementaria a mesma interface
e o resto do cérebro não mudaria — ver
[`INTELLIGENCE_ARCHITECTURE.md`](./INTELLIGENCE_ARCHITECTURE.md).
