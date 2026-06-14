# Modelo de Dados Inicial - Plataforma Jump

## 1. Principios

- Usar PostgreSQL desde o MVP.
- Usar Prisma migrations para versionamento do schema.
- Evitar dependencias fortes de recursos exclusivos do Supabase.
- Manter regras de negocio centrais no codigo da aplicacao.
- Registrar auditoria para alteracoes sensiveis.
- Preferir soft delete para entidades operacionais importantes.

## 2. Entidades Principais

### User

Representa usuario autenticado da plataforma.

Campos sugeridos:

- `id`
- `name`
- `email`
- `status`
- `createdAt`
- `updatedAt`

Relacionamentos:

- Um usuario pode ter muitos papeis.
- Um usuario pode estar associado a um consultor.
- Um usuario pode gerar eventos de auditoria.

Regras:

- Email deve ser unico.
- Usuario inativo nao acessa areas privadas.

### Role

Representa papel de acesso.

Valores iniciais:

- `ADMIN`
- `CONSULTANT`
- `PROJECT_MANAGER`
- `AREA_MANAGER`
- `FINANCE`
- `PEOPLE`
- `SALES`

Relacionamentos:

- Muitos usuarios podem ter muitos papeis.

### Consultant

Representa o profissional consultor.

Campos sugeridos:

- `id`
- `userId`
- `name`
- `email`
- `jobTitle`
- `seniority`
- `area`
- `status`
- `hourlyCost`
- `createdAt`
- `updatedAt`

Relacionamentos:

- Pode pertencer a um usuario.
- Possui muitas alocacoes.
- Possui muitos lancamentos de horas.
- Possui muitas skills.
- Possui muitos certificados.

Regras:

- Consultor ativo pode ser alocado.
- Consultor inativo nao deve receber novas alocacoes.
- `hourlyCost` deve ser visivel apenas para perfis autorizados.

### Client

Representa cliente atendido pela Jump.

Campos sugeridos:

- `id`
- `name`
- `document`
- `status`
- `createdAt`
- `updatedAt`

Relacionamentos:

- Cliente possui muitos projetos.

Regras:

- Cliente inativo nao recebe novos projetos ativos.

### Project

Representa projeto ou contrato operacional.

Campos sugeridos:

- `id`
- `clientId`
- `name`
- `description`
- `status`
- `startDate`
- `endDate`
- `managerUserId`
- `billingHourlyRate`
- `budgetHours`
- `costCenter`
- `createdAt`
- `updatedAt`

Relacionamentos:

- Pertence a um cliente.
- Possui muitas alocacoes.
- Possui muitos lancamentos de horas.
- Possui um gestor responsavel.

Regras:

- Projeto ativo aceita alocacoes e horas.
- Projeto encerrado nao aceita novos lancamentos, salvo permissao administrativa.
- Alteracoes em valor hora e budget devem gerar auditoria.

### Allocation

Representa alocacao de consultor em projeto.

Campos sugeridos:

- `id`
- `consultantId`
- `projectId`
- `role`
- `allocationPercent`
- `startDate`
- `endDate`
- `status`
- `createdAt`
- `updatedAt`

Relacionamentos:

- Pertence a um consultor.
- Pertence a um projeto.

Regras:

- Percentual deve ser maior que 0 e menor ou igual a 100.
- Sistema deve alertar quando a soma de alocacoes ativas ultrapassar 100% no periodo.
- Alocacao encerrada nao deve permitir novos lancamentos fora do periodo.

### TimesheetPeriod

Representa periodo de apontamento.

Campos sugeridos:

- `id`
- `consultantId`
- `startDate`
- `endDate`
- `status`
- `submittedAt`
- `createdAt`
- `updatedAt`

Relacionamentos:

- Pertence a um consultor.
- Possui muitos lancamentos.

Regras:

- Periodo semanal no MVP.
- Periodo enviado nao pode ser alterado pelo consultor sem reabertura.
- Periodo fechado nao pode ser alterado.

### TimeEntry

Representa lancamento individual de horas.

Campos sugeridos:

- `id`
- `periodId`
- `consultantId`
- `projectId`
- `allocationId`
- `date`
- `hours`
- `activityType`
- `description`
- `billable`
- `status`
- `createdAt`
- `updatedAt`

Status sugeridos:

- `DRAFT`
- `SUBMITTED`
- `APPROVED`
- `REJECTED`
- `CLOSED`

Relacionamentos:

- Pertence a um periodo.
- Pertence a um consultor.
- Pertence a um projeto.
- Pode estar associado a uma alocacao.
- Pode ter uma ou mais aprovacoes.

Regras:

- Horas devem ser maiores que 0.
- Lancamento deve estar dentro do periodo da alocacao.
- Lancamento aprovado entra no relatorio financeiro.
- Lancamento fechado nao pode ser alterado.

### Approval

Representa decisao de aprovacao.

Campos sugeridos:

- `id`
- `entityType`
- `entityId`
- `approverUserId`
- `status`
- `comment`
- `createdAt`

Entidades aprovaveis iniciais:

- `TIME_ENTRY`
- `CONSULTANT_SKILL`
- `CERTIFICATE`

Regras:

- Reprovacao exige comentario.
- Aprovar ou reprovar deve registrar usuario e data.

### Skill

Representa uma competencia cadastrada no catalogo.

Campos sugeridos:

- `id`
- `name`
- `category`
- `status`
- `createdAt`
- `updatedAt`

Regras:

- Nome deve ser unico por categoria.
- Skills inativas nao devem ser sugeridas em novos cadastros.

### ConsultantSkill

Representa uma skill declarada por consultor.

Campos sugeridos:

- `id`
- `consultantId`
- `skillId`
- `level`
- `yearsExperience`
- `lastUsedAt`
- `validationStatus`
- `createdAt`
- `updatedAt`

Niveis:

- `BASIC`
- `INTERMEDIATE`
- `ADVANCED`
- `SPECIALIST`

Regras:

- Consultor nao deve ter a mesma skill duplicada.
- Validacao por gestor pode ser exigida para busca comercial.

### Certificate

Representa certificacao do consultor.

Campos sugeridos:

- `id`
- `consultantId`
- `name`
- `issuer`
- `issuedAt`
- `expiresAt`
- `credentialId`
- `credentialUrl`
- `fileUrl`
- `status`
- `createdAt`
- `updatedAt`

Regras:

- Certificado vencido deve aparecer em alertas.
- Certificado pode exigir validacao por RH/People.

### MonthlyClosing

Representa fechamento mensal financeiro.

Campos sugeridos:

- `id`
- `clientId`
- `projectId`
- `month`
- `year`
- `status`
- `totalHours`
- `totalAmount`
- `closedByUserId`
- `closedAt`
- `createdAt`
- `updatedAt`

Regras:

- Apenas horas aprovadas entram no fechamento.
- Fechamento bloqueia alteracoes nos lancamentos vinculados.

### AuditEvent

Representa trilha de auditoria.

Campos sugeridos:

- `id`
- `actorUserId`
- `entityType`
- `entityId`
- `action`
- `before`
- `after`
- `createdAt`

Regras:

- Registrar alteracoes financeiras, aprovacoes, permissoes e fechamentos.
- `before` e `after` podem ser JSON.

### Entidades de Automacao (aprovacao automatica e relatorios)

Detalhes em `docs/aprovacao-automatica.md`.

- **AutoApprovalException**: lista configuravel de excecoes por
  `consultantId + projectId + type` (`ANY_HOURS` dispensa o total de 8h;
  `WEEKEND` libera sabado/domingo) com `active`. `@@unique(consultantId,
  projectId, type)`. Evita hardcode de listas.
- **AutomationConfig**: singleton (`id = "default"`) com tunables
  (`autoApprovalEnabled`, `requiredDailyMinutes`, `approvalDelayMinutes`,
  `reportRecipientEmail`).
- **AutomationEmailLog**: log de envio com `@@unique(type, referenceKey)` como
  chave de idempotencia (um relatorio por periodo).
- **Approval** (evolucao): `approverUserId` passou a nullable + FK para `User`
  (`onDelete: SetNull`); novos campos `isAutomatic` e `ruleKey` para registrar
  aprovacoes automaticas e qual regra disparou.
- **TimeEntry** (evolucao): novo `submittedAt` como ancora do atraso de 5 min.

## 3. Relacionamentos Resumidos

```text
User N:N Role
User 1:0..1 Consultant
Client 1:N Project
Project 1:N Allocation
Consultant 1:N Allocation
Consultant 1:N TimesheetPeriod
TimesheetPeriod 1:N TimeEntry
Project 1:N TimeEntry
TimeEntry 1:N Approval
Consultant N:N Skill via ConsultantSkill
Consultant 1:N Certificate
Project 1:N MonthlyClosing
User 1:N AuditEvent
```

## 4. Decisoes de Modelagem

- `User` e `Consultant` ficam separados porque nem todo usuario e consultor.
- `TimeEntry` tem status proprio para facilitar aprovacao individual.
- `TimesheetPeriod` agrupa lancamentos semanais para melhorar UX.
- `Approval` e generico para reaproveitar fluxo em horas, skills e certificados.
- Campos financeiros devem ter controle de permissao e auditoria.
- Supabase sera usado como PostgreSQL gerenciado, nao como fonte exclusiva de regras.

## 5. Regras Criticas

- Consultor so lanca horas em projeto com alocacao ativa.
- Gestor so aprova horas de projetos sob sua responsabilidade, salvo perfil superior.
- Financeiro so fecha horas aprovadas.
- Periodos fechados nao podem ser alterados.
- Reprovacao sempre exige justificativa.
- Valor hora e custo hora devem ser protegidos por perfil.
- A soma de alocacoes deve gerar alerta acima de 100%.

## 6. Expansao Fase 2 - Dominios Financeiros, Fiscal, Consultores e Integracoes

Esta expansao prepara os fluxos solicitados no roadmap longo sem implementar
telas ou providers externos. A decisao de modelagem e aditiva: entidades novas
convivem com o modelo MVP existente para permitir migracao gradual.

### Billing e Clientes

- **BillingType**: catalogo de tipos de cobranca (`HOURLY`, `MONTHLY`,
  `CONSULTANT_HOURLY`, `FIXED`) com regra de arredondamento padrao.
- **Client** passa a aceitar logo, tipo de cobranca, valor hora padrao,
  valor mensal, limite de horas, regra de arredondamento, dia de faturamento,
  dia de vencimento, tipo de NF, municipio, aliquota ISS e regras tributarias.
- Campos financeiros/fiscais de cliente devem ser restritos a FINANCE,
  AREA_MANAGER, ADMIN e perfis explicitamente autorizados.

### Projetos e Valores de Venda

- **ProjectSaleRate** registra valor de venda por projeto, opcionalmente por
  consultor/alocacao, com vigencia (`startsAt`/`endsAt`) e moeda.
- **ConsultantAllocationCostRate** registra custo hora por alocacao e vigencia,
  separado do valor de venda, para calculo futuro de margem.
- A regra de sobreposicao de vigencias deve ser validada no servidor antes de
  gravar, porque pode variar entre valor por projeto e valor por consultor.
- Alteracoes de valor de venda devem gerar `AuditEvent`.

### Consultores, Contratacao e Beneficios

- **ConsultantPersonalInfo** separa CPF e dados pessoais.
- **ConsultantCompanyInfo** separa CNPJ, razao social, nome fantasia, inscricao
  municipal, regime tributario e snapshot do provider CNPJ.
- **ConsultantAddress** separa CEP/endereco e snapshot do provider CEP.
- **ConsultantBankAccount** permite contas CLT, PJ ou primaria; CLT FLEX deve
  usar contas separadas quando aplicavel.
- **ConsultantCompensation** versiona tipo de contratacao (`CLT`, `PJ`,
  `CLT_FLEX`), valores acordados e regras de desconto por vigencia.
- **ConsultantBenefit** versiona beneficios como VA, VR, VT, cartao beneficio
  e outros.
- Dados pessoais, bancarios e remuneracao exigem RBAC estrito, testes
  negativos e auditoria em alteracoes.
- Entidades sensiveis de consultor usam `onDelete: Restrict`; consultores devem
  ser inativados por status, nao removidos fisicamente quando houver historico.

### Receita, Pre-fatura e NFS-e

- **RevenueClosing** representa o fechamento de receita por cliente/projeto,
  mes/ano e status (`OPEN`, `IN_REVIEW`, `READY_TO_CLOSE`, `CLOSED`,
  `INVOICED`, `CANCELLED`).
- **RevenueClosingLine** detalha itens do fechamento, incluindo horas,
  valor unitario, valor total e vinculo opcional com `TimeEntry`.
- Fechamentos por projeto usam unicidade `clientId + projectId + month + year`.
  Fechamentos client-level (`projectId` nulo) exigem indice parcial SQL
  `clientId + month + year WHERE projectId IS NULL`, mantido na migration.
- **FiscalDocument** guarda status fiscal, tipo de documento, provider,
  numero da NF, protocolo, storage keys de XML/PDF, erro e validador.
- Numero fiscal e unico por provider quando informado.
- O provider padrao previsto e `SAO_PAULO_NFSE`, mas regras de negocio devem
  chamar uma interface interna, nao o Web Service diretamente.
- XML/PDF devem ser privados e servidos por URLs assinadas ou equivalente.

### Pagamento de Consultores

- **ConsultantPaymentForecast** cadastra previsao por competencia, prazo limite
  de retorno e data prevista de pagamento.
- **ConsultantPayment** controla status de pagamento por consultor/mes/ano,
  tipo de contratacao, valores CLT/PJ/beneficios, previsao e confirmacao.
- **ConsultantPaymentLine** detalha abertura por projeto/alocacao/time entry,
  horas, valor unitario e valor total.
- Mudancas de status, valores, NF recebida/validada e pagamento confirmado
  devem gerar auditoria.

### Integracoes Externas

- **IntegrationEvent** registra provider, operacao, status, entidade relacionada,
  chave de idempotencia, metadados de request/response, erro e timestamps.
- Providers previstos: CNPJ, CEP, Entra ID, Sao Paulo NFS-e, email, storage,
  banco e ERP.
- Secrets nunca devem ser persistidos em `IntegrationEvent`; apenas metadados
  operacionais seguros.

### Regras Transversais

- Prisma e o banco guardam estrutura e historico; regras de permissao, calculo,
  provider e transicao de status ficam na aplicacao.
- Toda alteracao financeira, fiscal, bancaria, remuneratoria ou de permissao
  deve gerar `AuditEvent`.
- Integracoes devem ser idempotentes e rastreaveis, sem acoplar dominio a SDKs
  ou providers especificos.
