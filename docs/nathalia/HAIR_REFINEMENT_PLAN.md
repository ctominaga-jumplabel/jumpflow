# Nathal.IA — Plano de Refinamento do Cabelo (Fase 7 · Etapa 3)

> **Plano de refinamento do cabelo** da Nathal.IA. Documenta o que o builder V2
> (`construct_master_v2.py`) já entregou, o que ainda está simples e os próximos
> passos. Objetivo: **silhueta forte, volume controlado, mechas principais
> legíveis** — mantendo **baixa poligonagem e fácil animação** para web.
>
> Hierarquia de canon: [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md) **vence**; a
> [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md) é a folha visual
> definitiva (cabelo, paleta, materiais); este plano detalha a evolução do cabelo
> dentro desse canon e do contrato técnico ([`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md):
> 7 objetos, 7 materiais, 16 bones). Não gera código nem GLB.
>
> Última atualização: **2026-06-17**.

---

## Resumo em uma frase

O cabelo da V2 ganhou **massa traseira mais cheia + um comprimento traseiro
longo até o meio do tronco, coroa, franja assimétrica fora dos olhos e duas
mechas laterais por lado** emoldurando o rosto abaixo do ombro — reforçando o
**marcador nº 1 da silhueta** sem fios soltos, sem simulação e com clumps de
baixa poligonagem.

---

## Princípios (inegociáveis)

- **Silhueta = marcador nº 1.** Massa escura longa emoldurando rosto claro deve
  ser reconhecível **mesmo borrada** (avatar 40–64 px).
- **Cor única.** `#241f2b` (`MAT_Hair`) — escuro quase preto, alto contraste com
  a UI clara do JumpFlow.
- **Volume controlado.** Emoldura o rosto, soma ~0,25 HU à silhueta da cabeça;
  **nunca** "leão", nunca volume que esconda olhos/sobrancelhas.
- **Franja livre dos olhos.** Assimétrica e suave, mas sempre **off-eyes/brows**
  — a emoção depende de olhos e sobrancelhas visíveis.
- **Web-light.** Mechas como **massas/cards de baixa poligonagem**, não
  partículas/fios. Sem alpha de fios no MVP (cards sólidos).
- **Fácil animação.** Cabelo **majoritariamente rígido** preso à cabeça; sem
  cloth/hair sim. Movimento secundário contido (Playful Ops).

---

## O que a V2 entregou (feito)

| Mecha / massa | O que a V2 fez | Como (no builder) | Estado |
| --- | --- | --- | --- |
| **Massa traseira** | Volume cheio atrás da cabeça, dando corpo à silhueta. | `sphere` em `y=0.07, z=1.22`, `scale (1.18, 0.74, 1.85)`. | **Feito** |
| **Comprimento traseiro** | Mecha longa descendo até **~meio do tronco**. | `sphere` em `z=0.98`, `scale (1.30, 0.55, 1.45)`. | **Feito** |
| **Coroa (crown cap)** | Calota cobrindo o topo do crânio, fechando a silhueta. | `sphere` em `z=1.475`, `scale (1.10, 1.10, 0.70)`. | **Feito** |
| **Franja assimétrica** | Franja suave deslocada para um lado, **fora dos olhos**. | `sphere` em `x=-0.02, y=-0.085, z=1.50`, achatada. | **Feito** |
| **Mechas laterais** | Duas mechas por lado emoldurando o rosto **abaixo do ombro**. | 2 `capsule` por lado de `z≈1.44` até `z≈0.92`. | **Feito** |
| **Materialização** | Tudo em `MAT_Hair` `#241f2b`, fosco-acetinado (rough .45). | Objeto `Hair` único (`assemble`). | **Feito** |
| **Rigidez** | Cabelo preso à cabeça via skinning automático (sem bones próprios). | `_skin` (auto weights). | **Feito** |

---

## O que ainda está simples (dívida conhecida)

| Item | Limitação atual | Por que ainda serve | Risco |
| --- | --- | --- | --- |
| **Mechas** | Clumps de `sphere`/`capsule`; pontas arredondadas, sem "fio". | Lê limpo como mancha; barato para web. | Em close pode parecer "borracha". |
| **Movimento** | 100% rígido à cabeça; nenhum bone de cabelo. | Anima fácil; sem custo de sim. | `Wave`/`Celebrate` ficam estáticos no cabelo (sem follow-through). |
| **Repartição/coroa** | Coroa lisa, sem linha de risca nem direção de fios. | Silhueta de costas já fecha. | Falta direção de fluxo do cabelo na nuca. |
| **Pontas** | Sem afilamento nem leve onda nas pontas (canon pede "levemente ondulado"). | Volume e comprimento já corretos. | Pontas chatas em vista lateral. |
| **Franja** | Massa única; assimetria por posição, não por mecha. | Mantém olhos livres. | Pouca "textura" de franja em close. |

---

## Próximos passos concretos (futuro)

Ordenados por **maior ganho de silhueta/vida / menor custo**:

1. **1–2 bones de cabelo para movimento secundário (alta prioridade).**
   Adicionar `Hair_Back` (e opcionalmente `Hair_Side`) como bones-filhos de
   `Head`, pesando só o comprimento traseiro e as mechas laterais. Ganho:
   follow-through leve em `Wave`/`Celebrate`/`Greeting` (Playful Ops) sem sim.
   **Atenção ao contrato:** o GLB hoje tem 16 bones — adicionar bones de cabelo
   exige atualizar o contrato/validador junto, ou implementar como **shape keys
   de "sway"** caso queiramos manter 16 bones fixos.

2. **Afilamento e leve onda nas pontas.**
   Estreitar as pontas das mechas laterais e do comprimento traseiro e dar uma
   curva suave (canon: "liso a levemente ondulado nas pontas") — melhora a vista
   lateral e o 3/4 hero sem custo de polígonos relevante.

3. **Cards de franja separados (2–3) para textura leve.**
   Quebrar a franja única em 2–3 cards sobrepostos com leve variação, mantendo a
   abertura sobre olhos/sobrancelhas. Dá "cabelo", não "capacete", em close.

4. **Direção de fluxo na coroa/nuca.**
   Sutil sulco/repartição na crown cap e na massa traseira (geometria, não
   textura) para a vista de costas ter leitura de divisão natural.

5. **Highlight anisotrópico estilizado (ver MATERIAL_REFINEMENT_PLAN).**
   Uma faixa de brilho única ao longo do comprimento (via material/textura, não
   geometria) reforça volume e "premium estilizado" sem pesar.

> Todos os itens futuros **devem preservar** a silhueta-mancha legível a 40–64 px
> e a leveza para web. Nada de hair/cloth sim no MVP. Qualquer bone novo precisa
> de decisão de contrato registrada em [`DECISIONS.md`](./DECISIONS.md).

---

## Critérios de aceite (cabelo)

- [ ] Silhueta reconhecível como **mancha escura longa** a 40–64 px.
- [ ] Cor exata `#241f2b` (`MAT_Hair`), alto contraste com a UI clara.
- [ ] Franja **fora dos olhos e sobrancelhas** (emoção preservada).
- [ ] Volume controlado (~0,25 HU somados à cabeça); nunca "leão".
- [ ] Comprimento até ~meio do tronco nas costas.
- [ ] Sem fios soltos / sem sim; clumps de baixa poligonagem.
- [ ] Movimento secundário (se adicionado) é **contido** e tem fallback estático
      (reduced-motion).
- [ ] Contrato preservado (ou decisão de contrato registrada se bones forem
      adicionados).
- [ ] Alinhado à seção **CABELO** da [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md).
