# Backlog de Melhorias — Propostas das Áreas Usuárias

> Backlog complementar ao `docs/backlog-mvp.md`, consolidando as melhorias propostas
> pelas áreas usuárias do JumpFlow. Numeração de épicos em faixa própria (EP-M\*)
> para não colidir com o backlog principal.
>
> Princípios herdados do produto:
> - **IA sempre como sugestão**: núcleo determinístico + humano no loop. A IA enriquece
>   ou propõe, nunca decide sozinha (`apps/web/src/lib/ai/provider.ts`).
> - **Validação e autorização no servidor**; campos sensíveis protegidos por RBAC.
> - **Auditar mudanças sensíveis** e tudo que vira evidência de skill/avaliação.
> - **LGPD**: transcrições de pessoas e conteúdo de feed têm regras de visibilidade.

---

## Mapa das propostas → eixos do produto

| # | Proposta | Eixo | Greenfield? | Esforço |
|---|----------|------|-------------|---------|
| 1 | Voz + transcrição por IA na atividade da semana | Timesheet | Não (estende `TimeEntry`) | M |
| 2 | Descrição de atividade com campos padronizados | Timesheet | Não (estende `TimeEntry`) | S–M |
| 3 | IA de transcrição de checkpoint/1:1 → Skills / Oportunidades / Cases | People-Ops + Skills + Comercial | **Sim** (novo domínio) | L |
| 4 | Feed social do consultor (texto, foto, vídeo, reações, respostas) | Engajamento | **Sim** (novo domínio) | M–L |

**Sinergia central:** os itens 2 e 3 alimentam o pipeline `SkillSuggestion` que já existe
(`apps/web/src/lib/skills/suggestions.ts`), hoje baseado só em *keyword matching* sobre
texto livre. Campos estruturados (tecnologias) e transcrições de 1:1 são evidências de
qualidade muito superior para o mesmo motor — sem reescrevê-lo.

---

## Sequenciamento recomendado (ondas)

1. **Onda 1 — EP-M02 (campos estruturados)**: menor esforço, maior alavancagem imediata
   (relatórios, melhores sugestões de skill, base para os outros itens). Sem dependência de IA.
2. **Onda 2 — EP-M01 (voz/transcrição)**: estende o formulário da Onda 1; primeira integração
   de provider de áudio (reutiliza o padrão `transcriptionStatus` do `Feedback`).
3. **Onda 3 — EP-M04 (feed)**: domínio isolado, paralelizável com as ondas anteriores.
4. **Onda 4 — EP-M03 (IA de checkpoints/1:1)**: mais pesado (novo domínio + extração estruturada
   por LLM + LGPD); consome o pipeline de skills já maduro e pode publicar "cases" no feed da Onda 3.

---

## EP-M01 — Lançamento de Atividade por Voz

**Objetivo:** permitir que o consultor dite a atividade da semana e a transcreva por IA,
reduzindo atrito no preenchimento, alimentando o `Resumo Técnico` (EP-M02) sem digitação.

**Base existente:** padrão de voz já modelado no `Feedback`
(`audioStorageKey` / `transcription` / `transcriptionStatus` atrás de `NEXT_PUBLIC_FEEDBACK_VOICE`).
Storage por bucket via `apps/web/src/lib/storage/provider.ts`. **Provider de áudio ainda NÃO está
plugado** — é integração nova.

### US-M01.01 — Gravar áudio da atividade
Como consultor, quero gravar um áudio descrevendo minha atividade para não precisar digitar.

Critérios de aceite:
- Botão de gravação no formulário de atividade (`TimeEntryForm.tsx`), atrás de flag
  `NEXT_PUBLIC_TIMESHEET_VOICE`.
- Áudio enviado a um bucket privado novo (`timesheet-audio`), com validação de MIME/tamanho
  no cliente e no servidor (`file-validation.ts`).
- Metadados gravados (`audioStorageKey`, `contentType`, `size`); URL nunca persistida (signed URL sob demanda).
- Funciona em desktop e mobile web; degrada graciosamente se o navegador não suportar captura.

### US-M01.02 — Transcrever áudio por IA
Como consultor, quero que o áudio vire texto automaticamente para revisar e ajustar antes de salvar.

Critérios de aceite:
- Campo de status `transcriptionStatus` (PENDING/PROCESSING/DONE/FAILED), espelhando o padrão do `Feedback`.
- Transcrição roda no servidor via abstração de provider (novo `AiAudioProvider`, irmão de
  `AiTextProvider`); se o provider não estiver configurado, o status fica `DISABLED` e o fluxo
  cai para digitação manual (degradação segura).
- Texto transcrito popula o campo `Resumo Técnico` (EP-M02) como rascunho editável — **nunca salva direto**.
- Uso de IA registrado em `recordAiUsage` (feature nova `TIMESHEET_TRANSCRIPTION`).

### US-M01.03 — Revisar e confirmar
Como consultor, quero editar a transcrição antes de submeter para garantir precisão.

Critérios de aceite:
- Transcrição exibida em campo editável; salvar usa o texto final (editado), não o bruto.
- Indicação visual de que o texto veio de IA (badge "transcrito por IA").

**Dependências:** EP-M02 (campo Resumo Técnico). Provider de transcrição (decisão de integração).
**Open questions:**
- Provider de transcrição (Whisper/OpenAI, Azure Speech, Deepgram)? Custo por minuto e LGPD do áudio.
- Reter o áudio após transcrição ou descartar? (retenção mínima recomendada por LGPD).

---

## EP-M02 — Descrição de Atividade Estruturada

**Objetivo:** padronizar o preenchimento da atividade com campos estruturados, melhorando
relatórios, leitura por gestores e a qualidade das evidências de skill.

**Base existente:** `TimeEntry` (`packages/database/prisma/schema.prisma`) hoje tem só
`description: String?` livre + `activityType`. `SkillSuggestion` já lê `description` por keyword.

### US-M02.01 — Tecnologias e Ferramentas
Como consultor, quero marcar as tecnologias/ferramentas usadas na atividade.
Ex.: Databricks, AWS, IA Copilot, Microsoft Fabric.

Critérios de aceite:
- Novo campo multi-seleção com *tags* (ex.: `technologies: String[]` no `TimeEntry`).
- Catálogo curado de tecnologias com **opção de digitar livre** (cria tag pendente de curadoria).
- **Decisão de produto (recomendada):** o catálogo de tecnologias reaproveita/conversa com o
  catálogo `Skill` (categoria TECHNICAL). Tecnologia marcada vira **evidência direta** para
  `SkillSuggestion` (sinal estruturado, não keyword), com `evidenceSummary` e `sourceEntryIds`.
- Tags marcadas ficam visíveis no `TimeEntryRow` e filtráveis em `TimesheetFilters`.

### US-M02.02 — Fase do Projeto
Como consultor, quero indicar a fase do projeto na atividade. Ex.: Início, Na metade, Finalizando.

Critérios de aceite:
- Campo de seleção `projectPhase` (enum: `START` / `MIDDLE` / `FINISHING`), opcional ou obrigatório
  conforme decisão de produto.
- Visível para gestores e disponível para relatório/agregação por projeto.

### US-M02.03 — Resumo Técnico
Como consultor, quero descrever tecnicamente o que fiz, com um padrão claro.
Ex.: "Desenvolvimento de painel atual para aplicação de melhoria de modelagem de dados — Educação."

Critérios de aceite:
- Campo de texto dedicado (substitui/renomeia o atual `description` como `technicalSummary`,
  com migração de dados existentes).
- Placeholder/exemplo orientando o padrão de preenchimento.
- É o destino da transcrição por voz (EP-M01).

### US-M02.04 — Interação com Cliente
Como gestor, quero saber se houve interação/reunião com o cliente naquele dia.

Critérios de aceite:
- Campo de seleção `clientInteraction: Boolean` (Sim/Não).
- Agregável em relatório (ex.: frequência de contato com cliente por projeto/consultor) —
  insumo para People-Ops e gestão de relacionamento.

### US-M02.05 — Validação e compatibilidade
Como produto, quero introduzir os campos sem quebrar lançamentos existentes.

Critérios de aceite:
- Schemas Zod (`apps/web/src/lib/timesheet/schemas.ts`) atualizados com os novos campos.
- Migration Prisma aditiva (campos nullable / default), entradas legadas continuam válidas.
- Lançamento semanal em lote (`createWeeklyTimeEntries`) e cópia de semana anterior
  (`copyPreviousWeek`) propagam os novos campos.

**Dependências:** nenhuma (base das demais).
**Open questions:**
- Tecnologias: catálogo controlado, texto livre, ou híbrido com curadoria? (recomendado: híbrido).
- `projectPhase` e `clientInteraction` são obrigatórios?
- Migrar `description` → `technicalSummary` ou manter ambos?

---

## EP-M03 — IA de Transcrição de Checkpoints e 1:1

**Objetivo:** a partir de transcrições de agendas de checkpoint e 1:1, a IA identifica e propõe
**Skills**, **Oportunidades** e **Cases**, sempre com validação humana.

**Base existente:** **não há** modelo de checkpoint/1:1/reunião hoje. `SkillSuggestion` existe e
recebe evidências (`SkillEvidenceSource`). `lib/ai/provider.ts` suporta saída de texto; aqui é
necessária **extração estruturada** (saída em schema). Conteúdo é **dado pessoal sensível (LGPD)**.

### US-M03.01 — Registrar transcrição da reunião
Como gestor/People, quero registrar a transcrição de um checkpoint ou 1:1 para processá-la.

Critérios de aceite:
- Novo modelo `MeetingNote` (tipo: `CHECKPOINT` / `ONE_ON_ONE`), vinculado a consultor e
  opcionalmente projeto; campos de transcrição + status de processamento.
- Entrada por colagem de texto e/ou upload de áudio (reaproveita EP-M01 para transcrever).
- Visibilidade restrita por RBAC (nova permissão `MEETING_NOTES`); privacidade default = restrito
  ao gestor + People + o próprio consultor (regras LGPD do `Feedback`).
- Consentimento/aviso de uso de IA registrado.

### US-M03.02 — Extração estruturada por IA
Como gestor/People, quero que a IA leia a transcrição e proponha Skills, Oportunidades e Cases.

Critérios de aceite:
- Extração via provider com **saída estruturada** (schema com 3 listas: skills, oportunidades, cases).
- **Skills** → entram no pipeline `SkillSuggestion` existente, com
  `SkillEvidenceSource = MEETING` (novo valor de enum) e referência à `MeetingNote`.
- **Oportunidades** → registradas como sugestões para o papel SALES/Comercial (novo modelo leve
  `OpportunityLead` ou flag), com link à origem.
- **Cases** → registrados como sugestão de case de sucesso (candidato a publicação no Feed — EP-M04),
  pendente de validação.
- Tudo entra como **PENDING**; nada é criado/publicado automaticamente. Uso de IA auditado
  (`recordAiUsage`, feature `MEETING_EXTRACTION`).
- Se o provider estiver desabilitado, a tela mostra a transcrição sem extração (degradação segura).

### US-M03.03 — Curadoria humana das sugestões
Como gestor/People, quero revisar e aceitar/descartar cada sugestão extraída.

Critérios de aceite:
- Tela de revisão lista os 3 tipos com aceitar/editar/descartar por item (padrão do fluxo de skills).
- Aceitar Skill → cria/atualiza `ConsultantSkill` com evidência e `validationStatus` adequado.
- Aceitar Oportunidade → notifica Comercial (novo `NotificationEvent`).
- Aceitar Case → encaminha para publicação no Feed (EP-M04) ou repositório de cases.
- Decisões auditadas (`AuditEvent`).

**Dependências:** pipeline de Skills (existente); idealmente EP-M01 (transcrição de áudio) e
EP-M04 (destino dos cases). Provider de LLM com saída estruturada.
**Open questions:**
- "Oportunidades" = oportunidade comercial (upsell/novo projeto) ou oportunidade de desenvolvimento
  do consultor? (muda destino e RBAC).
- Onde vivem os "Cases": Feed, repositório de cases dedicado, ou material de marketing?
- LGPD: retenção da transcrição, anonimização, base legal e consentimento.

---

## EP-M04 — Feed do Consultor

**Objetivo:** espaço social interno para consultores postarem texto, fotos e vídeos, com
respostas, reações (emojis) e engajamento — fortalecendo cultura e visibilidade de cases.

**Base existente:** **greenfield**. Reaproveita storage (`provider.ts` + bucket novo),
motor de notificações (novo `NotificationEvent`) e matriz RBAC (novas permissões `FEED_*`).

### US-M04.01 — Publicar post
Como consultor, quero publicar texto, fotos e vídeos no feed.

Critérios de aceite:
- Novos modelos: `Post`, `PostMedia` (mídia anexa), com autor, corpo, timestamps, status.
- Upload de imagem/vídeo para bucket privado novo (`feed-media`), validação MIME/tamanho;
  limites distintos para vídeo. Metadados no DB, signed URL sob demanda.
- Permissão `FEED_POST` (create) na matriz RBAC; todos os papéis com acesso por padrão (configurável).
- Suporte a emojis no corpo do texto.

### US-M04.02 — Reagir e comentar
Como consultor, quero reagir com emoji e responder posts.

Critérios de aceite:
- Modelos `PostReaction` (emoji por usuário, unicidade por (post, user, emoji)) e `PostComment`
  (com possibilidade de resposta a comentário).
- Contagem de reações e comentários no card do post.
- Autor do post é notificado de respostas (novo `NotificationEvent = FEED_REPLY`, canal configurável).

### US-M04.03 — Feed e visibilidade
Como consultor, quero ver um feed cronológico/relevante das publicações.

Critérios de aceite:
- Listagem paginada (cronológica no MVP), com mídia renderizada e signed URLs.
- Visibilidade default = todos os usuários autenticados (decisão de produto: empresa-wide vs. por área).
- Tela acessível na navegação (`apps/web/src/lib/navigation.ts`).

### US-M04.04 — Moderação
Como People/Admin, quero remover conteúdo inadequado.

Critérios de aceite:
- Permissão `FEED_MODERATE` (delete) permite remover post/comentário de terceiros.
- Remoções auditadas; autor pode remover o próprio conteúdo.

**Dependências:** nenhuma rígida; consome storage/notificações/RBAC existentes.
**Open questions:**
- Escopo de visibilidade: toda a empresa, por área, ou por projeto?
- Limites de mídia (tamanho/duração de vídeo) e custo de storage.
- Política de moderação e diretrizes de uso (cultura interna / LGPD em fotos de pessoas).

---

## Resumo de impacto técnico

| Área | EP-M01 | EP-M02 | EP-M03 | EP-M04 |
|------|:------:|:------:|:------:|:------:|
| Migration Prisma | ✓ (campos áudio) | ✓ (campos atividade) | ✓ (novos modelos) | ✓ (novos modelos) |
| Novo bucket storage | `timesheet-audio` | — | (reusa EP-M01) | `feed-media` |
| Provider de IA | áudio (novo) | — | texto estruturado | — |
| Novo `NotificationEvent` | — | — | oportunidade | `FEED_REPLY` |
| Novas permissões RBAC | flag | — | `MEETING_NOTES` | `FEED_POST`, `FEED_MODERATE` |
| Sinergia com `SkillSuggestion` | indireta | **alta** | **alta** | — |
| Sensibilidade LGPD | média (áudio) | baixa | **alta** | média (mídia de pessoas) |
