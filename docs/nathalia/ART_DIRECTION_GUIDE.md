# Nathal.IA — Art Direction Guide (Fase 7, Etapa 13)

> **Norte de direção de arte** da Nathal.IA. Documento durável: qualquer trabalho
> futuro de modelo 3D, refino de forma, materiais ou novas versões deve se
> orientar por aqui. Consolida os princípios visuais aprendidos até a v2 e os
> torna acionáveis.
>
> Hierarquia de canon: [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md)
> (personalidade e direção) **vence**; a
> [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md) é a folha visual
> mensurável (proporções, paleta, materiais); o
> [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md) é o contrato técnico. Este guia
> **não** introduz canon novo — ele **interpreta e prioriza** o canon existente
> para decisões de arte. Em conflito, valem aqueles documentos.
>
> Referência de likeness: **`nathalia_tripo_v02.glb`** (aprovada).
>
> Última atualização: **2026-06-17**.

---

## 1. Princípios visuais (os 6 pilares)

1. **Função antes de forma.** A Nathal.IA existe para reduzir atrito operacional.
   A arte deve **comunicar acolhimento e competência** em meio segundo, em um
   avatar pequeno. Beleza que não comunica isso é decoração — e decoração não
   passa.
2. **Leitura em 40–64 px é a régua mestra.** Todo elemento se justifica pela sua
   leitura em miniatura. Se um detalhe vira ruído abaixo de 64 px, ele não entra.
3. **Silhueta primeiro, detalhe depois.** A personagem precisa ser reconhecível
   como **mancha**: cabelo longo escuro emoldurando rosto claro, sobre camiseta
   preta. Detalhe interno só agrega quando a silhueta já está resolvida.
4. **Expressão é o coração.** Olhos + sobrancelhas + boca são o motor de empatia.
   O repouso já é um micro-sorriso — **a Nathal.IA nunca tem cara fria**.
5. **Contenção de cor (Playful Ops).** Preto/branco como base, laranja Jump como
   **único** acento de marca; demais cores vivas só em acessórios. A UI é clara e
   escaneável; a personagem é o ponto focal escuro com um toque de laranja.
6. **Coerência de mundo.** Tudo fosco, estilizado, "de um material só". Sem
   fotorrealismo, sem metais, sem emissão na base. A personagem e a UI Neo
   Brutalism controlada precisam parecer do mesmo universo.

---

## 2. O que É a Nathal.IA

- **3D estilizado, traços limpos**, amigável e profissional ao mesmo tempo.
- **Compacta**, 4,5 cabeças (~1,60 m), **cabeça levemente maior** que o realista
  (apelo de simpatia e leitura pequena).
- **Cabelo longo escuro** (`#241f2b`) com franja suave assimétrica — silhueta
  reconhecível como marcador nº 1.
- **Camiseta preta** (`#111814`) com wordmark **`jump`** branco minúsculo,
  centralizado no peito; calça escura dessaturada; tênis claros.
- **Olhos expressivos proporcionais** com íris escura e um highlight de vida;
  **micro-sorriso de repouso** caloroso.
- **Pele** `#f3c6a3`, acabamento fosco-acetinado, sem brilho oleoso.
- Uma **colega administrativa querida** traduzida em forma: organizada, leve,
  acolhedora, objetiva.

## 3. O que NÃO é a Nathal.IA

- ❌ **Hiper-realista** (poros, subsurface pesado, cílios individuais).
- ❌ **Anime** (olhos gigantes, queixo afilado, cabelo de fios soltos).
- ❌ **Disney-princesa clássica** (idealização, corpo estilizado sensual).
- ❌ **Retrato/deepfake** de uma pessoa real — é homenagem, não reprodução.
- ❌ **Colorida demais** — nenhuma cor viva domina; laranja só como acento.
- ❌ **Corporativa-fria** — nada de terno engessado, postura rígida, cara séria.
- ❌ **Cabelo "capacete"** ou **"leão"** — volume médio, contido (Playful Ops).
- ❌ **Decoração sem função** — efeito que não ajuda a leitura/empatia sai.

---

## 4. Paleta & materiais (regras de aplicação)

Fonte única de cor: [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md)
§Paleta/§Materiais. Resumo acionável (espelhado no builder `master_v2`):

| Material | HEX base | Roughness | Metallic | Regra de arte |
| --- | --- | --- | --- | --- |
| `MAT_Body` | `#f3c6a3` | 0.60 | 0 | Pele uniforme, blush sutil opcional, **sem** poros. Cobre rosto, pescoço, braços, mãos. |
| `MAT_Hair` | `#241f2b` | 0.45 | 0 | Massa escura coesa. **Também** carrega os detalhes faciais (sobrancelha/íris/boca), por isso é o "traço" da personagem. |
| `MAT_Eyes` | `#ffffff` + íris `#3a2e2a` | 0.18 | 0 | **Único** material com leve specular (~0.6) — o brilho de vida no olhar. |
| `MAT_Shirt` | `#111814` | 0.70 | 0 | Tecido preto fosco; costas lisas. |
| `MAT_Pants` | `#2b3340` | 0.75 | 0 | Escuro dessaturado, nunca azul vivo. |
| `MAT_Shoes` | `#ece9e0` | 0.60 | 0 | Corpo claro, solado mais claro; acento laranja **opcional** em 1 detalhe. |
| `MAT_Logo` | `#ffffff` | 0.70 | 0 | Wordmark `jump`; sem emissão. |

**Regras inegociáveis:**

- **Sempre 7 materiais `MAT_*`** com esses nomes exatos (consumidos pela
  validação). Detalhes faciais reaproveitam `MAT_Hair`; **não** crie material
  facial novo.
- **Metallic = 0** em tudo; **sem emissão** na base (telas/holografias vivem em
  acessórios).
- **Laranja Jump (`#ff7a18`) nunca é cor de base** — só acessório/micro-detalhe.
- **Tudo fosco a levemente acetinado** — coerência de mundo.

---

## 5. Regras de leitura em tamanho pequeno

O uso principal é **avatar de widget (40–64 px)**. Critérios:

- **Cabeça grande + olhos claros** dominam o busto no avatar circular.
- **Silhueta de cabelo** distingue a personagem mesmo borrada — é o teste nº 1.
- **Contraste alto:** cabelo/camiseta escuros sobre o fundo claro do app; tênis
  claros "fecham" a figura embaixo no corpo inteiro.
- **Sem microdetalhe** que vire ruído < 64 px: nada de dedos finos individuais,
  textura de poro, padrões na roupa, costura hiperdetalhada.
- **Expressão por massas:** sobrancelha e boca precisam ler como traço, não como
  geometria fina. Cílios/cabelo como massa, não como fios.
- **Teste obrigatório:** reduzir qualquer arte/render a 48 px e checar se ainda
  se reconhece "a Nathal.IA" e seu humor.

---

## 6. Forma & construção (estado atual e evolução)

A personagem é **100% construída por código** (Blender, paramétrica por
primitivas), mantendo um contrato estável: **7 objetos** (Body, Hair, Eyes,
Shirt, Pants, Shoes, Logo), **7 materiais**, **rig de 16 bones**, pés no chão,
~1,6 m, faces -Y. Esse contrato é a base de toda evolução — não se quebra.

| Nível | Estado | Direção |
| --- | --- | --- |
| **Silhueta** | Forte (v2) | Manter; é o ativo mais valioso. |
| **Massas/junções** | Blocadas; braço lê destacado do ombro | **Próxima alavanca:** suavizar transições (ombro, pescoço, cintura) → "massas macias", sem resculpt. |
| **Rosto** | Presente e legível, porém esquemático | Refinar olho amendoado, sobrancelha de espessura variável, boca curva — preservando leitura < 64 px. |
| **Roupa** | Vestida (gola, punho, solado) | Dar caimento de pano à barra da camiseta; cintura. |
| **Materiais** | Em conformidade | Estável; só ajustes finos de roughness/specular. |

**Regra de evolução:** todo refino é **incremental sobre a base modular**.
Variações (sazonais, acessórios, poses) **derivam** do master — nunca redesenham
a personagem-base. Acessórios são GLBs pequenos separados, carregados sob demanda.

---

## 7. Evolução futura (norte de longo prazo)

1. **Aproximar do alvo "Pixar/Notion/Duolingo-like"** sem perder a leveza web:
   massas mais orgânicas, transições suaves, "fofura" 3D — mantendo low-poly.
2. **Rosto modelado** (não por discos/barras) quando o orçamento permitir, ainda
   regido pela régua de 40–64 px.
3. **Gestos de mão** via shape esculpido/shape keys (`HandPoint`,
   `HandThumbsUp`) — sem adicionar bones de dedos.
4. **Movimento secundário do cabelo** leve (1–2 bones ou shape keys) em
   Wave/Celebrate — contido, Playful Ops, nunca cloth/hair sim.
5. **Acessórios contextuais** (clipboard, clock, kanban…) derivados do master,
   com o laranja Jump como único acento de marca.
6. **Área reservada do peito** preservada para futuro rebrand do produto (o nome
   "JumpFlow" é configurável).

Sempre validar o resultado contra o
[`CHECKLIST DE CONSISTÊNCIA`](./CHARACTER_SHEET_PREMIUM.md#checklist-de-consistência-antes-de-aprovar-artemodelo)
da Sheet Premium antes de aprovar qualquer iteração.

## 8. Referência visual V3 e reconstrução leve (Fase 8.3)

- **`nathalia_tripo_v03.glb` é REFERÊNCIA visual, não runtime.** É pesado
  (1.847.223 tris / 55 MB), sem rig, sem shape keys e sem animações. Serve apenas
  como alvo de aparência (paleta, silhueta, volume de cabelo, expressão).
- **`master_v3` é uma reconstrução leve** baseada na referência, derivada do
  `master_v2` por **recolor + escala** (sem importar o mesh Tripo). Mantém o
  contrato (7 objetos, 7 materiais, 16 bones, 10 shape keys, 9 actions) e o
  orçamento web (~11.3k tris / 260 KB).
- **Paleta V3 (norte atual):** pele quente `#e8b189`, cabelo espresso `#2a2320`,
  camiseta preta `#0e0e10`, **logo laranja `#ff7a18`**, calça creme `#e6ddc8`,
  tênis preto `#1b1b1f`. Substitui a paleta fria do V2 (calça azul, tênis branco,
  logo branco) por uma silhueta fiel à marca.
- **Olhos & cabelo:** olhos maiores e mais expressivos; cabelo mais volumoso —
  ambos reforçam a leitura no bubble pequeno (launcher ~80px).
- **Regra firme:** o modelo Tripo pesado **não entra no runtime**; o fallback 2D
  continua sendo o piso visual e foi alinhado à mesma referência V3.
- Fontes: [`VISUAL_REFERENCE_V3_REVIEW.md`](./VISUAL_REFERENCE_V3_REVIEW.md),
  [`V3_ALIGNMENT_PLAN.md`](./V3_ALIGNMENT_PLAN.md),
  [`V2_VS_V3_COMPARISON.md`](./V2_VS_V3_COMPARISON.md).
