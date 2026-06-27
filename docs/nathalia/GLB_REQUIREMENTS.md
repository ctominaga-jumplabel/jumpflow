# Nathal.IA — Requisitos do `master.glb`

> Contrato técnico do modelo 3D final da Nathal.IA. O `master.glb` é a **fonte
> de verdade** da personagem (ver [`DECISIONS.md`](./DECISIONS.md)). Toda
> exportação, validação automática e integração em React Three Fiber assume os
> requisitos abaixo.
>
> Estes valores também são refletidos em
> [`../../scripts/nathalia/nathalia_assets.config.json`](../../scripts/nathalia/nathalia_assets.config.json),
> consumido pelos scripts de validação.

## 1. Formato e transform

| Item | Requisito |
| --- | --- |
| Formato | **glTF 2.0 binário (`.glb`)**, texturas embutidas |
| Escala | **1 unidade = 1 metro** |
| Origem | **Base no chão**, centralizada em `(0, 0, 0)` |
| Orientação | Personagem **olhando para `-Z`** (padrão glTF / three.js) |
| Eixo "para cima" | **+Y** |
| Câmeras / luzes | **Nenhuma** embutida (iluminação vem da cena) |

## 2. Polycount (orçamento)

| Alvo | Triângulos |
| --- | --- |
| **MVP** | até **25.000** |
| **Ideal web** | até **40.000** |
| **Máximo aceitável** | **60.000** |

Acima de 60k a validação deve **reprovar** (ver `validate_glb.py`).

## 3. Texturas

- Preferir **1024×1024**.
- Máximo **2048×2048**.
- Evitar múltiplas texturas grandes — atlas/compartilhamento quando possível.
- Preferir `.webp` / Basis (KTX2) quando o pipeline suportar.
- Compressão de malha recomendada: **Draco** ou **Meshopt**.

## 4. Materiais (nomes padronizados)

| Material | Aplica em |
| --- | --- |
| `MAT_Body` | Pele |
| `MAT_Hair` | Cabelo |
| `MAT_Shirt` | Camiseta preta |
| `MAT_Pants` | Calça |
| `MAT_Shoes` | Tênis |
| `MAT_Eyes` | Olhos |
| `MAT_Logo` | Wordmark **jump** |

## 5. Objetos (meshes nomeados)

| Objeto | Conteúdo |
| --- | --- |
| `Body` | Corpo + cabeça + pele |
| `Hair` | Cabelo |
| `Shirt` | Camiseta |
| `Pants` | Calça |
| `Shoes` | Tênis |
| `Eyes` | Olhos |
| `Logo` | Logo no peito |

## 6. Rig (esqueleto esperado)

Ossos mínimos (nomes exatos, sufixo `.L`/`.R` para lados):

```text
Pelvis
Spine
Neck
Head
UpperArm.L   UpperArm.R
LowerArm.L   LowerArm.R
Hand.L       Hand.R
UpperLeg.L   UpperLeg.R
LowerLeg.L   LowerLeg.R
Foot.L       Foot.R
```

> Rig humanoide simples; sem dedos individuais nesta fase (mãos simples — ver
> [`CHARACTER_SHEET_SPEC.md`](./CHARACTER_SHEET_SPEC.md)).

## 7. Shape keys (blend shapes)

Para expressões faciais (mapeadas das expressões da Character Sheet):

| Shape key | Efeito |
| --- | --- |
| `Smile` | Sorriso |
| `Blink_L` | Piscar olho esquerdo |
| `Blink_R` | Piscar olho direito |
| `Thinking` | Olhar pensativo / sobrancelha |
| `Surprised` | Surpresa (olhos/boca) |
| `OpenMouth` | Boca aberta (fala) |
| `Sad` | Tristeza / alerta suave |

## 8. Animações / Actions (clipes)

Clipes nomeados dentro do rig (alinhados a `nathaliaAnimations.ts`):

| Action | Estado(s) | Loop |
| --- | --- | --- |
| `Idle` | idle, listening | loop |
| `Wave` | welcome | once |
| `Thinking` | thinking, searching | loop |
| `Pointing` | pointing | once |
| `Explaining` | explaining | loop |
| `Celebrate` | celebrate | once |
| `Typing` | (futuro: digitando) | loop |
| `Alert` | warning, error | once |

> O pacote atual usa chaves de clipe um pouco diferentes (`Nod`, `LookAround`,
> `Point`, `Happy`, `Warn`, `Shrug`, `ThumbsUp`). Na integração (Fase 5+), o
> mapeamento clip-do-rig → estado será reconciliado em `nathaliaAnimations.ts`.
> A validação trata nomes de animação de forma **tolerante** (não reprova por
> nome divergente, apenas reporta).

## 9. Performance (orçamento de entrega)

- `.glb` final ≤ **~1.5 MB** (idealmente < 1 MB) após compressão.
- Carregar **sob demanda** (só quando o avatar/painel 3D for exibido).
- Fornecer thumbnails 2D como fallback (ver `generate_thumbnails.py`).
- Respeitar `prefers-reduced-motion` na integração.

## 10. Checklist de aceite (resumo)

Um `master.glb` é aceito quando:

- [ ] Abre como glTF 2.0 válido.
- [ ] Escala em metros, base em `(0,0,0)`, olhar para `-Z`.
- [ ] ≤ 60k triângulos (idealmente ≤ 40k).
- [ ] Texturas ≤ 2048², preferindo 1024².
- [ ] Materiais e objetos com os nomes padronizados (seções 4 e 5).
- [ ] Rig com os ossos da seção 6.
- [ ] Shape keys da seção 7 presentes.
- [ ] Actions da seção 8 presentes (nomes tolerantes).
- [ ] `.glb` ≤ ~1.5 MB.

A verificação automatizada vive em
[`../../scripts/nathalia/validate_glb.py`](../../scripts/nathalia/validate_glb.py).
