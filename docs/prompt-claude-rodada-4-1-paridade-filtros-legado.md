# Prompt - Rodada 4.1: Paridade de Filtros do Portal Antigo

Planejamento gerado em 2026-06-11 apos a Rodada 4
(`feat: add operational reports and exports`). Esta rodada deve aproximar os
relatorios do JumpFlow das opcoes de filtro do portal antigo, sem comprometer
RBAC, CSV seguro e a experiencia moderna.

## Prompt para enviar ao Claude Code

```text
Leia primeiro o arquivo CLAUDE.md.

Depois leia, nesta ordem:
- docs/mapeamento-filtros-portal-antigo.md
- docs/backlog-refinado-consultor-operacoes.md
- docs/horas-persistencia.md
- docs/despesas-persistencia.md
- docs/modelo-dados.md
- docs/database-foundation.md
- docs/auth-foundation.md
- docs/design-system.md
- packages/database/prisma/schema.prisma

Contexto:
O MVP operacional esta entregue: horas, despesas, aprovacoes, financeiro,
relatorios, CSV e consolidado estao em producao de validacao. Agora precisamos
aproximar os filtros dos relatorios do JumpFlow das opcoes existentes no portal
antigo da Jump Label, preservando RBAC server-side e evitando copiar legado que
nao faca sentido.

Objetivo:
Executar a Rodada 4.1 - Paridade de Filtros Legados em Relatorios.

Sub-rodada 4.1.0 - Confirmacao do legado:
- Use o agente `jump-legacy-portal-analyst`.
- Leia `docs/mapeamento-filtros-portal-antigo.md`.
- Se houver sessao/credenciais locais para o portal antigo, tente confirmar as
  opcoes dinamicas de filtro sem imprimir usuario, senha, token, cookies ou
  dados pessoais.
- O portal antigo usa Microsoft OAuth; se nao for possivel entrar sem MFA ou
  sessao interativa, nao bloqueie a rodada. Registre que a confirmacao veio do
  bundle Angular publico e siga.
- Nao commitar `.env.jump` nem qualquer arquivo com credenciais.

Sub-rodada 4.1.1 - Decisao de produto:
- Use `jump-product-owner`.
- Classifique cada filtro legado como:
  - manter agora;
  - melhorar com equivalente moderno;
  - postergar;
  - descartar.
- Escopo recomendado para implementar agora:
  - horas: `billable`/cobranca;
  - horas/despesas/consolidado: `clientStatus`, `projectStatus`,
    `consultantStatus`;
  - relatorios: `sort`, `direction`, `page`, `pageSize`;
  - periodo: presets de periodo sem remover `from`/`to`;
  - opcional de baixo risco: `somenteComMovimento`.
- Escopo que NAO deve entrar sem decisao:
  - `contractType` / tipo de contratacao;
  - `projectType` / tipo de projeto;
  - `facilities`;
  - `faturamento`/liberacao;
  - alteracao em massa.

Sub-rodada 4.1.2 - Modelo de dados:
- Use `jump-data-modeler`.
- Verifique se os filtros escolhidos exigem migration.
- Para esta rodada, prefira filtros que usam campos existentes:
  - `Client.status`;
  - `Project.status`;
  - `Consultant.status`;
  - `TimeEntry.billable`;
  - `TimeEntry.status`;
  - `Expense.status`.
- Se `contractType`, `projectType` ou `facilities` forem considerados
  indispensaveis, documente proposta de migration, mas nao implemente sem
  confirmacao explicita do product-owner dentro da rodada.
- Avalie indices apenas se os filtros novos justificarem. Evite churn de schema.

Sub-rodada 4.1.3 - Implementacao dos filtros:
- Use `jump-fullstack-engineer`, `jump-frontend-ux` e `jump-design-system`.
- Atualize `apps/web/src/lib/reports/schemas.ts` para aceitar:
  - `billable` em horas (`true`/`false`/ausente);
  - `clientStatus`;
  - `projectStatus`;
  - `consultantStatus`;
  - `sort`;
  - `direction`;
  - `page`;
  - `pageSize`;
  - presets de periodo, se adotados, resolvidos para `from`/`to` no servidor.
- Atualize `apps/web/src/lib/db/reports.ts` para aplicar os filtros com o mesmo
  RBAC atual. A tela e CSV devem continuar usando as mesmas funcoes de leitura.
- Atualize `ReportFilters.tsx` com controles densos e claros, sem transformar a
  tela em um formulario pesado demais:
  - usar disclosure/agrupamento "Filtros avancados" se necessario;
  - manter query string como fonte de verdade;
  - preservar acessibilidade e foco.
- Atualize `ReportsView.tsx`/links de CSV para propagar os novos parametros.
- Adicione paginacao server-side nas tabelas de relatorio se `page/pageSize`
  entrar no escopo. A exportacao CSV deve exportar o conjunto filtrado inteiro
  ou documentar claramente se exporta apenas a pagina atual. Preferencia:
  CSV exporta o conjunto filtrado inteiro, com limite seguro se necessario.
- Nao expor campos financeiros para roles sem permissao.

Sub-rodada 4.1.4 - CSV e contratos:
- CSV deve respeitar todos os filtros novos.
- Nao exportar storage keys, tokens, custos ou valores financeiros para quem
  nao pode ver.
- Manter protecao contra CSV injection.
- Manter BOM UTF-8 e headers estaveis.
- Se adicionar colunas novas, documentar nos testes.

Sub-rodada 4.1.5 - QA, revisao e deploy:
- Use `jump-qa-engineer` para testes:
  - schemas dos novos filtros;
  - builders de where com `billable`, status de cliente/projeto/consultor;
  - RBAC preservado;
  - sort/direction validos e invalidos;
  - page/pageSize limites;
  - CSV com novos filtros;
  - ReportFilters refletindo query string.
- Use `jump-code-reviewer` antes de commit.
- Use `jump-devops` para smoke local/producao e deploy manual se a integracao
  Git da Vercel ainda nao estiver ativa.

Fora do escopo:
- Auth real/Entra ID.
- Storage real de comprovantes.
- Integracao bancaria/ERP/CNAB/Open Finance.
- Modelo persistido de fechamento/lock.
- CRUDs administrativos completos.
- Alteracao em massa de aprovacao/status/cobranca.
- Migration para tipo de contratacao/tipo de projeto/facilities sem decisao
  explicita.

Criterios de pronto:
- Mapeamento legado revisado e atualizado se a sessao autenticada revelar
  diferenca relevante.
- Relatorios de horas/despesas/consolidado aceitam os filtros novos definidos
  para esta rodada.
- Tela e CSV usam os mesmos filtros e escopo.
- RBAC server-side preservado.
- `billable` permite reproduzir o filtro legado de cobranca/faturavel em horas.
- Status de cliente/projeto/consultor funcionam com campos existentes.
- Sort e paginacao, se implementados, sao server-side e testados.
- Query string continua sendo a fonte de verdade.
- `npm run typecheck`, `npm run lint`, `npm run test` e `npm run build` passam.
- Revisao do `jump-code-reviewer` sem bloqueadores.
- Commit e push em `origin/main`.
- Deploy Vercel validado se aplicavel.

Mensagem de commit sugerida:
`feat: align reports with legacy filters`

Ao final, reporte:
- quais filtros legados foram mantidos;
- quais foram melhorados/adaptados;
- quais foram postergados e por que;
- migrations, se houver;
- quantidade de testes;
- validacoes executadas;
- deploy Vercel, se feito.
```

## Observacao

Os agentes atuais atendem esta rodada. Nao crie agente novo a menos que a
analise mostre uma necessidade real. Um futuro `jump-reporting-agent` pode ser
util, mas nao e necessario agora.
