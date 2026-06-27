# Master Validation Report — Nathal.IA `<arquivo>`

> **Modelo de relatório** gerado por
> [`report_master.py`](../../../scripts/nathalia/blender/report_master.py) ao
> validar um candidato a `master.glb`. Copie este arquivo como
> `MASTER_VALIDATION_<data>.md` (ou deixe o script preenchê-lo) e registre o
> resultado. Critérios em
> [`MASTER_GLB_ACCEPTANCE_CHECKLIST.md`](../MASTER_GLB_ACCEPTANCE_CHECKLIST.md).
>
> Resultado final possível: **PASS** · **WARNING** · **FAIL**.

---

## Resumo

| Campo | Valor |
| --- | --- |
| Arquivo | `<nome>.glb` / `master.blend` |
| Data | `<AAAA-MM-DD>` |
| Modo | Blender / estrutural |
| Tamanho | `<x> MB` |
| Resultado final | **PASS / WARNING / FAIL** |

> Frase de uma linha sobre o estado geral.

---

## Objetos

Esperados (7): `Body`, `Hair`, `Eyes`, `Shirt`, `Pants`, `Shoes`, `Logo`.

| Objeto | Presente? | Observação |
| --- | --- | --- |
| Body | ✅/❌ | |
| Hair | ✅/❌ | |
| Eyes | ✅/❌ | |
| Shirt | ✅/❌ | |
| Pants | ✅/❌ | |
| Shoes | ✅/❌ | |
| Logo | ✅/❌ | |

Status: **PASS / WARNING / FAIL**

---

## Materiais

Esperados (7): `MAT_Body`, `MAT_Hair`, `MAT_Eyes`, `MAT_Shirt`, `MAT_Pants`,
`MAT_Shoes`, `MAT_Logo`.

| Material | Presente? | Observação |
| --- | --- | --- |
| MAT_Body | ✅/❌ | |
| ... | | |

Status: **PASS / WARNING / FAIL**

---

## Rig

- Armature presente: ✅/❌
- Bones (16) presentes: ✅/❌
- Hierarquia confere: ✅/❌

| Bone | Presente? | Pai correto? |
| --- | --- | --- |
| Pelvis | ✅/❌ | — |
| ... | | |

Status: **PASS / WARNING / FAIL**

---

## Shape Keys

Esperadas (7): `Smile`, `Blink_L`, `Blink_R`, `Thinking`, `Surprised`, `Sad`,
`OpenMouth`.

| Shape key | Presente? | Duplicata? |
| --- | --- | --- |
| Smile | ✅/❌ | |
| ... | | |

Status: **PASS / WARNING / FAIL**

---

## Actions

Esperadas (8): `Idle`, `Wave`, `Thinking`, `Pointing`, `Explaining`,
`Celebrate`, `Typing`, `Alert`.

| Action | Presente? | Duração (s) | Dentro da faixa? | Loop |
| --- | --- | --- | --- | --- |
| Idle | ✅/❌ | | ✅/❌ | sim |
| ... | | | | |

Status: **PASS / WARNING / FAIL**

---

## Polycount

| Métrica | Valor | Alvo MVP (≤25k) | Ideal (≤40k) | Máximo (≤60k) |
| --- | --- | --- | --- | --- |
| Triângulos | `<n>` | ✅/⚠️ | ✅/⚠️ | ✅/❌ |
| Vértices | `<n>` | — | — | — |

Status: **PASS / WARNING / FAIL**

---

## Texturas

| Métrica | Valor | Limite |
| --- | --- | --- |
| Quantidade | `<n>` | ≤ 4 |
| Resolução máx. | `<n>²` | ≤ 2048² (ideal 1024²) |
| Tamanho `.glb` | `<x> MB` | ≤ ~1,5 MB |

Status: **PASS / WARNING / FAIL**

---

## Resultado Final

> **PASS** — todos os critérios obrigatórios atendidos; pode promover a `master.glb`.
> **WARNING** — divergências cosméticas (nomes, faixas) toleradas (D-009); revisar e justificar.
> **FAIL** — violação dura (polycount acima do máximo, arquivo inválido, objeto/material/rig faltando); **não** promover.

| | |
| --- | --- |
| **Decisão** | **PASS / WARNING / FAIL** |
| Avisos | `<n>` |
| Violações duras | `<n>` |
| Próximo passo | promover / corrigir no Blender / regenerar |

Aceite formal: [`MASTER_GLB_ACCEPTANCE_CHECKLIST.md`](../MASTER_GLB_ACCEPTANCE_CHECKLIST.md) (ADR-010).
