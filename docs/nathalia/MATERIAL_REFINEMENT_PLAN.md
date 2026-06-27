# Nathal.IA — Plano de Refinamento de Materiais (Fase 7 · Etapa 5)

> **Plano de refinamento dos 7 materiais** da Nathal.IA. Documenta o que o
> builder V2 (`construct_master_v2.py`) já fixou, e quais ajustes futuros levam a
> personagem a um acabamento **"Stylized Premium"** compatível com Neo Brutalism
> / Playful Ops / JumpFlow — **sem perder performance web**.
>
> Hierarquia de canon: [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md) **vence**; a
> [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md) é a folha visual
> definitiva (paleta e materiais); este plano detalha a evolução dos materiais
> dentro desse canon e do contrato técnico
> ([`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md): **exatamente 7 materiais**,
> nomes `MAT_*` consumidos pela validação). Não gera código nem GLB.
>
> Última atualização: **2026-06-17**.

---

## Resumo em uma frase

A V2 **fixou os 7 materiais exatamente na paleta da CHARACTER_SHEET_PREMIUM**
(cores e roughness), com **metallic 0 e sem emissão** em toda a base, e adicionou
apenas um **toque de specular nos olhos** ("brilho de vida"); o laranja Jump
`#ff7a18` permanece **reservado** — vive só nos GLBs de acessório, nunca como
material base, para manter o contrato de 7 materiais.

---

## Princípios (inegociáveis)

- **Exatamente 7 materiais**, nomes `MAT_*` corretos (validação depende disso).
- **Tudo fosco a levemente acetinado** — "de um mundo só", estilo Playful Ops,
  nunca fotorrealista.
- **Sem metais reais** (metallic = 0) e **sem emissão** na personagem-base
  (telas/holografias/metais ficam em acessórios).
- **Laranja Jump é acento, não material base.** `#ff7a18` só em decal/textura ou
  acessório GLB → master fica em 7 materiais.
- **Stylized Premium, web-light.** Acabamento "premium" vem de **roughness bem
  calibrado, micro-variação e 1 highlight**, não de mapas pesados. Alvo de
  textura **1024²**, atlas compartilhado, **webp/KTX2**.
- **Não dominar com uma cor.** Base = preto/branco/pele/escuros dessaturados; a
  identidade é o ponto focal escuro com **um** toque de laranja.

---

## Os 7 materiais — base, roughness, refino V2 e ajuste futuro

| Material | Base color | Roughness | Metallic / Emissão | Refino V2 (feito) | Ajuste futuro (opcional, web-light) |
| --- | --- | --- | --- | --- | --- |
| **`MAT_Body`** | `#f3c6a3` | **0.60** | 0 / não | Pele estilizada uniforme, fosco macio; cobre rosto, pescoço, braços e mãos. | **Blush sutil** nas maçãs como gradiente (textura/vertex color), leve variação de tom — reforça jovialidade sem novo material. |
| **`MAT_Hair`** | `#241f2b` | **0.45** | 0 / não | Massa escura coesa, acetinada; também recebe os **detalhes faciais** (sobrancelhas, íris, boca). | **Highlight anisotrópico estilizado** (uma faixa de brilho ao longo do comprimento) via material/textura — dá volume "premium" sem geometria extra. |
| **`MAT_Eyes`** | `#ffffff` (esclera) + `#3a2e2a` (íris) | **0.18** | 0 / não | **+ specular ~0.6** → "brilho de vida" (único material com brilho mais alto). | **Catchlight** fixo (micro-highlight no canto da íris) para o olho não "morrer" sob luz frontal — independente da cena. |
| **`MAT_Shirt`** | `#111814` | **0.70** | 0 / não | Algodão preto fosco; gola, mangas e punhos modelados. | Leve **sombra de dobra** estilizada + **costuras** discretas via textura/decal (sem geometria). |
| **`MAT_Pants`** | `#2b3340` | **0.75** | 0 / não | Jeans/sarja escuro fosco, dessaturado; joelho/tornozelo definidos. | Micro-textura de tecido muito sutil + dobras suaves no joelho/tornozelo via material. |
| **`MAT_Shoes`** | `#ece9e0` | **0.60** | 0 / não | Sneaker claro fosco; solado mais claro/largo + biqueira. | **Acento laranja `#ff7a18`** em **decal/UV separada** (cadarço/etiqueta) — sem virar 8º material; solado levemente mais claro reforçado. |
| **`MAT_Logo`** | `#ffffff` | **0.70** | 0 / não | Wordmark `jump` branco fosco, redimensionado (0.055) e recentralizado. | Contorno mais limpo em UV dedicada (anti-blur a 40–64 px); sem emissão. |

> **Acento de marca:** Laranja Jump `#ff7a18` **não** está nos 7 materiais — é
> reservado e vive **só** em decal de textura (ex.: tênis) ou nos **acessórios
> GLB** (ver [`ACCESSORIES.md`](./ACCESSORIES.md) / `ACCESSORY_PIPELINE.md`).
> Verde/amarelo/cyan/lilás/coral idem: só em detalhes/acessórios.

---

## O que ainda está simples (dívida conhecida)

- **Sem texturas** ainda: todos os materiais são **cor lisa + roughness**. Lê
  muito bem a 40–64 px, mas falta a micro-variação que dá o "premium" em close.
- **Sem blush / sem highlight anisotrópico** modelados ainda (apenas previstos
  no canon).
- **Specular dos olhos** depende da luz da cena (não há catchlight fixo).
- **Costuras/dobras de roupa** são insinuadas pela forma, não pelo material.

---

## Próximos passos concretos (futuro)

Ordenados por **ganho de "premium" / menor custo web**:

1. **Catchlight de olho fixo** — micro-highlight independente de luz (alto ganho
   de empatia, custo quase zero). Ver [`FACE_REFINEMENT_PLAN.md`](./FACE_REFINEMENT_PLAN.md).
2. **Blush sutil em `MAT_Body`** — gradiente quente leve nas maçãs via vertex
   color ou textura pequena; sem novo material.
3. **Highlight anisotrópico estilizado em `MAT_Hair`** — uma faixa de brilho que
   reforça volume e o look "Stylized Premium".
4. **Atlas de textura compartilhado + KTX2/webp 1024²** — quando entrarmos em
   texturas (blush, costuras, faixa de cabelo), consolidar tudo em **um atlas**
   comprimido KTX2 para manter o GLB leve (ver [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md) §3).
5. **Decal laranja do tênis** — única assinatura de marca cromática, em UV
   separada de `MAT_Shoes`, mantendo 7 materiais.
6. **Costuras/dobras estilizadas** de camiseta e calça via mapa de textura no
   atlas — não geometria.

> **Regra de ouro de performance:** todo refino entra como **roughness calibrado,
> 1 highlight ou textura no atlas compartilhado** — nunca como material novo,
> nunca como múltiplas texturas grandes, nunca como metal/emissão na base.

---

## Critérios de aceite (materiais)

- [ ] **Exatamente 7 materiais** com nomes `MAT_*` corretos (validação passa).
- [ ] Cores e roughness batem com a tabela da
      [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md) §Materiais.
- [ ] Metallic = 0 e **sem emissão** em toda a base.
- [ ] Apenas os olhos têm brilho um pouco mais alto (vida no olhar).
- [ ] Laranja Jump e demais acentos **fora** dos 7 materiais (decal/acessório).
- [ ] Acabamento coerente (tudo fosco) — "de um mundo só".
- [ ] Texturas (quando entrarem): 1024², atlas compartilhado, KTX2/webp; GLB
      continua leve.
- [ ] Lê bem a 40–64 px e mantém contraste alto contra a UI clara do JumpFlow.
- [ ] Alinhado a [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md) §7 e à seção
      **MATERIAIS** da [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md).
