# Backlog Refinado - Consultor, Operacoes e Portal Antigo

## 1. Objetivo

Consolidar o que o JumpFlow ja possui com as funcionalidades identificadas no portal antigo da Jump Label, refinando o backlog para orientar as proximas rodadas de desenvolvimento orquestradas pelo Claude Code.

Este documento nao substitui `docs/backlog-mvp.md`; ele detalha a evolucao operacional dos modulos ja existentes e adiciona as lacunas do portal antigo.

Referencias:

- `docs/backlog-mvp.md`
- `docs/backlog-correcoes-e-modulos-consultor.md`
- `docs/modelo-dados.md`
- `docs/auth-foundation.md`
- `docs/database-foundation.md`
- Portal antigo: `https://admin.jumplabel.com.br/`

## 2. Estado Atual do JumpFlow

### Ja Implementado Como Base

- Autenticacao com Auth.js e Microsoft Entra ID preparado.
- Dev mode explicito para desenvolvimento.
- RBAC inicial.
- Prisma/PostgreSQL foundation.
- Shell operacional com sidebar/topbar.
- Dashboard.
- Modulos visuais MVP:
  - Horas.
  - Projetos.
  - Consultores.
  - Skills.
  - Certificados.
  - Aprovacoes.
  - Financeiro.
- Dados mockados centralizados.
- Automacao de aprovacao de horas.
- Relatorio de consultores sem lancamento.
- Jobs Vercel.
- Email provider console/Resend preparado.
- Testes, typecheck, lint e build configurados.

### Ainda Mockado ou Incompleto

- Botoes de acao em alguns modulos.
- Persistencia real dos modulos operacionais.
- Lancamento funcional de horas.
- Despesas.
- Relatorios operacionais com filtros/exportacao.
- CRUDs de clientes, projetos, consultores, skills e certificados.
- Anexos/comprovantes.
- Launcher inicial por perfil.

## 3. Matriz de Merge Funcional

| Area | Existe no JumpFlow | Portal antigo | Decisao de backlog |
| --- | --- | --- | --- |
| Horas | Tela MVP com grade e mocks | Apontamento completo, form, aprovacao, relatorios | Incrementar tela atual com acoes reais e persistencia |
| Despesas | Nao existe | Apontamento, aprovacao, relatorios, comprovantes | Criar novo modulo |
| Aprovacoes | Tela MVP + RBAC | Aprova horas e despesas | Unificar fila de horas/despesas progressivamente |
| Financeiro | Visao MVP | Relatorios e fechamento por apontamento/despesa | Incrementar com despesas e exportacoes |
| Projetos | Tela MVP mockada | Cadastro e filtros | Evoluir para CRUD real e suporte a alocacoes |
| Consultores | Tela MVP mockada | Usuarios/perfil | Evoluir para cadastro real e perfil do consultor |
| Skills/Certificados | Tela MVP mockada | Minhas skills e certificacoes | Evoluir para autosservico e validacao |
| Documentos | Nao existe | Download/gerenciar documentos, politicas | Fase posterior |
| RH | Nao existe | Folha de ponto, formularios CLT/PJ | Fase posterior |
| Equipamentos | Nao existe | Cadastro/controle equipamentos | Fase posterior |
| Notificacoes | Parcial tecnico/jobs | Notificacoes no portal | Criar centro de notificacoes futuro |
| Controle de acesso | RBAC inicial | Controle nivel acesso | Evoluir admin de perfis |
| Canal de Etica | Nao existe | Canal de Etica | Avaliar se fica no JumpFlow |

## 4. Fases Recomendadas

### Fase A - Corrigir UX Que Parece Quebrada

Objetivo:

- Garantir que botoes visiveis tenham comportamento funcional ou sejam claramente tratados como indisponiveis.

Entregas:

- Modal/form de novo lancamento de horas.
- Copiar semana anterior.
- Navegar entre semanas.
- Enviar horas para aprovacao.
- Aprovar/reprovar horas.
- Feedback visual para todas as acoes.
- Testes cobrindo acoes principais.
- Correcao de strings com encoding quebrado visivel.

### Fase B - Despesas MVP

Objetivo:

- Criar o modulo de despesas com experiencia similar ao portal antigo, mas alinhada ao JumpFlow.

Entregas:

- Rota `/app/despesas`.
- Item na navegacao.
- Lista de despesas.
- Novo lancamento de despesa.
- Upload/anexo preparado.
- Status de aprovacao.
- Status de pagamento.
- Totais por status.
- Mock centralizado ou schema Prisma, conforme decisao da rodada.
- Testes.

### Fase C - Launcher Inicial

Objetivo:

- Transformar `/app` em tela inicial de atalhos por perfil.

Entregas:

- Cards/botoes de modulo.
- Badges de pendencias.
- Atalhos por role.
- Sidebar mantida para navegacao avancada.
- Testes de exibicao por role.

### Fase D - Persistencia Real dos Modulos Base

Objetivo:

- Substituir mocks por Prisma em fatias.

Ordem sugerida:

1. Clientes.
2. Projetos.
3. Consultores.
4. Alocacoes.
5. Horas.
6. Despesas.
7. Skills.
8. Certificados.
9. Aprovacoes.
10. Financeiro.

### Fase E - Relatorios e Exportacoes

Objetivo:

- Trazer capacidades do portal antigo para operacao e financeiro.

Entregas:

- Relatorio de horas.
- Relatorio de despesas.
- Filtros por periodo, cliente, projeto, usuario, status.
- Exportacao CSV.
- Totais por status.
- Historico/logs.

### Fase F - Modulos Posteriores

Objetivo:

- Avaliar funcionalidades do portal antigo que podem ou nao pertencer ao JumpFlow.

Itens:

- Documentos.
- Politicas e procedimentos.
- Formularios RH CLT/PJ.
- Folha de ponto.
- Equipamentos.
- Controle de nivel de acesso.
- Notificacoes.
- Canal de Etica.

## 5. Epicos Refinados

### EP-COR - Acoes Funcionais e UX Confiavel

#### US-COR-01 - Novo Lancamento de Horas

Como consultor, quero criar um lancamento de horas para registrar trabalho por projeto.

Aceite:

- Botao abre modal/form.
- Exige projeto, atividade, data/dia e horas.
- Horas devem ser maiores que zero.
- Lancamento salvo aparece como rascunho.
- Se ainda nao houver persistencia, o estado deve ser local e explicitamente preparado no codigo.

#### US-COR-02 - Copiar Semana Anterior

Como consultor, quero copiar lancamentos da semana anterior para acelerar o preenchimento.

Aceite:

- Copia projetos/atividades elegiveis.
- Permite ajustar horas antes de enviar.
- Nao copia itens aprovados/fechados como editaveis.
- Exibe feedback de sucesso/erro.

#### US-COR-03 - Enviar Horas

Como consultor, quero enviar a semana para aprovacao.

Aceite:

- Valida lancamentos.
- Muda status para enviado.
- Bloqueia edicao pelo consultor.
- Reflete na fila de aprovacoes.

#### US-COR-04 - Aprovar/Reprovar Horas

Como gestor, quero decidir lancamentos pendentes.

Aceite:

- Aprovar muda status.
- Reprovar exige comentario.
- Registra historico/auditoria.
- Atualiza lista sem refresh manual.

### EP-DES - Despesas

#### US-DES-01 - Lista de Despesas

Como consultor/gestor, quero visualizar despesas por status para acompanhar reembolsos e pagamentos.

Aceite:

- Lista mostra projeto, cliente, data, valor, status e comprovante.
- Filtros por status, projeto/cliente e periodo.
- Totais por status.

#### US-DES-02 - Nova Despesa

Como consultor, quero lancar uma despesa vinculada a um projeto.

Aceite:

- Exige projeto, data, valor e descricao.
- Permite numero de nota fiscal.
- Permite anexar comprovante.
- Pode salvar como rascunho ou enviar.

#### US-DES-03 - Comprovante de Despesa

Como aprovador/financeiro, quero visualizar ou baixar comprovantes.

Aceite:

- Arquivo tem nome visivel.
- Tipo/tamanho sao validados.
- Acesso respeita permissao.

#### US-DES-04 - Aprovacao de Despesas

Como gestor/financeiro, quero aprovar ou reprovar despesas.

Aceite:

- Aprovacao muda status para aprovado.
- Reprovacao exige comentario.
- A decisao aparece no historico.

#### US-DES-05 - Pagamento de Despesas

Como financeiro, quero controlar o status de pagamento.

Aceite:

- Status possiveis: nao agendada, agendada, paga, cancelada.
- Apenas roles financeiras alteram pagamento.
- Consultor visualiza status.

#### US-DES-06 - Relatorio de Despesas

Como financeiro/gestor, quero exportar despesas para conferencia.

Aceite:

- Filtros por periodo, cliente, projeto, consultor e status.
- Exportacao CSV.
- Totais por status.

### EP-LAU - Launcher Inicial

#### US-LAU-01 - Tela Inicial por Perfil

Como usuario, quero uma tela inicial com minhas acoes principais.

Aceite:

- `/app` mostra atalhos.
- Atalhos respeitam roles.
- Cada atalho navega corretamente.
- Pendencias aparecem como badges.

#### US-LAU-02 - Atalhos do Consultor

Como consultor, quero acessar rapidamente horas, despesas, skills/certificados e projetos.

Aceite:

- Consultor ve apenas atalhos relevantes.
- A primeira dobra da tela mostra as acoes mais frequentes.

#### US-LAU-03 - Atalhos de Gestao

Como gestor/financeiro/admin, quero acessar aprovacoes, financeiro e cadastros rapidamente.

Aceite:

- Gestores veem aprovacoes e projetos.
- Financeiro ve financeiro, relatorios e despesas.
- Admin ve todos os atalhos.

### EP-REL - Relatorios Operacionais

#### US-REL-01 - Relatorio de Horas

Como gestor/financeiro, quero consultar horas por periodo, cliente, projeto e consultor.

Aceite:

- Filtros principais disponiveis.
- Totais por status.
- Exportacao CSV.

#### US-REL-02 - Relatorio de Horas e Despesas

Como financeiro, quero uma visao consolidada para fechamento.

Aceite:

- Mostra horas aprovadas e despesas aprovadas.
- Agrupa por cliente/projeto.
- Exporta CSV.

### EP-CAD - Cadastros Reais

#### US-CAD-01 - Clientes Reais

Como gestor/comercial, quero cadastrar e editar clientes.

Aceite:

- CRUD basico.
- Status ativo/inativo.
- Projetos usam clientes reais.

#### US-CAD-02 - Projetos Reais

Como gestor, quero cadastrar projetos com dados operacionais e financeiros.

Aceite:

- CRUD basico.
- Cliente, gestor, periodo, status e budget.
- Valor hora protegido por role.

#### US-CAD-03 - Consultores Reais

Como People/gestor, quero manter consultores reais.

Aceite:

- CRUD basico.
- Senioridade, area, status, usuario vinculado.
- Disponibilidade derivada de alocacoes.

## 6. Mapa de Agentes para Desenvolvimento

### Agentes Existentes a Usar

- `jump-product-owner`: refinar historias e criterios.
- `jump-architect`: decidir persistencia, rotas, RBAC e trade-offs.
- `jump-data-modeler`: schema Prisma, migrations e seeds.
- `jump-fullstack-engineer`: Server Actions, pages, services e integracao.
- `jump-frontend-ux`: fluxos, formularios, tabelas e responsividade.
- `jump-design-system`: Playful Ops, consistencia visual e acessibilidade.
- `jump-qa-engineer`: testes unitarios, integracao e smoke.
- `jump-devops`: Vercel, env vars, jobs e deploy.
- `jump-code-reviewer`: revisao final.

### Novos Agentes Sugeridos

#### `jump-timesheet-agent`

Especialista em:

- lancamento de horas;
- periodos semanais;
- envio para aprovacao;
- regras de edicao/bloqueio;
- integracao com aprovacao automatica.

#### `jump-expenses-agent`

Especialista em:

- despesas;
- comprovantes;
- aprovacao de despesas;
- status de pagamento;
- relatorios de despesas.

#### `jump-legacy-portal-analyst`

Especialista em:

- comparar portal antigo e JumpFlow;
- mapear funcionalidades legadas;
- extrair fluxos e campos relevantes;
- propor equivalentes modernos.

#### `jump-operational-launcher-agent`

Especialista em:

- tela inicial por perfil;
- atalhos;
- badges de pendencia;
- navegacao consultor-first.

## 7. Orquestracao Recomendada pelo Claude Code

### Rodada 1 - Acoes de Horas + Launcher + Despesas Mock

Objetivo:

- Resolver UX quebrada e adicionar a entrada de despesas.

Agentes:

1. `jump-product-owner`
2. `jump-timesheet-agent`
3. `jump-expenses-agent`
4. `jump-operational-launcher-agent`
5. `jump-frontend-ux`
6. `jump-design-system`
7. `jump-qa-engineer`
8. `jump-code-reviewer`

Entrega:

- Botoes de Horas funcionais no estado local/mock.
- `/app/despesas` criado.
- `/app` launcher criado.
- Navegacao atualizada.
- Testes.

Commit sugerido:

```text
feat: add consultant actions launcher and expenses
```

### Rodada 2 - Persistencia de Horas

Objetivo:

- Conectar horas ao Prisma.

Agentes:

1. `jump-data-modeler`
2. `jump-timesheet-agent`
3. `jump-fullstack-engineer`
4. `jump-qa-engineer`
5. `jump-code-reviewer`

Entrega:

- Queries e Server Actions de horas.
- Validacoes no servidor.
- Auditoria.
- Testes sem depender de Supabase real.

### Rodada 3 - Persistencia de Despesas

Objetivo:

- Criar schema e persistencia de despesas.

Agentes:

1. `jump-data-modeler`
2. `jump-expenses-agent`
3. `jump-fullstack-engineer`
4. `jump-devops`, se houver storage.
5. `jump-qa-engineer`
6. `jump-code-reviewer`

Entrega:

- `Expense` no Prisma.
- Aprovacao de despesa.
- Pagamento.
- Upload preparado ou integrado.

### Rodada 4 - Relatorios

Objetivo:

- Criar relatorios de horas/despesas.

Agentes:

1. `jump-product-owner`
2. `jump-data-modeler`
3. `jump-fullstack-engineer`
4. `jump-qa-engineer`
5. `jump-code-reviewer`

Entrega:

- Filtros.
- Exportacao CSV.
- Totais.

## 8. Criterios Gerais de Pronto

- Nenhum botao visivel deve ser inerte sem feedback.
- Acoes devem ter validacao no servidor quando persistirem dados.
- Fluxos sensiveis devem respeitar RBAC.
- Dados financeiros e despesas devem ser protegidos por role.
- Aprovacoes e reprovacoes devem gerar auditoria.
- Uploads devem validar tipo e tamanho.
- Testes devem cobrir regras criticas.
- `npm run typecheck`, `npm run test`, `npm run lint` e `npm run build` devem passar.
- Deploy na Vercel deve ser validado apos merges relevantes.

## 9. Decisoes Pendentes

- Despesas serao tratadas como modulo separado.
- Aprovacao de despesas tera fluxo combinado: gestor do projeto e financeiro.
- Status de pagamento sera manual no JumpFlow inicialmente.
- O launcher substitui o dashboard como primeira tela para consultores.
- O `ModulePlaceholder` pode ser removido se nao houver previsao clara de uso.
- Funcionalidades de RH, documentos e equipamentos podem entrar no JumpFlow; se no futuro fizer sentido separar, serao extraidas para outro produto.

## 10. Decisoes Tecnicas a Refinar

### Storage de Comprovantes

Decisao: **Supabase Storage**.

Motivos:

- O banco inicial ja e Supabase Postgres.
- Supabase Storage oferece controle de acesso por policies/RLS e URLs assinadas.
- Comprovantes de despesas sao documentos privados, entao controle fino de acesso e mais importante que distribuicao publica.
- A migracao futura para outro storage continua possivel se gravarmos no banco apenas metadados e uma `storageKey`, nao uma dependencia espalhada pela UI.

Alternativa: **Vercel Blob**.

Quando faria sentido:

- Se quisermos manter tudo muito proximo do deploy Vercel.
- Se o upload direto do browser para Blob simplificar a operacao.
- Se os arquivos nao exigirem regras complexas de acesso por usuario/role.

- Usar Supabase Storage para comprovantes e documentos privados.
- Criar uma camada `storageProvider` para nao acoplar o dominio ao Supabase.
- Armazenar metadados no Postgres:
  - `fileName`;
  - `contentType`;
  - `size`;
  - `storageBucket`;
  - `storageKey`;
  - `uploadedByUserId`;
  - `createdAt`.

### Integracao Futura de Status de Pagamento

Decisao inicial: pagamento manual no JumpFlow.

Status: ainda sera avaliado.

Padroes/caminhos futuros:

- **CNAB 240 / arquivos de retorno bancario**: padrao tradicional FEBRABAN para troca de arquivos entre empresas e bancos. Pode informar confirmacao/rejeicao de agendamento, liberacao/bloqueio e outros eventos de pagamento, dependendo do banco e layout contratado.
- **ERP/financeiro externo**: caminho provavelmente mais simples se a Jump ja usa um ERP que centraliza contas a pagar. JumpFlow envia ou exporta despesas aprovadas; o ERP devolve status.
- **Open Finance / Pix**: pode ser considerado no futuro para iniciacao/consulta de pagamentos via APIs, mas exige consentimento, participante/provedor adequado e maior complexidade regulatoria/operacional.

- MVP: pagamento manual dentro da cadeia unica de status da despesa (sem enum
  separado de pagamento; ver "Despesas - Decisoes Confirmadas" abaixo).
- Fase posterior: exportacao CSV/CNAB ou integracao com ERP.
- Fase avancada: avaliar APIs bancarias/Open Finance apenas se houver caso de uso claro e governanca financeira.

### Despesas - Decisoes Confirmadas (Rodada 3)

Storage e arquivo:

- Bucket Supabase Storage: `expense-receipts`.
- Path: `expenses/{expenseId}/{timestamp}-{safeFileName}`; sem CPF, nome de
  consultor, cliente, projeto ou dado sensivel no path.
- MIME aceitos: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`.
- Tamanho maximo: 10 MB. MVP: 1 comprovante por despesa.
- Acesso por URL assinada de curta duracao, gerada no servidor apos RBAC.
- Visibilidade do comprovante: dono da despesa, gestor do projeto da despesa,
  FINANCE, AREA_MANAGER e ADMIN. Mais ninguem.

Status (cadeia unica `ExpenseStatus`, sem `ExpensePaymentStatus` separado):

- `DRAFT -> SUBMITTED -> MANAGER_APPROVED -> FINANCE_APPROVED ->
  PAYMENT_SCHEDULED -> PAID`, com `MANAGER_REJECTED` e `FINANCE_REJECTED`.
- Cadeia unica evita combinacoes invalidas e da ao financeiro filtros diretos:
  `FINANCE_APPROVED` = a pagar, `PAYMENT_SCHEDULED` = agendada, `PAID` = paga.
- Sem status `PAYMENT_CANCELLED`: cancelar agendamento e a transicao
  `PAYMENT_SCHEDULED -> FINANCE_APPROVED`, com AuditEvent e motivo.
  `PAID` e o unico terminal.
- Reenvio pos-reprovacao segue o padrao de Horas: editar despesa
  `MANAGER_REJECTED`/`FINANCE_REJECTED` retorna a `DRAFT`; o reenvio refaz a
  cadeia completa (gestor aprova de novo, mesmo se a reprovacao foi do
  financeiro), preservando o historico de Approvals.
- Comprovante pode ser anexado/substituido apenas em `DRAFT`,
  `MANAGER_REJECTED` e `FINANCE_REJECTED`; imutavel a partir de `SUBMITTED`.
- Reprovacao (gestor ou financeiro) exige comentario.

Regras de criacao:

- Criar/editar despesa exige `Allocation ACTIVE` do consultor no projeto
  cobrindo a data da despesa (paridade com Horas); projeto `CLOSED` nao recebe
  despesa; `allocationId` gravado na despesa.

RBAC das decisoes:

- `approveAsManager`: PROJECT_MANAGER somente nos projetos onde e
  `managerUserId`; AREA_MANAGER e ADMIN em qualquer projeto. FINANCE puro nao
  aprova como gestor.
- `approveAsFinance` e `setPayment`: `FINANCIAL_ROLES`
  (FINANCE, AREA_MANAGER, ADMIN).
- Segregacao: nenhum usuario decide ou altera pagamento de despesa cujo
  consultor e ele mesmo, em nenhuma etapa.

Onde cada decisao acontece:

- `/app/aprovacoes`: fila unica; `SUBMITTED` para quem aprova como gestor e
  `MANAGER_APPROVED` para quem aprova como financeiro, com etiqueta da etapa.
  Requer adicionar `FINANCE` ao acesso da rota no route map.
- `/app/financeiro`: lista `FINANCE_APPROVED`/`PAYMENT_SCHEDULED`/`PAID` e
  concentra o controle manual de pagamento (`setPayment`).
- Integracao bancaria/ERP fora do escopo; pagamento manual no MVP.

## 11. Decisoes Ainda Pendentes

- Se despesas aprovadas entram no fechamento mensal junto com horas ou em fechamento separado.
- Quais funcionalidades de RH/documentos/equipamentos entram primeiro.

## 12. Rodada 1 - Implementado (MVP funcional/mockado)

Entregue na Rodada 1 (`feat: add consultant actions launcher and expenses`).
Tudo opera em **estado local/mock**, sem persistencia em banco; os shapes
espelham o modelo Prisma futuro para que a troca por Server Actions seja
mecanica.

### Horas (acoes funcionais)

- `Novo lancamento` abre modal com projeto, atividade, dia, horas (>0 e <=24),
  descricao e faturavel; salvar adiciona/atualiza rascunho local.
- `Copiar semana anterior` copia lancamentos elegiveis (nao reprovados) que
  ainda nao existem na semana, como rascunho, com feedback.
- Navegacao semana anterior/proxima troca a semana exibida; nos limites exibe
  feedback honesto.
- `Enviar para aprovacao` valida rascunhos com horas e muda status local para
  `SUBMITTED`.
- Itens `SUBMITTED`/`APPROVED` nao expoem edicao (somente `DRAFT`/`REJECTED`).

### Despesas (`/app/despesas`)

- Modulo novo com `ExpenseList`, `ExpenseForm`, `ExpenseStatusBadge`,
  `ExpensePaymentBadge`, `ExpenseSummaryCards`, `ExpenseAttachmentField`.
- Mock centralizado em `apps/web/src/lib/mock-data/expenses.ts`.
- Acoes: nova despesa (rascunho/enviar), filtros por status/projeto/periodo,
  visualizar metadados do comprovante.
- Pagamento: alteravel apenas por papeis financeiros (`FINANCIAL_ROLES`),
  decidido no servidor e passado como `canManagePayments`.

### Aprovacoes

- `ApprovalItem.type` distingue `HOURS`/`EXPENSE`; fila com filtro por tipo.
- Aprovar/reprovar mutam estado local; reprovar exige justificativa.
- `/app/aprovacoes` segue protegido por `requireRole`.

### Financeiro

- `ExpensesFinancePanel` lista despesas aprovadas/pagas dentro da pagina ja
  protegida por `FINANCIAL_ROLES`.

### Launcher (`/app`)

- `/app` deixou de redirecionar e virou launcher operacional por perfil
  (`lib/launcher.ts` + `LauncherView`), com atalhos filtrados por role e badges
  de pendencia a partir de mocks centralizados. Sidebar/topbar mantidos; item
  `Inicio` adicionado a navegacao (match exato de `/app`).

### Convencoes novas de UI/interacao

- `components/ui/Modal.tsx`: dialog acessivel compartilhado (focus trap, Escape,
  backdrop, `aria-modal`). Usado por Horas e Despesas.
- `components/ui/Feedback.tsx` (`useFeedback` + `FeedbackBanner`): regiao
  `aria-live` para feedback honesto de acoes mock — nenhuma acao finge
  round-trip de servidor.
- Mutacoes em estado local de componentes client; dados e helpers puros
  permanecem em `lib/mock-data/*` para facilitar a troca por Prisma.

### Decisoes confirmadas nesta rodada

- Despesas como modulo separado (`/app/despesas`).
- Launcher `/app` como primeira tela; dashboard permanece acessivel pela
  sidebar.
- `ModulePlaceholder` mantido (ainda util para telas futuras).
- Status de pagamento manual no JumpFlow, restrito a papeis financeiros.

## 13. Rodada 2 - Entregue (Persistencia de Horas)

Entregue (`feat: persist timesheet entries`): horas persistem via Prisma com
Server Actions, Zod, RBAC, Approval e AuditEvent; fila de aprovacoes le horas
reais e a automacao de aprovacao opera sobre dados persistidos. Spec e
pendencias residuais em `docs/horas-persistencia.md` (secao 8).
