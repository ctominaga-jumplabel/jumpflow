# Nathal.IA — Accessory Pipeline

> **Pipeline técnico dos acessórios/props** da Nathal.IA. Onde
> [`ACCESSORIES.md`](./ACCESSORIES.md) define o **catálogo visual**, este
> documento define **como construí-los e exportá-los** de forma consistente:
> nomenclatura, materiais, escala e ponto de encaixe.
>
> Regra-mãe (D-001): acessórios são **opcionais e derivados**. O `master.glb` é
> completo **sem** nenhum deles. Cada acessório é um **`.glb` próprio**,
> carregado sob demanda na **Fase 6** — **nunca** embutido no `master.glb`.
>
> Última atualização: **2026-06-16**.

---

## Acessórios oficiais

`clipboard`, `clock`, `kanban`, `report`, `chart`, `approval_stamp`
(catálogo e direção visual em [`ACCESSORIES.md`](./ACCESSORIES.md)).

---

## 1. Nomenclatura

| Item | Convenção | Exemplo |
| --- | --- | --- |
| Arquivo | `accessory-<key>.glb` | `accessory-clipboard.glb` |
| Objeto raiz | `Acc_<PascalKey>` | `Acc_Clipboard` |
| Material | `MAT_Acc_<PascalKey>` | `MAT_Acc_Clipboard` |
| Pasta | `paths.accessoriesDir` | `.../assets/models/accessories/` |

- `key` em `snake_case` minúsculo (igual ao catálogo e ao `nathaliaContext`).
- Sem acentos, espaços ou sufixos `.001`.

---

## 2. Materiais

- **Material próprio** por acessório (`MAT_Acc_*`) — nunca reaproveitar
  `MAT_Body`/`MAT_Shirt` etc.
- Paleta restrita: base preto/branco + **laranja Jump** como acento; cores vivas
  **só** para codificar significado (verde sucesso, amarelo/coral alerta).
- Foscos, sem metal/emissão (igual à personagem).
- Texto/checkboxes como **decal na textura**, não geometria.

---

## 3. Escala

- Mesma unidade do master: **1 unidade = 1 metro**.
- Dimensionar relativo à **mão** (`Hand.*` ≈ 0,16 m) ou ao **tronco**:
  - props de mão (`clipboard`, `clock`, `report`, `approval_stamp`): ~0,15–0,25 m.
  - props "de cena" (`kanban`, `chart`): ~0,3–0,5 m, flutuando ao lado.
- Low-poly: somados, **não** comprometem o orçamento web
  ([`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md) §9). Cada acessório alvo ≤ ~2k tris.

---

## 4. Ponto de encaixe (attach point)

| Tipo | Encaixe | Bone/alvo |
| --- | --- | --- |
| Prop de mão | segue a mão | `Hand.L` ou `Hand.R` |
| Prop de cena | plano fixo ao lado | offset do root `Nathalia` |

- **Origem do acessório** no ponto de contato com a mão (não no centro do mesh),
  para que o parent ao bone fique natural.
- Orientação coerente com a personagem (olhar `-Z`, +Y up).
- O acessório é **parented em runtime** (Fase 6) ao bone — não soldado à malha.

| Acessório | Tipo | Encaixe padrão |
| --- | --- | --- |
| `clipboard` | mão | `Hand.L` |
| `clock` | mão / cena | `Hand.R` ou cena |
| `kanban` | cena | offset lateral |
| `report` | mão | `Hand.L` |
| `chart` | cena | offset lateral |
| `approval_stamp` | mão | `Hand.R` |

---

## 5. Export (Fase 6)

- Cada acessório exporta um `.glb` independente em `accessoriesDir`, glTF 2.0
  binário, texturas embutidas, Draco, **sem câmeras/luzes**.
- Validar contra o orçamento com `validate_glb.py` (modo estrutural já cobre
  contagens; geometria exige Blender).
- Carregamento **sob demanda** no runtime, nunca no bundle inicial.

> Os scripts de export de acessórios entram na **Fase 6**. Nesta fase (4) só a
> convenção fica definida; nenhum `.glb` de acessório é gerado.
