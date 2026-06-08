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

