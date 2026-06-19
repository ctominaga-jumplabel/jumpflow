# Roadmap — Desenvolvimento Humano e Gestão de Talentos (inspirado em FatorRH / GCPEC®)

> Status: proposta de planejamento. Fonte primária de discussão para evoluir o JumpFlow de
> **PSA operacional** para **PSA + RH Estratégico + Gestão de Talentos**.
> Alinhado a `docs/plataforma-jump-horas.md` (Fase 4 — Planejamento e Inteligência),
> `docs/modelo-dados.md` e `docs/arquitetura.md`.

## 1. Tese estratégica

A FatorRH/GCPEC é forte em desenvolvimento humano, competências e avaliação. O JumpFlow já é
forte em operação (timesheet, alocação, aprovação, financeiro, fiscal). A oportunidade **não é
copiar** a FatorRH — é construir a camada de talentos **alimentada pela evidência operacional que
só o JumpFlow possui**:

- Feedbacks, avaliações e scores ancorados em **horas reais, projetos entregues e clientes atendidos**.
- Matriz de competências cruzada com **demanda real de alocação** (`AllocationSkill`).
- IA de alocação e risco usando **burn rate, apontamentos e margem** — dado que um RH puro não tem.

Esse cruzamento operação × pessoas é o diferencial defensável frente à FatorRH.

## 2. O que já existe (não reconstruir)

| Capacidade | Estado atual no JumpFlow |
|---|---|
| Catálogo de skills | `Skill` (name, category, status) + UI `SkillMatrix` |
| Skill do consultor com nível | `ConsultantSkill` (level BASIC→SPECIALIST, `yearsExperience`, `lastUsedAt`, `validationStatus`) |
| Sugestão de skill por IA | `SkillSuggestion` (deriva de descrições de horas; PENDING/ACCEPTED/DISMISSED) |
| Skill exigida por alocação | `AllocationSkill` (level por alocação) — **proxy de "nível requerido" por projeto** |
| Certificações | `Certificate` (issuer, validade, status, alertas de vencimento) |
| Idiomas / formação | `ConsultantLanguage`, `ConsultantEducation` |
| Aprovação genérica | `Approval` (já suporta `CONSULTANT_SKILL`, `CERTIFICATE`) |
| Auditoria | `AuditEvent` (before/after) |
| RBAC | 7 papéis incl. `PEOPLE`, `AREA_MANAGER`; guards server-side |
| Banco de talentos (parcial) | perfil rico do consultor (pessoal, contrato, banco, docs, compensação) |

**Conclusão:** a "Matriz de Competências" e o "Banco de Talentos" são em grande parte
**evolução**, não greenfield. O greenfield real é: nível requerido por cargo, avaliação,
feedback contínuo, PDI, clima, OKRs, trilhas e as camadas de IA.

## 3. Lacunas (greenfield)

Nenhum modelo existe hoje para: nível requerido por cargo/senioridade · histórico/evidência de
evolução de competência · avaliação de desempenho (90/180/360) · feedback contínuo · PDI ·
pesquisa de clima · metas/OKRs · trilhas de capacitação · score do consultor · snapshots de risco
de projeto · sugestão de alocação por IA.

## 4. Novo domínio: `Desenvolvimento & Talentos`

Novo grupo de rotas sob `/app` (consistente com os 16 módulos atuais), guardado por RBAC.
Papel central: **`PEOPLE`** (gestão), com `AREA_MANAGER` (visão de time), `PROJECT_MANAGER`
(feedback/risco do seu projeto e clientes) e `CONSULTANT` (autosserviço: próprio PDI, skills,
feedbacks recebidos, trilhas).

```
/app/competencias    Matriz + perfis requeridos + gap (P1)
/app/avaliacoes      Ciclos 90/180/360, radar, gap analysis (P1)
/app/feedback        Feed de feedback contínuo (+voz/IA depois) (P1)
/app/pdi             Plano de Desenvolvimento Individual (P1)
/app/clima           Pesquisas de clima/NPS interno (P2)
/app/metas           Metas e OKRs (P2)
/app/universidade    Trilhas, cursos, gamificação (P2)
/app/talentos        Banco de talentos consolidado + score + disponibilidade (P2/P3)
```

**Privacidade:** avaliação, feedback e clima são dados pessoais sensíveis. Regras:
visibilidade explícita por registro; clima **anônimo** por padrão (token desacoplado da resposta);
toda mudança gera `AuditEvent`; consultor vê o próprio histórico, gestor vê o do time, RH vê tudo.

## 5. Convenções obrigatórias (de `arquitetura.md`)

- Validação com **Zod no servidor**; schemas compartilhados UI/servidor.
- **Prisma** como única camada de acesso; sem SQL cru; queries sensíveis em funções de domínio.
- RBAC **checado no servidor** em toda operação privada; usar `requireRole`.
- **Auditar** validação de skill, avaliação, PDI, OKR, mudança de score.
- **Soft delete** via `status` para entidades operacionais.
- Migrations Prisma com nome `YYYYMMDDHHmmss_descricao`.
- IA atrás de **feature flag** + abstração de provider (padrão `jump-integrations-agent`), reusando
  o padrão de degradação graciosa com mock quando provider/DB indisponível.
- Reusar os 12 primitivos de `components/ui`; novos: **Radar chart**, **Timeline**, **Heatmap**
  (apoiar-se no skill `ui-ux-pro-max` para charts).

---

## 6. PRIORIDADE 1 — Núcleo de Talentos

### 6.1 Matriz de Competências (evolução)

**Já existe:** `Skill`, `ConsultantSkill`, `SkillMatrix`. **Falta:** tipo técnica/comportamental,
nível requerido por cargo, gap, evidência e histórico.

Modelo de dados:
- `Skill.type: SkillType` enum `TECHNICAL | BEHAVIORAL` (hoje só há `category` livre).
- `CompetencyProfile` (id, name, scope `SENIORITY|ROLE|AREA`, referenceKey, status) — perfil esperado.
- `CompetencyProfileItem` (profileId, skillId, requiredLevel) — nível requerido.
- `SkillEvidence` (consultantSkillId, sourceType `FEEDBACK|EVALUATION|CERTIFICATE|PROJECT|MANUAL`, sourceId, note, createdAt) — evidências.
- `ConsultantSkillHistory` (consultantSkillId, level, changedByUserId, reason, createdAt) — histórico de evolução.

Entregas: editor de catálogo (admin de skills, hoje só mock) · matriz **requerido × atual** (heatmap)
· gap por consultor e por time · filtro técnica/comportamental.
**Gap analysis = base do PDI e da IA de alocação.**

Agentes: `jump-skills-intelligence-agent`, `jump-data-modeler`, `jump-frontend-ux`.

### 6.2 Avaliação de Desempenho 90° / 180° / 360°

Modelo de dados:
- `EvaluationCycle` (id, name, type `SELF_90|MANAGER_180|FULL_360`, periodStart, periodEnd, status `DRAFT|OPEN|CLOSED`, createdByUserId).
- `Evaluation` (id, cycleId, subjectConsultantId, status) — a avaliação de um consultor no ciclo.
- `EvaluationResponse` (id, evaluationId, raterUserId?, relationship `SELF|MANAGER|PEER|CLIENT|SUBORDINATE`, status, submittedAt) — uma resposta por avaliador.
- `EvaluationAnswer` (responseId, skillId, score Int 1–5, comment) — nota por competência.

Resultado: **radar** (média por competência) · **evolução histórica** (ciclos anteriores) ·
**gap** (avaliado × `CompetencyProfileItem.requiredLevel`). Cliente como avaliador conecta com o
relacionamento Jump Label × cliente.

Agentes: `jump-people-ops-agent`, `jump-product-owner`, `jump-data-modeler`, `jump-frontend-ux`, `jump-qa-engineer`.

### 6.3 Feedback Contínuo

Modelo de dados:
- `Feedback` (id, subjectConsultantId, authorUserId, type `PRAISE|GUIDANCE|RECOGNITION|CONCERN`, source `INTERNAL|CLIENT|PEER`, visibility `PRIVATE|SHARED`, body, relatedProjectId?, relatedClientId?, createdAt).
- Voz/IA (incremento): campos `audioStorageKey`, `transcription`, `transcriptionStatus` + IA de reescrita.

Entregas: **feed timeline** por consultor, ancorado a projeto/cliente reais; vira histórico que
alimenta avaliação e score. Botão "🎤 Registrar feedback" (transcrição) e "polir com IA" entram
como incremento, atrás de flag.

Agentes: `jump-people-ops-agent`, `jump-frontend-ux`, `jump-integrations-agent` (voz/IA).

### 6.4 PDI — Plano de Desenvolvimento Individual

Modelo de dados:
- `DevelopmentPlan` (id, consultantId, cycleId?, ownerUserId, status `ACTIVE|COMPLETED|CANCELLED`, periodStart, periodEnd).
- `DevelopmentAction` (id, planId, type `TRAINING|MENTORSHIP|CERTIFICATION|PROJECT|READING`, targetSkillId?, description, dueAt, status `PLANNED|IN_PROGRESS|DONE|CANCELLED`, evidenceNote).

Entregas: gerar PDI **a partir do gap** (6.1/6.2) com ações sugeridas para skills abaixo do
requerido; ligar ações a cursos (6.7 Universidade) e a `Certificate`/`Expense (COURSES_TRAINING)`.

Agentes: `jump-people-ops-agent`, `jump-skills-intelligence-agent`, `jump-frontend-ux`.

---

## 7. PRIORIDADE 2 — Engajamento e Capacitação

### 7.1 Pesquisa de Clima / NPS interno

Modelo: `Survey` (title, type `CLIMATE|NPS|SATISFACTION|LEADERSHIP|PULSE`, anonymous, period, status) ·
`SurveyQuestion` (text, type `SCALE|NPS|TEXT|CHOICE`, options) · `SurveyInvitation` (surveyId,
consultantId, token, status) · `SurveyResponse` + `SurveyAnswer`. **Anonimato:** resposta não
referencia consultantId; só o `SurveyInvitation.token` controla "respondeu ou não". Dashboards
automáticos (NPS, eNPS, série temporal). Agentes: `jump-people-ops-agent`, `jump-frontend-ux`.

### 7.2 Metas e OKRs

Modelo: `Objective` (scope `CONSULTANT|PROJECT|AREA|COMPANY`, referenceKey, title, period, status,
ownerUserId) · `KeyResult` (objectiveId, title, metricType, startValue, targetValue, currentValue,
unit, progress). KRs podem ser **auto-atualizados** por dados operacionais (ex.: "reduzir incidentes",
"aumentar margem" leem do financeiro/horas). Agentes: `jump-product-owner`, `jump-data-modeler`,
`jump-finance-ops-agent` (KRs financeiros).

### 7.3 Universidade Jump (trilhas + gamificação)

Modelo: `LearningTrack` (title, category, status) · `Course` (trackId?, title, provider, hours,
externalUrl, skillId?) · `Enrollment` (consultantId, courseId, status `ENROLLED|IN_PROGRESS|COMPLETED`,
progressPct, hours, completedAt) · pontos/ranking **derivados** de conclusões. Conclusão de curso →
sugere `Certificate` e atualiza `ConsultantSkill`/evidência. Reusa `Expense (COURSES_TRAINING)` para
custo de treinamento. Agentes: `jump-skills-intelligence-agent`, `jump-frontend-ux`, `jump-design-system` (gamificação).

---

## 8. PRIORIDADE 3 — Inteligência (diferencial sobre a FatorRH)

> Camada de IA/analytics sobre os dados já existentes. Atrás de feature flag, com provider
> abstraído. Modelos Claude (Opus/Sonnet) conforme custo/latência.

### 8.1 Mapa de Disponibilidade (heatmap) — **quick win, antecipar**
Read-model derivado de `Allocation.allocationPercent` + `ConsultantVacation` + status. Estados:
Livre / Parcial / 100% / Férias / Bench. Quase sem novo schema, altíssimo valor operacional.
Recomendo entregar já junto da P1. Agente: `jump-frontend-ux`.

### 8.2 IA de Alocação
Serviço de score combinando `ConsultantSkill` × `AllocationSkill` (aderência), disponibilidade
(8.1), valor/custo hora, histórico com cliente. Saída: ranking ("João — 92% aderência"). Persistir
`AllocationSuggestion` (projectId, consultantId, score, factors Json) para auditoria e aprendizado.
Agentes: `jump-skills-intelligence-agent`, `jump-architect`, `jump-workflow-automation`.

### 8.3 IA de Risco de Projeto
`ProjectRiskSnapshot` (projectId, computedAt, score, level `GREEN|YELLOW|RED`, signals Json) via job:
burn rate (`budgetHours` vs `TimeEntry`), atrasos, sentimento de feedbacks/comentários.
Agentes: `jump-workflow-automation`, `jump-finance-ops-agent`.

### 8.4 Score do Consultor
`ConsultantScoreSnapshot` (consultantId, computedAt, score 0–100, breakdown Json) combinando
avaliações, horas, certificações, feedbacks, presença e cliente. Transparente (mostra a composição),
versionado por snapshot. Agentes: `jump-people-ops-agent`, `jump-architect`.

### 8.5 IA de Feedback (reescrita)
Gestor escreve cru → IA sugere versão estruturada (incremento de 6.3). Já listado em 6.3.

---

## 9. Sequenciamento recomendado

| Onda | Conteúdo | Justificativa |
|---|---|---|
| **0 (quick wins)** | Mapa de Disponibilidade (8.1) · `Skill.type` + editor de catálogo · nível requerido (`CompetencyProfile*`) | Baixo custo, destrava P1 e operação; reusa muito do que existe |
| **1** | Matriz com gap (6.1) → Feedback contínuo (6.3) → Avaliação 90/180/360 (6.2) → PDI (6.4) | Núcleo de talentos; cada um alimenta o próximo (gap→PDI, feedback→avaliação→score) |
| **2** | Universidade (7.3) · OKRs (7.2) · Clima (7.1) | Engajamento; Universidade fecha o ciclo do PDI |
| **3** | Score (8.4) · IA de Alocação (8.2) · IA de Risco (8.3) · IA de feedback (8.5) | Precisa de massa de dados das ondas 1–2 para ter qualidade |

Dependências-chave: **gap analysis (6.1)** é pré-requisito de PDI e IA de alocação;
**feedback+avaliação (6.2/6.3)** são insumo do Score (8.4); **disponibilidade (8.1)** é insumo da
IA de alocação (8.2).

## 10. Riscos e cuidados

- **Privacidade/LGPD:** avaliação, feedback e clima são dados sensíveis — visibilidade por registro,
  anonimato real no clima, auditoria completa, retenção definida.
- **Qualidade de IA:** não automatizar decisão de pessoas; IA sempre como sugestão com revisão humana
  (mesma filosofia de `SkillSuggestion` e governança do `jump-skills-intelligence-agent`).
- **Adoção:** começar pelo que dá valor com pouco atrito (disponibilidade, matriz, feedback) antes de
  ciclos formais de avaliação, que exigem ritual organizacional.
- **Não inflar o schema cedo:** snapshots de score/risco e sugestões são derivados — calcular sob
  demanda/por job antes de materializar histórico pesado.

## 11. Próximos passos sugeridos

1. Validar este recorte e a Onda 0 com `jump-product-owner` (gerar épicos/US e critérios de aceite).
2. `jump-data-modeler` desenha as migrations da Onda 0 + P1 (enums, `CompetencyProfile*`, `SkillEvidence`,
   `Evaluation*`, `Feedback`, `DevelopmentPlan*`).
3. `jump-architect` define a abstração de IA (provider + flags) para as camadas P3.
4. Implementar Onda 0 como prova de valor (heatmap + nível requerido + gap) antes de abrir ciclos.
