# Backlog - Desenvolvimento Humano e Gestao de Talentos

> Detalhamento da **Onda 0** (quick wins / fundacao) e da **Prioridade 1** (nucleo de talentos)
> do `docs/roadmap-talentos-gcpec.md`. Segue o formato de epicos/US/criterios de aceite de
> `docs/backlog-mvp.md`. Sem alteracao de codigo ou schema neste documento.

## 1. Objetivo

Evoluir o JumpFlow de PSA operacional para PSA + RH estrategico, entregando a fundacao de
competencias e o nucleo de talentos:

1. Enxergar a disponibilidade real do time (heatmap) sem novo schema.
2. Estruturar o catalogo de skills (tecnica/comportamental) com CRUD admin.
3. Definir o nivel requerido por cargo/senioridade/area (perfis de competencia).
4. Calcular gap (requerido x atual) como base de PDI e IA de alocacao.
5. Registrar feedback continuo ancorado em projetos/clientes reais.
6. Rodar ciclos de avaliacao 90/180/360 com radar e gap.
7. Gerar PDI a partir do gap de competencias.

## 2. Perfis e RBAC

Papeis do JumpFlow envolvidos: ADMIN, CONSULTANT, PROJECT_MANAGER, AREA_MANAGER, FINANCE,
PEOPLE, SALES.

Papel central do dominio: **PEOPLE** (gestao de talentos). Resumo de visibilidade padrao:

| Capacidade | ADMIN | PEOPLE | AREA_MANAGER | PROJECT_MANAGER | CONSULTANT | SALES | FINANCE |
|---|---|---|---|---|---|---|---|
| Catalogo de skills (CRUD) | escreve | escreve | le | le | le | le | - |
| Perfis de competencia (CRUD) | escreve | escreve | le | le | le | - | - |
| Mapa de disponibilidade | le | le | le (sua area) | le (seu projeto) | le (proprio) | le | - |
| Matriz / gap | le | le | le (seu time) | le (seu projeto) | le (proprio) | le (alocacao) | - |
| Feedback (criar) | sim | sim | sim (seu time) | sim (seu projeto) | nao* | nao | nao |
| Feedback (ler) | tudo | tudo | seu time | seu projeto | proprio (visivel) | - | - |
| Ciclos de avaliacao (config) | sim | sim | nao | nao | nao | nao | nao |
| Responder avaliacao | - | - | como rater | como rater | self/rater | client (link) | - |
| Resultado de avaliacao | tudo | tudo | seu time | seu projeto (limitado) | proprio | - | - |
| PDI (criar/editar) | sim | sim | sim (seu time) | sugere | proprio (acoes) | - | - |

\* CONSULTANT escreve feedback apenas como avaliador peer dentro de ciclo 360 (ver EP14).
SALES so participa como avaliador-cliente quando explicitamente convidado.

## 3. Privacidade e LGPD (regras gerais do dominio)

- Avaliacao, feedback e (futuramente) clima sao dados pessoais sensiveis: aplicar minimizacao,
  finalidade explicita e visibilidade por registro.
- `Feedback.visibility` (PRIVATE/SHARED) controla se o avaliado ve o registro; PRIVATE e visivel
  apenas a autor + PEOPLE + gestor responsavel.
- Consultor sempre pode acessar o proprio historico de feedbacks SHARED e os resultados das proprias
  avaliacoes apos o fechamento do ciclo.
- Toda criacao, alteracao, mudanca de visibilidade e exclusao de feedback/avaliacao/PDI gera
  `AuditEvent` (actor, entidade, before/after, motivo quando aplicavel).
- Exclusao e soft delete via `status`; retencao definida por politica (decisao pendente DP-04).
- Avaliador-cliente acessa apenas o formulario do convite, sem ver outras respostas.

## 4. Epicos - ONDA 0 (fundacao)

### EP11 - Mapa de Disponibilidade

Dar visao operacional da capacidade do time derivada de alocacao e ferias, sem novo schema.

Estados do heatmap: Livre (0%), Parcial (>0 e <100%), 100% (>=100%), Ferias (ConsultantVacation
ativa no periodo), Bench (ativo, sem alocacao no periodo).

#### US11.01 - Visualizar heatmap de disponibilidade

Como gestor de area, quero ver um heatmap de disponibilidade por consultor e periodo para decidir alocacoes.

Criterios de aceite:

- Read-model derivado de `Allocation.allocationPercent` + `ConsultantVacation` + status do consultor; sem nova tabela.
- Cada celula (consultor x semana/mes) mostra um dos estados: Livre, Parcial, 100%, Ferias, Bench.
- Soma de percentuais sobrepostos no periodo classifica corretamente Parcial vs 100% (>=100%).
- Consultor inativo nao aparece como capacidade disponivel.
- Periodo de Ferias (ConsultantVacation que cruza a celula) prevalece sobre o calculo de alocacao na exibicao.

#### US11.02 - Filtrar e escopar o heatmap por RBAC

Como gestor, quero filtrar o heatmap por area, senioridade e skill respeitando minha visibilidade para focar nos perfis relevantes.

Criterios de aceite:

- Filtros disponiveis: area, senioridade, skill, status, intervalo de datas.
- AREA_MANAGER ve apenas consultores da sua area; PROJECT_MANAGER ve os do seu projeto; CONSULTANT ve apenas o proprio.
- ADMIN, PEOPLE e SALES veem todos os consultores ativos.
- Acesso a consultor fora do escopo retorna erro/filtro vazio, nao dados de outro time.

Dependencias: nenhuma (reusa schema existente). Insumo de EP14 (avaliacao) e da futura IA de alocacao (P3).

Auditoria: leitura nao auditada; sem escrita de dados.

LGPD: nao expoe dados sensiveis novos; respeita escopo de visibilidade por papel.

### EP12 - Catalogo de Skills (tipo + CRUD admin)

Transformar o catalogo de skills (hoje mock) em CRUD real com classificacao tecnica/comportamental.

Modelo proposto (roadmap): `Skill.type: SkillType` enum `TECHNICAL | BEHAVIORAL`.

#### US12.01 - Classificar skill por tipo

Como administrador do catalogo, quero classificar cada skill como tecnica ou comportamental para organizar a matriz de competencias.

Criterios de aceite:

- Cada skill tem `type` em {TECHNICAL, BEHAVIORAL}, obrigatorio na criacao.
- Migracao define um type padrao para skills existentes (decisao pendente DP-01) sem quebrar `ConsultantSkill`/`AllocationSkill`.
- Listagens e filtros de skill permitem filtrar por type.

#### US12.02 - CRUD de skills do catalogo

Como ADMIN/PEOPLE, quero criar, editar e inativar skills do catalogo para mantê-lo fiel a realidade da Jump.

Criterios de aceite:

- Criar skill exige name, type e category; name unico (case-insensitive).
- Editar permite alterar name, type, category e status.
- Inativar e soft delete via `status`; skill inativa nao aparece para nova selecao, mas preserva vinculos historicos (`ConsultantSkill`, `AllocationSkill`).
- Validacao com Zod no servidor; RBAC checado no servidor (apenas ADMIN/PEOPLE escrevem).
- Toda criacao/edicao/inativacao gera `AuditEvent` (before/after).

#### US12.03 - Substituir mock por catalogo persistido

Como usuario das telas de skill, quero que a UI consuma o catalogo real para refletir o que foi cadastrado.

Criterios de aceite:

- `SkillMatrix` e seletores de skill (consultor, alocacao) leem do catalogo persistido, nao do mock.
- Degradacao graciosa: se o DB estiver indisponivel, a UI exibe estado de erro claro (sem fallback silencioso para mock em producao).

Dependencias: US12.01 antecede US12.02 e EP13 (perfis usam skillId+type).

Auditoria: escrita de skill auditada (US12.02).

LGPD: catalogo nao contem dado pessoal.

### EP13 - Perfis de Competencia (nivel requerido)

Definir o nivel esperado de cada skill por senioridade, cargo ou area.

Modelo proposto: `CompetencyProfile` (name, scope `SENIORITY|ROLE|AREA`, referenceKey, status);
`CompetencyProfileItem` (profileId, skillId, requiredLevel).

#### US13.01 - Criar perfil de competencia por escopo

Como PEOPLE, quero definir perfis de competencia por senioridade, cargo ou area para padronizar o esperado.

Criterios de aceite:

- Perfil exige name, scope em {SENIORITY, ROLE, AREA} e referenceKey coerente com o scope.
- Nao pode haver dois perfis ativos com o mesmo (scope, referenceKey).
- Perfil inativo (soft delete via status) nao e usado em novos calculos de gap, mas preserva historico.
- Criacao/edicao gera `AuditEvent`.

#### US13.02 - Definir nivel requerido por skill no perfil

Como PEOPLE, quero atribuir o nivel requerido de cada skill em um perfil para servir de referencia ao gap.

Criterios de aceite:

- Item exige skillId (do catalogo ativo) e requiredLevel na mesma escala de `ConsultantSkill.level` (BASIC..SPECIALIST).
- Uma skill aparece no maximo uma vez por perfil.
- Itens podem ser adicionados, editados e removidos; mudancas auditadas.
- Perfil pode misturar skills TECHNICAL e BEHAVIORAL.

#### US13.03 - Resolver perfil aplicavel a um consultor

Como sistema, quero determinar o perfil de competencia aplicavel a um consultor para calcular o gap correto.

Criterios de aceite:

- Regra de resolucao definida e documentada (precedencia entre ROLE, SENIORITY, AREA - decisao pendente DP-02).
- Consultor sem perfil aplicavel retorna gap indefinido com mensagem clara (nao erro).
- A resolucao e funcao de dominio reutilizavel por matriz, PDI e avaliacao.

Dependencias: US13.01 e US13.02 dependem de EP12 (skillId + type). US13.03 e pre-requisito do gap (EP13 abaixo) e do PDI (EP16).

Auditoria: criacao/edicao de perfil e itens auditadas.

LGPD: perfil e dado organizacional, nao pessoal.

### EP14 - Matriz de Competencias com Gap Analysis

Cruzar nivel requerido (perfil) com nivel atual (`ConsultantSkill`) para evidenciar lacunas.

#### US14.01 - Visualizar matriz requerido x atual

Como gestor, quero ver a matriz de competencias do time com nivel requerido e atual para identificar lacunas.

Criterios de aceite:

- Matriz cruza consultores x skills mostrando requiredLevel (do perfil aplicavel) e currentLevel (`ConsultantSkill`).
- Heatmap destaca gap negativo (atual < requerido), atende (atual >= requerido) e nao avaliado (sem `ConsultantSkill`).
- Permite filtrar por type (tecnica/comportamental), area, senioridade e skill.
- Escopo por RBAC: AREA_MANAGER ve seu time, PROJECT_MANAGER ve seu projeto, CONSULTANT ve so o proprio.

#### US14.02 - Calcular gap por consultor

Como consultor, quero ver meu gap de competencias para saber onde preciso evoluir.

Criterios de aceite:

- Gap por skill = requiredLevel - currentLevel (positivo indica lacuna).
- Skill sem `ConsultantSkill` aparece como nao avaliada, distinta de nivel zero.
- Consultor sem perfil aplicavel ve mensagem clara em vez de gap incorreto.
- O calculo e funcao de dominio reutilizada por PDI (EP16) e (futuro) IA de alocacao.

#### US14.03 - Calcular gap agregado por time

Como AREA_MANAGER, quero ver o gap agregado da minha area para priorizar capacitacao.

Criterios de aceite:

- Mostra skills com maior gap medio/contagem de consultores abaixo do requerido na area.
- Respeita escopo de visibilidade do solicitante.
- Exportavel em CSV (consistente com relatorios do MVP).

Dependencias: depende de EP12, EP13 (US13.03). E pre-requisito do PDI (EP16) e insumo do gap por avaliacao (EP15).

Auditoria: leitura nao auditada.

LGPD: nivel de skill e dado de perfil profissional; exposicao limitada por escopo de papel.

## 5. Epicos - PRIORIDADE 1 (nucleo de talentos)

### EP15 - Feedback Continuo

Registrar feedback ancorado a projetos/clientes reais, formando historico que alimenta avaliacao e score.

Modelo proposto: `Feedback` (subjectConsultantId, authorUserId, type `PRAISE|GUIDANCE|RECOGNITION|CONCERN`,
source `INTERNAL|CLIENT|PEER`, visibility `PRIVATE|SHARED`, body, relatedProjectId?, relatedClientId?, createdAt).

#### US15.01 - Registrar feedback sobre um consultor

Como gestor de projeto, quero registrar feedback sobre um consultor ligado a um projeto/cliente para construir historico de desempenho.

Criterios de aceite:

- Feedback exige subjectConsultantId, type, source, visibility e body (nao vazio).
- relatedProjectId/relatedClientId sao opcionais, mas se informados devem existir e ser coerentes (cliente do projeto).
- PROJECT_MANAGER so registra feedback de consultores alocados no seu projeto; AREA_MANAGER no seu time; PEOPLE/ADMIN em qualquer um.
- Validacao Zod no servidor; RBAC checado no servidor.
- Criacao gera `AuditEvent`.

#### US15.02 - Visualizar feed timeline do consultor

Como consultor, quero ver meu feed de feedbacks recebidos em ordem cronologica para acompanhar minha evolucao.

Criterios de aceite:

- Timeline lista feedbacks SHARED do consultor, mais recentes primeiro, com type, source, projeto/cliente e autor (conforme visibilidade).
- Feedbacks PRIVATE nao aparecem para o avaliado; aparecem para autor, PEOPLE e gestor responsavel.
- Filtros por type, source, projeto, cliente e periodo.
- Gestor ve a timeline conforme escopo (seu time/projeto); PEOPLE/ADMIN veem tudo.

#### US15.03 - Alterar visibilidade e corrigir feedback

Como autor do feedback, quero ajustar visibilidade ou corrigir o conteudo para garantir clareza e adequacao.

Criterios de aceite:

- Apenas autor, PEOPLE ou ADMIN podem editar/alterar visibilidade ou inativar (soft delete).
- Mudanca de PRIVATE->SHARED ou conteudo gera `AuditEvent` (before/after) com motivo.
- Janela de edicao apos publicacao (decisao pendente DP-03).

#### US15.04 - (Flag) Registrar feedback por voz com transcricao

Como gestor, quero registrar feedback por voz com transcricao automatica para reduzir atrito.

Criterios de aceite:

- Incremento atras de feature flag (ex.: `NEXT_PUBLIC_FEEDBACK_VOICE`); desligado por padrao.
- Campos previstos: audioStorageKey, transcription, transcriptionStatus; provider abstraido com degradacao graciosa (mock se indisponivel).
- Transcricao gera rascunho de body editavel; nada e publicado sem confirmacao humana.
- Audio tratado como dado pessoal: armazenamento controlado, acesso por RBAC, exclusao audita.

#### US15.05 - (Flag) Polir feedback com IA

Como gestor, quero que a IA sugira uma versao estruturada do meu feedback cru para comunicar melhor.

Criterios de aceite:

- Incremento atras de feature flag; provider de IA abstraido.
- IA so sugere; o texto final exige revisao e confirmacao do autor (nunca publica automaticamente).
- Sugestao nao altera o registro ate aceite explicito; aceite auditado.

Dependencias: US15.01 antecede US15.02/03. US15.04/05 dependem de US15.01 e estao atras de flag. Feedback e insumo de EP16 (avaliacao) e do Score (P3).

Auditoria: criacao, edicao, mudanca de visibilidade, inativacao e aceite de sugestao IA.

LGPD: dado sensivel; visibilidade por registro; PRIVATE restrito; audio com cuidado especial; retencao por politica (DP-04).

### EP16 - Avaliacao de Desempenho 90 / 180 / 360

Conduzir ciclos formais de avaliacao por competencia, com radar e gap contra o perfil requerido.

Modelo proposto: `EvaluationCycle` (name, type `SELF_90|MANAGER_180|FULL_360`, periodStart, periodEnd,
status `DRAFT|OPEN|CLOSED`, createdByUserId); `Evaluation` (cycleId, subjectConsultantId, status);
`EvaluationResponse` (evaluationId, raterUserId?, relationship `SELF|MANAGER|PEER|CLIENT|SUBORDINATE`, status, submittedAt);
`EvaluationAnswer` (responseId, skillId, score 1-5, comment).

#### US16.01 - Configurar ciclo de avaliacao

Como PEOPLE, quero criar um ciclo de avaliacao definindo tipo e periodo para padronizar a rodada.

Criterios de aceite:

- Ciclo exige name, type em {SELF_90, MANAGER_180, FULL_360}, periodStart < periodEnd e status inicial DRAFT.
- Apenas ADMIN/PEOPLE criam e configuram ciclos.
- Transicoes de status validas: DRAFT -> OPEN -> CLOSED (sem retroceder de CLOSED).
- Criacao e transicao de status geram `AuditEvent`.

#### US16.02 - Definir avaliados e avaliadores

Como PEOPLE, quero selecionar quem sera avaliado e quem avalia cada um para montar o ciclo.

Criterios de aceite:

- Para cada `Evaluation` (subjectConsultantId), o conjunto de `EvaluationResponse` reflete o type do ciclo: SELF_90 = SELF; MANAGER_180 = SELF + MANAGER; FULL_360 = SELF + MANAGER + PEER + (opcional) CLIENT/SUBORDINATE.
- Avaliador-cliente recebe relationship CLIENT e acesso restrito (so o proprio formulario).
- Nao e possivel abrir respostas em ciclo ainda DRAFT.

#### US16.03 - Responder avaliacao por competencia

Como avaliador, quero pontuar as competencias do avaliado para registrar minha percepcao.

Criterios de aceite:

- `EvaluationAnswer` exige skillId (do catalogo) e score inteiro 1-5; comment opcional.
- Avaliador so ve/responde a propria `EvaluationResponse`; nao ve respostas de terceiros.
- Resposta so e aceita com ciclo OPEN; submeter muda status para submitted e registra submittedAt.
- Skills do formulario derivam do perfil aplicavel (US13.03) e/ou config do ciclo.

#### US16.04 - Visualizar resultado em radar e gap

Como consultor, quero ver meu resultado em radar e o gap contra o nivel requerido para entender minha posicao.

Criterios de aceite:

- Radar mostra media por competencia (consolidando os relationships), apos o ciclo CLOSED.
- Gap = media avaliada x `CompetencyProfileItem.requiredLevel` do perfil aplicavel.
- Consultor ve o proprio resultado consolidado; respostas individuais de peers permanecem nao identificadas para ele (anonimato de peer - DP-05).
- PEOPLE/ADMIN veem resultado completo; gestor ve resultado do time conforme escopo.

#### US16.05 - Comparar evolucao historica entre ciclos

Como gestor, quero comparar o resultado do consultor entre ciclos para acompanhar evolucao.

Criterios de aceite:

- Exibe serie por competencia ao longo de ciclos CLOSED.
- Respeita escopo de visibilidade do solicitante.
- Lida com competencias adicionadas/removidas entre ciclos sem quebrar a serie.

Dependencias: depende de EP12 (skillId), EP13 (requiredLevel) e EP14 (gap). US16.02+ dependem de US16.01. Resultado alimenta PDI (EP16/EP17) e Score (P3). Pode registrar `SkillEvidence` (sourceType EVALUATION) quando esse modelo entrar.

Auditoria: criacao/transicao de ciclo, montagem de avaliados/avaliadores, submissao de resposta e fechamento auditados.

LGPD: dado sensivel; anonimato de peer por padrao; cliente-avaliador isolado; resultado so visivel ao avaliado apos fechamento; visibilidade por papel.

### EP17 - PDI (Plano de Desenvolvimento Individual)

Gerar e acompanhar plano de desenvolvimento a partir do gap de competencias.

Modelo proposto: `DevelopmentPlan` (consultantId, cycleId?, ownerUserId, status `ACTIVE|COMPLETED|CANCELLED`,
periodStart, periodEnd); `DevelopmentAction` (planId, type `TRAINING|MENTORSHIP|CERTIFICATION|PROJECT|READING`,
targetSkillId?, description, dueAt, status `PLANNED|IN_PROGRESS|DONE|CANCELLED`, evidenceNote).

#### US17.01 - Criar PDI a partir do gap

Como PEOPLE, quero gerar um PDI sugerido a partir do gap do consultor para acelerar o planejamento.

Criterios de aceite:

- Ao criar PDI, o sistema sugere `DevelopmentAction` para skills com gap positivo (US14.02 / US16.04), com targetSkillId preenchido.
- Sugestoes sao editaveis e removiveis antes de salvar; nada e criado sem confirmacao.
- PDI exige consultantId, ownerUserId, periodStart < periodEnd e status inicial ACTIVE; cycleId opcional.
- Criacao gera `AuditEvent`.

#### US17.02 - Gerenciar acoes do PDI

Como dono do PDI, quero adicionar, editar e acompanhar acoes para conduzir o desenvolvimento.

Criterios de aceite:

- Acao exige type, description e dueAt; targetSkillId opcional (do catalogo ativo).
- Status da acao evolui PLANNED -> IN_PROGRESS -> DONE (ou CANCELLED); transicoes auditadas.
- ownerUserId (PEOPLE/AREA_MANAGER) edita estrutura; CONSULTANT pode atualizar progresso/evidenceNote das proprias acoes.
- Acao pode referenciar `Certificate` e (futuro) curso da Universidade; vinculo de custo via `Expense (COURSES_TRAINING)` previsto, nao obrigatorio no MVP.

#### US17.03 - Acompanhar progresso do PDI

Como consultor, quero acompanhar o progresso do meu PDI para saber o que falta concluir.

Criterios de aceite:

- Mostra % de acoes concluidas e acoes vencidas (dueAt < hoje e status != DONE).
- CONSULTANT ve apenas o proprio PDI; gestor ve o do time conforme escopo; PEOPLE/ADMIN veem todos.
- Concluir acao com targetSkillId pode registrar evidencia para reavaliacao da skill (via `SkillEvidence` quando o modelo entrar).

Dependencias: depende de EP14 (gap) e/ou EP16 (resultado de avaliacao). Fecha o ciclo com a Universidade (P2) e com `Certificate`.

Auditoria: criacao/edicao/transicao de plano e acoes auditadas.

LGPD: PDI e dado pessoal de desenvolvimento; visivel ao proprio consultor, gestor responsavel e PEOPLE/ADMIN.

## 6. Decisoes pendentes

- DP-01: type padrao a aplicar nas skills existentes na migracao de `Skill.type` (TECHNICAL por default?).
- DP-02: regra de precedencia ao resolver perfil aplicavel quando um consultor casa com mais de um escopo (ROLE > SENIORITY > AREA?).
- DP-03: janela de edicao/retratacao de feedback apos publicacao.
- DP-04: politica de retencao/anonimizacao de feedback, avaliacao e audio (LGPD).
- DP-05: grau de anonimato de avaliadores peer no resultado consolidado (agregacao minima por relationship).
- DP-06: escala de score da avaliacao (1-5) x escala de nivel de skill (BASIC..SPECIALIST) - como converter para o gap radar x requiredLevel.
- DP-07: criterios de score quando consultor nao tem perfil de competencia aplicavel.

## 7. Criterios gerais de pronto (alem dos de `backlog-mvp.md`)

- Validacao com Zod no servidor; RBAC checado no servidor em toda operacao privada (`requireRole`).
- Mudancas sensiveis (skill validada, perfil, feedback, avaliacao, PDI, visibilidade) geram `AuditEvent`.
- Visibilidade por registro respeitada; nenhum dado sensivel exposto fora do escopo do papel.
- Incrementos de IA/voz atras de feature flag, com provider abstraido e degradacao graciosa.
- Soft delete via `status` para entidades operacionais; sem hardcode de listas/parametros.
- Novos charts (radar, timeline, heatmap) apoiados no skill `ui-ux-pro-max`, mantendo o design system.
