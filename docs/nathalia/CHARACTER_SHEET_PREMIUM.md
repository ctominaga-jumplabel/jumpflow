# Nathal.IA — Character Sheet Premium

> **Folha visual definitiva** da Nathal.IA. Fonte de verdade para Blender,
> rigging, shape keys, animação, React Three Fiber, geração por IA e produção de
> novos modelos. Qualquer artista, ferramenta ou pipeline deve conseguir recriar
> a personagem **com consistência visual e técnica usando apenas este documento**
> e seus anexos, sem conhecimento externo.
>
> Hierarquia de canon: [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md) (personalidade
> e direção) **vence**; esta folha detalha e mede a direção visual; o
> [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md) é o contrato técnico do
> `master.glb`. Em conflito numérico, vale o que estiver **mais específico** aqui
> e for tecnicamente compatível com o GLB Requirements.
>
> Referência de likeness: **`nathalia_tripo_v02.glb`** (aprovado como referência
> visual — ver [`CHARACTER_REVIEW.md`](./CHARACTER_REVIEW.md)).
>
> Última atualização: **2026-06-16**.

---

## Resumo em uma frase

Mulher jovem-adulta estilizada, **4,5 cabeças de altura**, cabelo longo escuro
com franja suave, camiseta preta com o wordmark **jump** branco, calça escura
casual e tênis claros — amigável, profissional, legível em 40 px, no registro
"Pixar/Notion/Duolingo-like com identidade própria". Nunca hiper-realista, anime,
Disney-princesa ou retrato de pessoa real.

---

## VISTAS (turnaround)

Todas em **fundo neutro**, **iluminação plana e uniforme**, **sem sombras
dramáticas**, personagem **centralizada**, **escala idêntica** entre vistas e na
**pose-base** (A-Pose leve, ver §Pose-base). Câmera ortográfica ou tele (sem
distorção de perspectiva). Personagem olhando para a câmera nas vistas frontais.

### 1. Front View (frontal — 0°)

- **Enquadramento:** corpo inteiro, dos pés ao topo do cabelo, centralizado.
- **Cabeça/rosto:** olhar direto para a câmera, **sorriso de repouso** leve
  (cantos da boca sutilmente para cima), olhos abertos e atentos, franja
  cobrindo a testa de forma suave e assimétrica leve.
- **Cabelo:** emoldura o rosto, desce pelos lados até abaixo dos ombros; volume
  controlado, silhueta limpa.
- **Tronco:** camiseta preta, **wordmark `jump` branco centralizado no peito**,
  caimento natural (não justo, não largo).
- **Braços:** afastados ~30° do corpo (A-Pose leve), mãos relaxadas, dedos
  levemente abertos, palmas voltadas para o corpo/levemente à frente.
- **Pernas/pés:** calça escura casual, pés **paralelos** apoiados no chão, tênis
  claros visíveis por inteiro.
- **Uso:** silhueta-mestre, proporções, simetria, rosto, posição do logo.

### 2. Back View (traseira — 180°)

- **Enquadramento:** corpo inteiro de costas, mesma escala da frontal.
- **Cabeça/cabelo:** **principal foco** — comprimento total do cabelo, como cai
  nas costas, divisão/coroa, ausência de elementos presos (sem rabo de cavalo no
  canon-base).
- **Tronco:** **costas da camiseta lisas** (sem estampa nas costas no MVP; área
  livre para versões futuras). Costura de ombro e gola visíveis.
- **Braços/mãos:** mesma A-Pose; dorso das mãos visível.
- **Pernas/pés:** traseira da calça, solado/calcanhar do tênis.
- **Uso:** modelar nuca/costas do cabelo, caimento traseiro da roupa, calcanhar.

### 3. Left Side (lateral esquerda — 90°)

- **Enquadramento:** perfil completo, mesma escala.
- **Cabeça/rosto:** perfil do nariz, queixo e franja; **orelha parcialmente
  coberta** pelo cabelo.
- **Cabelo:** **volume lateral e profundidade** — quanto o cabelo projeta atrás
  da cabeça e desce no ombro.
- **Postura:** leve curvatura natural da coluna (não rígida), peito aberto,
  ombros relaxados — postura confiante e acolhedora, **nunca encurvada**.
- **Braço:** o braço esquerdo mostra o afastamento de ~30° em profundidade.
- **Pés:** comprimento do tênis e arco.
- **Uso:** volume do cabelo, postura, profundidade do tronco.

### 4. Right Side (lateral direita — 90°)

- **Idêntica à esquerda, espelhada.** Serve de **checagem de simetria**.
- A personagem é **simétrica** salvo a leve assimetria intencional da franja
  (que pode cair um pouco mais para um lado). Nenhum outro elemento assimétrico.
- **Uso:** validar simetria, conferir que cabelo/roupa/tênis batem dos dois lados.

### 5. 3/4 View (três-quartos — ~45°, pose "hero")

- **Enquadramento:** corpo inteiro ou 3/4 (joelho para cima) em ~45° entre
  frontal e lateral, **olhando para a câmera**.
- **Expressão:** **sorriso aberto simpático** (a expressão "hero" / marketing).
- **Pose:** pode sair da A-Pose neutra para uma **pose de boas-vindas leve** —
  uma mão num gesto de "oi" ou aberta apresentando, peso levemente deslocado.
- **Uso:** leitura geral da personagem, key art, thumbnail, primeira impressão.
  É a vista que melhor "vende" a Nathal.IA.

> **Folha de turnaround (entregável):** as 5 vistas + closes na mesma régua de
> altura. Arquivos previstos em
> [`CHARACTER_SHEET_SPEC.md`](./CHARACTER_SHEET_SPEC.md) §8 (não versionados se
> pesados — D-004).

---

## PROPORÇÕES

Sistema de medida: **HU = "head unit"** = altura de 1 cabeça (topo do crânio ao
queixo). Canon mensurável (resolve a fragilidade apontada no
[`CHARACTER_REVIEW.md`](./CHARACTER_REVIEW.md)):

| Medida | Valor (HU) | Valor métrico (alvo) | Observação |
| --- | --- | --- | --- |
| **Altura total** | **4,5 HU** | **1,60 m** | base no chão a topo do cabelo. Estilizado compacto. |
| **Cabeça** (crânio→queixo) | **1,0 HU** | **~0,355 m** | levemente maior que o realista (apelo de simpatia). |
| **Cabeça + cabelo** (silhueta) | ~1,25 HU | ~0,44 m | volume do cabelo soma à silhueta, não ao crânio. |
| **Largura dos ombros** | **1,5 HU** | ~0,53 m | ombros estreitos-médios, não masculinos. |
| **Comprimento do braço** (ombro→ponta do dedo) | **1,8 HU** | ~0,64 m | proporcional, levemente curto (estilizado). |
| ↳ ombro→cotovelo | ~0,8 HU | — | — |
| ↳ cotovelo→pulso | ~0,7 HU | — | — |
| **Mão** (pulso→ponta) | **0,4 HU** | ~0,14 m | **maior que o realista** para leitura de gestos. |
| **Tronco** (ombro→quadril) | ~1,3 HU | — | compacto. |
| **Pernas** (quadril→chão) | **2,0 HU** | ~0,71 m | curtas/médias (estilizado), mas suficientes para andar. |
| ↳ coxa | ~1,0 HU | — | — |
| ↳ canela | ~0,9 HU | — | — |
| **Pé/tênis** (comprimento) | **0,5 HU** | ~0,18 m | levemente grande para estabilidade visual. |
| **Olhos** (largura de 1 olho) | ~0,18 HU | — | proporcionais e expressivos — **não anime gigante**. |
| **Distância entre olhos** | ~1 olho | — | regra clássica, levemente afastados (simpatia). |

**Régua vertical (de baixo para cima, em HU):**

```
4.50  topo do cabelo
4.25  topo do crânio
3.50  queixo            ── cabeça = 1.0 HU (3.50→4.50, inclui crânio→queixo)
3.20  ombros
2.20  quadril / cintura
0.50  joelho
0.00  chão (base, origem do modelo)
```

**Objetivo de leitura:** a personagem precisa ser **excelente em telas
pequenas**. Regras que sustentam isso:

- **Cabeça grande + olhos claros** dominam a leitura no avatar circular (busto).
- **Silhueta de cabelo** distingue a personagem mesmo borrada.
- **Contraste alto** (cabelo/camiseta escuros sobre fundo claro do app).
- **Sem microdetalhe** que vire ruído < 64 px (sem dedos individuais finos, sem
  textura de poro, sem padrões na roupa).

---

## ROSTO

Registro: **amigável, profissional, não infantil, não hiper-realista, não anime,
não Disney clássico.** Adulta jovem, competente e acessível.

| Elemento | Especificação |
| --- | --- |
| **Formato do rosto** | Oval suave, levemente arredondado no queixo. Bochechas com volume sutil (jovialidade), maçãs do rosto leves. **Não** bebê (não-infantil), **não** anguloso. |
| **Olhos** | Amendoados, médios-grandes mas **proporcionais** (~0,18 HU). Íris escura grande, brilho de vida (1 highlight pequeno). Pálpebra superior define o olhar. **Sem** olhos anime gigantes, **sem** realismo de cílios individuais (cílios como massa estilizada). |
| **Sobrancelhas** | Bem definidas, médias, expressivas — **o principal motor de emoção** junto com a boca. Arqueadas de leve no neutro. Cor do cabelo. |
| **Nariz** | Pequeno, simples, levemente arrebitado. Pouca sombra. Quase um plano suave — **não** detalhado, **não** realista. |
| **Boca** | Média, lábios definidos sem volume exagerado. Capaz de sorriso aberto e fala (`OpenMouth`). Cor natural quente. |
| **Sorriso** | **Genuíno e caloroso**, cantos para cima, leve mostra de dentes superiores no sorriso aberto. Nunca forçado, nunca debochado. |
| **Expressão neutra (repouso)** | Olhos abertos atentos + **micro-sorriso** (cantos levemente para cima) + sobrancelhas relaxadas. **A Nathal.IA nunca tem cara séria/fria em repouso** — o repouso já é acolhedor. |
| **Pele** | `#f3c6a3` (ver Paleta). Acabamento fosco/levemente acetinado, sem brilho oleoso. Blush sutil opcional nas maçãs (acento quente, muito leve). |

> Detalhamento de **todas** as expressões em [`EXPRESSIONS.md`](./EXPRESSIONS.md).
> Mapeamento facial → shape keys (`Smile, Blink_L/R, Thinking, Surprised,
> OpenMouth, Sad`) em [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md) §7.

---

## CABELO

| Atributo | Especificação |
| --- | --- |
| **Cor** | Escuro quase preto — `#241f2b` (ver Paleta, `MAT_Hair`). |
| **Formato** | Liso a levemente ondulado nas pontas. Repartido de forma natural (sem risca rígida central), franja suave caindo sobre a testa com leve assimetria. |
| **Comprimento** | Longo: **abaixo dos ombros**, terminando ~na altura do meio do tronco (entre ombro e cotovelo). |
| **Volume** | Médio — emoldura o rosto e dá silhueta, **sem** ser "leão". Volume soma ~0,25 HU à silhueta da cabeça. |
| **Franja** | Suave, cobrindo a testa parcialmente, com uma "abertura" leve que mantém os olhos e sobrancelhas totalmente visíveis (emoção depende disso). |
| **Mechas** | Modeladas como **massas/cascos** (clumps) largos, **não** fios individuais — leitura limpa e leve para web. 6–12 mechas principais. |
| **Silhueta** | O **marcador nº 1** da personagem em tamanho pequeno: massa escura longa emoldurando rosto claro. Deve ser reconhecível como mancha. |

**Prioridades de produção (inegociáveis para web):**

- **Fácil modelagem:** mechas como superfícies/cards de baixa poligonagem, não
  partículas/fios.
- **Fácil rigging:** cabelo majoritariamente **rígido** preso à cabeça;
  **opcional** 1–2 bones de cabelo (ou shape keys) para movimento secundário leve
  em `Wave`/`Celebrate`. Sem simulação física no MVP.
- **Fácil animação:** nada de fios soltos que exijam cloth/hair sim. Movimento
  contido (Playful Ops).

---

## ROUPA

Casual, confortável, profissional-descontraída. **Nunca** terno/corporativo
engessado, **nunca** sensual/justo.

### Camiseta (`MAT_Shirt`)

| Item | Especificação |
| --- | --- |
| **Cor** | Preta — `#111814` (= `--color-ink` do design system). |
| **Modelo** | Gola careca (crew neck), manga curta, caimento solto-confortável (não justo, não oversized). Comprimento até o quadril. |
| **Logo** | Wordmark **`jump`** em **branco** (`#ffffff`, `MAT_Logo`), **letras minúsculas**, centralizado no peito. |
| **Posicionamento do logo** | Centro horizontal do peito, verticalmente entre a base da gola e a linha do busto. Largura do wordmark ≈ **1/3 da largura do tronco**. |
| **Área reservada (versões futuras)** | Bloco retangular invisível ao redor do logo — **~1,2 HU de largura × 0,4 HU de altura**, centralizado no peito — reservado para futuras versões/rebrand do produto (o nome é configurável; ver CLAUDE.md). Nada mais deve ocupar essa área. |
| **Acabamento** | Tecido fosco, leve dobra/sombra de pano (estilizada), sem estampas além do logo. Costas lisas. |

> O logo deve ser implementado como **decal / material próprio (`MAT_Logo`) em
> UV dedicada**, numa **superfície plana reservada** do peito, para não distorcer
> com o caimento da camiseta nem borrar em tamanho pequeno (ver risco em
> [`CHARACTER_REVIEW.md`](./CHARACTER_REVIEW.md) §3).

### Calça (`MAT_Pants`)

| Item | Especificação |
| --- | --- |
| **Modelo** | Casual reto/levemente afunilado (jeans ou sarja). Cintura na linha natural, sem cós marcado. Comprimento até o tornozelo. |
| **Cor** | Escura — azul-marinho jeans (`#2b3340`) **ou** sarja grafite (`#2f3338`). Escolha exata livre (ver evolutivos no Review), mantendo **escura e dessaturada** para não competir com o laranja Jump. |
| **Materiais** | Tecido fosco, leve textura estilizada (sem costuras hiperdetalhadas). Dobras suaves nos joelhos/tornozelo. |

### Tênis (`MAT_Shoes`)

| Item | Especificação |
| --- | --- |
| **Estilo** | Casual esportivo baixo (sneaker low-top), silhueta simples e arredondada. |
| **Cores** | Corpo **claro** (off-white `#ece9e0` / cinza claro), solado branco/off-white. **Acento laranja Jump** (`#ff7a18`) opcional em **cadarço ou etiqueta** (1 detalhe só). |
| **Materiais** | Fosco, sem couro brilhante. Solado levemente mais claro que o corpo. |
| **Leitura pequena** | Silhueta clara contrastando com a calça escura — ajuda a "fechar" a figura embaixo no avatar de corpo inteiro. Cadarços como massa, não fios. |

---

## PALETA OFICIAL

**Fonte única de cor da personagem** (resolve a divergência de "coral" apontada
no Review). Compatível com o design system do JumpFlow (Playful Ops / Neo
Brutalism controlado). Cores de marca/acento vivas só em **blocos/detalhes**,
nunca como dominante.

| Papel | Nome | HEX | Aplicação na personagem | Material |
| --- | --- | --- | --- | --- |
| **Primary** | Ink / Camiseta | `#111814` | Camiseta, base escura, contorno de silhueta | `MAT_Shirt` |
| **Primary (2)** | Cabelo | `#241f2b` | Cabelo, sobrancelhas | `MAT_Hair` |
| **Secondary** | Branco / Superfície | `#ffffff` | Wordmark `jump`, solado do tênis, brilho dos olhos | `MAT_Logo` |
| **Accent** | Laranja Jump | `#ff7a18` | **Único acento de marca** — cadarço/etiqueta, micro-detalhes | (detalhe) |
| **Neutral** | Pele | `#f3c6a3` | Pele (rosto, mãos, braços) | `MAT_Body` |
| **Neutral (2)** | Calça escura | `#2b3340` | Calça (jeans) — alt. sarja `#2f3338` | `MAT_Pants` |
| **Neutral (3)** | Tênis claro | `#ece9e0` | Corpo do tênis | `MAT_Shoes` |
| Olhos | Íris | `#3a2e2a` | Íris escura quente | `MAT_Eyes` |

**Acentos secundários (apenas detalhes pontuais / acessórios — nunca dominam):**

| Nome | HEX | Token JumpFlow | Uso |
| --- | --- | --- | --- |
| Flow green | `#32d583` | `--color-flow` | sucesso, check, acessórios |
| Marker yellow | `#ffd43b` | `--color-marker` | destaque, acessórios |
| Cyan info | `#39c6d6` | (info) | informação, acessórios |
| Lilac accent | `#a78bfa` | (accent) | variação, acessórios |
| **Coral** | **`#ff5a5f`** | (identidade) | **valor canônico** — alerta suave/detalhe (substitui o `#ff7a7a` do ASSET_GUIDE) |

> **Regra de composição:** preto/branco = base; **laranja Jump = único destaque
> de marca**; verde/amarelo/cyan/lilás/coral **só** em detalhes e acessórios. A
> personagem não pode ficar "colorida demais" — a UI do JumpFlow é clara e
> escaneável, a Nathal.IA é o ponto focal escuro com um toque de laranja.

---

## MATERIAIS

PBR **leve e estilizado** (sem realismo de poros/subsurface pesado). Todos
**foscos a levemente acetinados**, otimizados para leitura em tamanho pequeno e
para o orçamento web. Nomes **exatos** (consumidos pela validação —
[`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md) §4 e
`scripts/nathalia/nathalia_assets.config.json`).

| Material | Base color | Roughness | Metallic | Aparência visual | Notas |
| --- | --- | --- | --- | --- | --- |
| **`MAT_Body`** | `#f3c6a3` (pele) | ~0.6 (fosco macio) | 0 | Pele estilizada uniforme, leve variação de tom nas maçãs (blush sutil), **sem** poros/sardas. | Cobre rosto, pescoço, braços e mãos. Blush opcional como leve gradiente. |
| **`MAT_Hair`** | `#241f2b` | ~0.45 (acetinado) | 0 | Massa escura coesa com leve highlight anisotrópico estilizado (uma faixa de brilho). | Sem transparência/alpha de fios no MVP (cards sólidos). |
| **`MAT_Shirt`** | `#111814` | ~0.7 (tecido fosco) | 0 | Algodão preto fosco, leve sombreamento de dobras. | Costas lisas. Logo é material separado. |
| **`MAT_Pants`** | `#2b3340` | ~0.75 | 0 | Jeans/sarja escuro fosco, dobras suaves. | Dessaturado, nunca azul vivo. |
| **`MAT_Shoes`** | `#ece9e0` (corpo) | ~0.6 | 0 | Sneaker claro fosco, solado off-white, acento laranja opcional. | Acento `#ff7a18` em cadarço/etiqueta (decal pequeno). |
| **`MAT_Eyes`** | `#ffffff` (esclera) + `#3a2e2a` (íris) | ~0.2 (úmido, leve brilho) | 0 | Olho estilizado: esclera levemente off-white, íris escura grande, 1 highlight branco. | Único material com brilho um pouco mais alto (vida no olhar). |
| **`MAT_Logo`** | `#ffffff` | ~0.7 | 0 | Wordmark `jump` branco fosco, contorno limpo. | Decal/UV dedicada na área reservada do peito. Sem emissão. |

**Diretrizes gerais de material:**

- **Sem metais reais** (metallic = 0 em tudo); acessórios metálicos, se houver,
  ficam em materiais próprios do acessório (ver [`ACCESSORIES.md`](./ACCESSORIES.md)).
- **Sem emissão** na personagem-base (telas/holografias ficam em acessórios).
- Texturas: alvo **1024²**, atlas compartilhado quando possível, webp/KTX2
  (ver GLB Requirements §3). Evitar múltiplas texturas grandes.
- Acabamento coerente entre materiais (todos foscos) para a personagem parecer
  "de um mundo só" — estilo Playful Ops, não fotorrealista.

---

## POSE-BASE (modelagem / bind pose)

Para facilitar rig e skinning (ecoa [`CHARACTER_SHEET_SPEC.md`](./CHARACTER_SHEET_SPEC.md) §5):

- **A-Pose leve** (não T-Pose): braços afastados **~30°** do corpo.
- **Pés paralelos**, apoiados no chão, na origem `(0,0,0)`.
- **Olhar frontal**, expressão **neutra de repouso** (micro-sorriso).
- **Mãos relaxadas**, dedos levemente abertos, palmas para o corpo.
- Coluna em postura **natural confiante** (não rígida, não encurvada).
- Orientação: personagem olhando para **`-Z`**, **+Y** para cima, escala em
  **metros** (1,60 m) — ver GLB Requirements §1.

---

## CHECKLIST DE CONSISTÊNCIA (antes de aprovar arte/modelo)

- [ ] 4,5 cabeças de altura, cabeça levemente maior, mãos legíveis (0,4 HU).
- [ ] Cabelo longo escuro `#241f2b` com franja suave; silhueta reconhecível.
- [ ] Camiseta preta `#111814` + wordmark `jump` branco, minúsculas, centralizado.
- [ ] Laranja Jump `#ff7a18` **só** como acento; sem cores dominando.
- [ ] Pele `#f3c6a3`; expressão de repouso com micro-sorriso (nunca fria).
- [ ] Calça escura dessaturada; tênis claros legíveis.
- [ ] Não é hiper-realista, anime, Disney-princesa nem retrato de pessoa real.
- [ ] Materiais nomeados `MAT_*` corretos; tudo fosco; sem metais/emissão na base.
- [ ] Lê bem a 40–64 px (testar reduzindo a arte).
- [ ] Alinhado a [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md) e
      [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md).
