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
| 4 | Feed social do consultor (texto, foto, vídeo, reações, respostas) | Engajamento | **Sim** (novo domínio) | M–L — **✅ implementado (sem vídeo)** |
| 5 | Feed: revisar anexo/imagem/vídeo (fechar lacuna de vídeo do EP-M04) | Engajamento | Não (estende Feed) | S–M |
| 6 | Currículo do consultor, atualizado automaticamente a cada mudança de perfil | Talentos / Consultores | Não (deriva do `Consultant`) | M |
| 7 | Remover módulos Competências, PDI, Clima e Metas do produto | Talentos (redução de escopo) | Não (remoção) | M |
| 8 | Termos de Uso com Aceite/Recusa (gate de acesso) | Plataforma / Compliance | **Sim** (novo) | S–M |
| 9 | Navegação restrita ao perfil Consultor + renomear Universidade → JumpAcademy | Navegação / RBAC | Não (ajuste de nav) | S |

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
5. **Onda 5 — EP-M05 (mídia do feed / vídeo)**: incremento sobre o Feed já em produção; fecha a
   lacuna de vídeo prevista no EP-M04 e revisa a UX de anexo/imagem. Sem dependência de IA.
6. **Onda 6 — EP-M06 (currículo do consultor)**: read-model derivado do `Consultant` — "sempre
   atualizado" por construção, sem acoplar às 15+ server actions de escrita. Independente das demais.

**Frente de plataforma/escopo (jul/2026) — pode correr em paralelo, com prioridade própria:**

- **EP-M08 (Termos de Uso, gate de acesso)** e **EP-M09 (nav restrita do Consultor + JumpAcademy)**: mudanças
  transversais de acesso; boas candidatas a ir primeiro (baixo esforço, alto efeito de conformidade/foco).
- **EP-M07 (remover Competências/PDI/Clima/Metas)**: coordenar com EP-M09 (saem da nav) e confirmar a decisão
  de dropar tabelas vs. desligar só a UI antes de mexer no schema.
- **EP-M05 (mídia do feed)**: incremento sobre o Feed já em produção; depende de ligar a flag do Feed.

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

> **Status (jul/2026): ✅ IMPLEMENTADO E MERGEADO EM `main`** (PR #25, `feat/feed-social`),
> atrás da flag `NEXT_PUBLIC_FEATURE_FEED` (OFF por padrão). O que subiu **difere da spec acima**:
> - Modelos reais: `FeedPost`, `FeedComment`, `FeedReaction`, `FeedPostAttachment` (não `Post`/`PostMedia`).
> - Bucket real: `feed-attachments` (não `feed-media`); anexo genérico espelhando `ExpenseAttachment`.
> - **Anexo e imagem: OK.** Whitelist `FEED_MIME_EXTENSIONS` = `pdf, jpeg, png, webp, gif`; limite
>   10 MB/arquivo; `FEED_MAX_ATTACHMENTS` por post. Imagem renderiza inline (signed URL sob demanda);
>   arquivo (PDF) vira link de download em `FeedPostCard`.
> - **Vídeo: NÃO implementado** — não está na whitelist, não há player e o limite de 10 MB não serve
>   para vídeo. **Esta é a lacuna endereçada pelo EP-M05.**

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

## EP-M05 — Feed: Anexo, Imagem e Vídeo

**Objetivo:** fechar a lacuna de mídia do Feed (EP-M04, já em produção): revisar a experiência de
anexo/imagem e **adicionar suporte a vídeo**, mantendo o padrão de storage privado + signed URL.

**Base existente:** Feed em `main` (flag `NEXT_PUBLIC_FEATURE_FEED`). Anexo e imagem já funcionam
(`FeedPostAttachment`, bucket `feed-attachments`, upload via `attachFile`, render em `FeedPostCard`,
whitelist em `lib/storage/file-validation.ts`). **Não há vídeo.** Incremento, não greenfield.

### US-M05.01 — Enviar vídeo em um post
Como consultor, quero anexar um vídeo curto a um post do feed.

Critérios de aceite:
- Estender `FEED_MIME_EXTENSIONS` com formatos de vídeo web (`video/mp4`, `video/webm`; avaliar `video/quicktime`).
- Limite de tamanho **específico de vídeo** (novo `MAX_FEED_VIDEO_SIZE_BYTES`, ex.: 50–100 MB), distinto
  dos 10 MB de imagem/PDF — validado no cliente (`FeedComposer`) e reconfirmado no servidor (`attachFile`).
- Validação server-side de MIME+extensão como já feito em `validateFeedAttachmentFile` (nunca confiar só no cliente).
- Vídeo persistido em `feed-attachments` como qualquer anexo; URL sempre assinada, nunca persistida.

### US-M05.02 — Reproduzir vídeo no feed
Como consultor, quero assistir ao vídeo direto no card do post.

Critérios de aceite:
- `FeedPostCard`/`AttachmentItem` reconhece `VIDEO_TYPES` e renderiza `<video controls>` com a signed URL
  (hoje só há `IMAGE_TYPES` inline; o resto cai em link de download).
- Carregamento lazy da URL assinada (mesmo padrão do `getAttachmentUrl` das imagens); `preload="none"`
  ou poster para não estourar banda.
- Fallback gracioso quando a URL expira/falha (mensagem + botão de recarregar, como nas imagens).

### US-M05.03 — Botões de foto/vídeo e UX multi-mídia (feedback do usuário)
Como consultor, quero botões claros para adicionar **foto** e **vídeo**, com uma experiência consistente.

Critérios de aceite:
- **Problema relatado (jul/2026):** o composer só tem um clipe genérico (`Paperclip`) — sem affordance clara
  de "adicionar foto" nem "adicionar vídeo". Incluir botões/ícones explícitos: **Foto** (`accept=image/*` da
  whitelist) e **Vídeo** (`accept="video/mp4,video/webm"`, US-M05.01).
- Preview no composer para imagem **e** vídeo antes de publicar (hoje o preview mostra só nome/ícone de arquivo).
- Galeria/grid quando há múltiplos anexos; imagem em lightbox ao clicar (decisão de produto: manter inline vs. modal).
- Mensagens de erro claras por tipo e por limite (imagem vs. vídeo vs. documento).
- Acessibilidade: `alt`/legenda em imagens, `controls`+legenda em vídeo.

**Decisão (jul/2026) — vídeo "simples", sem pipeline de mídia:** não haverá transcodificação, streaming
adaptativo (HLS/DASH) nem CDN dedicada (padrão Instagram-scale, injustificado para o volume interno). O
vídeo é armazenado no bucket **existente** `feed-attachments` e servido por **signed URL**, exatamente como
as imagens de hoje. Só formatos que tocam nativamente no navegador: **`video/mp4` e `video/webm`**. Teto
sugerido de **50 MB** (`MAX_FEED_VIDEO_SIZE_BYTES`). Trade-off aceito: arquivos fora do formato/limite (ex.:
`.mov` do iPhone) são **rejeitados no upload** com mensagem clara — sem conversão. Reavaliar transcoder só se
o volume justificar.

### US-M05.04 — Remover o seletor de visibilidade (feedback do usuário)
Como consultor, não quero um seletor de visibilidade que só tem uma opção.

Critérios de aceite:
- **Problema relatado (jul/2026):** o composer expõe um seletor cuja única opção ativa é "Empresa toda"
  (`PUBLIC_INTERNAL`); a opção `AREA` está desligada na UI (v1). Um seletor de uma opção só confunde.
- **Remover o seletor** do `FeedComposer` enquanto houver só um escopo. O post continua criado com
  `visibility = PUBLIC_INTERNAL` (default do modelo) — sem mudança de schema.
- Manter o enum `FeedVisibility` no modelo (reintroduzir o seletor é trivial se um dia houver escopo por área).

**Dependências:** EP-M04 (Feed) — já atendida. Nenhuma IA.
**Open questions:**
- Duração máxima de vídeo (além do teto de tamanho)? Gerar poster/thumbnail estático é desejável mas opcional no MVP.
- Moderação de vídeo (mesmo fluxo `FEED_MODERATE` cobre; revisar diretrizes LGPD para imagem/vídeo de pessoas).
- Documentar `NEXT_PUBLIC_FEATURE_FEED` no `.env.example` (hoje ausente) ao promover a feature.

---

## EP-M06 — Currículo do Consultor (Auto-Atualizável)

**Objetivo:** cada consultor tem um currículo/perfil consolidado que **está sempre atualizado**, refletindo
qualquer mudança de dados do consultor sem passo manual — para visão de talentos e desenvolvimento.

**Decisões de produto (jul/2026):**
- **Público:** somente **RH/People e o próprio consultor**. **Não** há versão voltada a cliente → **projeção única**.
- **Sem valores:** o currículo **nunca** expõe custo, valor-hora ou remuneração — em nenhuma projeção.
- **Histórico + PDF:** requisito confirmado → o snapshot versionado + PDF é **story central**, não opcional
  (o read-model derivado é a foto viva; o snapshot congela um estado para histórico). **Sem assinatura** (decisão jul/2026).

**Base existente:** modelo `Consultant` rico (dados pessoais, formação/idiomas, skills validadas, certificados,
alocações/projetos, avaliações, PDI). Todas as escritas passam por server actions uniformes
(`/app/consultores`, `/app/competencias`, `/app/skills`, `/app/feedback`, `/app/avaliacoes`, `/app/pdi`) com
padrão Zod → RBAC → Prisma → `recordAuditEvent` → `revalidatePath`. **Não existe** conceito de currículo, nem
lib de PDF (há framework de export CSV em `lib/reports/csv.ts`).

**Decisão de arquitetura recomendada — currículo DERIVADO (read-model), não armazenado:**
montar o currículo **sob demanda** a partir das tabelas-fonte do `Consultant`. Assim ele é "sempre atualizado"
*por construção* — sem precisar plugar um hook em cada uma das 15+ server actions de escrita, sem risco de
dessincronização e sem estado duplicado. "Atualizar automaticamente" vira "derivar na leitura". Um snapshot
persistido/versionado (e PDF) só entra se houver requisito de histórico/assinatura — como story separada.

### US-M06.01 — Modelo de dados do currículo (agregação)
Como plataforma, quero um agregador que monte o currículo a partir das fontes já existentes.

Critérios de aceite:
- `lib/consultants/curriculum.ts` (puro/testável) com `buildConsultantCurriculum(consultantId)` que agrega:
  identidade (cargo, senioridade, área, bio), formação (`ConsultantEducation`), idiomas (`ConsultantLanguage`),
  skills **validadas** (`ConsultantSkill` com nível e evidências), certificados (`Certificate`), histórico de
  projetos (`Allocation` → projeto, papel, período) e destaques de avaliação/PDI.
- **Sem financeiro, sempre:** o agregador **não lê nem projeta** custo/valor-hora/remuneração — projeção única,
  para RH/People e o próprio consultor. (Não é "esconder na UI": o campo não entra no read-model.)
- Pura leitura; sem migration nesta story (deriva do que existe).

### US-M06.02 — Tela do currículo do consultor
Como RH/People (e o próprio consultor), quero ver o currículo consolidado sempre atualizado.

Critérios de aceite:
- Aba/rota "Currículo" no perfil do consultor (`/app/consultores/...`) renderizando o agregado.
- Como é derivado, reflete edições imediatamente (`revalidatePath` das actions existentes já cobre o cache).
- Seções vazias tratadas com elegância (ex.: sem certificados → oculta a seção).
- Respeita RBAC: **o próprio consultor vê o seu; RH/People vê o de todos**. Sem acesso para outros papéis; sem financeiro.

### US-M06.03 — Bio/resumo curado pelo consultor
Como consultor, quero um resumo profissional editável que o currículo não consegue inferir sozinho.

Critérios de aceite:
- Campo(s) de texto curado (ex.: `summary`/`headline`) no perfil — **única** parte não-derivada; requer migration mínima.
- Salvo via server action no padrão existente (Zod + RBAC + `recordAuditEvent` + `revalidatePath`).
- O currículo = fatos derivados + narrativa curada.

### US-M06.04 — Snapshot versionado + PDF (histórico)
Como RH/People, quero congelar o currículo em uma versão datada, gerar o PDF e mantê-lo no histórico.

Critérios de aceite:
- **Requisito confirmado** (não opcional): ao gerar, o read-model derivado é **congelado** num snapshot persistido.
- Novo modelo (ex.: `ConsultantCurriculumSnapshot`): `consultantId`, `content` (JSON do agregado no momento),
  `pdfStorageKey` (bucket privado + signed URL, padrão `ExpenseAttachment`), `generatedByUserId`, `createdAt`
  → requer migration. **Sem campos/fluxo de assinatura** (decisão jul/2026).
- PDF: começar por **HTML imprimível → PDF** (reaproveita o padrão de HTML gerado da pré-fatura em
  `financeiro/actions.ts`, evitando nova lib de PDF).
- Histórico navegável de snapshots por consultor; **sem valores financeiros** no conteúdo/PDF.
- Geração **auditada** (`recordAuditEvent`).

**Dependências:** nenhuma rígida; consome o modelo `Consultant` e o padrão de actions existentes.
**Decididas:** público = RH/People + próprio consultor (sem versão cliente); sem valores financeiros;
snapshot versionado + PDF é requisito (US-M06.04), **sem assinatura**.
**Open questions:**
- Idioma do currículo: PT apenas ou PT/EN?
- Bio curada: livre ou com estrutura sugerida por IA (respeitando "IA sugere, humano decide")?

---

## EP-M07 — Remover Competências, PDI, Clima e Metas

**Objetivo:** reduzir o escopo do produto removendo quatro módulos do domínio Talentos &
Desenvolvimento: **Competências** (catálogo/perfis/matriz de gap), **PDI** (planos de desenvolvimento),
**Clima** (pesquisas de clima/NPS) e **Metas** (OKRs/objetivos).

**Base existente (o que sai):**
- **Competências** → rota `/app/competencias`, `actions.ts`, `lib/competencies/*`, modelos `Skill` (catálogo),
  `CompetencyProfile`, `CompetencyProfileItem`. ⚠️ **Cuidado:** "Skills" do consultor (`/app/skills`,
  `ConsultantSkill`, `SkillSuggestion`) **PERMANECE** — é tela do perfil Consultor (EP-M09). Remover
  Competências não pode derrubar a self-service de skills nem as evidências.
- **PDI** → rota `/app/pdi`, `actions.ts`, modelos `DevelopmentPlan`, `DevelopmentAction`.
- **Clima** → pesquisas: modelos `Survey`, `SurveyQuestion`, `SurveyInvitation` e rota correspondente.
- **Metas** → OKRs: modelos `Objective`, `KeyResult` e rota correspondente.

### US-M07.01 — Remover navegação e telas
Critérios de aceite:
- Remover itens de navegação (`lib/navigation.ts`) e as rotas/páginas dos quatro módulos.
- Remover permissões RBAC correspondentes da matriz e do seed (evitar rota órfã protegida).
- Remover testes específicos desses módulos; ajustar testes que dependiam deles.

### US-M07.02 — Tratar dados e schema (decisão pendente)
Critérios de aceite:
- **Decisão necessária:** os modelos são **removidos do schema** (migration de `DROP`, perde dados) ou
  apenas **desativados na UI** (schema mantido, sem perda)? Recomendo confirmar com People antes de dropar.
- Se dropar: migration reversível documentada; checar FKs (`Skill` é referenciado por `ConsultantSkill`/
  evidências — **não** pode ser dropado junto se Skills do consultor permanece).
- Se só desativar: garantir que nada na navegação/lançador aponte para as telas removidas.

**Dependências:** coordenar com EP-M06 (currículo consome skills validadas e certificados — **não** consome
Competências/PDI/Clima/Metas, então o currículo não quebra) e EP-M09 (nav do Consultor).
**Open questions:**
- Dropar tabelas (perda de dados) vs. desligar só a UI? (recomendo desligar UI primeiro, dropar depois se confirmado).
- "Skills" do consultor e "Certificados" permanecem — confirmar a fronteira exata entre "Skills" (fica) e
  "Competências" (sai), já que compartilham o catálogo `Skill`.

---

## EP-M08 — Termos de Uso com Aceite/Recusa

**Objetivo:** exibir os Termos de Uso e Política de Uso Aceitável no primeiro acesso (e a cada nova versão
relevante), exigindo **aceite** para usar a plataforma. **Recusa → desconecta** e bloqueia o acesso.

**Base existente:** conteúdo redigido em **`docs/termos-de-uso-jumpflow.md`** (rascunho para revisão
Jurídico/People — cobre não discriminação, uso responsável, confidencialidade, LGPD). Auth via Entra ID
(`apps/web/src/lib/auth/`), proteção de `/app/*` por `apps/web/src/proxy.ts`.

### US-M08.01 — Tela de Termos com Aceite/Recusa
Critérios de aceite:
- Tela dedicada com o texto dos Termos, botão **"Aceito"** e **"Não Aceito"**.
- **"Não Aceito"** → efetua logout e retorna ao `/login` (sem acesso a `/app/*`).
- **"Aceito"** → registra o aceite e libera o acesso.

### US-M08.02 — Gate de aceite e reaceite por versão
Critérios de aceite:
- Novo modelo (ex.: `TermsAcceptance`: `userId`, `termsVersion`, `acceptedAt`) → migration.
- Constante de **versão vigente** dos Termos; usuário sem aceite da versão atual é redirecionado à tela
  (gate no `proxy.ts` ou em layout de `/app`), antes de qualquer outra tela.
- Ao publicar nova versão relevante, exige **novo aceite**.
- Aceite/recusa **auditados** (`recordAuditEvent`).

**Dependências:** revisão do texto pelo Jurídico/People (bloqueia publicação, não o desenvolvimento).
**Open questions:**
- Preencher lacunas do texto (razão social/CNPJ, DPO, foro, data). Ver `docs/termos-de-uso-jumpflow.md`.
- Onde colocar o gate: `proxy.ts` (mais cedo, edge) vs. layout do `/app` (mais simples, acesso ao DB)?

---

## EP-M09 — Navegação do Perfil Consultor + JumpAcademy

**Objetivo:** restringir o que o perfil **Consultor** enxerga e renomear "Universidade" para **"JumpAcademy"**.

**Escopo do Consultor (decisão jul/2026):** apenas estas telas ficam acessíveis ao perfil Consultor:
**Feed (Home)**, **Horas**, **Despesas**, **Skills**, **JumpAcademy** (ex-Universidade), **Certificados**.

### US-M09.01 — Restringir navegação do Consultor
Critérios de aceite:
- `lib/navigation.ts` + matriz RBAC: o perfil Consultor só vê/acessa as 6 telas acima; demais rotas
  retornam 403 para esse papel (padrão de rota protegida por `x-pathname` já existente).
- **Feed como Home** do Consultor (tela inicial pós-login para esse perfil).
- Não afeta outros perfis (RH/People/Admin/Gestor mantêm seu acesso).

### US-M09.02 — Renomear Universidade → JumpAcademy
Critérios de aceite:
- Trocar a **nomenclatura de exibição** de "Universidade" para "JumpAcademy" (label de navegação, títulos, textos).
- Preferir ler o nome de configuração/constante (produto é renomeável — diretriz do CLAUDE.md); evitar
  hard-code espalhado. Rota interna pode permanecer, só o rótulo muda (avaliar impacto de mudar o path).

**Dependências:** EP-M07 (os módulos removidos saem da nav de todos os perfis) e EP-M08 (Feed é a Home,
mas o gate de Termos vem antes de qualquer tela).
**Open questions:**
- "Feed (Home)" depende de ligar a flag `NEXT_PUBLIC_FEATURE_FEED` para o Consultor — confirmar ativação.
- Renomear só o rótulo ou também a rota `/app/universidade` → `/app/jumpacademy`? (rota muda links/bookmarks).

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

| Área | EP-M05 (mídia feed) | EP-M06 (currículo) |
|------|:-------------------:|:------------------:|
| Migration Prisma | — (reusa `FeedPostAttachment`) | bio curada (US-M06.03) + `ConsultantCurriculumSnapshot` (US-M06.04) |
| Novo bucket storage | — (reusa `feed-attachments`) | privado p/ PDFs (reusa `provider.ts`) |
| Provider de IA | — | opcional (bio) |
| Novo `NotificationEvent` | — | — |
| Novas permissões RBAC | — (reusa `FEED_*`) | projeção interna vs. cliente + guarda financeira |
| Sinergia com `SkillSuggestion` | — | consome skills validadas |
| Sensibilidade LGPD | média (vídeo de pessoas) | **alta** (dados pessoais + financeiro) |
