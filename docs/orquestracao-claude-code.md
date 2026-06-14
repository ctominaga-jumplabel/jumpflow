# Orquestracao Claude Code - JumpFlow

## 1. Objetivo

Este guia descreve como iniciar e conduzir o desenvolvimento do JumpFlow usando Claude Code, agentes especializados e workflows sob demanda.

## 2. Antes de Implementar

Para toda historia relevante:

1. Ler `docs/plano-implementacao-proximas-funcionalidades.md`, quando a historia
   pertencer ao roadmap atual.
2. Ler `docs/backlog-mvp.md`.
3. Confirmar a historia e criterios de aceite.
4. Verificar impacto em `docs/modelo-dados.md`.
5. Verificar arquitetura em `docs/arquitetura.md`.
6. Verificar design system em `docs/design-system.md`, se houver UI.
7. Verificar identidade visual em `docs/identidade-visual-playful-ops.md`, se houver mudanca de linguagem visual.
8. Escolher os agentes adequados.

## 3. Prompt Base para Claude Code

```text
Leia CLAUDE.md e os documentos fonte em docs/.
Use os agentes do projeto quando fizer sentido.
Implemente a historia [ID] do backlog MVP.
Mantenha a solucao alinhada com Next.js, Prisma, Supabase Postgres e Vercel.
Antes de finalizar, rode validacoes possiveis e use jump-code-reviewer para revisar riscos.
```

## 4. Fluxo por Historia

### Produto

```text
Use o agente jump-product-owner para refinar a historia [ID], confirmar criterios de aceite e apontar decisoes pendentes.
```

### Dados

```text
Use o agente jump-data-modeler para propor alteracoes de schema Prisma necessarias para a historia [ID], respeitando docs/modelo-dados.md.
```

### Arquitetura

```text
Use o agente jump-architect para revisar impacto tecnico da historia [ID] e confirmar que a solucao continua migravel de Supabase/Vercel para Render/Postgres.
```

### Implementacao

```text
Use o agente jump-fullstack-engineer para implementar a historia [ID] de ponta a ponta.
```

### Automacao

```text
Use o agente jump-workflow-automation para definir motores de regra, jobs agendados, notificacoes, emails, planilhas, idempotencia e logs operacionais da historia [ID].
```

### Financeiro Avancado

```text
Use o agente jump-finance-ops-agent para revisar cobranca, remuneracao,
valor hora por alocacao, vigencia, fechamento, exportacoes e RBAC financeiro
da historia [ID].
```

### Billing / Receita

```text
Use o agente jump-billing-agent para revisar tipos de cobranca, valores de venda,
pre-fatura, fechamento de receita e regras de faturamento da historia [ID].
```

### Pagamento de Consultores

```text
Use o agente jump-payments-agent para revisar pagamentos de consultores,
previsoes, confirmacao de valores, NF recebida/validada, envio ao banco/ERP e
status de pagamento da historia [ID].
```

### Fiscal / NFS-e

```text
Use o agente jump-fiscal-nfse-agent para revisar NFS-e Sao Paulo, XML/PDF,
numero de NF, protocolo, ISS, municipio, tipo de NF, documentos fiscais e
regras tributarias da historia [ID].
```

### HR Compensation

```text
Use o agente jump-hr-compensation-agent para revisar CLT/PJ/CLT FLEX, valores
acordados, beneficios, dados bancarios, descontos CLT, FGTS/INSS e regras de
compensacao da historia [ID].
```

### Integracoes

```text
Use o agente jump-integrations-agent para revisar provider abstractions, CNPJ,
CEP, Entra ID, Prefeitura SP, email, storage, banco/ERP, secrets, retries,
timeouts e portabilidade da historia [ID].
```

### People / Lifecycle

```text
Use o agente jump-people-ops-agent para revisar revisao semanal, ocorrencias,
calendario, feedback assincrono, offboarding, SLA e lifecycle operacional
da historia [ID].
```

### Skills 2.0

```text
Use o agente jump-skills-intelligence-agent para revisar skills reais,
autosservico, sugestoes assistidas, curadoria de catalogo, evidencias e
validacao humana da historia [ID].
```

### UX

```text
Use o agente jump-frontend-ux para revisar e melhorar a experiencia da tela/fluxo da historia [ID].
```

### Design System

```text
Use o agente jump-design-system para auditar identidade visual, Motion, componentes 21st.dev e acabamento premium da historia [ID].
```

### Identidade Visual

```text
Use o agente jump-visual-identity para refinar a direcao Playful Ops, avaliar Neo Brutalism controlado, decidir uso de Three.js/assets e indicar onde a interface deve ser mais divertida ou mais operacional.
```

### QA

```text
Use o agente jump-qa-engineer para criar cenarios de teste para a historia [ID], incluindo casos negativos.
```

### Revisao

```text
Use o agente jump-code-reviewer para revisar as alteracoes, priorizando bugs, permissoes, dados financeiros e testes faltantes.
```

## 5. Quando Usar Ultracode / Dynamic Workflows

Use para:

- auditoria ampla de arquitetura;
- revisao de seguranca e permissoes;
- revisao pre-release;
- busca de inconsistencias entre documentos e codigo;
- migracoes grandes;
- bugs espalhados por varios modulos.

Nao usar como padrao para tarefas pequenas e localizadas.

## 6. Primeira Sequencia Recomendada

1. Criar base Next.js e monorepo.
2. Configurar Prisma e schema inicial.
3. Configurar autenticacao.
4. Implementar usuarios e roles.
5. Implementar consultores.
6. Implementar clientes.
7. Implementar projetos.
8. Implementar alocacoes.
9. Implementar lancamento semanal de horas.
10. Implementar aprovacao/reprovacao.

## 7. Sequencia Atual Recomendada

Fonte: `docs/plano-implementacao-proximas-funcionalidades.md`.

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

## 8. Sequencia Faseada Atual - Orquestracao Longa

Fonte: `docs/orchestration/jumpflow-master-plan.md`.

1. Fase 1: refinar/criar agentes e documentacao de orquestracao.
2. Fase 2: expandir modelo de dados base com `jump-data-modeler` e especialistas financeiros/HR/fiscal/integracoes.
3. Fase 3: evoluir Horas com filtros, periodo, calendario, totais e lancamento diario/semanal.
4. Fase 4: evoluir Aprovacoes com filtros combinados, massa, detalhe e auditoria.
5. Fase 5: reforcar Despesas com anexo obrigatorio, download, preview e auditoria.
6. Fase 6: implementar Clientes e tipos de cobranca.
7. Fase 7: implementar Projetos e valores de venda.
8. Fase 8: implementar Skills com confirmacao humana.
9. Fase 9: implementar Consultores, contratacao e beneficios.
10. Fase 10: implementar Financeiro Receita e NFS-e.
11. Fase 11: implementar Pagamento de Consultores.
12. Fase 12: implementar Previsao de Pagamento.
13. Fase 13: revisao final, testes e hardening.

Para otimizar tokens, cada rodada deve carregar somente `CLAUDE.md`, este guia,
`docs/orchestration/jumpflow-execution-state.md`, o plano atual e os arquivos
diretamente afetados pela fase.
