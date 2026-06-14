# Plano de Implementacao - Proximas Funcionalidades

## Objetivo

Conduzir as proximas rodadas do JumpFlow com baixo custo de contexto, usando
agentes por dominio e fases pequenas. Este plano assume que a rodada anterior
ja deixou modelados/implementados parcialmente:

- `TimesheetDefault` para padrao semanal por alocacao.
- `SkillSuggestion` para sugestoes de skills com decisao humana.
- `Expense` e `ExpenseAttachment` para despesas persistidas.
- Horas reais com `TimeEntry`, `TimesheetPeriod`, aprovacao e automacao.

## Processo de Otimizacao de Tokens

Use este processo em toda rodada:

1. Carregar apenas este plano, `CLAUDE.md` e o doc da fase.
2. Chamar no maximo 2 agentes exploradores em paralelo para perguntas
   independentes.
3. Nao reler documentos longos se o resumo da fase ja responder o escopo.
4. Editar arquivos somente depois de definir escopo, ownership e testes.
5. Ao final da fase, atualizar o doc da fase com decisoes, riscos e pendencias.
6. Antes da proxima fase, usar o resumo da fase anterior como contexto, nao o
   historico inteiro da conversa.

## Agentes por Dominio

| Dominio | Agentes principais | Quando usar |
| --- | --- | --- |
| Produto e escopo | `jump-product-owner` | Refinar fase, historias, criterios e fora de escopo. |
| Horas | `jump-timesheet-agent`, `jump-people-ops-agent` | Timesheet, revisao semanal, ocorrencias e calendario. |
| Financeiro | `jump-finance-ops-agent`, `jump-data-modeler` | Cobranca, remuneracao, valor hora, fechamento e export. |
| Skills | `jump-skills-intelligence-agent` | Skills reais, sugestoes, catalogo e validacao. |
| Despesas | `jump-expenses-agent` | Despesas, comprovantes, aprovacao e pagamento. |
| Automacoes | `jump-workflow-automation` | Jobs, emails, SLA, calendario, notificacoes e idempotencia. |
| Implementacao | `jump-fullstack-engineer`, `jump-frontend-ux` | Server Actions, Prisma, telas e UX. |
| Qualidade | `jump-qa-engineer`, `jump-code-reviewer` | Testes, riscos, RBAC, auditoria e regressao. |
| Deploy | `jump-devops` | Vercel, Supabase, migrations, env vars e release. |

## Sequencia Recomendada

1. Consolidar Horas real.
2. Cadastros reais para sustentar operacao.
3. Skills reais e autosservico.
4. Despesas e aprovacoes unificadas.
5. Relatorios e fechamento MVP.
6. Revisao semanal por projeto.
7. Ocorrencias simples e calendario.
8. Financeiro operacional avancado.
9. Feedback assincrono.
10. Offboarding operacional.

A sequencia preserva uma base confiavel: primeiro estabiliza o que ja esta
mais pronto, depois remove mocks, e so entao expande financeiro/lifecycle.

## Fase 1 - Consolidar Horas Real

### Objetivo

Fechar Horas como base confiavel para financeiro, skills e operacao.

### Escopo

- Testes completos de `TimesheetDefault`: salvar, aplicar, idempotencia, semana
  fechada, alocacao fora de vigencia e projeto encerrado.
- Preview mais explicito do "Padrao da semana": dias que serao criados e dias
  pulados.
- Decisao sobre indice unico para `(consultantId, projectId, activityType,
  date)`, com saneamento antes se houver risco de dados legados duplicados.
- Documentacao de Horas alinhada ao comportamento real: salvar entrada completa
  envia para aprovacao (`SUBMITTED`).

### Fora de Escopo

- Revisao semanal obrigatoria.
- Feriados/emendas.
- Cobranca/remuneracao por dia.
- Sobrescrita granular de lancamentos existentes.

### Arquivos Provaveis

- `apps/web/src/app/app/horas/actions.ts`
- `apps/web/src/lib/db/timesheet.ts`
- `apps/web/src/components/timesheet/TimesheetWeekView.tsx`
- `apps/web/src/app/app/horas/actions.test.ts`
- `apps/web/src/components/timesheet/TimesheetWeekView.test.tsx`
- `docs/horas-persistencia.md`

### Agentes

1. `jump-timesheet-agent`
2. `jump-data-modeler`
3. `jump-frontend-ux`
4. `jump-qa-engineer`
5. `jump-code-reviewer`

### Criterios de Pronto

- Aplicar default nao sobrescreve lancamento existente.
- Toda criacao via default gera auditoria.
- Periodo `CLOSED` bloqueia aplicacao.
- Testes cobrem cenarios positivos e negativos.
- `npm run typecheck`, `npm run lint`, `npm run test` e `npm run build` passam.

### Prompt Enxuto

```text
Use docs/plano-implementacao-proximas-funcionalidades.md, Fase 1.
Consolide Horas real e TimesheetDefault. Nao implemente revisao semanal,
feriados ou financeiro. Use jump-timesheet-agent, jump-data-modeler e QA.
Atualize docs/horas-persistencia.md ao final.
```

## Fase 2 - Cadastros Reais

### Objetivo

Reduzir dependencia de mocks/seeds em clientes, projetos, consultores e
alocacoes.

### Escopo

- CRUD minimo real de Clientes.
- CRUD minimo real de Projetos.
- CRUD minimo real de Consultores.
- CRUD minimo real de Alocacoes.
- Validacoes: consultor inativo nao recebe alocacao; projeto fechado nao recebe
  horas/despesas.
- Auditoria para alteracoes relevantes.

### Fora de Escopo

- Projeto = proposta/PTC completo.
- Valor hora com vigencia.
- Cadastros DP completos.
- Importacao via API Suporte.

### Arquivos Provaveis

- `apps/web/src/app/app/clientes/*`
- `apps/web/src/app/app/projetos/*`
- `apps/web/src/app/app/consultores/*`
- `apps/web/src/lib/db/clients.ts`
- `apps/web/src/lib/db/projects.ts`
- `apps/web/src/lib/db/consultants.ts`
- `apps/web/src/lib/db/allocations.ts`
- `docs/backlog-refinado-consultor-operacoes.md`

### Agentes

1. `jump-product-owner`
2. `jump-data-modeler`
3. `jump-fullstack-engineer`
4. `jump-frontend-ux`
5. `jump-qa-engineer`
6. `jump-code-reviewer`

### Criterios de Pronto

- Telas base usam Prisma quando banco estiver configurado.
- Permissoes aplicadas no servidor.
- Alocacoes reais alimentam Horas e Despesas.
- Alteracoes sensiveis geram auditoria.

## Fase 3 - Skills Reais e Autosservico

### Objetivo

Transformar Skills de matriz mockada em perfil real do consultor.

### Escopo

- Tela "Minhas skills" com CRUD real de `ConsultantSkill`.
- Matriz de skills lendo Prisma.
- Refinar sugestoes existentes: gerar, confirmar, editar nivel e descartar.
- Curadoria admin para sugestoes fora do catalogo.
- Auditoria para aceite, descarte e validacao.

### Fora de Escopo

- IA externa obrigatoria.
- Avaliacao de performance.
- Inferencia automatica de senioridade.

### Arquivos Provaveis

- `apps/web/src/app/app/skills/page.tsx`
- `apps/web/src/app/app/skills/actions.ts`
- `apps/web/src/components/skills/*`
- `apps/web/src/lib/db/skills.ts`
- `apps/web/src/lib/skills/suggestions.ts`
- `docs/skills-persistencia.md`

### Agentes

1. `jump-skills-intelligence-agent`
2. `jump-data-modeler`
3. `jump-fullstack-engineer`
4. `jump-frontend-ux`
5. `jump-qa-engineer`
6. `jump-code-reviewer`

### Criterios de Pronto

- Consultor edita apenas as proprias skills.
- Skill aceita entra como `PENDING` quando exigir validacao.
- Skill fora do catalogo nao vira ativa sem curadoria.
- Matriz e gaps usam dados reais.

## Fase 4 - Despesas e Aprovacoes Unificadas

### Objetivo

Completar despesas persistidas e consolidar fila unica de aprovacao.

### Escopo

- Persistencia completa de despesas.
- Upload/URL assinada de comprovantes via provider isolado.
- Aprovacao em duas etapas: gestor e financeiro.
- Controle manual de pagamento em `/app/financeiro`.
- Fila unica em `/app/aprovacoes` para horas e despesas.

### Fora de Escopo

- Integracao bancaria/ERP.
- CNAB/Open Finance.
- Multiplos comprovantes por despesa.

### Agentes

1. `jump-expenses-agent`
2. `jump-finance-ops-agent`
3. `jump-data-modeler`
4. `jump-workflow-automation`
5. `jump-qa-engineer`
6. `jump-code-reviewer`

### Criterios de Pronto

- Despesa exige alocacao ativa na data.
- Ninguem aprova ou paga a propria despesa.
- Reprovacao exige comentario.
- Comprovante respeita RBAC.

## Fase 5 - Relatorios e Fechamento MVP

### Objetivo

Dar visibilidade mensal para operacao e financeiro com exportacao confiavel.

### Escopo

- Relatorio mensal de horas.
- Relatorio de despesas.
- Export CSV estavel.
- Totais por cliente, projeto, consultor e status.
- Preparacao para `MonthlyClosing`.

### Fora de Escopo

- XLS nativo se CSV atender o MVP.
- Contas a pagar completo.
- Margem bruta automatica.

### Agentes

1. `jump-finance-ops-agent`
2. `jump-data-modeler`
3. `jump-fullstack-engineer`
4. `jump-qa-engineer`
5. `jump-code-reviewer`

### Criterios de Pronto

- CSV tem contrato documentado.
- Dados financeiros respeitam roles.
- Relatorios nao misturam mock com dados reais sem aviso.

## Fases Posteriores

### Fase 6 - Revisao Semanal por Projeto

- Resumo semanal por projeto.
- Descritivo semanal.
- Confirmacao final por projeto.
- Base melhor para skills e aprovacao.

Agentes: `jump-people-ops-agent`, `jump-timesheet-agent`,
`jump-workflow-automation`.

### Fase 7 - Ocorrencias e Calendario

- UX de registrar ocorrencia.
- Calendario de feriados/emendas.
- Bloqueio de defaults em dias bloqueados.
- Contagem de dias uteis para SLA.

Agentes: `jump-people-ops-agent`, `jump-workflow-automation`,
`jump-data-modeler`.

### Fase 8 - Financeiro Operacional Avancado

- Cobranca x remuneracao por dia.
- Valor hora venda/remuneracao por alocacao com vigencia.
- Relatorio financeiro granular.
- Liberacao de faturamento e reabertura auditada.

Agentes: `jump-finance-ops-agent`, `jump-data-modeler`, `jump-architect`,
`jump-code-reviewer`.

### Fase 9 - Feedback Assincrono

- Threads por projeto.
- SLA visual de 5 dias uteis.
- Notificacoes.
- Historico imutavel.

Agentes: `jump-people-ops-agent`, `jump-workflow-automation`,
`jump-frontend-ux`.

### Fase 10 - Offboarding Operacional

- Assets de desligamento.
- Redistribuicao imediata ou adiada.
- Painel de pendencias.
- Auditoria imutavel.

Agentes: `jump-people-ops-agent`, `jump-architect`, `jump-data-modeler`,
`jump-code-reviewer`.

## Checklist de Fechamento por Fase

- [ ] Escopo e fora de escopo atualizados.
- [ ] Schema/migrations revisados por `jump-data-modeler`, quando houver.
- [ ] RBAC aplicado no servidor.
- [ ] Auditoria em mudancas sensiveis.
- [ ] Testes positivos e negativos.
- [ ] `typecheck`, `lint`, `test` e `build` executados.
- [ ] Docs da fase atualizados.
- [ ] Deploy/migrations revisados por `jump-devops`, quando houver release.
