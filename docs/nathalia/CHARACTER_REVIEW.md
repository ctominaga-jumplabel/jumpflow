# Nathal.IA — Character Review (Fase 3B)

> Revisão crítica da personagem, feita **antes** de fechar a Character Sheet
> Premium. Cruza os documentos canônicos com os modelos brutos recebidos do
> Tripo. Não gera código, GLB nem altera a aplicação.
>
> Documentos lidos: [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md),
> [`CHARACTER_SHEET_SPEC.md`](./CHARACTER_SHEET_SPEC.md),
> [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md),
> [`ANIMATION_GUIDE.md`](./ANIMATION_GUIDE.md).
>
> Referência visual: **`nathalia_tripo_v02.glb`** (aprovado como referência) ·
> `nathalia_tripo_raw.glb` (= v01, **rejeitado**).
>
> Última atualização: **2026-06-16**.

## 0. Material analisado

| Modelo | Papel | Medições (modo estrutural, sem Blender) |
| --- | --- | --- |
| `nathalia_tripo_raw.glb` (**v01**) | **Rejeitado** | 54.5 MB · 1 objeto · 1 mesh · 1 material · 3 texturas · sem rig/shape keys/animações |
| `nathalia_tripo_v02.glb` (**v02**) | **Referência visual oficial aprovada** | 57.1 MB · 1 objeto · 1 mesh · 1 material · 3 texturas · sem rig/shape keys/animações |

> ⚠️ **Importante:** "aprovado" aqui significa **aprovado como referência de
> likeness/silhueta** (direção visual), **não** como `master.glb`. Ambos são
> _sculpts_ densos de blob único, fora do orçamento web (≤ 1.5 MB) e sem
> separação de partes, rig ou expressões. A geometria final virá do refinamento
> no Blender (Fase 4), usando a v02 como guia. Ver
> [`ASSET_INTAKE_REPORT.md`](./ASSET_INTAKE_REPORT.md) e ADR-010 em
> [`DECISIONS.md`](./DECISIONS.md).

## 1. Pontos fortes da personagem

- **Conceito claro e diferenciado.** "Colega administrativa querida que organiza
  as horas" é um arquétipo concreto, fácil de traduzir em pose, expressão e copy.
  A personagem tem _função_, não só aparência.
- **Silhueta reconhecível.** Cabelo longo escuro + camiseta preta com wordmark
  **jump** branco = leitura imediata, mesmo em avatar de 40–64 px. Poucos
  elementos, todos legíveis.
- **Paleta enxuta e on-brand.** Preto/branco como base e laranja Jump como
  acento dão contraste alto e amarram a personagem ao produto sem competir com a
  UI (que é clara e escaneável — Neo Brutalism controlado).
- **Direção "estilizada profissional" bem delimitada.** O Bible define
  explicitamente o que **não** é (hiper-realista, anime, Disney princesa,
  retrato real) — isso reduz drasticamente a deriva entre artistas/IA.
- **Personalidade já operacionalizada em software.** Estados emocionais, copy
  pt-BR, RBAC e fallback 2D já existem. A camada visual entra num esqueleto
  pronto — baixo risco de "arte bonita que não pluga".
- **Proporção compacta (cabeça maior).** Favorece simpatia e leitura em telas
  pequenas — exatamente o uso principal (avatar de widget).

## 2. Pontos fracos / fragilidades

- **Falta de números fechados de proporção.** O Bible e a Sheet Spec dizem
  "~4–5 cabeças", "cabeça levemente maior", "pernas curtas/médias" — bom para
  direção, insuficiente para reproduzir com consistência. **Resolvido nesta fase**
  em [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md) §Proporções
  (canon: **4,5 cabeças**, altura **1,60 m**).
- **Wordmark "jump" é um ponto de falha de likeness.** Texto pequeno no peito é
  o primeiro elemento a borrar em tamanho reduzido e o primeiro a sair errado em
  geração por IA. Precisa de tratamento dedicado (decal/material próprio, área
  reservada) — ver `MAT_Logo` e a seção de roupa.
- **"Coral" tem dois valores divergentes.** ASSET_GUIDE usa `#ff7a7a`; o
  design-system usa `#ff5a5f`. Pequena inconsistência que precisa de uma fonte
  única (resolvida na Paleta Oficial da Sheet Premium).
- **Brutos do Tripo não são base de produção.** Blob único de ~55–57 MB, sem
  partes separadas, sem rig, sem shape keys, texturas 2K–4K. Ótimos como
  _likeness_, inúteis como geometria final — todo o trabalho de topologia,
  split, rig e expressões ainda é Blender (Fase 4).
- **Mãos.** O Bible pede "mãos simples", mas os clipes (`wave`, `point`,
  `thumbsUp`) exigem leitura clara de mão aberta, dedo apontando e polegar. Há
  tensão entre "simples de modelar" e "expressivo o bastante". Precisa de uma
  regra explícita (mitten estilizada com polegar separado — ver Sheet Premium).
- **Mapeamento de nomes de animação divergente** entre o pacote
  (`nathaliaAnimations.ts`) e o canon do `master.glb`. Já conhecido e tolerado
  pela validação (D-009), mas continua sendo dívida a reconciliar na Fase 5.

## 3. Riscos de modelagem

- **Topologia herdada do sculpt.** Reaproveitar a malha bruta da v02 sem retopo
  carrega N-gons, densidade irregular e zero edge-loops úteis para deformação.
  **Mitigação:** retopo limpo no Blender; a v02 serve de _shrinkwrap target_, não
  de malha final.
- **Fusão de partes.** Corpo, cabelo, roupa, olhos e tênis vêm fundidos num
  objeto/material só. Separar em `Body/Hair/Shirt/Pants/Shoes/Eyes/Logo` é
  trabalho manual e fonte de erro (costuras, interseções). **Mitigação:** modelar
  partes como objetos próprios desde o início, usando a v02 só como referência de
  forma.
- **Orçamento de polígonos apertado.** 25k (MVP) / 40k (ideal) / 60k (máx). Cabelo
  e tênis são os maiores consumidores. **Mitigação:** cabelo em "cascos"/mechas
  baixas (não fios), tênis com silhueta simplificada.
- **Logo no peito.** Aplicar o wordmark como decal/UV num material próprio
  (`MAT_Logo`) sem distorção no caimento da camiseta. **Mitigação:** área plana
  reservada no peito + UV dedicada (ver Sheet Premium §Roupa).
- **Escala/origem/orientação.** Brutos de IA raramente vêm em metros, na origem,
  olhando para `-Z`. **Mitigação:** `normalize_master.py` + checklist de aceite.
- **Peso de textura.** Texturas 2K–4K do bruto estouram o orçamento de arquivo.
  **Mitigação:** rebake para 1024², atlas único, webp/KTX2.

## 4. Riscos de animação

- **Cabelo rígido vs. movimento.** Cabelo longo pede ao menos pseudo-secundário
  (bob/celebrate). Sem bones de cabelo, fica "capacete". **Mitigação:** 1–2 bones
  opcionais de cabelo **ou** shape keys de leve deslocamento; manter contido
  (Playful Ops é restrito).
- **Mãos sem dedos individuais.** O rig canônico não tem bones de dedos. `wave`,
  `point` e `thumbsUp` precisam ser legíveis com mão estilizada. **Mitigação:**
  resolver gesto na **forma esculpida da mão** + pose do antebraço, não em dedos;
  se necessário, shape keys de mão (`HandPoint`, `HandThumbsUp`) — fora do MVP.
- **Expressão depende de shape keys ainda inexistentes.** Todas as 10 expressões
  (ver [`EXPRESSIONS.md`](./EXPRESSIONS.md)) mapeiam para 7 shape keys
  (`Smile, Blink_L/R, Thinking, Surprised, OpenMouth, Sad`). Se a topologia da
  face não for limpa, as shape keys quebram. **Mitigação:** loops de boca/olhos
  bem-formados no retopo.
- **Reduced-motion.** Toda animação precisa de um estado estático equivalente.
  **Mitigação:** já previsto no ANIMATION_GUIDE; cada expressão tem pose neutra.
- **Idle "vivo".** Respiração + piscar aleatório são o que evita o "boneco
  morto". Barato, mas precisa estar no escopo desde a Fase 6.

## 5. Elementos visuais que **devem ser preservados** (inegociáveis)

1. **Cabelo longo escuro** (`#241f2b`) com franja suave — principal marcador de
   silhueta.
2. **Camiseta preta** (`#111814`) com **wordmark `jump` branco, em minúsculas**,
   centralizado no peito.
3. **Laranja Jump** (`#ff7a18`) como **único** acento de marca (detalhes, nunca
   dominante).
4. **Proporção compacta com cabeça levemente maior** — simpatia + leitura
   pequena.
5. **Olhos expressivos proporcionais** (não-anime, não-realista) e **sorriso
   simpático** como expressão de repouso.
6. **Postura amigável e profissional** — nunca infantil, nunca sensual, nunca
   corporativa-fria.
7. **Tom estilizado "Pixar/Notion/Duolingo-like com identidade própria"** — sem
   escorregar para realismo ou anime.

## 6. Elementos que **podem evoluir** (espaço criativo controlado)

- **Tênis:** modelo/cor exatos em aberto, desde que claros e legíveis em
  miniatura, com possível cadarço/etiqueta laranja.
- **Calça:** jeans vs. sarja escura; corte exato livre, desde que casual e
  escuro.
- **Acessórios contextuais** (clipboard, relógio, kanban, etc.) — opcionais e
  derivados do `master.glb`, ver [`ACCESSORIES.md`](./ACCESSORIES.md).
- **Variações sazonais/temáticas** — sempre derivadas do master, nunca
  redesenhando a personagem-base.
- **Área reservada do peito** para versões futuras do logo (rebrand do produto é
  previsto — o nome "JumpFlow" deve ser fácil de trocar).
- **Penteado:** comprimento e volume exatos da franja/mechas podem ser ajustados
  para facilitar rig, desde que a silhueta longa escura permaneça.
- **Microexpressões e gestos adicionais** além do set mínimo, na Fase 6.

## 7. Veredito da revisão

A personagem está **madura conceitualmente** e **pronta para fechar a Character
Sheet Premium**. Os riscos são quase todos de **produção 3D** (topologia, split,
rig, peso), não de **direção** — o que é o cenário ideal para esta fase.

- **v02 = referência visual aprovada** (likeness/silhueta), **não** `master.glb`.
- A Sheet Premium desta fase fixa os números (proporções, paleta, materiais) que
  faltavam, removendo a principal fragilidade ("falta de canon mensurável").
- O caminho de produção é **retopo + split + rig + shape keys no Blender**
  (Fase 4), usando a v02 como guia de forma — confirmando o **Caminho 1** do
  intake report.

> Próximo passo desta fase: consolidar tudo em
> [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md),
> [`EXPRESSIONS.md`](./EXPRESSIONS.md), [`GESTURES.md`](./GESTURES.md),
> [`ACCESSORIES.md`](./ACCESSORIES.md),
> [`MASTER_GLB_BLUEPRINT.md`](./MASTER_GLB_BLUEPRINT.md) e
> [`GENERATION_PROMPTS.md`](./GENERATION_PROMPTS.md).
