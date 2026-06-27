# Nathal.IA — Rig Blueprint

> **Planta do esqueleto** do `master.glb`. Define os bones mínimos, a hierarquia,
> as convenções de rotação/nome e a bind pose. Espelha
> [`MASTER_GLB_BLUEPRINT.md`](./MASTER_GLB_BLUEPRINT.md) §6 e o contrato em
> [`scripts/nathalia/blender/master_character_config.json`](../../scripts/nathalia/blender/master_character_config.json)
> (`rigBones` / `rigHierarchy`), validado por
> [`validate_rig.py`](../../scripts/nathalia/blender/validate_rig.py).
>
> Última atualização: **2026-06-16**.

---

## 1. Bones (conjunto mínimo)

**16 bones**, sufixo `.L`/`.R` por lado. Sem bones de dedos no MVP.

| Bone | Pai | Papel |
| --- | --- | --- |
| `Pelvis` | — (root do rig) | quadril / centro de massa |
| `Spine` | `Pelvis` | tronco |
| `Neck` | `Spine` | pescoço |
| `Head` | `Neck` | cabeça |
| `UpperArm.L` | `Spine` | braço sup. esquerdo |
| `UpperArm.R` | `Spine` | braço sup. direito |
| `LowerArm.L` | `UpperArm.L` | antebraço esquerdo |
| `LowerArm.R` | `UpperArm.R` | antebraço direito |
| `Hand.L` | `LowerArm.L` | mão esquerda |
| `Hand.R` | `LowerArm.R` | mão direita |
| `UpperLeg.L` | `Pelvis` | coxa esquerda |
| `UpperLeg.R` | `Pelvis` | coxa direita |
| `LowerLeg.L` | `UpperLeg.L` | canela esquerda |
| `LowerLeg.R` | `UpperLeg.R` | canela direita |
| `Foot.L` | `LowerLeg.L` | pé esquerdo |
| `Foot.R` | `LowerLeg.R` | pé direito |

---

## 2. Hierarquia

```
Armature
└─ Pelvis                      (root do rig)
   ├─ Spine
   │   ├─ Neck
   │   │   └─ Head
   │   ├─ UpperArm.L → LowerArm.L → Hand.L
   │   └─ UpperArm.R → LowerArm.R → Hand.R
   ├─ UpperLeg.L → LowerLeg.L → Foot.L
   └─ UpperLeg.R → LowerLeg.R → Foot.R
```

- O `Armature` é filho do root `Nathalia`; todos os meshes (exceto `Logo`) são
  skinned a ele. `Logo` pode seguir o tronco (parent a `Body`/`Shirt`).
- **Opcional (fora do conjunto validado):** 1–2 bones de cabelo
  (`Hair.L`/`Hair.R`) para movimento secundário leve em `Wave`/`Celebrate`.

---

## 3. Convenções

| Convenção | Regra |
| --- | --- |
| Nomes | exatos, `PascalCase`; lado como sufixo `.L`/`.R`; sem acentos/espaços; sem `.001` |
| Lados | `.L` = esquerda **da personagem** (lado +X em Blender Z-up, antes do export) |
| Eixo up | **+Y** no `.glb` exportado (Blender é Z-up; o exportador glTF converte) |
| Orientação | personagem olhando para **`-Z`** |
| Escala | **1 unidade = 1 metro**; altura ~1,60 m |
| Origem | `Pelvis` alinhado ao eixo; base (pés) no chão em `(0,0,0)` |

### Rotações / eixos dos bones

- **Roll** consistente: braços com eixo de dobra do cotovelo previsível;
  pernas com dobra do joelho para a frente.
- Eixo primário do bone apontando para o filho (Blender padrão Y do bone).
- Evitar gimbal: usar a orientação de bone padrão do Blender e checar dobras
  em `LowerArm`/`LowerLeg` antes do skinning.

---

## 4. Bind pose

- **A-Pose leve**: braços a ~30° do tronco (não T-Pose).
- Pés paralelos, apoiados na origem; peso distribuído.
- Mãos relaxadas (mitten estilizada, polegar separado — sem dedos individuais).

---

## 5. Skinning

- Pesos suaves; máximo recomendado **4 influências por vértice** (limite glTF).
- Atenção especial: ombro, cotovelo, quadril, joelho, pescoço.
- Sem vértices órfãos (peso 0 em todos os bones) e sem peso negativo.

---

## 6. Critérios de validação (resumo)

`validate_rig.py` verifica:

- [ ] Existe **exatamente um** `Armature`.
- [ ] Os **16 bones** canônicos estão presentes (nomes exatos; D-009 tolerante a extras como bones de cabelo).
- [ ] **Hierarquia** confere com `rigHierarchy` (pai de cada bone).
- [ ] Nenhum sufixo `.001` ou nome fora de convenção (warning).

Fonte das listas: `master_character_config.json` → `rigBones` / `rigHierarchy`.
