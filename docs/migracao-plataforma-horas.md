# Migração da Plataforma de Horas legada → JumpFlow

> Análise da base legada `apontamento_prod` (MySQL/InnoDB) e plano de carga futura
> para o JumpFlow (PostgreSQL/Prisma). Fonte: `PlataformaHoras/` (extração de
> 2026-06-17). Documento de planejamento — **nenhuma carga foi executada ainda.**

## 1. Resumo executivo

- A base legada é um **MySQL único** no schema `apontamento_prod`: **92 tabelas
  base + 7 views**, ~430 MB. Tudo gira em torno de uma tabela central de
  apontamento de horas (`apontamento`, **~307 mil linhas** — 99% do volume real).
- O modelo do JumpFlow é **mais rico e mais normalizado** que o legado. A maioria
  dos conceitos legados tem destino claro (usuário, cliente, projeto, alocação,
  horas, skills, despesas, dados de PJ/CLT). Alguns módulos legados **não têm
  destino** (equipamentos, canal de denúncia, departamentos de cliente) e vários
  módulos do JumpFlow **não têm origem** (faturamento, fechamento de receita,
  pagamentos, NFS-e, avaliações/PDI/OKR, sobreaviso) — começam vazios.
- O legado usa **`INT auto_increment`**; o JumpFlow usa **`cuid()` string**. A
  carga exige uma **tabela/coluna de de-para** para preservar relacionamentos e
  permitir reexecução idempotente. **Recomendação central deste doc: adicionar um
  campo `legacyId` (nullable, unique) nas entidades migráveis.**
- Os apontamentos legados são linhas por dia, com horários como `TIME`. O JumpFlow
  agrupa horas em **`TimesheetPeriod` semanal** + `TimeEntry`. A carga de horas é
  a parte mais cara (volume + reagrupamento + derivação de alocação).

## 2. Visão geral do legado

| Item | Valor |
|---|---|
| SGBD | MySQL / InnoDB |
| Schema | `apontamento_prod` |
| Tabelas base | 92 |
| Views | 7 (`vw_*`) |
| Encoding | Misto: `utf8mb4`, `utf8mb3`, alguns `latin1` |
| Convenção PK | `id INT auto_increment` em todas as tabelas |
| Convenção FK | `idXxx` apontando para `Xxx.id`; todas `ON DELETE/UPDATE NO ACTION` |
| Soft delete | `removido` / `status` tinyint em várias tabelas |
| Rastro de migração anterior | coluna `idOld` presente em `usuario`, `projeto`, `cliente`, `apontamento`, `despesas` (já houve uma migração antes) |

### Tabelas por volume (as que importam)

| Tabela | Linhas | Observação |
|---|---:|---|
| `apontamento` | ~307.000 | **núcleo** — horas lançadas |
| `login_jwt` | ~47.600 | tokens de sessão — **descartar** |
| `logs` | ~19.150 | auditoria histórica — opcional |
| `consultorSkill` | ~10.380 | skills por consultor |
| `liberacaoFaturamentoProjetos` | ~4.355 | liberação de faturamento |
| `flatProjetoGeral` / `flatSkillConsultor` | ~3.000 / ~5.100 | **tabelas-flat (cache) — descartar** |
| `consultorProjeto` | ~2.537 | **alocações** |
| `perfilProjeto` | ~2.166 | perfis (papéis) por projeto |
| `despesas` | ~2.067 | despesas |
| `valoresPerfis` | ~1.502 | valor de venda por perfil, com vigência |
| `usuario` | ~1.166 | pessoas (consultores + internos) |
| `notificacoes` | ~1.408 | notificações históricas — opcional |
| `usuarioEquipamento` / `equipamento` | ~1.077 / ~631 | **módulo sem destino** |
| `certificacoes` | ~539 | certificações |
| `projeto` | ~483 | projetos |
| `consultoresClt` / `consultorPj` | ~254 / ~109 | cadastros CLT / PJ |
| `cliente` | ~89 | clientes |

Tabelas-flat (`flat*`), `bkp_projeto_20250730`, `migrations` e as `vw_*` são
**artefatos internos** e não devem ser migrados.

## 3. Inventário do legado por domínio

**Pessoas & acesso** — `usuario`, `nivelAcesso`, `controleNivelAcesso`, `cargos`,
`tipoContratacao`, `motivosDesligamento`, `login_jwt`, `logs`.

**Consultor PJ** — `consultorPj`, `dadosPessoaisPj`, `contasConsultoresPj`,
`contatoEmergenciaConsultorPj`, `documentosConsultoresPj`, `dadosBancarios`.

**Consultor CLT** — `consultoresClt`, `contasConsultoresClt`,
`contatoEmergenciaConsultorClt`, `documentosConsultoresClt`,
`dependentesConsultoresClt`, `consultorSalario`, `fechamentoFolhaConsultores` (0
linhas), `cadastroInss` (1 linha).

**Cliente & projeto** — `cliente`, `departamentosCliente`, `responsavelDepartamento`,
`projeto`, `tipoProjeto`, `responsavelProjeto`, `perfil`, `nivelPerfil`,
`perfilProjeto`, `valoresPerfis`, `consultorProjeto`.

**Horas** — `apontamento`, `tipoApontamento`, `tipoApontamentosContratacao`,
`status`, `localidade`, `liberacaoFaturamentoProjetos`.

**Despesas** — `despesas`, `permissoesStatusDespesas`.

**Skills & certificações** — `skill`, `tipoSkill`, `nivelSkill`, `consultorSkill`,
`certificacoes`, `categoriaCertificacao`, `emissorCertificacao`, `tipoCertificado`.

**Equipamentos** *(sem destino)* — `equipamento`, `modeloEquipamento`,
`fabricanteEquipamento`, `categoriaEquipamento`, `statusEquipamentos`,
`usuarioEquipamento`, `proprietarioEquipamento`.

**Arquivos & documentos** — `arquivos` (paths S3), `contratos` (0 linhas),
`listaDocumentosConsultores`, `pdfsParaDownloads`, `downloadsPdfs`, `pdfsFiltros`,
`filtrosPdfs`, `permissoesPdfs`, `permissoesNiveisAcessoPdfs`.

**Canal de denúncia/ética** *(sem destino)* — `formularioDenuncia`,
`respostaFormularioDenuncia`, `statusRespostaDenuncia`.

**Notificações** — `notificacoes`.

**Tabelas de domínio (lookups de-para)** — `paises`, `bancos`, `estadoCivil`,
`generosConsultores`, `sexoConsultores`, `racaCor`, `grausInstrucao`,
`grauParentescoDependente`, `tiposEmpresas`, `tiposTributariosEmpresas`,
`tipoContaBancaria`, `tipoDocumentoIdentidade`, `condicaoEstrangeiro`,
`consultorEstrangeiro` (0 linhas), `localidade`.

**Descartar** — `flatConsultor`, `flatConsultorGeral`, `flatProjetoGeral`,
`flatSkillConsultor`, `flatCertificacaoConsultor`, `bkp_projeto_20250730`,
`migrations`, `login_jwt`, todas as `vw_*`.

## 4. Mapeamento legado → JumpFlow

> `idOld`/`legacyId` indica que o id legado deve ser preservado no de-para.

### 4.1 Pessoas e acesso

| Legado | JumpFlow | Notas |
|---|---|---|
| `usuario` | **`User`** (auth/RBAC) + **`Consultant`** (perfil) | Uma linha legada vira até 2 registros. `usuario.id = 0` (Webmaster) e usuários de sistema → descartar. `senha` **não migra** (JumpFlow usa Entra ID / convite). `email` é a chave natural. |
| `usuario.idNivelAcesso` → `nivelAcesso` | **`Role` / `UserRole`** | Mapear os 19 níveis legados para os 7 grupos do RBAC (`RoleName`) + grupos dinâmicos. Tabela de correspondência manual. |
| `controleNivelAcesso` | `RolePermission` (matriz) | Reconferir contra a matriz atual; provavelmente **não migrar** linha a linha — a matriz do JumpFlow já está semeada. |
| `cargos` | `Consultant.jobTitle` (string) | Desnormalizar (lookup → string). |
| `tipoContratacao` | `Consultant.contractType` / `ConsultantCompensation.contractType` | enum `ConsultantContractType`. |
| `motivosDesligamento` + `usuario.dataDesligamento` | `Consultant.status = INACTIVE` (+ nota) | Sem campo dedicado de motivo — registrar em observação/auditoria. |
| `login_jwt` | — | **descartar.** |
| `logs` | `AuditEvent` (opcional) | Histórico; migrar só se houver requisito de auditoria retroativa. |

### 4.2 Consultor PJ / CLT (dados cadastrais)

| Legado | JumpFlow |
|---|---|
| `consultorPj` (razão social, CNPJ, endereço fiscal, ISS) | `ConsultantPjInfo` + `ConsultantCompanyInfo` |
| `dadosPessoaisPj` | `ConsultantPersonalInfo` |
| `consultoresClt` (dados pessoais, documentos, CTPS, PIS) | `ConsultantCltInfo` + `ConsultantPersonalInfo` + `ConsultantAddress` |
| `contasConsultoresPj` / `contasConsultoresClt` + `dadosBancarios` | `ConsultantBankAccount` |
| `documentosConsultoresPj` / `documentosConsultoresClt` + `arquivos` | `ConsultantDocument` |
| `consultorSalario` / `fechamentoFolhaConsultores` | `ConsultantCompensation` (2 e 0 linhas — quase nada a migrar) |
| `contatoEmergenciaConsultor*` | **GAP** — ver §5 |
| `dependentesConsultoresClt` | **GAP** — ver §5 |

### 4.3 Cliente e projeto

| Legado | JumpFlow | Notas |
|---|---|---|
| `cliente` | **`Client`** | `nomeCliente`→`name`. Jornada de trabalho personalizada (`*JornadaTrabalho`) não tem campo direto → `taxRules`/notas ou ignorar. |
| `departamentosCliente` / `responsavelDepartamento` | **GAP** — `Client` não tem departamentos |
| `projeto` | **`Project`** (+ `ProjectBillingConfig`) | `idUsuarioGP`→`managerUserId`. `valorProjeto`(float)→`Decimal`. `idUsuarioComercial`/`idUsuarioGC` sem campo direto. |
| `tipoProjeto` | sem destino direto | usar `Project.costCenter`/metadado ou ignorar (4 valores). |
| `perfil` + `nivelPerfil` + `perfilProjeto` | **`Allocation.role`** (string) | No legado, "perfil" é catálogo reutilizável (papel) com nível (senioridade). No JumpFlow `role` é texto livre por alocação. Desnormalizar para string `"<perfil> - <nivel>"`. Ver sugestão em §7. |
| `consultorProjeto` | **`Allocation`** | `idUsuario`→`consultantId`, `idPerfilProjeto`→projeto+role, `dataInicio/Fim`. `allocationPercent` não existe no legado → default (ex. 100). |
| `valoresPerfis` (valor de **venda** por perfil, com vigência) | **`ProjectSaleRate`** | `valorVenda`→`hourlyRate`, `dataInicio/Fim`→`startsAt/endsAt`. **Atenção:** no legado o valor é por `perfilProjeto` (perfil×projeto), não por consultor; no JumpFlow `ProjectSaleRate` pode ser por projeto / consultor / alocação. Mapear para o nível **projeto+alocação** conforme o perfil. |
| `responsavelProjeto` | `Project.managerUserId` (já coberto) | |

> **Custo (cost rate):** o legado **não tem custo por hora do consultor** separado
> da venda (`valoresPerfis` é só venda). `ConsultantAllocationCostRate` /
> `Consultant.hourlyCost` no JumpFlow **nascem vazios** — preencher manualmente.

### 4.4 Horas (núcleo)

| Legado | JumpFlow | Notas |
|---|---|---|
| `apontamento` | **`TimeEntry`** (+ **`TimesheetPeriod`** gerado) | 1 linha/dia. Agrupar por consultor + semana para criar os períodos. |
| `apontamento.horaInicio/Pausa/Retorno/Fim` (`TIME`) | `TimeEntry.startTime/breakStart/breakEnd/endTime` (`String "HH:mm"`) | Converter `TIME "09:00:00"` → `"09:00"`. |
| `apontamento.totalHoras` (`TIME`) | `TimeEntry.hours` (`Decimal(5,2)`) | `"08:00:00"` → `8.00`. |
| `apontamento.cobranca` (tinyint) | `TimeEntry.billable` (bool) | |
| `apontamento.idTipoApontamento` → `tipoApontamento` | `TimeEntry.activityType` (string) | Desnormalizar. `localidade` (presencial/remoto, 3 valores) → embutir em `activityType` ou descartar. |
| `apontamento.idStatus` → `status` (horas) | `TimeEntry.status` + `Approval` | `1 Aguardando`→`SUBMITTED`/`DRAFT`, `2 Revisar`→`SUBMITTED`, `3 Reprovado`→`REJECTED`, `4 Aprovado`→`APPROVED`. Para aprovados, gerar `Approval` (com `idUsuarioAprovacao`→`approverUserId`). |
| `apontamento.faturado` | derivar p/ `RevenueClosing` (opcional) | Sem migração 1:1; informativo. |
| `liberacaoFaturamentoProjetos` | parcial → `RevenueClosing` | Conceito de "liberar faturamento por período"; o JumpFlow tem fechamento de receita mais rico. Migrar só se necessário (histórico). |

### 4.5 Despesas

| Legado | JumpFlow |
|---|---|
| `despesas` | `Expense` |
| `despesas.idAnexo` → `arquivos` | `ExpenseAttachment` |
| `despesas.idStatus` → `status` | `Expense.status` (`ExpenseStatus`) |
| `permissoesStatusDespesas` | — (coberto pela matriz RBAC) |

### 4.6 Skills e certificações

| Legado | JumpFlow | Notas |
|---|---|---|
| `skill` (+ `tipoSkill`) | `Skill` | `tipoSkill`→`Skill.type`/`category`. |
| `nivelSkill` (6 níveis) | `SkillLevel` (4 níveis) | Mapear 6→4 (`BASIC/INTERMEDIATE/ADVANCED/SPECIALIST`). |
| `consultorSkill` | `ConsultantSkill` | `validationStatus` default conforme regra (ex. `VALIDATED` para histórico). |
| `certificacoes` (+ categoria/emissor/tipo + `arquivos`) | `Certificate` | Conferir se `Certificate` exige `Enrollment`/`Course`; certificações legadas são **externas** (sem curso) → pode exigir ajuste no schema (campos nullable). |

### 4.7 Sem destino / descartar

- **Equipamentos** (`equipamento` e correlatas, ~1.700 linhas): não há módulo de
  inventário no JumpFlow. Decisão de produto: descartar ou criar módulo (§5).
- **Canal de denúncia** (`formularioDenuncia`...): sem módulo. Descartar ou exportar.
- **PDFs/relatórios** (`pdfs*`, `downloadsPdfs`): o JumpFlow gera relatórios sob
  demanda — descartar.
- **`notificacoes`** (1.408): históricas; o motor do JumpFlow é de regras. Descartar.
- **Tabelas-flat, bkp, views, migrations, login_jwt**: descartar.

## 5. Gaps

### 5.1 Features do legado sem destino no JumpFlow

| Gap | Volume | Decisão necessária |
|---|---:|---|
| **Equipamentos / inventário** | ~1.700 | Criar módulo novo, exportar p/ planilha, ou descartar. |
| **Departamentos de cliente** + responsável | ~6 | Adicionar `ClientDepartment` ou achatar em metadado do projeto. |
| **Contato de emergência** (CLT/PJ) | ~690 | Adicionar a `ConsultantPersonalInfo` (campos `emergency*`) ou tabela própria. |
| **Dependentes CLT** | ~51 | Adicionar `ConsultantDependent` (relevante p/ folha/benefícios). |
| **Canal de denúncia/ética** | ~8 | Fora do escopo; exportar e arquivar. |
| **Localidade do apontamento** (presencial/remoto) | 3 valores | Decidir se vira `activityType`, flag em `TimeEntry`, ou se perde. |
| **Catálogo de perfis/papéis reutilizável** (`perfil`+`nivelPerfil`) | 138/5 | `Allocation.role` é string livre — perde-se padronização. Ver §7. |
| **Motivo de desligamento** | 9 valores | Sem campo dedicado em `Consultant`. |
| **Jornada de trabalho personalizada por cliente** | — | `Client` não tem; embutir em `taxRules`/config ou ignorar. |

### 5.2 Módulos do JumpFlow sem origem no legado (nascem vazios)

Faturamento/`BillingType`/`ProjectBillingConfig`, fechamento de receita
(`RevenueClosing`), **custo por hora** (`ConsultantAllocationCostRate`,
`Consultant.hourlyCost`) e margem, pagamentos a consultores
(`ConsultantPayment*`), **NFS-e/documentos fiscais** (`FiscalDocument`),
avaliações/PDI/clima/OKR/universidade (`Evaluation*`, `DevelopmentPlan`,
`Survey*`, `Objective`, `LearningTrack`...), **sobreaviso** (`OnCallEntry`),
fechamento operacional (`OperationClosing`), banco de horas
(`ConsultantHourBankEntry`), férias (`ConsultantVacation`).

→ Estes não têm dados de origem; entram com cadastro novo. **A maior lacuna
operacional pós-carga é o custo por hora** (necessário para margem) — não existe
no legado.

## 6. Estratégia de carga (ETL)

### 6.1 Princípio: de-para de IDs

O legado é `INT`; o JumpFlow é `cuid()`. **Recomendado: adicionar `legacyId Int?
@unique` (ou `String?`) nas entidades migráveis** (`User`, `Consultant`,
`Client`, `Project`, `Allocation`, `Skill`, `ConsultantSkill`, `TimeEntry`,
`Expense`, `Certificate`, ...). Benefícios:

- **Idempotência**: reexecutar a carga faz `upsert` por `legacyId` sem duplicar.
- **Rastreabilidade**: auditável de ponta a ponta.
- **Relacionamentos**: resolver FKs legadas via lookup `legacyId → cuid`.

Alternativa sem alterar schema: manter o de-para num arquivo/tabela temporária de
staging (`migration_id_map(entidade, id_legado, id_novo)`). Preferir o `legacyId`
no schema por ser mais simples e duradouro.

### 6.2 Ordem de carga (respeitando FKs)

1. **Lookups/decisões manuais** — de-para de `nivelAcesso→Role`, `nivelSkill→SkillLevel`, `status→TimeEntryStatus`, `tipoContratacao→ConsultantContractType`.
2. **`User`** (de `usuario`, filtrando sistema/`id=0`, sem senha).
3. **`Role`/`UserRole`** (vínculo de acesso).
4. **`Consultant`** (+ `ConsultantPersonalInfo`, `*PjInfo`, `*CltInfo`, `Address`, `BankAccount`, `Document`, `Compensation`).
5. **`Client`**.
6. **`Project`** (+ `ProjectBillingConfig` se aplicável).
7. **`Skill`** → **`ConsultantSkill`** → **`Certificate`**.
8. **`Allocation`** (de `consultorProjeto`, resolvendo projeto+perfil).
9. **`ProjectSaleRate`** (de `valoresPerfis`).
10. **`TimesheetPeriod`** (gerados por consultor×semana) → **`TimeEntry`** (de `apontamento`, em lotes) → **`Approval`** (para aprovados).
11. **`Expense`** (+ `ExpenseAttachment`).
12. (Opcional) `AuditEvent` de `logs`; `RevenueClosing` de `liberacaoFaturamentoProjetos`.

### 6.3 Reagrupamento das horas (a parte cara)

- `apontamento` não tem período; gerar `TimesheetPeriod` por **consultor + semana
  ISO** (seg–dom) cobrindo cada `dataApontamento`.
- Resolver `allocationId` cruzando `idUsuario` + `idProjeto` + intervalo de datas
  da alocação (`consultorProjeto.dataInicio/Fim`). Sem match, deixar `allocationId`
  nulo (o schema permite) e logar.
- Processar em **lotes (ex. 5–10k linhas)** com `createMany`; ~307k linhas.
- `status` do período derivado do conjunto de entries (se todas aprovadas → período `APPROVED`).

### 6.4 Ambiente e ferramentas

- Rodar a carga contra a base do JumpFlow via **script Node + PrismaClient**
  (mesmo padrão dos seeds em `packages/database`). Lembrar dos gotchas de rede
  Supabase (session pooler em `DIRECT_URL`, `.env` da raiz carregado manualmente).
- Para o volume de `apontamento`, considerar **`COPY`/`INSERT` em massa** direto no
  Postgres em vez de Prisma linha-a-linha.
- Exportar o legado: dumps CSV por tabela (já temos amostras) ou conexão direta
  MySQL → script de ETL.

## 7. Recomendações de organização do schema (antes da carga)

1. **Adicionar `legacyId` nas entidades migráveis** (§6.1). É a mudança de maior
   alavancagem — habilita carga idempotente e auditável.
2. **Catálogo de papéis/perfis** *(opcional, mas recomendado)*: o legado tem
   `perfil` + `nivelPerfil` como catálogo reutilizável; o JumpFlow usa
   `Allocation.role` (string livre). Avaliar criar um `ProjectRole`/`RoleCatalog`
   para padronizar papéis e ligar `ProjectSaleRate` a ele (hoje a venda por perfil
   vira venda por alocação, perdendo a noção de "tabela de preços por papel").
3. **Cobrir os gaps cadastrais que importam para folha/RH** antes de migrar
   pessoas: `ConsultantDependent` (dependentes CLT) e contato de emergência em
   `ConsultantPersonalInfo`. São baratos e evitam perda de dado real.
4. **Certificações externas**: garantir que `Certificate` aceite certificação sem
   `Course`/`Enrollment` (campos nullable) — as 539 certificações legadas são
   externas.
5. **Decisão de produto sobre equipamentos e departamentos de cliente** antes da
   carga (criar módulo vs. descartar) — define se ~1.700 linhas entram ou não.
6. **Custo por hora**: planejar coleta dos custos (não existe no legado) logo após
   a carga, senão a margem fica indisponível.
7. **Staging schema**: carregar primeiro num schema `staging`/banco separado,
   validar contagens e amostras, e só então promover para produção.

## 8. Quirks técnicos MySQL → PostgreSQL

| Quirk | Tratamento |
|---|---|
| `NULL` aparece como **string literal `"NULL"`** nos CSVs | tratar como nulo no parser. |
| Encoding misto (`utf8mb3`/`utf8mb4`/`latin1`) | campos `latin1` (`perfil.nomePerfil`, `tipoContratacao`, `statusEquipamentos`) precisam re-encode explícito p/ UTF-8. |
| Valores monetários como **`float`** (`valorVenda`, `valorProjeto`, `despesas.valor`) | converter para `Decimal` — cuidado com arredondamento do float. |
| `TIME` (`horaInicio`, `totalHoras`) | horários → `String "HH:mm"`; `totalHoras` → `Decimal` horas. |
| `tinyint(1)` | converter para `Boolean` (`cobranca`, `faturado`, `removido`, `status`...). |
| `date` `'YYYY-MM-DD'` / `datetime` `'YYYY-MM-DD HH:MM:SS'` | parse p/ `DateTime` (atenção a timezone — assumir America/Sao_Paulo). |
| `senha` (hash legado) em `usuario` | **não migrar.** JumpFlow usa Entra ID / convite (scrypt). |
| `removido = 1` / `status = 0` | mapear para `status` inativo no JumpFlow, não excluir. |
| FKs `NO ACTION` + valores `0` em colunas FK (`idUsuario = 0`, `idCliente = 0`) | `0` é frequentemente "sem vínculo"/sistema — tratar como nulo. |
| Chave natural | usar **`email`** (usuário/consultor) e **`legacyId`** como âncoras de de-para. |
| CNPJ inconsistente (`varchar(14)` vs `varchar(19)`) | normalizar (só dígitos). |

## 9. Checklist de próximos passos

- [ ] Decidir destino de **equipamentos** e **departamentos de cliente** (produto).
- [ ] Adicionar `legacyId` (+ migration) nas entidades migráveis.
- [ ] Cobrir gaps cadastrais: dependentes CLT, contato de emergência, certificação externa.
- [ ] Montar tabelas de de-para manuais (`nivelAcesso→Role`, `nivelSkill→SkillLevel`, `status→TimeEntryStatus`).
- [ ] Obter dump completo do legado (não só amostras).
- [ ] Escrever script de ETL por domínio na ordem da §6.2, em schema de staging.
- [ ] Validar contagens/amostras pós-carga; reconciliar horas (∑ `totalHoras` legado vs ∑ `TimeEntry.hours`).
- [ ] Plano para preencher **custo por hora** (margem) após a carga.
- [ ] Promover staging → produção.

---

### Apêndice A — Arquivos da extração legada (`PlataformaHoras/`)

| Arquivo | Conteúdo |
|---|---|
| `01_tabelas.csv` | Lista de tabelas + engine + linhas aprox + tamanho |
| `02_colunas.csv` | Colunas de cada tabela com tipo de dado |
| `03_chaves_primarias.csv` | PKs (todas `id`) |
| `04_chaves_estrangeiras.csv` | FKs e relacionamentos |
| `05_contagem_linhas.csv` | Contagem real de linhas por tabela |
| `07_ddl.sql` | DDL completo da base |
| `amostras.zip` | Amostra de dados por tabela (92 CSVs) |
| `dicionario_apontamento_prod.xlsx` | Dicionário de produção |
