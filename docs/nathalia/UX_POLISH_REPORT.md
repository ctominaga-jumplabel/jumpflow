# Nathal.IA — Relatório de Polimento de UX (Fase 8.1)

Fase focada **exclusivamente em UX, legibilidade, percepção de valor e adoção**.
Sem alterar RBAC, Intelligence Layer, LLM, Tool Calling ou a arquitetura
existente. Fallback 2D, 3D, camada de inteligência e SSR permanecem intactos.

## Antes → Depois

### 1. Posicionamento do painel

- **Antes**: painel com altura fixa (`h-[32rem]`, `max-h-[80vh]`) e largura
  `22rem`. Em telas menores ou com zoom, o topo saía da viewport e o usuário
  precisava reduzir o zoom do navegador.
- **Depois**: tamanho/ancoragem resolvidos por viewport
  (`resolveNathaliaPanelLayout` + `useNathaliaPanelLayout`), recalculados em
  `resize`/`orientationchange`. Ancoragem `corner` em telas folgadas e `sheet`
  quase cheia em telas estreitas/baixas. **Garantia testada**: nunca ultrapassa
  nenhuma borda. → `UX_POSITIONING.md`

### 2. Tamanho do painel

- **Antes**: ~`352 × 512px` fixos.
- **Depois**: `560 × 480px` no desktop (dentro das faixas pedidas 520–600 /
  420–520), responsivo, encolhendo apenas o necessário; folha quase cheia no
  mobile. Mais espaço para headline + sugestões + conversa sem scroll
  desnecessário.

### 3. Presença do avatar

- **Antes**: launcher `64px`, sem anel; cabeçalho `44px`.
- **Depois**: launcher `72px` com anel de intenção e halo de atenção (quando há
  nudge); cabeçalho `52px` com pop de entrada. Mais presença, sem inflar a área.
  → `AVATAR_PRESENCE.md`

### 4. Boas-vindas

- **Antes**: "Oi! Sou a Nathal.IA. Posso te ajudar a navegar pelo JumpFlow."
- **Depois**: "Olá, Ana! Vejo que você está em Horas. Posso ajudar com
  lançamentos, status ou envio dos apontamentos." — nome + contexto da tela.
  → `WELCOME_STRATEGY.md`

### 5. Sugestões rápidas

- **Antes**: contextuais, porém pouco alinhadas às tarefas e às vezes oferecendo
  ações bloqueadas.
- **Depois**: conjuntos por contexto alinhados às tarefas (Home, Horas,
  Projetos, Aprovações, Relatórios) + filtro RBAC duplo (acesso à tela **e**
  `canExecuteAction` por chip). → `CONTEXTUAL_ACTIONS.md`

### 6. Feedback visual

- **Antes**: apenas a transição de abertura do painel.
- **Depois**: pop de entrada do avatar, halo de atenção no launcher e destaque
  do headline ao mudar de contexto (keyed por contexto). Tudo respeitando
  `prefers-reduced-motion`.

### 7. Fluxo de conversa

- **Antes**: respostas longas em parágrafo único.
- **Depois**: copy mais curta e humana; passos/status em bullets (`•`) com
  `white-space: pre-line`, mais fáceis de escanear.

### 8. Nathal.IA Lab

- **Antes**: estados, contexto, intents, cérebro e proativo.
- **Depois**: + seção **Posicionamento do painel** que resolve o layout para
  presets de viewport (pequena, paisagem curta, média, grande, ultrawide) e um
  botão para abrir o painel ao vivo.

## Impacto esperado

- **Painel nunca sai da tela** → fim do "reduza o zoom"; remoção de um bloqueio
  duro de usabilidade.
- **Avatar com presença forte** → descoberta imediata da assistente.
- **Mensagens e sugestões contextuais** → percepção de utilidade e relevância
  desde o primeiro segundo.
- **Conversa mais legível** → menor esforço de leitura, mais ações concluídas.
- Resultado: Nathal.IA parece uma assistente **nativa** do JumpFlow, pronta para
  validação com usuários.

## Qualidade (Etapa 10)

| Verificação        | Resultado            |
| ------------------ | -------------------- |
| `npm run typecheck`| ✅ passou             |
| `npm run lint`     | ✅ passou             |
| `npm test`         | ✅ 982 testes (92 arq.) |
| `npm run build`    | ✅ build concluído    |

Garantias preservadas: fallback 2D intacto, 3D intacto (opt-in por flag),
Intelligence Layer intacta, SSR intacto (painel client-only com default de SSR
estável). Nenhum LLM foi introduzido nesta fase.

---

## Adendo — Fase 8.2 (Visual Parity & Placement)

Após validação local da Fase 8.1, problemas remanescentes de **visibilidade e
posicionamento** foram corrigidos (sem alterar RBAC/Intelligence/LLM):

| Problema (8.1 → validação) | Correção (8.2) |
| --- | --- |
| Avatar não aparecia em várias telas | Portal em `document.body` (`NathaliaRoot`) — escapa de containers com `transform`/`overflow` que prendiam o `fixed` |
| Launcher pequeno demais | Bubble ~88px (avatar 80px, ~90% do círculo) |
| Painel parcialmente fora da viewport | Mesmo cálculo seguro de 8.1, agora numa camada `z-[9999]` portada (sem ancestral recortando) |
| Distante da referência `Avatar_NathIA.png` | Crop `bubble` mais fechado + redesign do 2D (olhos/cílios, cabelo, chevron laranja, disco por estado) |
| Cards/tabelas cobriam a Nathal | Camada dedicada `z-[9999]` acima de toda a chrome do app |

Detalhes técnicos em
[`REACT_THREE_FIBER_INTEGRATION.md`](./REACT_THREE_FIBER_INTEGRATION.md) §11 e o
comparativo completo em [`VISUAL_PARITY_REPORT.md`](./VISUAL_PARITY_REPORT.md).
