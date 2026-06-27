# Nathal.IA — Character Sheet Spec (Premium)

> Especificação da **Character Sheet** (folha de personagem) necessária para
> gerar o modelo base e, depois, o `master.glb`. Esta folha é o briefing visual
> entregue ao pipeline de geração 3D (Tripo) e ao refinamento (Blender).
>
> Personalidade e direção visual: [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md).
> Requisitos do modelo final: [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md).

## Objetivo

Produzir um conjunto de imagens de referência **consistentes** (mesma
personagem, mesmas proporções, mesmas cores) que permitam:

1. Gerar um modelo base no Tripo (ou similar) com fidelidade.
2. Servir de referência durante o rig e o sculpt no Blender.
3. Validar visualmente o `master.glb` exportado.

## 1. Vistas obrigatórias (turnaround)

Todas em fundo neutro, iluminação plana e uniforme, **sem sombras dramáticas**,
personagem centralizada, escala consistente entre vistas.

| Vista | Descrição | Uso |
| --- | --- | --- |
| **Frontal** | De frente, olhar para a câmera | Silhueta, proporções, rosto |
| **Lateral esquerda** | Perfil esquerdo (90°) | Volume do cabelo, postura |
| **Lateral direita** | Perfil direito (90°) | Simetria, volume |
| **Traseira** | De costas | Cabelo, costas da camiseta |
| **3/4** | Frente-lateral (~45°) | Leitura geral, pose "hero" |

## 2. Closes (detalhe)

| Close | O que mostrar |
| --- | --- |
| **Rosto** | Olhos, sobrancelhas, boca, franja — referência das expressões |
| **Cabelo** | Volume, franja suave, comprimento, mechas |
| **Camiseta + logo** | Wordmark **jump** (minúsculas, branco) no peito, caimento |
| **Tênis** | Modelo claro, solado, laços — leitura em tamanho pequeno |
| **Mãos e gestos** | Mão aberta, apontando, polegar para cima, acenando |

## 3. Expressões (folha de expressões)

Sete expressões mínimas, alinhadas aos estados do pacote
(`nathaliaStates.ts`). Cada uma com close de rosto:

| Expressão | Estado(s) relacionado(s) | Leitura |
| --- | --- | --- |
| **Neutra** | `idle`, `listening` | Repouso atento, sorriso leve |
| **Feliz** | `happy`, `success` | Sorriso aberto, olhos vivos |
| **Pensando** | `thinking`, `searching` | Olhar para cima/lado, dedo no queixo |
| **Explicando** | `explaining`, `pointing` | Sobrancelha erguida, boca falando |
| **Surpresa** | (reações) | Olhos arregalados, boca aberta leve |
| **Alerta** | `warning`, `error` | Sobrancelhas franzidas amigáveis, atenção |
| **Comemorando** | `celebrate` | Sorriso grande, energia, braços |

> As expressões devem mapear para as **shape keys** definidas em
> [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md) (`Smile`, `Blink_L`, `Blink_R`,
> `Thinking`, `Surprised`, `OpenMouth`, `Sad`).

## 4. Proporções (model sheet)

Anotar na folha com linhas-guia de altura (cabeças):

- **Cabeça levemente maior** que o realista — apelo de simpatia.
- **Corpo compacto** (estilizado, ~4–5 cabeças de altura total).
- **Mãos simples** (dedos legíveis, sem hiperdetalhe).
- **Pernas curtas/médias**.
- Olhos **proporcionais e expressivos** (não anime gigante, não realista).

## 5. Pose recomendada (pose de modelagem)

Para facilitar rig e skinning, a folha-base deve usar:

- **A-Pose leve** (não T-Pose).
- Braços afastados do corpo **~30 graus**.
- **Pés paralelos**, apoiados no chão.
- **Olhar frontal**, neutro.
- Mãos relaxadas, dedos levemente abertos.

## 6. Vestuário (referência de design)

- Camiseta **preta** (`#111814`), wordmark **jump** branco, minúsculas, centralizado no peito.
- Calça **casual** escura (jeans/sarja).
- **Tênis claros** (off-white / cinza claro).
- Pequenos acentos **laranja Jump** (`#ff7a18`) em detalhes (ex.: cadarço, etiqueta).

## 7. Diretrizes de geração (consistência)

Para manter a mesma personagem entre imagens:

- Fixar **seed/prompt-base** quando usar geração assistida.
- Repetir descrição de cores e proporções em **todos** os prompts.
- Gerar turnaround a partir da **mesma imagem hero** quando a ferramenta permitir.
- Revisar contra o `CHARACTER_BIBLE.md` antes de aprovar.

## 8. Entregáveis desta folha

```text
docs/nathalia/sheet/            (a criar na Fase 3 — imagens não versionadas se pesadas)
  nathalia-front.png
  nathalia-left.png
  nathalia-right.png
  nathalia-back.png
  nathalia-three-quarter.png
  nathalia-face-closeup.png
  nathalia-hair-closeup.png
  nathalia-shirt-logo.png
  nathalia-shoes.png
  nathalia-hands.png
  nathalia-expressions.png      (folha com as 7 expressões)
```

> Imagens grandes **não** são versionadas nesta fase (ver [`DECISIONS.md`](./DECISIONS.md)).
> A produção das imagens é trabalho da **Fase 3** (ver [`NEXT_PHASES.md`](./NEXT_PHASES.md)).
