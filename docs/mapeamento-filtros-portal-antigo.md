# Mapeamento - Filtros do Portal Antigo vs JumpFlow

Data: 2026-06-11

Origem analisada:

- Portal antigo: `https://admin.jumplabel.com.br/`
- Bundle Angular publico:
  - `main.0551ecf1b6141561.js`
  - `778.172e0beefc2ba716.js` (apontamentos/horas)
  - `770.47c695d653082aca.js` (despesas)
  - `951.c23ea6fe58351b4e.js` (resumos semanais/mensais)

Observacao de seguranca:

- As credenciais locais em `.env.jump` nao foram impressas nem copiadas.
- O portal antigo usa Microsoft OAuth (`login.microsoftonline.com`) e os
  endpoints reais exigem token. Sem sessao interativa autenticada, este
  mapeamento se baseia no bundle Angular e nos contratos de query/labels
  presentes no front-end legado.
- Valores dinamicos concretos de Cliente/Projeto/Usuario/Status vindos da API
  devem ser confirmados numa etapa com sessao autenticada.

## 1. Menus/Rotas Legadas Relevantes

### Horas

- Apontamento de horas e despesas: `/apontamentos/horas/`
- Aprovacao de horas e despesas: `/apontamentos/horas/aprovacao/`
- Relatorio de apontamento de horas e despesas:
  `/apontamentos/horas/relatorios/`

### Despesas

- Apontamento de despesas: `/apontamentos/despesas/`
- Aprovacao de despesas: `/apontamentos/despesas/aprovacao/`
- Relatorio de despesas: `/apontamentos/despesas/relatorios/`

### Relatorios/Resumos auxiliares

- Resumo semanal por usuarios/projeto:
  - `notificacoes/resumo-semana`
  - `notificacoes/total-horas`
  - `projetos/resumo-semana`
  - `projetos/total-horas`

## 2. Filtros Legados - Horas/Apontamentos

Endpoint legado principal:

```text
GET /api/apontamento
```

Parametros usados pelo front-end legado:

| Parametro legado | Significado inferido | Fonte/opcoes |
| --- | --- | --- |
| `pageFunction` | contexto da tela: `apontamento-horas`, `aprovacao-horas`, `relatorios` | fixo por rota |
| `pageLimit` | paginacao: `1000` na listagem, `50` em aprovacao/relatorios | fixo na tela |
| `page` | pagina atual | UI |
| `status` | status do apontamento | API `tabelas.statusApontamento` |
| `dia` | dia do mes | fixo 1..31 |
| `mes` | mes | fixo 1..12 |
| `ano` | ano | fixo 2015..ano atual |
| `idProjeto` | projeto | API `tabelas.projetos` |
| `idTipoApontamento` | tipo/atividade do apontamento | API `tabelas.tipoApontamento` |
| `idCliente` | cliente | API `tabelas.clientes` |
| `idUsuario` | usuario/consultor | API `tabelas.usuarios` |
| `order` | ordenacao | default `dataApontamento` |
| `tipoFiltroData` | modo do filtro de data | default `data`; tambem ha range por `dataInicio/dataFim` |
| `dataInicio` | inicio do periodo | UI |
| `dataFim` | fim do periodo | UI |
| `cobranca` | filtro de cobranca/faturavel | valores fixos inferidos: todos `-1`, sim `1`, nao `2` |
| `faturamento` | filtro de faturamento | API/estado legado; usado com liberacao de faturamento |
| `statusClientes` | status do cliente | API |
| `statusProjetos` | status do projeto | API |
| `statusUsuarios` | status do usuario | API |
| `tipoContratacao` | tipo de contratacao do usuario | API `tipoContratacaoList` |
| `filtroUsuariosClientesProjetos` | filtrar clientes/projetos/usuarios com apontamentos | checkbox booleano |
| `filtroFacilities` | filtrar facilities | checkbox booleano |
| `idTipoProjeto` | tipo de projeto | API `tiposProjetoList` |
| `agrupaPorProjeto` | exportar planilha com filtro de projeto/cliente | checkbox booleano |

Status de horas inferidos por uso visual:

| Id legado | Label/semantica inferida | JumpFlow aproximado |
| --- | --- | --- |
| `1` | aguardando aprovacao | `SUBMITTED` |
| `2` | aguardando revisao | `REJECTED`/rework |
| `3` | reprovado | `REJECTED` |
| `4` | aprovado | `APPROVED` |

Atividades visiveis no print do portal antigo:

| Label legado | Observacao | Sugestao de chave JumpFlow |
| --- | --- | --- |
| Dia Util | trabalho normal | `WORKDAY` |
| Aguardando inicio no projeto | periodo alocado sem inicio efetivo | `WAITING_PROJECT_START` |
| Ferias | ausencia programada | `VACATION` |
| Licenca | licenca/afastamento | `LEAVE` |
| Ausencia / Falta | ausencia nao remunerada/falta | `ABSENCE` |
| Folga | folga/compensacao | `DAY_OFF` |
| Ausencia Remunerada | ausencia remunerada | `PAID_ABSENCE` |
| Sobreaviso | disponibilidade/sobreaviso | `ON_CALL` |

O bundle tambem referencia slugs como `ferias`, `ausencia`, `folga`,
`compensacao-horas` e `sobreaviso`. A API autenticada deve ser usada para
confirmar se ha outras atividades ativas alem das visiveis no print.

Totais exibidos no legado:

- Horas apontadas.
- Horas aguardando aprovacao.
- Horas aguardando revisao.
- Horas aprovadas.
- Horas reprovadas.
- Horas com cobranca.
- Horas sem cobranca.

Acoes/controles legados relacionados:

- Exportar CSV.
- Alteracao em massa de status em aprovacao.
- Alteracao em massa de cobranca.
- Selecionar todos.
- Agrupar/exportar por projeto/cliente.

## 3. Filtros Legados - Despesas

Endpoint legado principal:

```text
GET /api/despesa
```

Exportacao legada:

```text
GET /api/despesas/relatorio
```

Parametros usados pelo front-end legado:

| Parametro legado | Significado inferido | Fonte/opcoes |
| --- | --- | --- |
| `order` | ordenacao | default `dataDespesa` |
| `pageFunction` | contexto: `apontamento-despesas`, `aprovacao-despesas`, `relatorios` | fixo por rota |
| `pageLimit` | paginacao: `1000` na listagem, `50` em aprovacao/relatorios | fixo na tela |
| `page` | pagina atual | UI |
| `status` | status da despesa | API `tabelas.statusApontamento`/`listaStatusDespesa` |
| `dia` | dia do mes | fixo 1..31 |
| `mes` | mes | fixo 1..12 |
| `ano` | ano | fixo 2015..ano atual |
| `idProjeto` | projeto | API `tabelas.projetos` |
| `idCliente` | cliente | API `tabelas.clientes` |
| `idUsuario` | usuario/consultor | API `tabelas.usuarios` |
| `tipoFiltroData` | modo do filtro de data | default `data`; tambem ha range por `dataInicio/dataFim` |
| `dataInicio` | inicio do periodo | UI |
| `dataFim` | fim do periodo | UI |
| `statusClientes` | status do cliente | API |
| `statusProjetos` | status do projeto | API |
| `statusUsuarios` | status do usuario | API |
| `tipoContratacao` | tipo de contratacao do usuario | API `tipoContratacaoList` |
| `filtroUsuariosClientesProjetos` | filtrar clientes/projetos/usuarios com apontamentos/despesas | checkbox booleano |

Totais exibidos no legado:

- Total de despesas apontadas.
- Despesas aguardando aprovacao.
- Despesas aguardando revisao.
- Despesas agendadas.
- Despesas aprovadas.
- Despesas reprovadas.
- Despesas com pagamento efetuado.

Campos de despesa no formulario legado:

- Projeto.
- Data da despesa.
- Valor.
- Descricao.
- Anexo/comprovante.
- Numero da nota fiscal.

## 4. Comparacao com JumpFlow Atual

### Ja existe no JumpFlow

- Relatorios em `/app/relatorios`.
- Segmentos: `horas`, `despesas`, `consolidado`.
- Exportacao CSV server-side:
  - `/api/relatorios/horas`
  - `/api/relatorios/despesas`
  - `/api/relatorios/consolidado`
- Filtros atuais:
  - `from`
  - `to`
  - `clientId`
  - `projectId`
  - `consultantId`
  - `status`
  - `activityType` em horas
  - `stage` em despesas
  - `month` no consolidado
- RBAC server-side por leitura.
- Status de cliente/projeto existem no schema:
  - `Client.status`
  - `Project.status`
- Consultor tem status:
  - `Consultant.status`
- Hora possui `billable`, equivalente moderno de cobranca/faturavel.
- Despesa possui status suficiente para aprovacao, pagamento agendado e paga.

### Lacuna descoberta apos Rodada 4.1

A Rodada 4.1 alinhou filtros de **relatorios**, mas nao alinhou a tela
operacional de **lancamento de horas** (`/app/horas`). No legado, a tela de
apontamento mostra filtros visiveis diretamente no modulo de horas:

- tipo de periodo/data;
- dia;
- mes;
- ano;
- status do projeto;
- projeto;
- atividade;
- status;
- ordenar por;
- itens por pagina.

No JumpFlow, `/app/horas` ainda mostra a grade semanal com acoes principais,
mas nao expoe esses filtros operacionais. Alem disso, o catalogo de atividades
do formulario de novo lancamento usa atividades de entrega/consultoria
(`Desenvolvimento`, `Reuniao`, `Discovery`, `Suporte`, `Documentacao`), que
nao correspondem ao catalogo operacional do portal antigo.

### Gaps de paridade com o legado

| Gap | Prioridade | Como tratar no JumpFlow |
| --- | --- | --- |
| Filtro por dia/mes/ano alem de range `from/to` | Media | Criar presets/modo de periodo sem perder `from/to` |
| Filtro por cliente/projeto/consultor com registros | Media | Adicionar toggle `somenteComMovimento` se fizer sentido |
| Filtro por status do cliente | Baixa/Media | Usar `Client.status` |
| Filtro por status do projeto | Media | Usar `Project.status` |
| Filtro por status do usuario/consultor | Media | Usar `Consultant.status`; User.status se necessario |
| Filtro por tipo de contratacao | Alta para operacao/RH; baixa para MVP financeiro | Exige novo campo em `Consultant` ou `User` |
| Filtro por tipo de projeto | Media | Exige novo campo em `Project` ou taxonomia |
| Filtro facilities | Baixa sem confirmacao de dominio | Exige decisao de modelo (`Project.category`, tag ou flag) |
| Filtro cobranca/faturavel em horas | Alta | Ja ha `TimeEntry.billable`; expor filtro `billable` |
| Filtro faturamento/liberacao | Media/Alta futuro financeiro | Exige modelo de fechamento/faturamento persistido |
| Ordenacao configuravel | Media | Adicionar `sort`/`direction` em tela e CSV |
| Paginacao server-side | Alta para producao real | Implementar `page`/`pageSize` nos relatorios |
| Alteracao em massa de status/cobranca | Baixa para relatorios; sensivel para aprovacao | Nao misturar com relatorios; avaliar em aprovacao |
| Exportar por projeto/cliente agrupado | Media | Consolidado ja cobre parte; adicionar modo/colunas se necessario |

## 5. Dados/Modelo que Precisam Ser Alterados

### Alteracoes sem migration

- Relatorios:
  - adicionar filtros `billable`, `clientStatus`, `projectStatus`,
    `consultantStatus`, `sort`, `direction`, `page`, `pageSize`.
- Queries:
  - aplicar filtros em `lib/db/reports.ts`.
- CSV:
  - propagar os mesmos filtros para os route handlers.
- UI:
  - adicionar controles no `ReportFilters`.

### Alteracoes com migration provavel

- `Consultant.contractType` ou equivalente:
  - opcoes legadas vêm de `tipoContratacaoList`.
  - sugestao inicial: enum ou string controlada no seed.
- `Project.type` ou `Project.category`:
  - equivalente de `idTipoProjeto`.
- `Project.isFacilities` ou tag/categoria:
  - equivalente de `filtroFacilities`, se a Jump confirmar que isso ainda e
    relevante.

### Alteracoes que devem aguardar rodada futura

- Modelo de faturamento/liberacao:
  - necessario para paridade completa de `faturamento` e status de cobranca
    fechado.
- Fechamento contabil persistido/lock de periodo.
- Alteracao em massa de status/cobranca em aprovacao.

## 6. Agentes Existentes vs Necessidade

Os agentes atuais atendem a rodada de ajustes.

| Necessidade | Agente indicado | Status |
| --- | --- | --- |
| Extrair/comparar legado | `jump-legacy-portal-analyst` | Atende |
| Decidir o que manter/melhorar/postergar | `jump-product-owner` | Atende |
| Avaliar mudancas de schema | `jump-data-modeler` | Atende |
| Queries, filtros, CSV e paginas | `jump-fullstack-engineer` | Atende |
| UX de filtros densos | `jump-frontend-ux` | Atende |
| Consistencia visual/acessibilidade | `jump-design-system` | Atende |
| Testes RBAC/filtros/CSV | `jump-qa-engineer` | Atende |
| Deploy/smoke | `jump-devops` | Atende |
| Revisao final | `jump-code-reviewer` | Atende |

Nao e obrigatorio criar novo agente. Se quiser especializar no futuro, faria
sentido um `jump-reporting-agent`, mas os agentes atuais sao suficientes para
esta rodada.

## 7. Recomendacao de Escopo

Rodada sugerida: **Rodada 4.1 - Paridade de Filtros Legados em Relatorios**.

Implementar agora:

- `billable` em horas.
- `clientStatus`, `projectStatus`, `consultantStatus`.
- `sort`, `direction`, `page`, `pageSize`.
- `somenteComMovimento` se a leitura atual permitir sem custo alto.
- Presets de periodo: mes atual, mes anterior, ano atual e range customizado,
  mantendo `from`/`to` como contrato final.

Implementar em rodada complementar de `/app/horas`:

- Catalogo legado de atividades no lancamento de horas.
- Filtros operacionais na tela `/app/horas`: status, projeto, status do
  projeto, atividade, cobranca/faturavel e ordenacao.
- Modo de periodo/data adaptado ao design semanal do JumpFlow.

Decidir antes de migrar:

- `contractType`.
- `projectType`.
- `facilities`.

Postergar:

- `faturamento`/liberacao.
- alteracao em massa.
- fechamento contabil persistido.
