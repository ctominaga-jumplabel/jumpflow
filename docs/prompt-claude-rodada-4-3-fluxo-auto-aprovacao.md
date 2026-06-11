# Prompt - Rodada 4.3: Fluxo Direto de Horas e Tela de Aprovacao Automatica

Planejamento gerado em 2026-06-11 apos a identificacao de dois ajustes de
produto:

1. No lancamento de horas, salvar um apontamento completo deve iniciar o fluxo
   de aprovacao automaticamente, sem exigir um botao separado "Enviar para
   aprovacao".
2. A aprovacao automatica ja existe como motor/job, mas precisa de uma tela de
   administracao/observabilidade.

## Prompt para enviar ao Claude Code

```text
Leia primeiro o arquivo CLAUDE.md.

Depois leia, nesta ordem:
- docs/horas-persistencia.md
- docs/aprovacao-automatica.md
- docs/backlog-refinado-consultor-operacoes.md
- docs/modelo-dados.md
- docs/database-foundation.md
- docs/auth-foundation.md
- docs/design-system.md
- packages/database/prisma/schema.prisma

Contexto:
Hoje o fluxo de horas e:
`Novo lancamento -> DRAFT -> Enviar para aprovacao -> SUBMITTED`.
O motor de aprovacao automatica ja existe e processa apenas `TimeEntry` com
`status = SUBMITTED` e `submittedAt != null`. Portanto, enquanto o usuario nao
clica "Enviar para aprovacao", a automacao nao atua.

Decisao de produto:
Para o JumpFlow, um lancamento de horas completo deve entrar em aprovacao assim
que for salvo. O botao "Enviar para aprovacao" deixa de ser necessario no fluxo
padrao de horas.

Objetivo:
Executar a Rodada 4.3 - Fluxo Direto de Horas e Tela de Aprovacao Automatica.

Sub-rodada 4.3.0 - Produto e regras:
- Use `jump-product-owner` e `jump-timesheet-agent`.
- Confirmar a regra operacional:
  - criar lancamento completo gera `SUBMITTED` + `submittedAt = now`;
  - editar lancamento reprovado tambem reenvia para aprovacao
    (`REJECTED -> SUBMITTED`, `submittedAt = now`);
  - lancamentos `SUBMITTED`, `APPROVED` e `CLOSED` continuam bloqueados para
    edicao pelo consultor;
  - nao manter botao "Enviar para aprovacao" na UI de horas, salvo se houver
    uma razao clara de rascunho.
- Documentar a decisao em `docs/horas-persistencia.md`.

Sub-rodada 4.3.1 - Mutacoes de horas:
- Use `jump-fullstack-engineer`.
- Atualizar Server Actions de horas:
  - `createTimeEntry` deve criar entrada como `SUBMITTED`, com `submittedAt`;
  - quando houver merge/upsert de entrada existente editavel, aplicar a mesma
    transicao para `SUBMITTED`;
  - `updateTimeEntry` em entrada `REJECTED` deve reabrir/reprocessar como
    `SUBMITTED`, com novo `submittedAt`;
  - manter validacoes Zod, ownership, alocacao ativa e projeto aberto;
  - manter AuditEvent, agora com acao clara como `TIME_ENTRY_SUBMITTED_ON_SAVE`
    ou adaptar a acao existente sem perder rastreabilidade;
  - recomputar `TimesheetPeriod.status` corretamente.
- Avaliar se a action `submitWeek` ainda e necessaria:
  - se ficar, deve ser apenas compatibilidade/teste/demo;
  - se remover da UI, garantir que imports/testes nao quebrem.
- Nao chamar `runAutoApproval` inline a menos que o product-owner/architect
  decidam explicitamente. Preferencia: manter job/cron como orquestrador e
  oferecer botao "Executar agora" na tela administrativa.

Sub-rodada 4.3.2 - UI de horas:
- Use `jump-frontend-ux` e `jump-design-system`.
- Remover ou esconder o botao "Enviar para aprovacao" da tela `/app/horas`.
- Ajustar textos/feedback:
  - "Lancamento enviado para aprovacao."
  - "Lancamento corrigido e reenviado para aprovacao."
  - evitar "rascunho" quando a entrada ja nasce `SUBMITTED`.
- Em modo demo, simular o mesmo comportamento: novo lancamento vira
  `SUBMITTED`.
- Preservar filtros da Rodada 4.2 se ja estiverem implementados.

Sub-rodada 4.3.3 - Tela de aprovacao automatica:
- Use `jump-workflow-automation`, `jump-fullstack-engineer`,
  `jump-frontend-ux`, `jump-design-system`.
- Criar tela administrativa, sugestao:
  - `/app/automacoes/aprovacao-automatica`
  - ou `/app/aprovacao-automatica`, se a navegacao existente favorecer.
- Acesso sugerido:
  - `ADMIN`
  - `AREA_MANAGER`
  - opcionalmente `PROJECT_MANAGER` somente leitura, se fizer sentido.
- A tela deve mostrar:
  - status global `AutomationConfig.autoApprovalEnabled`;
  - `requiredDailyMinutes`;
  - `approvalDelayMinutes`;
  - total de excecoes ativas;
  - lista de excecoes `AutoApprovalException` por consultor/projeto/tipo:
    `ANY_HOURS` e `WEEKEND`;
  - ultimas aprovacoes automaticas (`Approval.isAutomatic = true`,
    `entityType = TIME_ENTRY`, `ruleKey`);
  - lancamentos `SUBMITTED` pendentes e, se possivel, motivo estimado usando o
    avaliador puro (`DELAY_NOT_ELAPSED`, `DUPLICATE`, etc.).
- Criar acao "Executar agora":
  - protegida por role;
  - chama `runAutoApproval()` no servidor;
  - retorna resumo: processed, approved, skipped/pending, raced;
  - revalida a pagina;
  - nunca expor dados sensiveis.
- CRUD completo de excecoes pode ser MVP simples:
  - se for baixo risco, permitir criar/desativar excecao;
  - se ficar grande, entregar leitura + executar agora e registrar CRUD como
    proxima tarefa.

Sub-rodada 4.3.4 - Navegacao:
- Adicionar item de menu/launcher para a tela de automacao apenas para roles
  permitidas.
- Nao poluir o menu de consultores puros.
- Atualizar `route-permissions.ts` e testes.

Sub-rodada 4.3.5 - QA/revisao/deploy:
- Use `jump-qa-engineer`:
  - criar hora gera `SUBMITTED` + `submittedAt`;
  - editar `REJECTED` reenvia como `SUBMITTED`;
  - consultor nao edita `SUBMITTED`/`APPROVED`/`CLOSED`;
  - UI nao mostra "Enviar para aprovacao";
  - demo mode acompanha comportamento;
  - motor de auto-aprovacao continua idempotente;
  - tela de automacao respeita RBAC;
  - "Executar agora" protegido e testado com mock;
  - route-permissions e launcher/nav.
- Use `jump-code-reviewer` antes do commit.
- Use `jump-devops` para build/deploy e smoke em producao.

Fora do escopo:
- Auth real/Entra ID.
- Storage real de comprovantes.
- Modelo persistido de fechamento/lock.
- Reescrever o motor de aprovacao automatica.
- Worker/fila externo.
- Envio de email de resultado da aprovacao automatica.

Criterios de pronto:
- Novo lancamento de horas completo entra direto como `SUBMITTED`.
- `submittedAt` sempre preenchido quando uma hora entra em aprovacao.
- Botao "Enviar para aprovacao" nao aparece no fluxo padrao.
- Automacao existente continua processando pelas regras atuais.
- Tela de aprovacao automatica disponivel para roles permitidas.
- Tela mostra configuracao, excecoes, ultimas aprovacoes automaticas e
  pendencias.
- Botao "Executar agora" funciona com RBAC e feedback honesto.
- `npm run typecheck`, `npm run lint`, `npm run test` e `npm run build` passam.
- Revisao do `jump-code-reviewer` sem bloqueadores.
- Commit e push em `origin/main`.
- Deploy Vercel validado se aplicavel.

Mensagem de commit sugerida:
`feat: streamline timesheet approval automation`

Ao final, reporte:
- mudancas no fluxo de horas;
- rota/tela criada para aprovacao automatica;
- se CRUD de excecoes entrou ou ficou postergado;
- comportamento do job/cron;
- quantidade de testes;
- validacoes executadas;
- deploy Vercel, se feito.
```
