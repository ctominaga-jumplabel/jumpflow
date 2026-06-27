# Nathal.IA — Plano de Refinamento Facial (Fase 7 · Etapa 2)

> **Plano de refinamento do rosto** da Nathal.IA. Documenta o que o builder V2
> (`construct_master_v2.py`) já entregou, o que ainda está simples e quais são os
> próximos passos concretos. Objetivo: **empatia, leitura em tamanhos pequenos,
> rosto amigável e profissional** — sem cair em hiper-realismo, anime ou
> uncanny valley.
>
> Hierarquia de canon: [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md) (personalidade
> e direção) **vence**; a [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md)
> é a folha visual definitiva (proporções, rosto, paleta, materiais); este plano
> apenas **detalha a evolução facial** dentro desse canon e do contrato técnico
> ([`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md): 7 objetos, 7 materiais,
> 16 bones). Não gera código nem GLB.
>
> Última atualização: **2026-06-17**.

---

## Resumo em uma frase

O rosto da V2 ganhou **sobrancelhas, íris/pupila e linha de boca com cantos
levemente erguidos** (micro-sorriso de repouso) e um **plano de nariz suave**,
todos dobrados na malha `Body` como segundo slot `MAT_Hair` — para que as
**shape keys faciais os deformem** — entregando muito mais leitura emocional a
40–64 px sem aumentar a contagem de objetos ou materiais.

---

## Princípios (inegociáveis)

- **Empatia primeiro.** Sobrancelhas + boca são os principais motores de emoção;
  olhos dão vida; o rosto de repouso já é acolhedor (micro-sorriso), nunca frio.
- **Leitura pequena.** Tudo precisa funcionar como **mancha legível a 40–64 px**.
  Sem microdetalhe que vire ruído (sem cílios individuais, sem poros, sem rugas).
- **Olhos proporcionais.** ~0,18 HU de largura. **Não** anime gigante, **não**
  realismo de íris fotográfica.
- **Anti-uncanny.** Estilizado "Pixar/Notion/Duolingo-like com identidade
  própria". Sem sombreamento dramático, sem sub-superfície pesada, sem assimetrias
  involuntárias (a única assimetria intencional é a franja).
- **Contrato técnico preservado.** Os detalhes faciais **não** criam novos
  objetos nem materiais: vivem dentro de `Body` com slot `MAT_Hair` (escuro),
  para deformar junto com as shape keys.

---

## O que a V2 entregou (feito)

| Elemento | O que a V2 fez | Como (no builder) | Estado |
| --- | --- | --- | --- |
| **Sobrancelhas** | Barras finas e arqueadas, escuras (`MAT_Hair`), uma acima de cada olho, com leve inclinação para fora. | `box` por lado em `z≈1.474`, rotacionada `-6°·s`, dentro de `Body`. | **Feito** |
| **Íris / pupila** | Disco escuro achatado à frente da esclera branca, dando direção ao olhar. | `sphere` achatada (`scale y=0.45`) por lado em `EYE_Z=1.43`, `MAT_Hair`. | **Feito** |
| **Esclera** | Branco levemente off-white, leve brilho de vida. | Objeto `Eyes` (`MAT_Eyes`), com toque de specular (~0.6). | **Feito** |
| **Boca** | Linha de boca suave com **cantos erguidos** → micro-sorriso de repouso. | `box` central + duas `sphere` nos cantos elevados (`MOUTH_Z+0.006`). | **Feito** |
| **Nariz** | Plano pequeno, suave, cor de pele — apenas uma "dica" no perfil. | `sphere` pequena em `y=-0.128`, `z=1.405`, `MAT_Body`. | **Feito** |
| **Shape keys** | 10 deformadores faciais (V1: 7 + V2: `Curious`, `Greeting`, `Celebrate`) que **deformam os detalhes** porque estão na mesma malha. | `_add_shape_keys(body)`. | **Feito** |
| **Repouso acolhedor** | Olhos abertos + micro-sorriso + sobrancelhas relaxadas já no neutro. | Geometria-base + `Smile` modulável. | **Feito** |

---

## O que ainda está simples (dívida conhecida)

| Item | Limitação atual | Por que ainda serve | Risco |
| --- | --- | --- | --- |
| **Sobrancelhas** | `box` retangular rígida; só sobe/desce em bloco via shape key. | Lê bem como mancha; é o motor de emoção principal. | Em close (>200 px) parece "barra", não pelo. |
| **Pálpebras** | Não há pálpebra modelada; `Blink` empurra a parte de cima da malha do olho. | Piscar funciona como leitura. | Sem peso de pálpebra superior definindo o olhar. |
| **Íris** | Disco chapado, sem highlight próprio (o brilho é só o specular da esclera). | Direção do olhar fica legível. | Olho pode parecer "morto" em luz frontal forte. |
| **Boca** | Linha + 2 cantos; sem volume de lábio nem dentes. | Sorriso de repouso e `OpenMouth` leem bem. | Sorriso aberto "mostra de dentes" do canon ainda não existe. |
| **Nariz** | Plano único, sem narina nem ponte. | Mantém "quase plano" do canon. | Some em frontal achatada (aceitável). |
| **Bochechas** | Sem volume modelado nem blush. | Forma oval já transmite jovialidade. | Falta o "lift" de bochecha em sorrisos fortes. |

---

## Próximos passos concretos (futuro)

Ordenados por **maior ganho de empatia / menor custo**:

1. **Pálpebra superior como deformador próprio (alta prioridade).**
   Modelar uma fina pálpebra (cor de pele, parte de `Body`) sobre cada olho e
   fazer `Blink_L/R` mover **a pálpebra**, não a esclera. Ganho: olhar com peso,
   piscar crível, base para `Sad`/`Thinking` (pálpebra meio-baixa).

2. **Sobrancelha com leve arqueamento de malha + bone-less tilt.**
   Trocar a `box` por uma barra de 3–4 segmentos levemente curvada, e dar a cada
   sobrancelha um par de shape keys dedicado (`Brow_Up_L/R`, `Brow_Down_L/R`)
   para emoções assimétricas (`Curious`) sem mexer no resto da testa.

3. **Highlight de íris (catchlight) (baixo custo, alto ganho).**
   Um micro-ponto branco fixo no canto superior da íris (geometria minúscula em
   `MAT_Eyes` ou via material) → "brilho de vida" do canon, sem depender da luz
   da cena. Reforça empatia mesmo a 48 px.

4. **Volume sutil de lábio + mostra de dentes no sorriso aberto.**
   Dar leve espessura à linha de boca e uma faixa clara interna (parte de `Body`,
   sem novo material) revelada só por `Greeting`/`Celebrate`/`OpenMouth`.
   Mantém a boca "fechada-sorrindo" no repouso e cumpre o "leve mostra de dentes
   superiores" do canon.

5. **Lift de bochecha vinculado ao sorriso.**
   Pequeno deslocamento de malha nas maçãs do rosto dentro de `Smile`/`Greeting`
   para o sorriso parecer genuíno (olhos "sorriem" junto), não apenas a boca.

6. **Blush sutil como gradiente de material (ver MATERIAL_REFINEMENT_PLAN).**
   Acento quente muito leve nas maçãs via textura/vertex color de `MAT_Body` —
   **não** como novo material. Reforça jovialidade e calor.

> Todos os itens futuros **devem preservar** o contrato: nada de novos objetos ou
> materiais; detalhes faciais continuam em `Body`/`MAT_Hair`/`MAT_Body`/`MAT_Eyes`
> e deformáveis por shape keys.

---

## Critérios de aceite (rosto)

- [ ] A 40–64 px o rosto lê como **simpático e atento** (micro-sorriso visível).
- [ ] Sobrancelhas + boca comunicam a emoção **sem depender de movimento**
      (pose estática equivalente — ecoa [`EXPRESSIONS.md`](./EXPRESSIONS.md)).
- [ ] Olhos proporcionais (~0,18 HU), **nunca** anime gigante.
- [ ] Sem uncanny: sem realismo de pele, sem sombra dramática, sem assimetria
      involuntária.
- [ ] Detalhes faciais deformam corretamente com as 10 shape keys.
- [ ] Contrato preservado: 7 objetos / 7 materiais / 16 bones.
- [ ] Alinhado a [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md) §3–7 e à seção
      **ROSTO** da [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md).
