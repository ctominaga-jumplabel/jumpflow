# Nathal.IA — Auditoria Completa (Revisão Independente)

> **Tipo:** auditoria independente (Product Design · UX · Frontend Architecture ·
> Character Design · Technical Lead). **Não** houve alteração de código, commits
> ou branches. Este documento é o **único** artefato produzido.
>
> **Data:** 2026-06-17 · **Fase auditada:** 8.2 (Visual Parity & Placement),
> sobre a Fase 8 (Intelligence Layer) e 7/7.1 (Artistic Refinement + Framing).
>
> **Referência visual oficial:** [`Avatar_NathIA.png`](./Avatar_NathIA.png).
>
> **Método:** leitura da documentação (`docs/nathalia/`), do código do pacote
> (`packages/character-nathalia/`), da integração no app (`apps/web`), dos ativos
> 3D (`*.glb`/`*.blend`) e da imagem de referência **+ validação ao vivo** (Etapa
> 4 executada de fato): app rodando em `localhost:3100`, login dev, Playwright/
> Chrome percorrendo as 7 rotas com **screenshots** e medições de geometria. As
> evidências estão em [`audit-screenshots/`](./audit-screenshots/) (ver índice e
> achados no `README.md` de lá). As verificações de qualidade
> (`typecheck`/`lint`/`build`/`986 testes`) são as reportadas pela equipe.
>
> 🔴 **A validação ao vivo encontrou um bug crítico não detectado pelos testes: a
> Nathal.IA está invisível na viewport em todas as telas.** Ver §4-live e §7.

---

## 1. Resumo Executivo

### O que é a Nathal.IA

Uma **assistente virtual contextual** do JumpFlow, personagem original inspirada
na simpatia da Nathalia (assistente administrativa de horas da Jump). O objetivo
declarado é **reduzir atrito operacional**: orientar lançamento de horas,
aprovações, projetos e relatórios, respondendo "como faço X?" com passo a passo.

### Capacidades que **possui** hoje

| Camada | Estado | Evidência |
| --- | --- | --- |
| **Fundação de software** | ✅ Madura | Pacote `@jumpflow/character-nathalia`, store imperativo, Context Engine, RBAC, fallback 2D garantido |
| **Avatar 2D (CSS/SVG)** | ✅ Padrão de runtime | `NathaliaAvatar2D.tsx` — SSR-safe, dependency-free, reduced-motion, 9 expressões |
| **Avatar 3D (R3F/WebGL)** | ⚠️ Opt-in por flag | `master_v2_preview.glb` (~260 KB), lazy, `NEXT_PUBLIC_ENABLE_NATHALIA_3D` **off por padrão** |
| **Inteligência local (sem LLM)** | ✅ Funcional, determinística | `NathaliaBrain`: intent → FAQ/knowledge → tool → fallback honesto |
| **Conhecimento curado** | ⚠️ Pequeno | **14 entradas de FAQ** + **16 documentos** de conhecimento |
| **Ferramentas (tools)** | ✅ Seguras (navegação/tour/UI) | 8 tools, **nenhuma de escrita**, todas via RBAC |
| **RBAC** | ✅ Sólida e conservadora | `nathaliaPermissions.ts`: gate por contexto, tópico e ação |
| **Placement/visibilidade** | 🔴 **Quebrado em runtime** | Portal/`z-[9999]` no código, mas o widget renderiza **fora da viewport** (classes de inset não compilam) — **invisível em todas as telas**. Ver §4-live |
| **Proatividade** | ⚠️ Quase dormente | Engine com 4 gatilhos; **só `first-visit` está ligado no app** |

### Capacidades que **ainda não possui**

- ❌ **LLM generativo** — não há nenhuma chamada a OpenAI/Anthropic/etc. (por design, Fase 9 pendente).
- ❌ **Dados reais** — não consulta pendências, status ou valores; "tenho horas pendentes?" é respondido com um disclaimer honesto.
- ❌ **Memória** — sem persistência de conversa (sessão ou entre sessões).
- ❌ **Telemetria/analytics** — não há instrumentação de uso (aberturas, perguntas, perguntas sem resposta, cliques).
- ❌ **Ações de escrita** — não lança, envia nem aprova nada.
- ❌ **Paridade visual com a referência** — o que a maioria vê (2D SVG) é uma aproximação afetiva; o 3D é blocado e está desligado por padrão.

### Maturidade

**Fundação de produto/engenharia: excelente. Produto "assistente inteligente":
prototipal.** A arquitetura, o RBAC, a performance (lazy, three fora do bundle
inicial) e a disciplina de testes estão em nível de produção. A *promessa* da
personagem ("Sua assistente inteligente", "antecipo necessidades") está **à
frente** da entrega atual (FAQ curada e determinística, sem dados nem
proatividade efetiva). O maior risco não é técnico — é de **expectativa**.

---

## 2. Avaliação Visual

### A referência (`Avatar_NathIA.png`)

Render premium estilo **Pixar/Disney corporativo**: jovem com cabelo longo
ondulado castanho-escuro, **olhos grandes expressivos** (íris castanha, cílios,
catchlight), sobrancelhas definidas, sorriso caloroso, bochechas levemente
rosadas, pele quente. Veste **camiseta preta com o chevron laranja da jumpflow**
e calça clara, segurando um tablet com atalhos (Horas, Projetos, Aprovações,
Relatórios). A folha inclui traços de personalidade (Pró-ativa, Organizada,
Atenciosa, Especialista), cards de capacidade, uma fileira de **expressões** e
badges circulares "Sempre com você" (rosto + ombros sobre discos pastel).

**O que a torna atraente:** rosto protagonista e altamente expressivo; calor +
profissionalismo; identidade de marca clara (preto + chevron laranja);
enquadramento de busto que lê bem em círculo pequeno.

**Elementos obrigatórios a preservar:** (1) olhos grandes com cílios e
catchlight; (2) cabelo longo escuro emoldurando o rosto; (3) camiseta preta com
chevron laranja; (4) micro-sorriso acolhedor de repouso; (5) enquadramento
rosto+ombros+tronco no widget; (6) discos pastel por estado.

### O avatar real

**Veredito: parcialmente alinhado — alinhado em *direção*, distante em *plástica*.**

- **2D SVG (o que o usuário realmente vê):** o redesign da Fase 8.2 acerta os
  marcadores de marca — olhos grandes com cílios+catchlight, sobrancelhas,
  cabelo espresso, chevron laranja na camiseta preta, disco por estado, blush em
  estados positivos. É uma **aproximação vetorial afetiva e legível em ~80px**,
  mas é assumidamente estilizada-plana, **não** o render da referência.
- **3D (`master_v2_preview.glb`):** a própria [`ARTISTIC_REVIEW.md`](./ARTISTIC_REVIEW.md)
  é honesta — base **low-poly paramétrica por primitivas**, "boneco de blocos".
  A v2 resolveu o crítico (rosto em branco, silhueta fraca), mas permanece um gap
  **médio de escultura**: rosto esquemático (íris-disco, sobrancelha-barra),
  junção ombro→braço destacada, tronco cilíndrico, mãos sem dedos. Otimizado para
  web (~260 KB / ~11k tris), longe do render Pixar da referência.

**Conclusão:** proporção, paleta, vestuário e silhueta **batem** com o canon. A
distância para a referência é de **qualidade de forma/render**, agravada por dois
fatos: (a) o **3D está desligado por padrão**, então o usuário vê o 2D; (b) o 2D
é uma representação simplificada, não o render. A "presença Pixar" da imagem de
referência **ainda não existe no produto rodando**.

---

## 3. Avaliação de UX

> ⚠️ **Releitura obrigatória após §4-live:** os pontos fortes de UX abaixo são do
> **design pretendido** e valem assim que o bug de visibilidade (§4-live) for
> corrigido. **Hoje, em runtime, a descoberta é nula** — o launcher não aparece
> na viewport, então o usuário **não vê** a Nathal.IA para clicar.

**Pontos fortes (por design, válidos pós-correção):**

- **Descoberta:** launcher ~88px com avatar de rosto protagonista, anel/halo de
  intenção, portal em `z-[9999]`. **No código** aparece em todas as telas; **em
  runtime está invisível** (§4-live). Quando corrigido, um usuário novo
  **clicaria** nela.
- **Contexto por tela:** boas-vindas nominal + contexto ("Olá, Ana! Vejo que
  você está em Horas…"), sugestões rápidas alinhadas à tarefa e filtradas por
  RBAC (acesso à tela **e** `canExecuteAction` por chip).
- **Painel robusto:** `useNathaliaPanelLayout` resolve tamanho/ancoragem por
  viewport (corner/sheet), garantindo que **nunca** abre fora da tela — bloqueio
  de usabilidade duro eliminado.
- **Legibilidade:** copy curta, passos em bullets, `prefers-reduced-motion`
  respeitado, follow-ups dinâmicos.

**Pontos fracos:**

- **Percepção de utilidade vs. promessa:** o usuário entende *que* ela ajuda, mas
  ao perguntar algo concreto ("tenho horas pendentes?") recebe um disclaimer.
  Risco de **"experimentou uma vez, não voltou"**.
- **Inteligência aparente:** `sendMessage` responde **instantaneamente** (sem
  beat de "pensando" perceptível) — paradoxalmente reduz a sensação de
  processamento/inteligência.
- **Proatividade rasa:** só o nudge de `first-visit` dispara; os gatilhos por
  tela/perdido/tour existem mas **não estão conectados** ao host.
- **Sem onboarding ativo:** os tours existem mas dependem do usuário pedir.

**Respostas diretas:** *Clicaria nela?* Sim — presença e descoberta são boas.
*Entenderia a utilidade?* Parcialmente — entende o papel, mas a entrega curada
pode frustrar quem espera respostas com dados. *Parece parte natural do produto?*
Sim, visual e de placement; menos no "cérebro", que ainda é genérico.

---

## 4. Avaliação Técnica

**Arquitetura — excelente.** Separação limpa: cérebro puro/SSR-safe
(`intelligence/`, sem React/`window`/`three`), camada React consumidora, store
externo compatível com `useSyncExternalStore` (sem nova dependência). O seam para
LLM está claro (`KnowledgeProvider`, `IntentEngine`) sem nada depender dele.

**Performance — forte.** `NathaliaMount` é `dynamic(ssr:false)`; three.js só em
`NathaliaCanvas`/`NathaliaModel`, alcançado por `import()` dinâmico → **fora do
bundle inicial**. 2D leve por padrão; 3D opt-in e com error boundary que garante
fallback. `prefers-reduced-motion` respeitado.

**Placement (Fase 8.2) — bem resolvido.** Causa-raiz correta: `position:fixed`
preso a containers com `transform/overflow`. Solução via portal em
`document.body` (`NathaliaRoot`) com host zero-size e `pointer-events:none`, sem
bloquear cliques, mantendo o provider fora do portal (context flui). Correto.

**RBAC — sólida e conservadora.** Gate único (`canAccessContext`/`canAnswerTopic`/
`canExecuteAction`); tópicos sensíveis (finance/approvals/settings) filtrados na
busca e na navegação; ações sensíveis **bloqueadas na origem**. Boa postura.

**Pontos de atenção técnicos:**

- O gating de UI **não** é fronteira de segurança — quando a Fase 9 ligar dados/
  tools reais, a autorização **tem** de ser revalidada no servidor (o próprio
  README já alerta). Hoje é seguro porque não há escrita nem dados.
- Binários `.glb`/`.blend` versionados localmente são gitignored; a estratégia de
  storage (LFS/CDN) para runtime ainda precisa ser definida antes de escalar.
- A promoção de `master_preview.glb` → `master.glb` de runtime depende de Blender
  + checklist de aceite (ADR-010), ainda pendente.

---

## 4-live. Validação ao Vivo (Etapa 4 — executada)

App rodando (`localhost:3100`), login dev (Ana Martins, todos os papéis), modo
**2D padrão** (3D off — o que a maioria vê). Percorri as 7 rotas com Playwright/
Chrome (1440×900), com screenshots em [`audit-screenshots/`](./audit-screenshots/).

**O que funcionou:** todas as 7 rotas responderam **200** e renderizaram bem —
login polido (sem Nathal.IA, correto), home operacional, horas, projetos,
aprovações, relatórios e o **Nathal.IA Lab** (que renderiza o avatar 2D inline e
todos os controles de estado/contexto/cérebro/proativo/posicionamento).

### 🔴 Achado crítico: Nathal.IA invisível na viewport (todas as telas)

O widget flutuante **existe no DOM em todas as rotas** (`launcherCount=1`), mas
**não aparece na viewport**. Medições com `getBoundingClientRect` (scroll 0):

| Rota | Altura do doc | Y do launcher | Na viewport? |
| --- | --- | --- | --- |
| `/app` | 900px | **900px** | ❌ |
| `/app/horas` | 1493px | **1493px** | ❌ |
| `/app/relatorios` | 3359px | **3359px** | ❌ |

O `y` do launcher **é exatamente a altura do documento** em toda tela, **sem
nenhum ancestral** com `transform/filter/will-change/contain`. Estilo computado do
container: `position: fixed` porém `top: 1493px; bottom: -685px; right: 818.9px;
left: 0` — ou seja, **sem `inset` efetivo**.

**Causa-raiz:** as classes Tailwind arbitrárias do `NathaliaWidget`
`[bottom:max(1rem,env(safe-area-inset-bottom))]` e `[right:max(1rem,env(safe-area-inset-right))]`
**não geram CSS** no build atual (provável incompatibilidade de `env()` aninhado
em `max()` dentro de propriedade arbitrária). Sem inset, o elemento `fixed` cai na
sua **posição estática** (fim do `body`, onde o portal o injeta) → rodapé do
documento, fora da viewport. Confirmado visualmente: `V1-horas-closed-viewport.png`
e `V2-horas-panel-open-viewport.png` são **idênticos** — abrir o painel não muda
nada na tela; só o **tour** pinta (`11-panel-after-question.png`), porque usa
posicionamento próprio.

**Por que escapou:** é uma classe utilitária que **silenciosamente não compila** —
`typecheck`/`lint`/`test`/`build` passam; nenhum teste afirma "o launcher está
dentro da viewport". A Fase 8.2 (portal em `document.body` + `z-[9999]`) **está
presente no código**, mas a fixação na viewport depende dessas classes que não
surtem efeito. O componente do avatar **funciona** (aparece inline no Lab e no
tour) — o defeito é **exclusivamente de posicionamento do widget**.

**Correção provável (uma linha de CSS):** trocar as classes arbitrárias por
`fixed bottom-4 right-4 sm:bottom-6 sm:right-6` (+ `style` com `env(safe-area-*)`
se quiser o inset seguro) — ou aplicar o inset via `style={{ bottom: 'max(1rem, env(...))' }}`.
**Recomendo revalidar ao vivo após a correção.**

> Implicação para a auditoria: toda a avaliação de "presença/descoberta" da §3 e
> a nota de UX assumem o widget **visível**. Hoje, na prática, **o usuário não vê
> a Nathal.IA** — o que rebaixa a maturidade real até a correção (refletido na §9).

---

## 5. Avaliação da Inteligência

**Arquitetura do cérebro (`NathaliaBrain.ask`)** — `intent → (navegação/tour ⇒
tool) | (FAQ ⇒ knowledge ⇒ fallback honesto)`, derivando estado/acessório/clipe.
Determinístico, RBAC em cada ramo. Desenho limpo e extensível.

| Camada | Estado | Observação |
| --- | --- | --- |
| **Knowledge Layer** | ✅ Bom desenho, ⚠️ pequeno | 16 docs curados com `roles`; busca por palavras-chave (tokenização pt-BR). Seam p/ embeddings pronto. |
| **FAQ Engine** | ✅ Bom, ⚠️ cobertura baixa | **14 entradas** (hours 5, projects 3, reports 3, approvals 2, settings 1) + variações. Alta precisão, baixa abrangência. |
| **Intent Engine** | ✅ Sólido p/ regras | 7 intents, triggers normalizados, confiança heurística. Frágil a fraseado fora do padrão (esperado sem LLM). |
| **Context Awareness** | ✅ Bom | Mensagem/capacidades/perguntas por tela. |
| **Tool Registry** | ✅ Seguro | 8 tools (navegação/tour/UI), **zero escrita**, `canRun`→`canExecuteAction`. |
| **Proactive Engine** | ⚠️ Subutilizado | 4 gatilhos no engine, **só `first-visit` ligado** no `NathaliaProvider`. Os demais são código morto na prática. |
| **Visual Intelligence** | ✅ Bom | Intenção → estado → acessório → clipe. |

**O que está excelente:** segurança/RBAC, ausência total de invenção de dados
(fallback honesto), arquitetura preparada para LLM sem acoplamento.

**O que está bom:** FAQ/knowledge de alta precisão dentro do que cobre; intents
determinísticos; visual intelligence.

**O que falta:** (1) **dados reais read-only** — o maior salto de valor; (2)
**cobertura** de conhecimento e um loop de captura de perguntas sem resposta; (3)
**proatividade efetiva** (ligar os 3 gatilhos dormentes + nudges por prazo); (4)
**memória**; (5) **telemetria** para saber o que perguntam e o que falha; (6) o
beat de "pensando" para inteligência *parecer* inteligência.

---

## 6. Comparação com `Avatar_NathIA.png`

| Dimensão | Referência | Produto rodando (2D padrão) | 3D (flag on) | Veredito |
| --- | --- | --- | --- | --- |
| Estilo | Render Pixar premium | SVG estilizado-plano | Low-poly blocado | ⚠️ Distante em render |
| Rosto/olhos | Grandes, cílios, catchlight | ✅ Grandes + cílios + catchlight | ⚠️ Íris-disco esquemática | 2D ok / 3D esquemático |
| Cabelo | Longo ondulado espresso | ✅ Espresso, mechas frontais | ✅ Silhueta forte | ✅ Alinhado |
| Camiseta/marca | Preta + chevron laranja | ✅ Chevron laranja | ✅ Wordmark/chevron | ✅ Alinhado |
| Enquadramento | Busto (rosto+ombros) | ✅ Crop bubble fechado | ✅ Câmera bubble | ✅ Alinhado |
| Disco por estado | Pastel "Sempre com você" | ✅ `accent.chip` por estado | ✅ wrapper colorido | ✅ Alinhado |
| Expressões | Fileira rica | ✅ 9 expressões 2D | ✅ 10 shape keys | ✅ Bom |
| **Presença geral** | **Render encantador** | **Simpático, plano** | **Reconhecível, blocado** | **⚠️ Gap de "magia"** |

**Síntese:** o produto **honra a direção** (cor, marca, silhueta, enquadramento,
expressões) mas **não entrega a presença premium** da referência. A imagem vende
um personagem Pixar; o app entrega um avatar simpático estilizado. Para a maioria
dos usuários (3D off), a distância é maior ainda. Fechar esse gap é **trabalho de
arte** (refino do 2D e/ou produção de um GLB esculpido), não de engenharia.

---

## 7. Gaps Identificados

### 🔴 CRÍTICO

- **[UX/Visual] Nathal.IA invisível na viewport em todas as telas** (§4-live).
  Bug de runtime: classes de inset (`[bottom:max(1rem,env(...))]`) não compilam, o
  `fixed` cai no rodapé do documento. **Bloqueia o produto inteiro** — sem isso,
  nada do resto importa para o usuário. **Correção provável de 1 linha + revalidar.**
- **[Produto] Gap promessa × entrega.** "Assistente inteligente / pró-ativa" vs.
  FAQ curada sem dados nem proatividade. Risco de churn de primeira impressão.
- **[Produto] Zero telemetria.** Impossível medir adoção, perguntas sem resposta
  ou valor — decisões de roadmap são às cegas. (Teria flagrado o bug acima:
  "0 aberturas do painel em produção" é um sintoma gritante.)

### 🟠 ALTO

- **[Inteligência] Sem dados reais read-only.** "Tenho horas pendentes?" é o caso
  de uso mais óbvio e hoje é respondido com disclaimer.
- **[Visual] Presença distante da referência** + **3D off por padrão** → a maioria
  vê o 2D plano. Decidir a direção (investir no 2D? produzir GLB esculpido?).
- **[UX] Proatividade dormente.** 3 de 4 gatilhos não ligados; sem nudges por
  prazo de horas/reprovação (os casos que gerariam valor real).

### 🟡 MÉDIO

- **[Inteligência] Cobertura curada baixa** (14 FAQ / 16 docs) sem loop de
  captura de lacunas.
- **[UX] Resposta instantânea** reduz a sensação de inteligência (falta beat de "pensando").
- **[Inteligência] Sem memória** de conversa.
- **[Visual] 3D: junções ombro→braço, rosto esquemático, mãos sem dedos** (já mapeado em `ARTISTIC_REVIEW`).

### 🟢 BAIXO

- **[Técnico] Estratégia de storage** de `.glb` (LFS/CDN) e promoção a `master.glb`.
- **[Visual] AO sob o queixo** nas thumbnails offline (cosmético).
- **[Performance] Já saudável** — manter três fora do bundle ao evoluir.
- **[UX] Acessibilidade/i18n** — externalizar copy, revisar leitores de tela/foco.

---

## 8. Roadmap Recomendado (10 fases, ordenado por impacto)

> Premissa: **LLM não é o próximo passo.** Primeiro **consertar o que está
> quebrado**, depois medir e dar valor real e seguro; só então IA generativa.

0. **🔴 Corrigir a visibilidade do widget (HOTFIX).** Trocar as classes de inset
   que não compilam por utilitários válidos (`bottom-4 right-4 sm:bottom-6
   sm:right-6` + inset seguro via `style`) e **revalidar ao vivo** com os
   screenshots desta auditoria. **Pré-requisito de tudo** — hoje o produto é
   invisível. — *Esforço trivial, impacto bloqueante.*
1. **Telemetria & Analytics (medir antes de construir).** Instrumentar aberturas,
   perguntas, intents, *perguntas sem resposta*, cliques em sugestões, uso de
   tours. Sem isso, todo o resto é palpite. — *Esforço baixo, impacto altíssimo.*
2. **Validação ao vivo + User Testing.** Passada manual real nas 7 telas + 5–8
   sessões com consultores/gestores reais. Valida descoberta, utilidade e o gap
   promessa×entrega. — *Esforço baixo, impacto alto.*
3. **Dados reais read-only (RBAC-first).** Pendências de horas/aprovações por
   perfil; transformar "tenho horas pendentes?" em resposta de verdade. **Sem
   escrita.** Maior salto de valor percebido. — *Esforço médio, impacto altíssimo.*
4. **Proatividade efetiva.** Ligar `first-screen-visit`/`user-lost`/`tour-available`
   + nudges por prazo de horas e por reprovação, com controle de frequência. —
   *Esforço médio, impacto alto.*
5. **Expansão do conhecimento + loop de lacunas.** Ampliar FAQ/knowledge guiado
   pelas perguntas sem resposta capturadas na fase 1. — *Esforço médio, impacto alto.*
6. **Decisão e investimento de arte visual.** Refinar o **2D** (o que os usuários
   veem) para mais perto da referência e/ou produzir GLB esculpido + promover a
   `master.glb`; decidir 2D-first vs 3D-on. — *Esforço médio-alto, impacto médio-alto.*
7. **Polimento de "inteligência percebida".** Beat de "pensando", microcopy de
   transição, melhor tratamento de não-entendido com sugestão de reformulação. —
   *Esforço baixo, impacto médio.*
8. **Tools reais com confirmação (write seguro).** Ex.: "criar rascunho de
   horas", "enviar período" — sempre via `canExecuteAction` + confirmação
   explícita + auditoria + revalidação no servidor. — *Esforço médio-alto, impacto alto.*
9. **Memória de conversa.** Sessão (curto prazo) e, depois, preferências/contexto
   entre sessões. — *Esforço médio, impacto médio.*
10. **LLM generativo (Fase 9) + acessibilidade/i18n.** Rota server, tools sob
    RBAC, RAG sobre o knowledge existente — **só depois** de dados, telemetria e
    KB justificarem; fechar com a11y/i18n. — *Esforço alto, impacto alto (mas tardio).*

---

## 9. Nota Geral

### **5.5 / 10** — *(8.5 do design/arquitetura, penalizado pelo runtime quebrado)*

> A nota caiu de uma leitura "só código" (~6.5) para **5.5** porque a validação ao
> vivo mostrou que **o usuário não vê a Nathal.IA hoje** (§4-live). A boa notícia:
> é um bug de runtime de correção trivial — pós-hotfix + revalidação, a nota
> realista volta a ~6.5.

| Dimensão | Nota | Comentário |
| --- | --- | --- |
| Arquitetura & Código | **9.0** | Limpo, puro/SSR-safe, seam para LLM, store sem deps |
| Performance | **8.5** | Lazy, three fora do bundle, fallback garantido |
| Segurança / RBAC | **8.5** | Conservadora e correta para a fase (revalidar no servidor na Fase 9) |
| UX / Placement | **3.5** | Design forte, mas **invisível em runtime** (§4-live) — descoberta zero hoje |
| Inteligência | **5.5** | Boa arquitetura, baixa cobertura, sem dados/memória/telemetria |
| Visual vs. referência | **5.0** | Direção fiel; presença premium ausente; 3D off por padrão |
| Maturidade de produto | **4.0** | Fundação sólida; mas o que roda hoje não é utilizável (widget oculto); sem métricas |

**Leitura final:** a Nathal.IA é uma **fundação de engenharia excelente cujo
produto, em runtime, está hoje inutilizável por um bug de CSS** — o widget não
aparece. O time construiu o difícil (arquitetura, RBAC, performance, fallback,
inteligência local) com rigor incomum, mas faltou o **fechamento empírico**: um
teste/checagem que afirme "o launcher está dentro da viewport". O caminho é
direto: **(0) hotfix de visibilidade + revalidar**; depois **(1) telemetria** (que
teria gritado "0 aberturas") e **(2) teste com usuários reais**; só então dados
reais, proatividade e — bem mais tarde — LLM. **A lição central: testes verdes
não provam que o usuário vê o produto. Validação ao vivo é parte do "done".**

---

*Auditoria somente-leitura. Nenhuma funcionalidade, arquivo de código, commit ou
branch foi alterado na produção deste relatório.*
