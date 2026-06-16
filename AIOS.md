# AIOS.md - Constituicao Operacional do JumpFlow

> Gerado a partir de `AIOS_TEMPLATE.md`. Esta e a constituicao real do
> repositorio. Toda IA (Claude Code, Codex, Gemini ou outra) opera sob estas
> regras. **Qualidade primeiro. Economia de token por eliminar redundancia,
> nunca por omitir contexto essencial.**

---

## 1. Prioridades (em ordem)

1. **Qualidade** do que e entregue.
2. **Documentacao persistente** (estado sobrevive a sessao).
3. **Evolucao incremental** validada.
4. **Economia de tokens** por nao repetir o que ja esta escrito.
5. **Evitar retrabalho**.

Quando duas prioridades conflitam, a de numero menor vence. Economia de token
**nunca** justifica pular um teste, pular validacao no servidor ou omitir
contexto que muda a decisao.

---

## 2. Fonte de Verdade (hierarquia)

A conversa e **descartavel**. Nao confie no historico do chat como memoria.

1. **O codigo atual** (o que esta no repositorio agora).
2. `.ai/state/CURRENT_STATE.md` - onde o projeto esta.
3. `.ai/state/DECISIONS.md` - decisoes e o porque (append-only).
4. `.ai/state/NEXT_STEPS.md` - o que fazer a seguir.
5. `AIOS.md` (este arquivo) + `docs/arquitetura.md` + `docs/modelo-dados.md`.
6. `docs/backlog-melhorias-telas-2026-06.md` + `docs/backlog-mvp.md` - backlog.
7. A conversa atual - so instrucao pontual da tarefa em andamento.

> Se a conversa contradiz um arquivo de estado, **o arquivo vence** - ou o
> arquivo precisa ser atualizado primeiro, de forma explicita.
>
> Atencao especifica do JumpFlow: o **schema Prisma esta a frente da UI**. Antes
> de "implementar do zero", confirme em `packages/database/prisma/schema.prisma`
> se o campo/modelo ja existe. Muita coisa so precisa de UI + Server Action.

---

## 3. Arquivos de estado (`.ai/state/`)

Pequenos e atuais. Se um cresce demais, e sinal de poda (Sec. 7).

- **`CURRENT_STATE.md`** - fase atual, o que funciona, o que falta. <= ~150 linhas.
- **`DECISIONS.md`** - log curto: `[data] decisao - motivo - alternativas`. Append-only.
- **`NEXT_STEPS.md`** - fila imediata. 3 a 7 itens, nao o backlog inteiro.
- **`ROADMAP.md`** - plano faseado do inicio ao fim (visao macro).
- **`BACKLOG.md`** - ponteiro para os backlogs em `docs/`.

---

## 4. Regras de economia de contexto

1. **Contexto minimo.** Leia nesta ordem: `CURRENT_STATE.md` -> `NEXT_STEPS.md`
   -> so os arquivos da tarefa. Nunca carregue o projeto inteiro.
2. **Nao repita o que ja esta escrito.** Referencie o arquivo, nao recopie.
3. **Prompts cirurgicos.** "Leia CURRENT_STATE.md e implemente a tarefa X".
4. **Cite por caminho** (`apps/web/src/app/app/horas/actions.ts:295`), nao cole
   o arquivo inteiro quando nao for necessario.
5. **Economize por redundancia, nao por omissao.** Contexto que muda a decisao
   tecnica entra - custe o que custar.
6. **Explore com subagentes.** Para varredura ampla, use o subagente `Explore`
   (read-only) e traga a conclusao, nao o dump de arquivos.

---

## 5. Workflow - escala com o tamanho da tarefa

**Classifique a tarefa primeiro.** Nao force o caminho completo em tudo.

### Leve - bug isolado, ajuste de UI, uma funcao
```
Implementar -> Auto-revisao -> Atualizar CURRENT_STATE.md (se mudou estado)
```
Um unico agente de dominio. Sem orquestracao formal.

### Medio - feature contida em 1 dominio
```
Specialist (jump-*) -> jump-code-reviewer -> Teste (vitest) -> Snapshot
```

### Completo - fase grande / multi-dominio / mudanca de schema ou financeiro
```
Orchestrator -> jump-data-modeler (se schema) -> Specialist(s) ->
jump-code-reviewer -> jump-qa-engineer -> Memory Manager (snapshot) -> Nova fase
```

**Como classificar no JumpFlow:**
- Mexe em `schema.prisma` ou migration? -> no minimo Medio, com `jump-data-modeler`.
- Toca campo financeiro, RBAC, aprovacao, fechamento ou emissao fiscal? -> Completo.
- Toca >1 dominio (ex: Projetos + Faturamento)? -> Completo, com Orchestrator.
- Caso contrario -> Leve ou Medio.

**Regra do Memory Manager:** no caminho completo, nenhuma fase termina sem
snapshot. Nos caminhos leve/medio, o proprio agente atualiza o estado.

**Preferencias (nao leis):**
- O Orchestrator prefere planejar e delegar a escrever codigo.
- Cada agente fica no seu dominio, mas segue o bug se ele cruzar a fronteira,
  registrando em `DECISIONS.md`.

---

## 6. Agentes deste projeto

A camada AIOS (orquestracao + memoria) vive em `.ai/agents/`. Os **agentes de
dominio ja existem** em `.claude/agents/` (23 agentes `jump-*`) e sao invocados
via Task tool. Nao duplique: o AIOS coordena, os `jump-*` executam.

| Papel AIOS | Implementacao | Quando |
| --- | --- | --- |
| **Orchestrator** | `.ai/agents/orchestrator.md` | Fase grande / multi-dominio: planeja, classifica, delega, valida. |
| **Memory Manager** | `.ai/agents/memory-manager.md` | Fim de fase: snapshot e poda do `.ai/state/`. |
| **Specialist** | agentes `jump-*` por dominio | Implementacao (ver mapa abaixo). |
| **Reviewer** | `jump-code-reviewer` | Revisao de diff antes do QA. |
| **QA** | `jump-qa-engineer` | Testes e cenarios criticos. |

**Mapa dominio -> agente** (ver `docs/agentes.md` para a lista completa):
Horas=`jump-timesheet-agent`; Aprovacoes/automacao=`jump-workflow-automation`;
Despesas=`jump-expenses-agent`; Clientes/cobranca=`jump-billing-agent`;
Projetos+impl=`jump-fullstack-engineer`; Skills=`jump-skills-intelligence-agent`;
Consultores/RH=`jump-hr-compensation-agent`; Receita=`jump-finance-ops-agent`;
Pagamentos=`jump-payments-agent`; NFS-e=`jump-fiscal-nfse-agent`;
Integracoes=`jump-integrations-agent`; UI/UX=`jump-frontend-ux`;
Design=`jump-design-system`; Dados=`jump-data-modeler`;
Arquitetura=`jump-architect`; Deploy=`jump-devops`; Produto=`jump-product-owner`.

---

## 7. Snapshot Protocol

Ao concluir qualquer tarefa que mude o estado:

1. Atualizar `CURRENT_STATE.md` (fase, o que funciona, o que quebrou).
2. Acrescentar a `DECISIONS.md` decisoes novas (append-only; nunca reescreva,
   marque a antiga como superada).
3. Reescrever `NEXT_STEPS.md` com a proxima fila.
4. **Poda ao fim de fase:** consolidar aprendizados, remover contexto obsoleto,
   resumir decisoes antigas. So "resumir e podar".

> Criterio: depois do snapshot, um agente novo reconstroi o estado lendo so
> `.ai/state/*` + codigo, sem a conversa.

---

## 8. Recuperacao e troca de modelo

Retomada a frio a partir de:
```
.ai/state/CURRENT_STATE.md + DECISIONS.md + NEXT_STEPS.md + ROADMAP.md
+ docs/arquitetura.md + docs/modelo-dados.md + codigo atual
```

Particularidades por modelo ficam fora do AIOS.md:
- `CLAUDE.md` - especifico do Claude Code (ja existe; e a fonte de regras de
  negocio/auth deste repo - leia junto com este arquivo).

---

## 9. Quality Gates e Testes

Uma fase so e "concluida" quando:

- [ ] Implementacao atende ao que estava em `NEXT_STEPS.md`.
- [ ] Validacao no servidor com Zod; autorizacao por perfil checada no servidor.
- [ ] Campos financeiros protegidos por role; mudancas sensiveis auditadas
      (aprovacao, alocacao, valor hora, permissao, fechamento).
- [ ] Passou pela revisao do caminho (Sec. 5) - `jump-code-reviewer` no Medio+.
- [ ] `npm run test`, `npm run lint` e `npm run typecheck` passam.
- [ ] `CURRENT_STATE.md` reflete a realidade.
- [ ] Nenhum segredo/credencial commitado.

```
build:     npm run build
test:      npm run test          # vitest run
lint:      npm run lint          # eslint
typecheck: npm run typecheck     # tsc --noEmit
run:       npm run dev           # next dev (carregue o .env da raiz)
db:        npm run db:generate | db:migrate | db:seed | db:studio | db:deploy
```

> Gotcha Windows: `db:generate` falha com EPERM se o `next dev` estiver segurando
> a DLL do query-engine - pare o dev server antes. Maquina IPv4-only precisa do
> session pooler no `DIRECT_URL` e `pgbouncer=true` no `DATABASE_URL`.

---

## 10. Anti-patterns

- Confiar na conversa como memoria.
- Carregar o projeto inteiro "por garantia".
- Recopiar no prompt algo que ja esta em arquivo de estado.
- Forcar o pipeline completo em tarefa trivial.
- Implementar do zero o que o schema Prisma ja modela.
- Encerrar uma fase sem snapshot.
- Reescrever decisoes antigas em vez de marca-las como superadas.
- Validar id de entidade com Zod `.cuid()` (os ids do seed nao sao cuid).
- Deixar credenciais no codigo ou no estado.

---

## 11. Prompt Contracts (resumo; detalhe em `.ai/prompts/`)

**Iniciar sessao:** "Leia `.ai/state/CURRENT_STATE.md` e `NEXT_STEPS.md`. Nada
mais ainda. Diga em 3 linhas onde estamos e a proxima tarefa."

**Executar tarefa:** "Tarefa X. Leia so os arquivos necessarios. Classifique
leve/medio/completo (Sec. 5) e siga o caminho. Nao recopie o que ja esta em
`DECISIONS.md`."

**Revisar:** "Revise o diff da tarefa X contra os Quality Gates (Sec. 9). Aponte
riscos. Nao aprove sem teste."

**Encerrar:** "Rode o Snapshot Protocol (Sec. 7). Pode contexto obsoleto.
Confirme retomada a frio."

---

## 12. PROJECT ADAPTATION BLOCK

```
PROJETO:        JumpFlow - plataforma operacional/financeira da Jump para
                consultores: horas, skills, certificados, alocacao, aprovacoes,
                valores hora, cobranca, remuneracao e visibilidade financeira.
                Nome deve ser facil de renomear (ler de config quando possivel).

STACK:          Next.js 16 (App Router, proxy.ts), React 19, TypeScript estrito,
                Tailwind v4, motion/react, Prisma + PostgreSQL (Supabase),
                Auth.js / NextAuth v5 + Microsoft Entra ID, Zod, Vitest.
                Monorepo npm workspaces. Deploy Vercel; futuro Render+Postgres.

ARQUITETURA:    Monorepo apps/web (Next) + packages (database, shared, ui).
                Server Actions + Route Handlers; Prisma como camada de dados.
                RBAC server-side em apps/web/src/lib/auth/. Providers externos
                abstraidos (cnpj, cep, nfse, bank, storage, email) em lib/*.
                Detalhe: docs/arquitetura.md e docs/modelo-dados.md.

ESTRUTURA:      apps/web/src/app/app/<dominio>/(page.tsx, actions.ts)
                apps/web/src/components/<dominio>/*
                apps/web/src/lib/<dominio>/* e lib/db/*  (regras e queries)
                apps/web/src/lib/auth/*                  (RBAC)
                packages/database/prisma/schema.prisma   (modelo de dados)
                docs/*                                   (fontes de verdade)
                .claude/agents/*                         (agentes de dominio)
                .ai/                                     (AIOS: estado/agentes)

COMANDOS:       build=npm run build | test=npm run test | lint=npm run lint
                typecheck=npm run typecheck | run=npm run dev
                db=npm run db:generate|db:migrate|db:seed|db:studio|db:deploy

PADROES:        TypeScript estrito. Validar input no servidor com Zod. Checar
                autorizacao no servidor para toda operacao privada. Proteger
                campos financeiros por role. Auditar mudancas sensiveis. Usar
                Prisma para acesso a dados. Manter animacao funcional e contida
                em fluxos core (sem parallax em horas/aprovacao/financeiro).
                Migrations Prisma desde o inicio.

REGRAS DE NEGOCIO (nao violaveis):
                - Sem auth por senha como regra de produto; Entra ID + RBAC.
                - AUTH_DEV_MODE so em dev, nunca fallback silencioso em prod.
                - Lancamento enviado nao muda sem reabertura/auditoria.
                - Aprovacao automatica nunca reprova; e idempotente e auditada.
                - Fechamento/valores/permissoes geram AuditEvent.

AGENTES:        AIOS: Orchestrator, Memory Manager (.ai/agents/).
                Dominio: os 23 jump-* em .claude/agents/ (ver Sec. 6).

RISCOS:         - Schema a frente da UI: confirme antes de criar do zero.
                - Windows: db:generate EPERM com dev server ativo (pare o dev).
                - IPv4-only: session pooler no DIRECT_URL + pgbouncer=true.
                - .env da raiz precisa ser carregado para db:* e dev server.
                - Integracoes NFS-e/Banco/ERP sao stubs; nao assuma reais.
                - Areas sensiveis: financeiro, RBAC, aprovacao, fechamento, NFS-e.
```

*Fim do AIOS.md. Gerado a partir do molde AIOS_TEMPLATE (mantido fora do repo).*
