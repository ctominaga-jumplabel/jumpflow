# Nathal.IA — Artistic Review (Fase 7, Etapa 1)

> Revisão crítica de arte da Fase 7 (Artistic Refinement Pass). Cruza o
> **conceito** (personalidade + direção visual) com o **modelo real** construído
> por código, o `master_v2`. Não gera código nem altera a aplicação — é uma
> leitura honesta do que melhorou, do que ainda falta e do que priorizar.
>
> Hierarquia de canon: [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md)
> (personalidade e direção) **vence**; a
> [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md) detalha e mede a
> direção visual; o [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md) é o contrato
> técnico. Referência de likeness: **`nathalia_tripo_v02.glb`** (aprovado como
> referência visual — ver [`CHARACTER_REVIEW.md`](./CHARACTER_REVIEW.md)).
>
> Material analisado: `master_v2.blend` / `master_v2_preview.glb` e os
> thumbnails em `assets/nathalia/thumbnails/v2/` (front, three_quarter, side,
> back), comparados com a v1 em `assets/nathalia/thumbnails/`.
>
> Última atualização: **2026-06-17**.

---

## 0. O que esta revisão NÃO é

Esta não é uma revisão de **direção** (a direção está madura desde a Fase 3B) nem
um veredito técnico de validação (esse é o
[`reports/MASTER_V2_VALIDATION.md`](./reports/MASTER_V2_VALIDATION.md)). É uma
**revisão de arte**: o quanto o modelo atual se aproxima — visualmente — da
personagem descrita na Bible e na Sheet Premium, e onde estão as próximas
alavancas de melhoria.

A Fase 7 é um **passe incremental de refino sobre a mesma base modular
paramétrica** (7 objetos, 7 materiais, 16 bones), **não** um resculpt completo.
A personagem continua sendo um avatar low-poly estilizado-blocado, construído por
primitivas (esferas, cápsulas, caixas, toros). Toda avaliação abaixo parte dessa
premissa.

---

## 1. Pontos fortes (o que a v2 acerta)

| # | Ponto forte | Onde se vê |
| --- | --- | --- |
| 1 | **Rosto agora existe.** Sobrancelhas arqueadas, íris/pupila e uma linha de boca com cantos levantados (micro-sorriso de repouso) dão à personagem o **olhar e a empatia** que faltavam. Este é o maior ganho da fase. | front, three_quarter |
| 2 | **Micro-sorriso de repouso cumpre o canon.** A Sheet Premium diz "a Nathal.IA nunca tem cara séria em repouso" — a v2 já nasce acolhedora, sem expressão neutra fria. | front |
| 3 | **Silhueta de cabelo mais forte.** Massa traseira mais cheia + comprimento até o meio do tronco + mechas laterais emoldurando o rosto = o marcador nº 1 de leitura em tamanho pequeno ficou mais nítido. | back, side, three_quarter |
| 4 | **Detalhes faciais embutidos no Body (slot `MAT_Hair`).** Decisão elegante: sobrancelhas, íris e boca deformam junto com as shape keys faciais, **sem** criar objeto/material extra — o contrato de 7+7 se mantém. | (técnico) |
| 5 | **Roupa mais "vestida".** Gola careca, mangas curtas com punho, e o tênis low-top com solado mais claro + biqueira arredondada substituem os blocos chapados da v1. A figura lê como roupa, não como caixas. | front, side, three_quarter |
| 6 | **Paleta fiel à Sheet Premium.** Os 7 `MAT_*` estão fixados em hex+roughness do canon; laranja Jump **não** virou cor de base (continua reservado a acessórios), evitando "personagem colorida demais". | todas |
| 7 | **Olhos com vida.** O leve specular (~0.6) só no `MAT_Eyes` cria um highlight úmido — exatamente o "brilho de vida" pedido na Sheet, sem cair em realismo. | front |
| 8 | **Repertório emocional e de movimento ampliado.** 10 shape keys e 9 actions cobrem agora bem mais estados da personagem (Curious, Greeting, Celebrate, Typing, Explaining…), todos dentro das janelas de duração. | (animação) |
| 9 | **Wordmark `jump` mais limpo e centralizado.** Reescalado (0.055) e re-centrado no peito; lê bem na frontal e na 3/4. | front, three_quarter |

---

## 2. Pontos fracos (o que ainda falta)

| # | Ponto fraco | Onde se vê | Severidade |
| --- | --- | --- | --- |
| 1 | **Ainda é estilizado-blocado, não o alvo "Pixar/Notion/Duolingo-like".** A base é paramétrica por primitivas; faltam transições orgânicas, volumes esculpidos e a "fofura" 3D do alvo. A personagem é simpática, mas reconhecidamente um boneco de blocos. | todas | **Importante** |
| 2 | **Braços parecem levemente destacados dos ombros.** A junção ombro→braço lê como duas peças encaixadas, não como uma transição contínua de tecido/pele. Quebra a leitura de "um corpo só". | front, back, three_quarter | **Importante** |
| 3 | **Rosto melhorou, mas é simples.** Sobrancelhas, íris e boca são barras/discos primitivos; o nariz é um plano sutil. Funciona em 40–64 px, mas em close grande ainda é esquemático — longe do rosto modelado da Sheet. | front, three_quarter | **Importante** |
| 4 | **Sombra escura sob o queixo.** O render offline de 3 luzes gera uma faixa de ambient-occlusion no pescoço/queixo que parece "barba" ou sujeira na thumbnail. **Não** reproduz no runtime R3F (iluminação diferente), mas polui o material de referência. | front, three_quarter | **Opcional** |
| 5 | **Mãos são massas arredondadas sem polegar/dedos.** Coerente com o canon ("mãos simples", sem bones de dedos), mas gestos como Wave/Pointing/Greeting dependem 100% da pose do antebraço — a mão não "aponta" nem "acena" por si. | front, side | **Opcional** |
| 6 | **Volume lateral do tronco/quadril ainda cilíndrico.** No perfil, tronco e quadril leem como cilindros sobrepostos; falta o caimento solto da camiseta e a definição de cintura descritos na Sheet. | side | **Opcional** |
| 7 | **Costas 100% lisas e um pouco chapadas.** Correto pelo canon (sem estampa nas costas), mas a massa de cabelo traseira domina e o torso atrás fica sem leitura de ombro/gola. | back | **Opcional** |

---

## 3. Conceito vs. modelo (diferenças)

| Elemento (canon) | Conceito / Sheet Premium | Modelo `master_v2` | Gap |
| --- | --- | --- | --- |
| **Registro geral** | 3D estilizado "Pixar/Notion/Duolingo-like com identidade própria" | Low-poly paramétrico blocado, simpático | **Médio** — o tom é amigável e legível, mas a textura/forma ainda não é a do alvo |
| **Proporção** | 4,5 cabeças, 1,60 m, cabeça levemente maior | ~1,584 m, cabeça grande, pernas compactas | **Pequeno** — proporções batem bem |
| **Rosto** | Olhos amendoados com íris+highlight, sobrancelhas como motor de emoção, boca capaz de sorrir | Íris-disco + sobrancelha-barra + boca-linha com cantos erguidos | **Médio** — presente e legível, porém esquemático |
| **Cabelo** | Longo escuro, franja assimétrica suave, massas/cascos largos, silhueta-marcador | Massa traseira cheia + comprimento médio + mechas laterais + franja assimétrica | **Pequeno** — silhueta forte; pontas/casco ainda lisos |
| **Camiseta** | Gola careca, manga curta, caimento solto, wordmark branco centralizado | Cilindro de torso + anel de gola + mangas com punho + logo centrado | **Pequeno-médio** — falta caimento de pano |
| **Calça** | Casual reta, dobras suaves joelho/tornozelo | Cápsulas com esfera de joelho + anel de tornozelo | **Pequeno** |
| **Tênis** | Low-top claro, solado off-white, biqueira arredondada | Corpo + solado mais claro + biqueira arredondada | **Pequeno** — fiel |
| **Materiais** | 7 `MAT_*` foscos, sem metal/emissão, olhos com leve brilho | Idêntico, hex+roughness fixados, specular só nos olhos | **Nenhum** — em conformidade |
| **Expressão de repouso** | Micro-sorriso acolhedor, nunca frio | Cantos da boca erguidos no Basis | **Nenhum** — atende |

**Resumo:** o gap **conceitual** é pequeno (proporção, paleta, vestuário e
silhueta estão alinhados). O gap **plástico/escultural** permanece médio: a
personagem é fiel à descrição, mas a *qualidade de forma* ainda é a de um modelo
blocado, não a do alvo Pixar/Notion. Isso é esperado para um passe incremental.

---

## 4. Prioridades de melhoria

Classificação: **Crítico** (bloqueia leitura/empatia ou viola canon) ·
**Importante** (eleva claramente a qualidade percebida) · **Opcional**
(polimento fino, baixo retorno por agora).

### Crítico

- _Nenhum item crítico em aberto._ A v2 resolveu o que era crítico na v1: o
  **rosto em branco** (ausência de empatia) e a **silhueta fraca**. A personagem
  agora **comunica acolhimento e é reconhecível** — os dois requisitos
  inegociáveis do canon. A validação consolidada é **PASS**.

### Importante

1. **Suavizar as junções ombro→braço.** Adicionar uma transição (deltoide
   estilizado / overlap de manga) para os braços lerem como parte do corpo, não
   como peças encaixadas. Maior retorno visual da próxima iteração.
2. **Aproximar a forma do alvo estilizado.** Sem virar resculpt: arredondar
   silhueta do tronco/quadril, dar caimento à barra da camiseta, suavizar a
   transição cabeça→pescoço→ombros. Mover de "blocos" para "massas macias".
3. **Refinar o rosto sem perder a leitura pequena.** Dar formato amendoado real
   ao olho (não disco), espessura variável à sobrancelha e curvatura à boca —
   mantendo a regra "sem microdetalhe que vire ruído < 64 px".

### Opcional

4. **Ajustar a iluminação offline** para matar a faixa de AO sob o queixo nas
   thumbnails (cosmético — não afeta o runtime).
5. **Indicar polegar na mão** (shape esculpido ou shape key `HandPoint`/
   `HandThumbsUp`), reforçando gestos sem adicionar bones de dedos.
6. **Definir leitura de ombro/gola nas costas** para a vista traseira não ficar
   dominada só pela massa de cabelo.

---

## 5. Veredito

A v2 é um **avanço claro e honesto** sobre a v1: entrega rosto, expressão de
repouso acolhedora, silhueta de cabelo mais forte e roupa mais crível, **sem
quebrar o contrato técnico** (7 objetos, 7 materiais, 16 bones, ~1,6 m, faces -Y)
e **mantendo a validação em PASS**. O gap remanescente é de **plástica
escultural** — a personagem ainda é blocada e o rosto é esquemático — não de
direção, paleta ou leitura.

Próximo norte de arte (durável): [`ART_DIRECTION_GUIDE.md`](./ART_DIRECTION_GUIDE.md).
Próxima alavanca técnica: suavizar junções e massas, então refinar o rosto, sem
nunca abandonar a regra de leitura em 40–64 px.
