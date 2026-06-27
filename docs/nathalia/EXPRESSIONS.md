# Nathal.IA — Expressões (Expression Sheet)

> Catálogo definitivo das **expressões faciais + linguagem corporal de apoio** da
> Nathal.IA. Fonte de verdade para shape keys (Blender), animação e geração por
> IA. Não gera código nem GLB.
>
> Cada expressão mapeia para as **7 shape keys canônicas** do `master.glb`
> (`Smile, Blink_L, Blink_R, Thinking, Surprised, OpenMouth, Sad` —
> [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md) §7) e se conecta aos **estados
> emocionais** do pacote (`nathaliaStates.ts`).
>
> Direção emocional canônica: [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md) §3–5.
> Rosto-base e materiais: [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md).
>
> Última atualização: **2026-06-16**.

## Como ler esta folha

Para cada expressão definimos: **objetivo**, **quando usar** (estado/contexto),
**olhos**, **sobrancelhas**, **boca**, **cabeça** e **corpo**, além das **shape
keys** envolvidas e sua intensidade aproximada (0–1).

**Regras transversais (valem para todas):**

- **Nunca infantil, nunca fria, nunca sarcástica.** Toda emoção passa por
  "colega querida e competente".
- **Sobrancelhas + boca** são os principais motores; olhos dão vida; cabeça/corpo
  reforçam.
- **Reduced-motion:** toda expressão tem uma **pose estática** equivalente (sem
  transição animada) — a emoção nunca depende só de movimento.
- **Piscar** (`Blink_L`+`Blink_R`) é independente e aleatório em quase todos os
  estados (vida do idle), exceto `Surprised` (olhos arregalados).
- Expressões são **combináveis** com gestos corporais (ver
  [`GESTURES.md`](./GESTURES.md)) e com `OpenMouth` modulado durante a fala.

---

## 1. Neutral (repouso atento)

- **Objetivo:** presença calma e acolhedora; "estou aqui, pronta pra ajudar".
- **Quando usar:** `idle`, `listening`. Estado-base do avatar.
- **Olhos:** abertos, atentos, foco suave na câmera/usuário. Piscar aleatório.
- **Sobrancelhas:** relaxadas, levemente arqueadas (nunca planas/sérias).
- **Boca:** **micro-sorriso** (cantos levemente para cima). Boca fechada.
- **Cabeça:** ereta, leve inclinação amigável (~2–5°).
- **Corpo:** A-Pose leve, respiração sutil (idle vivo).
- **Shape keys:** `Smile` ~0.25; piscar aleatório.

## 2. Happy (feliz / sucesso)

- **Objetivo:** celebrar com o usuário, confirmar que deu certo.
- **Quando usar:** `happy`, `success` (horas enviadas, aprovação concluída).
- **Olhos:** vivos, levemente fechados pelo sorriso (bochecha sobe).
- **Sobrancelhas:** elevadas e relaxadas.
- **Boca:** **sorriso aberto**, leve mostra de dentes superiores.
- **Cabeça:** ereta ou leve para cima, pequeno aceno positivo.
- **Corpo:** ombros abertos, leve energia para cima (pode combinar com `ThumbsUp`).
- **Shape keys:** `Smile` ~0.9; `OpenMouth` ~0.2.

## 3. Thinking (pensando)

- **Objetivo:** sinalizar processamento sem ansiedade; "deixa eu ver isso".
- **Quando usar:** `thinking`, `searching` (analisando, buscando dados).
- **Olhos:** desviados para cima/lado (olhar de busca), foco interno.
- **Sobrancelhas:** uma levemente mais alta que a outra (curiosidade), leve
  franzir central suave.
- **Boca:** fechada, levemente comprimida ou meio-sorriso pensativo.
- **Cabeça:** inclinada para um lado (~8–10°).
- **Corpo:** pode combinar com gesto `thinking` (mão ao queixo).
- **Shape keys:** `Thinking` ~0.7; `Smile` ~0.15.

## 4. Explaining (explicando)

- **Objetivo:** orientar com clareza e didatismo amigável.
- **Quando usar:** `explaining`, `pointing` (passo a passo, tours, dicas).
- **Olhos:** abertos, contato direto, animados.
- **Sobrancelhas:** uma erguida (ênfase didática), móveis.
- **Boca:** **falando** — `OpenMouth` modulado, meio-sorriso de base.
- **Cabeça:** acenos curtos de ênfase, leve aproximação.
- **Corpo:** combina com gesto `explain`/`point` (mãos apresentando/apontando).
- **Shape keys:** `OpenMouth` 0.1–0.5 (modulado pela fala); `Smile` ~0.2; leve `Thinking` ~0.15 para ênfase.

## 5. Surprised (surpresa)

- **Objetivo:** reagir a algo inesperado (positivo ou neutro), com leveza.
- **Quando usar:** reações pontuais (novidade, número fora do esperado). Curto.
- **Olhos:** **arregalados** (sem piscar durante o pico), íris bem visível.
- **Sobrancelhas:** ambas elevadas.
- **Boca:** levemente aberta, formato "oh".
- **Cabeça:** leve recuo/para trás.
- **Corpo:** pequeno respingo de energia, ombros sobem rápido e relaxam.
- **Shape keys:** `Surprised` ~0.8; `OpenMouth` ~0.4; piscar suprimido no pico.
- **Nota:** sempre **leve e simpática** — surpresa curiosa, nunca de susto/medo.

## 6. Warning (alerta / atenção)

- **Objetivo:** chamar atenção para uma pendência ou ação sensível **sem
  assustar nem culpar**.
- **Quando usar:** `warning`, `error` (pendência de horas, confirmação sensível).
- **Olhos:** atentos, levemente estreitados, foco firme.
- **Sobrancelhas:** **franzidas amigáveis** (preocupação gentil, nunca brava).
- **Boca:** fechada, levemente comprimida; canto leve para baixo (sem drama).
- **Cabeça:** leve inclinação, posição de "atenção, vamos resolver".
- **Corpo:** mão aberta em "pausa/atenção" leve; postura contida.
- **Shape keys:** `Sad` ~0.3 (suave, **nunca** dramático); `Thinking` ~0.2.
- **Nota:** o tom é "ei, faltou isso, vamos juntos" — nunca "você errou".

## 7. Celebrate (comemorando)

- **Objetivo:** festejar uma conquista maior (fechamento, meta, marco).
- **Quando usar:** `celebrate`. Reação `once`, mais ampla que `happy`.
- **Olhos:** brilhando, sorriso chegando aos olhos.
- **Sobrancelhas:** bem elevadas, animadas.
- **Boca:** **sorriso grande aberto**, dentes visíveis.
- **Cabeça:** levantada, enérgica.
- **Corpo:** **braços para cima/abertos**, leve salto/bounce (combina com gesto `celebrate`); pode ter confete na cena (UI), não no modelo.
- **Shape keys:** `Smile` 1.0; `OpenMouth` ~0.5.

## 8. Curious (curiosa)

- **Objetivo:** convidar à interação, demonstrar interesse genuíno.
- **Quando usar:** abrir sugestões, oferecer ajuda proativa, descoberta.
- **Olhos:** bem abertos, atentos, leve brilho de interesse.
- **Sobrancelhas:** ambas levemente elevadas (interesse), uma um pouco mais.
- **Boca:** meio-sorriso aberto/expectante.
- **Cabeça:** inclinada para o lado (~10°), aproximação leve.
- **Corpo:** levemente inclinada para frente, abertura.
- **Shape keys:** `Surprised` ~0.25; `Smile` ~0.3; `Thinking` ~0.2.
- **Nota:** distinta de `Surprised` (que é reação curta) — `Curious` é um
  **convite sustentado**, mais suave.

## 9. Focused (focada / concentrada)

- **Objetivo:** mostrar que está trabalhando/executando uma tarefa a sério.
- **Quando usar:** processamento mais longo, "digitando", execução de ação.
- **Olhos:** foco firme à frente/no "trabalho", piscar reduzido.
- **Sobrancelhas:** levemente baixas e estáveis (concentração, **não** raiva).
- **Boca:** fechada, neutra-determinada, leve compressão.
- **Cabeça:** estável, leve para frente.
- **Corpo:** combina com gesto `typing`; ombros estáveis.
- **Shape keys:** `Thinking` ~0.3; `Smile` ~0.1.
- **Nota:** transmite competência tranquila — concentrada, mas ainda acessível.

## 10. Greeting (saudação / boas-vindas)

- **Objetivo:** receber bem, primeira impressão calorosa.
- **Quando usar:** `welcome` (entrada no app, início de tour, primeiro contato).
- **Olhos:** abertos, calorosos, contato direto.
- **Sobrancelhas:** elevadas, abertas (acolhimento).
- **Boca:** **sorriso aberto amistoso**.
- **Cabeça:** leve aceno, inclinação amigável.
- **Corpo:** combina com gesto `wave`/`greeting` (acenar); postura aberta,
  levemente voltada ao usuário.
- **Shape keys:** `Smile` ~0.8; `OpenMouth` ~0.2 (se "oi!").

---

## Mapa rápido: estado → expressão → shape keys

| Estado (`nathaliaStates`) | Expressão | Shape keys dominantes |
| --- | --- | --- |
| `idle`, `listening` | Neutral | `Smile` 0.25 + piscar |
| `welcome` | Greeting | `Smile` 0.8, `OpenMouth` 0.2 |
| `thinking`, `searching` | Thinking | `Thinking` 0.7 |
| `explaining`, `pointing` | Explaining | `OpenMouth` mod., `Smile` 0.2 |
| `happy`, `success` | Happy | `Smile` 0.9, `OpenMouth` 0.2 |
| `warning`, `error` | Warning | `Sad` 0.3, `Thinking` 0.2 |
| `celebrate` | Celebrate | `Smile` 1.0, `OpenMouth` 0.5 |
| (proativo/descoberta) | Curious | `Surprised` 0.25, `Smile` 0.3 |
| (execução/digitando) | Focused | `Thinking` 0.3 |
| (reação pontual) | Surprised | `Surprised` 0.8, `OpenMouth` 0.4 |

> **Combinação canônica:** expressão (shape keys) + gesto corporal
> ([`GESTURES.md`](./GESTURES.md)) + `OpenMouth` modulado na fala. O idle vivo =
> `Neutral` + piscar aleatório + respiração. Tudo respeita `prefers-reduced-motion`
> (ver [`ANIMATION_GUIDE.md`](./ANIMATION_GUIDE.md)).
