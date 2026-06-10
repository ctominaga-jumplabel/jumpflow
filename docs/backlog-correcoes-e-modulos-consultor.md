# Backlog - Correcoes, Despesas e Experiencia do Consultor

## 1. Contexto

Este backlog complementa o MVP atual do JumpFlow apos a primeira versao dos modulos operacionais.

Motivadores:

- Alguns botoes da interface estao visiveis, mas ainda nao executam nenhuma acao.
- Alem do lancamento de horas, consultores tambem precisam lancar despesas.
- A experiencia de navegacao pode ser melhor para consultores se houver uma tela inicial com atalhos de modulo, alem do menu lateral.
- O portal antigo da Jump Label possui funcionalidades que ainda nao foram incorporadas ao JumpFlow.

Portal antigo analisado:

- `https://admin.jumplabel.com.br/`

Observacao:

- As credenciais locais foram consideradas segredo e nao devem ser versionadas ou documentadas.
- Parte da analise foi feita por inspecao do app publico/bundle do portal antigo, identificando menus, rotas e textos de funcionalidades.

## 2. Frente 1 - Corrigir Botoes Inertes

### Problema

Alguns botoes ja aparecem como acoes reais, mas ainda nao executam comportamento funcional.

Exemplo principal:

- Modulo Horas:
  - `Novo lancamento`
  - `Copiar semana anterior`
  - `Enviar para aprovacao`
  - navegacao de semana anterior/proxima

O codigo atual deixa claro que essas acoes foram preparadas visualmente, mas ainda estao inertes.

### Objetivo

Transformar botoes visiveis em acoes funcionais, ainda que em uma primeira etapa usem Server Actions, estado local ou fluxo preparado para persistencia.

### Escopo Inicial

#### Horas

Funcionalidades:

- Abrir formulario/modal de novo lancamento.
- Editar lancamento em rascunho.
- Copiar semana anterior.
- Navegar entre semanas.
- Enviar semana para aprovacao.
- Exibir confirmacao de envio.
- Bloquear edicao de horas aprovadas/fechadas.
- Exibir erros de validacao.

Campos minimos do lancamento:

- Projeto.
- Atividade/tipo de apontamento.
- Data ou dia da semana.
- Quantidade de horas.
- Descricao.
- Faturavel ou nao faturavel.

#### Aprovacoes

Funcionalidades:

- Aprovar apontamento.
- Reprovar com justificativa obrigatoria.
- Visualizar historico de decisao.
- Atualizar contadores/lista apos decisao.

#### Financeiro

Funcionalidades:

- Preparar acao de fechamento mensal.
- Confirmar fechamento.
- Bloquear alteracoes apos fechamento.
- Exibir estado de fechamento com clareza.

#### Cadastros Operacionais

Funcionalidades a preparar:

- Novo projeto.
- Novo consultor.
- Novo certificado.
- Nova skill.

### Historias

#### US-COR-01 - Novo Lancamento de Horas

Como consultor, quero criar um novo lancamento de horas para registrar meu trabalho em um projeto.

Critérios de aceite:

- O botao `Novo lancamento` abre um formulario.
- O formulario exige projeto, data, horas e atividade.
- Horas devem ser maiores que zero.
- Ao salvar, o lancamento aparece na grade semanal como rascunho.
- O fluxo nao deve fingir persistencia se ainda estiver mockado.

#### US-COR-02 - Copiar Semana Anterior

Como consultor, quero copiar a semana anterior para acelerar meu apontamento.

Critérios de aceite:

- A acao copia projetos/atividades da semana anterior.
- Horas copiadas podem ser editadas antes do envio.
- Projetos encerrados nao devem ser copiados quando houver dados reais.
- O usuario recebe feedback visual da acao.

#### US-COR-03 - Enviar Horas para Aprovacao

Como consultor, quero enviar minha semana para aprovacao para concluir meu apontamento.

Critérios de aceite:

- Apenas semanas com lancamentos validos podem ser enviadas.
- Apos envio, os lancamentos mudam para status `Enviado`.
- Lancamentos enviados ficam bloqueados para edicao pelo consultor.
- O gestor passa a enxergar os itens em aprovacoes.

#### US-COR-04 - Decidir Aprovacao

Como gestor, quero aprovar ou reprovar lancamentos para controlar o fechamento.

Critérios de aceite:

- Aprovar muda status para `Aprovado`.
- Reprovar exige justificativa.
- A decisao registra usuario, data e comentario.
- O consultor consegue identificar itens reprovados.

## 3. Frente 2 - Modulo de Despesas

### Referencia do Portal Antigo

Funcionalidades identificadas no portal antigo:

- `Apontamento de horas e despesas`.
- `Apontamento de despesas`.
- `Aprovacao de horas e despesas`.
- `Relatorio de apontamento de horas e despesas`.
- Filtros por cliente, projeto, usuario, status e periodo.
- Upload/download/visualizacao de anexo ou comprovante.
- Status de despesa:
  - aguardando aprovacao;
  - aprovada;
  - reprovada;
  - pagamento efetuado;
  - agendada;
  - concluida.
- Totais de despesas por status.

Campos inferidos para despesa:

- Projeto.
- Cliente.
- Consultor/usuario.
- Data da despesa.
- Valor.
- Numero da nota fiscal.
- Descricao.
- Comprovante/anexo.
- Status de aprovacao.
- Status de pagamento.
- Logs/historico.

### Objetivo

Criar um modulo de despesas para consultores lancarem gastos vinculados a projetos e para gestores/financeiro aprovarem, acompanharem e fecharem despesas.

### Rotas Propostas

- `/app/despesas`
- `/app/despesas/nova`, se for pagina dedicada.
- Ou modal/form dentro de `/app/despesas` na primeira versao.

### Modelo de Dados Proposto

Nova entidade `Expense`:

- `id`
- `consultantId`
- `projectId`
- `clientId`, opcional se derivado do projeto
- `date`
- `amount`
- `description`
- `invoiceNumber`
- `attachmentUrl`
- `status`
- `paymentStatus`
- `submittedAt`
- `approvedAt`
- `approvedByUserId`
- `rejectedAt`
- `rejectionReason`
- `createdAt`
- `updatedAt`

Enums sugeridos:

- `ExpenseStatus`
  - `DRAFT`
  - `SUBMITTED`
  - `APPROVED`
  - `REJECTED`
  - `CLOSED`

- `ExpensePaymentStatus`
  - `NOT_SCHEDULED`
  - `SCHEDULED`
  - `PAID`
  - `CANCELLED`

Atualizacao em `ApprovableEntityType`:

- adicionar `EXPENSE`.

### Componentes Propostos

- `ExpenseList`
- `ExpenseForm`
- `ExpenseStatusBadge`
- `ExpensePaymentBadge`
- `ExpenseSummaryCards`
- `ExpenseAttachmentField`
- `ExpenseApprovalQueue`

### Historias

#### US-DES-01 - Lancar Despesa

Como consultor, quero lancar uma despesa vinculada a um projeto para solicitar reembolso ou registro financeiro.

Critérios de aceite:

- O consultor informa projeto, data, valor e descricao.
- O valor deve ser maior que zero.
- O comprovante pode ser anexado.
- A despesa pode ficar como rascunho ou ser enviada para aprovacao.

#### US-DES-02 - Anexar Comprovante

Como consultor, quero anexar comprovante para validar a despesa lancada.

Critérios de aceite:

- O formulario aceita upload de arquivo.
- O usuario consegue ver o nome do arquivo anexado.
- Gestores conseguem visualizar ou baixar o anexo.
- Arquivos devem ter validacao de tipo/tamanho.

#### US-DES-03 - Aprovar ou Reprovar Despesa

Como gestor/financeiro, quero aprovar ou reprovar despesas para controlar pagamentos.

Critérios de aceite:

- Aprovacao muda status para `Aprovada`.
- Reprovacao exige justificativa.
- A decisao fica registrada em auditoria/historico.
- Despesas aprovadas aparecem no financeiro.

#### US-DES-04 - Acompanhar Pagamento

Como financeiro, quero acompanhar se uma despesa aprovada foi agendada ou paga.

Critérios de aceite:

- Financeiro visualiza despesas aprovadas.
- Financeiro altera status de pagamento.
- O consultor consegue ver o status da despesa.

#### US-DES-05 - Relatorio de Despesas

Como financeiro/gestor, quero filtrar e exportar despesas para fechamento e auditoria.

Critérios de aceite:

- Filtros por periodo, cliente, projeto, consultor e status.
- Totais por status.
- Exportacao CSV.

## 4. Frente 3 - Tela Inicial com Botoes de Modulo

### Problema

O menu lateral e eficiente para usuarios administrativos, mas pode ser mais pesado para consultores que precisam executar poucas acoes frequentes.

### Objetivo

Transformar `/app` em uma tela inicial operacional com atalhos grandes para os principais modulos, mantendo o menu lateral para navegacao secundaria e usuarios avancados.

### Proposta de Experiencia

Tela `/app` como launcher:

- Saudacao ao usuario.
- Cards/botoes grandes de acao:
  - Lancar horas.
  - Lancar despesas.
  - Minhas skills e certificacoes.
  - Meus projetos.
  - Aprovar horas/despesas, se gestor.
  - Financeiro, se permitido.
- Badges de pendencia:
  - horas pendentes;
  - despesas pendentes;
  - certificados vencendo;
  - aprovacoes aguardando;
  - fechamento em aberto.

### Diretriz de Design

- Manter Playful Ops.
- Usar botoes grandes, iconicos e tateis.
- Evitar parallax ou decoracao pesada.
- Deve funcionar bem em desktop e mobile.
- Acesso rapido deve ser melhor do que navegar pela sidebar.

### Historias

#### US-LAU-01 - Launcher Operacional

Como consultor, quero acessar minhas principais acoes em uma tela inicial para trabalhar mais rapido.

Critérios de aceite:

- `/app` mostra botoes de modulo.
- Os botoes respeitam permissoes do usuario.
- Cada botao navega para o modulo correto.
- Modulos com pendencia exibem badge/contador.

#### US-LAU-02 - Atalhos por Perfil

Como usuario com diferentes papeis, quero ver atalhos relevantes para meu perfil.

Critérios de aceite:

- Consultor ve horas, despesas, skills/certificados e projetos.
- Gestor ve aprovacoes e projetos.
- Financeiro ve financeiro, relatorios e despesas aprovadas.
- Admin ve todos os atalhos principais.

## 5. Funcionalidades do Portal Antigo Ainda Ausentes no JumpFlow

As seguintes funcionalidades foram identificadas no portal antigo e ainda nao estao completas ou nao existem no JumpFlow:

### Apontamentos

- Lancamento funcional de horas.
- Edicao de horas.
- Envio real para aprovacao.
- Aprovacao/reprovacao real de horas.
- Relatorio de apontamento de horas.
- Filtros avancados por cliente, projeto, usuario, status e periodo.
- Exportacao de relatorio.
- Anexos em apontamento de horas, quando aplicavel.
- Visualizacao de historico/logs do apontamento.

### Despesas

- Lancamento de despesas.
- Edicao de despesas.
- Upload de comprovante.
- Visualizar/baixar comprovante.
- Aprovacao/reprovacao de despesas.
- Controle de pagamento da despesa.
- Relatorio de despesas.
- Totais por status.
- Filtros por cliente, projeto, usuario, status e periodo.

### Cadastros

- Cadastro funcional de clientes.
- Cadastro funcional de projetos.
- Cadastro funcional de usuarios/consultores.
- Cadastro de equipamentos.
- Controle de usuarios, projetos e equipamentos.
- Controle de nivel de acesso.

### RH e Documentos

- Folha de ponto.
- Formularios RH CLT.
- Formularios RH PJ.
- Gerenciar documentos.
- Download de documentos.
- Politicas e procedimentos.

### Perfil do Consultor

- Minhas skills.
- Minhas certificacoes.
- Perfil do usuario/consultor.
- Upload de certificados.
- Validacao de certificacoes.

### Comunicacao e Governanca

- Notificacoes.
- Canal de Etica.
- Relatorios administrativos.
- Auditoria/historico de acoes por modulo.

## 6. Priorizacao Recomendada

### P0 - Corrigir UX Que Parece Quebrada

- Botoes de Horas funcionando.
- Acoes de aprovar/reprovar funcionando.
- Remover ou sinalizar claramente acoes ainda nao implementadas.
- Corrigir textos com encoding quebrado, quando aparecerem na UI.

### P1 - Despesas para Consultores

- Rota `/app/despesas`.
- Novo lancamento de despesa.
- Lista de despesas.
- Upload de comprovante preparado.
- Status e totais.
- Navegacao no menu/launcher.

### P2 - Launcher Inicial

- `/app` como tela inicial de botoes por perfil.
- Badges de pendencia.
- Manter sidebar para navegacao avancada.

### P3 - Relatorios e Exportacoes

- Relatorio de horas.
- Relatorio de despesas.
- Exportacao CSV.
- Filtros avancados.

### P4 - Documentos, RH e Governanca

- Documentos.
- Politicas e procedimentos.
- Formularios RH.
- Canal de Etica.
- Equipamentos.
- Controle de nivel de acesso.

## 7. Decisoes Pendentes

- Despesas entram como modulo separado ou dentro de um hub `Apontamentos`?
- Upload de comprovantes sera armazenado em Supabase Storage, Vercel Blob ou outro servico?
- Aprovacao de despesas sera feita por gestor de projeto, gestor de conta, financeiro ou fluxo combinado?
- Status de pagamento sera controlado dentro do JumpFlow ou integrado a outro sistema financeiro?
- O menu lateral continua sempre visivel no desktop ou vira secundario apos criarmos o launcher?
- Funcionalidades antigas como equipamentos, documentos e formularios RH entram no escopo do JumpFlow ou ficam fora do produto?

## 8. Proxima Rodada Sugerida

Implementar a fatia:

1. Corrigir os botoes de Horas.
2. Criar o modulo `/app/despesas` com mock funcional e componentes definitivos.
3. Adicionar Despesas na navegacao.
4. Criar primeira versao do launcher `/app`.
5. Atualizar testes para cobrir os novos fluxos.

Mensagem de commit sugerida:

```text
feat: add expenses module and operational launcher
```

## 9. Refinamento Consolidado

O backlog consolidado e comparado com o estado atual do JumpFlow foi refinado em:

- `docs/backlog-refinado-consultor-operacoes.md`

Esse documento deve ser usado como fonte principal para orquestrar as proximas rodadas com agentes especializados.
