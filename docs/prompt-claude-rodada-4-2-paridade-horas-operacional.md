# Prompt - Rodada 4.2: Paridade Operacional do Modulo Horas

Planejamento gerado em 2026-06-11 apos a Rodada 4.1
(`feat: align reports with legacy filters`). A Rodada 4.1 alinhou filtros de
**relatorios**, mas a tela operacional `/app/horas` ainda nao replica os
filtros visiveis e o catalogo de atividades do portal antigo.

## Prompt para enviar ao Claude Code

```text
Leia primeiro o arquivo CLAUDE.md.

Depois leia, nesta ordem:
- docs/mapeamento-filtros-portal-antigo.md
- docs/horas-persistencia.md
- docs/backlog-refinado-consultor-operacoes.md
- docs/modelo-dados.md
- docs/database-foundation.md
- docs/design-system.md
- packages/database/prisma/schema.prisma

Contexto:
A Rodada 4.1 alinhou filtros dos relatorios com parte do portal antigo, mas
nao ajustou a tela operacional de lancamento de horas. O print do portal antigo
mostra que o modulo "Apontamento de horas" tem filtros visiveis na propria
tela e um catalogo de atividades diferente do JumpFlow atual.

Problema a corrigir:
- `/app/horas` nao exibe filtros operacionais como Status, Projeto,
  Status Projeto, Atividade, Ordenar por e Itens por pagina.
- O formulario de novo lancamento usa atividades atuais:
  `Desenvolvimento`, `Reuniao`, `Discovery`, `Suporte`, `Documentacao`.
- O legado usa atividades de apontamento:
  `Dia Util`, `Aguardando inicio no projeto`, `Ferias`, `Licenca`,
  `Ausencia / Falta`, `Folga`, `Ausencia Remunerada`, `Sobreaviso`.

Objetivo:
Executar a Rodada 4.2 - Paridade Operacional do Modulo Horas, alinhando o
catalogo de atividades e os filtros visiveis da tela `/app/horas` ao portal
antigo, preservando o design JumpFlow, a grade semanal e o RBAC server-side.

Sub-rodada 4.2.0 - Confirmacao do legado:
- Use `jump-legacy-portal-analyst`.
- Leia a secao de atividades em `docs/mapeamento-filtros-portal-antigo.md`.
- Se for possivel acessar o portal antigo com sessao autenticada, confirme se
  existem outras atividades ativas alem das visiveis no print.
- Se Microsoft OAuth/MFA impedir confirmacao, siga com o catalogo do print e
  registre a limitacao.
- Nunca imprimir usuario, senha, token, cookies ou dados pessoais.

Sub-rodada 4.2.1 - Catalogo de atividades:
- Use `jump-product-owner`, `jump-timesheet-agent` e `jump-data-modeler`.
- Atualize o catalogo de atividades de horas para refletir o legado:
  - `WORKDAY`: Dia Util
  - `WAITING_PROJECT_START`: Aguardando inicio no projeto
  - `VACATION`: Ferias
  - `LEAVE`: Licenca
  - `ABSENCE`: Ausencia / Falta
  - `DAY_OFF`: Folga
  - `PAID_ABSENCE`: Ausencia Remunerada
  - `ON_CALL`: Sobreaviso
- Nao criar migration se nao for necessario: `TimeEntry.activityType` ja e
  string no Prisma.
- Garantir compatibilidade com dados ja existentes:
  - entradas antigas com `DEVELOPMENT`, `MEETING`, `DISCOVERY`, `SUPPORT`,
    `DOCS` devem continuar sendo exibidas com label legivel;
  - novas entradas devem usar o catalogo legado por padrao;
  - filtros devem conseguir lidar com atividades antigas e novas sem quebrar.
- Definir `WORKDAY`/Dia Util como default do formulario, salvo se o PO decidir
  outra coisa.
- Atualizar seeds/mock-data para usar o novo catalogo em dados futuros,
  preservando fixtures antigas apenas quando forem testes de compatibilidade.

Sub-rodada 4.2.2 - Filtros operacionais em `/app/horas`:
- Use `jump-fullstack-engineer`, `jump-frontend-ux` e `jump-design-system`.
- Adicionar uma area de filtros visivel na tela `/app/horas`, inspirada no
  legado, mas com UX JumpFlow:
  - periodo/data:
    - manter a semana como unidade primaria do JumpFlow;
    - oferecer atalho de data especifica que navega para a semana daquela data;
    - opcional: mes/ano como atalhos de navegacao, sem tentar listar mes inteiro
      dentro da grade semanal.
  - Status Projeto (`Project.status`);
  - Projeto;
  - Atividade;
  - Status do lancamento (`DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`,
    `CLOSED`);
  - Cobranca/faturavel (`billable`: todos/sim/nao), equivalente ao legado de
    cobranca;
  - Ordenar por:
    - `date`;
    - `project`;
    - `activity`;
    - `status`;
  - Direcao:
    - asc/desc, se fizer sentido;
  - Itens por pagina:
    - manter opcao apenas se houver lista paginavel; se a grade semanal tiver
      poucos itens, nao criar controle inerte. Justificar a decisao.
- Filtros devem estar na query string.
- Em modo db, filtros devem ser aplicados no servidor em
  `getWeekForConsultant` ou funcao equivalente.
- Em modo demo, filtros podem ser aplicados no client/local state, com o mesmo
  contrato visual.
- Acoes de criar/editar/enviar/copiar devem preservar os filtros atuais sempre
  que possivel.
- Nao expor campos financeiros.

Sub-rodada 4.2.3 - Queries e contratos:
- Criar/atualizar schemas Zod para os filtros de `/app/horas`.
- Se necessario, criar tipo `TimesheetFilter` em `lib/timesheet`.
- Aplicar filtros em:
  - leitura da semana;
  - lista de projetos permitidos, quando `projectStatus` for usado;
  - ordenacao das linhas.
- Cuidado: filtros nao podem quebrar a regra de alocacao ativa. O filtro apenas
  reduz o que o usuario ve; criar/editar continua validando alocacao no
  servidor.
- Status/atividade invalidos devem ser ignorados com fallback seguro ou
  retornar estado de input invalido, conforme padrao local. Preferencia:
  schema rejeita valores invalidos nas actions/rotas sensiveis e a pagina usa
  defaults seguros.

Sub-rodada 4.2.4 - UI/UX:
- A area de filtros deve ser densa, escaneavel e consistente com Playful Ops.
- Evitar esconder filtros essenciais se o pedido e torna-los aparentes.
- Pode usar um bloco "Filtros" acima da grade, com layout responsivo.
- O usuario deve perceber claramente:
  - quais filtros estao ativos;
  - como limpar filtros;
  - que a semana continua sendo a unidade principal.
- Nao criar landing/explicacao textual longa dentro da aplicacao.

Sub-rodada 4.2.5 - QA/revisao/deploy:
- Use `jump-qa-engineer`:
  - catalogo de atividades novo;
  - compatibilidade com atividades antigas;
  - schema de filtros;
  - filtros por status/projeto/status projeto/atividade/billable;
  - query string preservada;
  - data especifica navega para a semana correta;
  - ordenacao whitelist;
  - modo demo e modo db;
  - criar novo lancamento usa Dia Util por default;
  - CSV/relatorios nao regressam.
- Use `jump-code-reviewer` antes do commit.
- Use `jump-devops` para build/deploy e smoke em producao.

Fora do escopo:
- Copiar integralmente a UI visual antiga.
- Listagem mensal completa de apontamentos substituindo a grade semanal.
- Alteracao em massa de status/cobranca.
- Modelo de faturamento/liberacao.
- Migration para tipo de contratacao/tipo de projeto/facilities.
- Auth real/Entra ID.
- Storage de comprovantes.

Criterios de pronto:
- `/app/horas` mostra filtros operacionais aparentes.
- O catalogo de atividades do formulario de horas corresponde ao legado
  principal do print.
- Atividades antigas continuam renderizando sem quebrar.
- Filtros funcionam em modo db e demo.
- Query string e navegacao de semana convivem sem conflito.
- Criar/editar/copiar/enviar horas continua funcionando.
- Relatorios/CSV existentes continuam verdes.
- `npm run typecheck`, `npm run lint`, `npm run test` e `npm run build` passam.
- Revisao do `jump-code-reviewer` sem bloqueadores.
- Commit e push em `origin/main`.
- Deploy Vercel validado se aplicavel.

Mensagem de commit sugerida:
`feat: align timesheet filters and activities`

Ao final, reporte:
- atividades implementadas;
- filtros adicionados em `/app/horas`;
- decisoes de UX tomadas para data/semana e itens por pagina;
- compatibilidade com dados antigos;
- quantidade de testes;
- validacoes executadas;
- deploy Vercel, se feito.
```

## Observacao

Esta rodada corrige uma interpretacao anterior: paridade de filtros em
relatorios nao substitui paridade operacional na tela de lancamento de horas.
