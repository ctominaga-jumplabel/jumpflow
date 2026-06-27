# Nathal.IA — Intelligence Security & RBAC (Fase 8)

> Modelo de segurança da camada de inteligência local. Resume **o que a
> Nathal.IA pode e não pode fazer**, como o RBAC é aplicado e as ameaças
> consideradas.
>
> Última atualização: **2026-06-17** (Fase 8 — Intelligence Layer).

## Postura (não-negociável nesta fase)

A Nathal.IA **nunca**:

1. **Responde dados não autorizados.** Todo conteúdo é curado (FAQ + base de
   conhecimento). Documentos e FAQs sensíveis carregam `roles`; a busca os filtra
   antes mesmo de pontuar, então não vazam para o perfil errado.
2. **Executa ações sem permissão.** Toda tool passa por `canExecuteAction`
   (`nathaliaPermissions.ts`). Tools `sensitive` ficam **bloqueadas** e, se um dia
   habilitadas, **exigem confirmação explícita**.
3. **Expõe informações sensíveis.** Não há leitura de dados reais. Tópicos
   financeiros explicam **conceitos**, nunca valores.
4. **Faz escrita.** Não existe tool de escrita, aprovação ou submissão. As tools
   atuais são apenas navegação, destaque de elemento e tours.

## Onde o RBAC é aplicado (defesa em profundidade)

| Camada | Gate | Efeito |
| --- | --- | --- |
| Knowledge Search | `roles` do documento | docs restritos nunca são pontuados/retornados |
| FAQ Engine | `roles` da entrada | FAQs restritas nunca casam para o perfil errado |
| Context Awareness | `faqEngine.list({ roles })` | perguntas sugeridas já vêm filtradas |
| Brain (tópico) | `canAnswerTopic` / `canAccessContext` | não navega/responde sobre tela proibida |
| Brain (tool) | `ToolRegistry.canRun` → `canExecuteAction` | navegação/tour só se permitido; sensível bloqueado |
| Provider (execução) | `runAction` → `canExecuteAction` | gate final antes de qualquer efeito no host |
| Rota | `apps/web/src/proxy.ts` + guards | a própria tela rejeita acesso indevido |

Mesmo que uma camada falhe, a seguinte segura. A navegação para uma tela
restrita é bloqueada **na origem** (o brain), e ainda assim a rota tem seu
próprio guard.

## Matriz de tópicos × perfis

| Tópico/Contexto | Perfis que podem ouvir/navegar |
| --- | --- |
| Geral, Dashboard, Horas, Despesas, Projetos, Clientes, Consultores, Relatórios | qualquer usuário autenticado |
| Aprovações | ADMIN, AREA_MANAGER, PROJECT_MANAGER, FINANCE |
| Financeiro (conceitos) | ADMIN, AREA_MANAGER, FINANCE |
| Acessos/Administração | ADMIN |

Fonte: `APPROVAL_ROLES` / `FINANCE_ROLES` em `nathaliaPermissions.ts`, espelhando
os papéis do host (`RoleName`).

## Modelo de ameaças (e mitigação)

- **Prompt injection / pedido malicioso** → não há LLM nem execução dinâmica; as
  respostas vêm de um catálogo fixo. O pior caso é uma resposta curada irrelevante.
- **Escalada por pergunta** ("me explica a fila de aprovação") de um consultor →
  FAQ/knowledge de aprovações têm `roles`; o match nunca ocorre, cai no fallback
  honesto sem confirmar que o recurso existe.
- **Navegação indevida** ("ir para acessos") → `canAccessContext` bloqueia antes
  de oferecer a tool; resposta é `blockedByPermission`.
- **Vazamento de valores financeiros** → nenhum dado real é lido; conteúdo
  financeiro é conceitual por construção.
- **Ação sem consentimento** → não há tools de escrita; `sensitive` é bloqueada e
  exigiria confirmação. O proativo só **sinaliza** (nunca abre o painel nem age).

## Auditoria

Nesta fase a Nathal.IA não muta estado de negócio, então não há eventos de
auditoria próprios. Quando tools sensíveis forem habilitadas (fase futura), cada
execução deverá: (1) exigir confirmação explícita, (2) passar pelo gate de RBAC
do host e (3) gerar registro de auditoria, como já ocorre para aprovações,
alocações e valores.

## Checklist para novas FAQs / documentos / tools

- [ ] Conteúdo é conceitual e **não** expõe dados reais?
- [ ] Se for tópico restrito, declarei `roles`?
- [ ] A tool é navegação/UI/tour (sem escrita)? Se sensível, está bloqueada e
      exigiria confirmação?
- [ ] Testei como um perfil **sem** acesso e confirmei que cai no fallback?

Relacionados: [`INTELLIGENCE_ARCHITECTURE.md`](./INTELLIGENCE_ARCHITECTURE.md),
[`TOOLING_GUIDE.md`](./TOOLING_GUIDE.md), [`FAQ_GUIDE.md`](./FAQ_GUIDE.md).
