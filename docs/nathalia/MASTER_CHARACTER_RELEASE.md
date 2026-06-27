# Nathal.IA — Master Character Release (Fase 5)

> **Primeiro `master.blend` canônico** da Nathal.IA. A personagem deixa de ser só
> documentação e passa a existir como **personagem técnico** dentro do projeto:
> geometria modular, rig funcional, shape keys, actions MVP, materiais oficiais,
> validação automática e preview exportável.
>
> Estratégia: [`MASTER_CHARACTER_STRATEGY.md`](./MASTER_CHARACTER_STRATEGY.md) ·
> Análise da referência: [`reports/REFERENCE_ANALYSIS.md`](./reports/REFERENCE_ANALYSIS.md) ·
> Validação: [`reports/MASTER_VALIDATION_REPORT.md`](./reports/MASTER_VALIDATION_REPORT.md).
>
> Build em **Blender 5.1.2** · Data: **2026-06-16**.

---

## 1. Arquivos gerados

| Arquivo | Caminho | Papel | Observação |
| --- | --- | --- | --- |
| **`master.blend`** | `packages/character-nathalia/assets/blender/master.blend` | **Fonte oficial** (D-001) | reconstruído por código; nunca sobrescrito pelo export |
| `master_preview.glb` | `packages/character-nathalia/assets/models/master_preview.glb` | preview derivado | ~154 KB, Draco, texturas embutidas |
| `MASTER_VALIDATION_REPORT.md` | `docs/nathalia/reports/` | relatório de validação da cena viva | gerado por `report_master` |
| `front.png` / `side.png` / `back.png` / `three_quarter.png` | `assets/nathalia/thumbnails/` | previews EEVEE (720×900, alpha) | turnaround básico |

> Binários (`.blend`, `.glb`, `.png`) **não são versionados** (D-004/ADR-010) —
> são gerados pela fábrica e guardados em storage. O que entra no Git é o
> **código** que os reproduz: `scripts/nathalia/blender/construct_master.py`.

## 2. Como reproduzir

```bash
blender --background --python scripts/nathalia/blender/construct_master.py -- --apply
# ou, via orquestrador:
blender --background --python scripts/nathalia/blender/build_master.py -- --construct
```

Um único comando faz: cena limpa → materiais → geometria → rig → shape keys →
actions → salva `master.blend` → valida (cena viva) → escreve o relatório →
exporta `master_preview.glb` → renderiza os 4 thumbnails.

---

## 3. Métricas

| Métrica | Valor | Orçamento | Status |
| --- | --- | --- | --- |
| Tamanho do preview `.glb` | **~154 KB** | ≤ 1,5 MB | ✅ ~10× abaixo |
| Triângulos (7 meshes) | **~8.540** | ≤ 25.000 (MVP) | ✅ ~3× abaixo |
| Vértices | **~6.210** | — | ✅ |
| Objetos / meshes | **7** | 7 | ✅ |
| Materiais | **7** (`MAT_*`) | 7 | ✅ |
| Bones | **16** | 16 | ✅ |
| Shape keys (+ Basis) | **7 (+Basis)** | 7 | ✅ |
| Actions | **3** (Idle/Wave/Thinking) | 3 no MVP (8 no total) | ✅ MVP · ⚠️ 5 adiadas |
| Altura | **1,569 m** | ~1,60 m | ✅ |
| Pés no chão (min Z) | **≈ 0** | 0 | ✅ |

> Comparação com a referência `nathalia_tripo_v02.glb` (1,93 M tris / 57 MB):
> o master é **~226× mais leve em triângulos** e **~370× menor em bytes**,
> mantendo a silhueta/likeness aprovada. Ver
> [`reports/REFERENCE_ANALYSIS.md`](./reports/REFERENCE_ANALYSIS.md).

## 4. Materiais (paleta oficial aplicada)

| Material | Cor base | Aplicação |
| --- | --- | --- |
| `MAT_Body` | `#f3c6a3` | pele (rosto, pescoço, braços, mãos) |
| `MAT_Hair` | `#241f2b` | cabelo |
| `MAT_Eyes` | `#ffffff` | olhos |
| `MAT_Shirt` | `#111814` | camiseta |
| `MAT_Pants` | `#2b3340` | calça |
| `MAT_Shoes` | `#ece9e0` | tênis |
| `MAT_Logo` | `#ffffff` | wordmark `jump` |

Todos PBR foscos (metallic 0), `roughness` por material conforme
[`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md) §Materiais.

## 5. Rig (16 bones)

`Pelvis → Spine → Neck → Head`; braços `UpperArm/LowerArm/Hand.L|.R`; pernas
`UpperLeg/LowerLeg/Foot.L|.R`. Skinning por **automatic weights** (bone heat).
Hierarquia validada contra `rigHierarchy`. Bind pose em **A-Pose leve**.

## 6. Shape keys (7 + Basis)

`Smile`, `Blink_L`, `Blink_R`, `Thinking`, `Surprised`, `Sad`, `OpenMouth` —
deformações **regionais** no `Body`, não destrutivas. Funcionais para a
integração; ganham refino quando a face for esculpida.

## 7. Actions (MVP)

| Action | Loop | Duração | Status |
| --- | --- | --- | --- |
| `Idle` | sim | 4,0 s | ✅ |
| `Wave` | não | 1,5 s | ✅ |
| `Thinking` | sim | 2,21 s | ✅ |

Exportadas via tracks NLA (visíveis no `.glb`). As 5 restantes (`Pointing`,
`Explaining`, `Celebrate`, `Typing`, `Alert`) ficam para a próxima fase.

---

## 8. Limitações conhecidas (v1 estrutural)

- **Face minimalista.** Sem topologia esculpida de olhos/boca/sobrancelha; as
  shape keys são deslocamentos regionais. Os olhos são globos simples. Refino
  escultural é evolução incremental sobre a mesma base modular.
- **Junções visíveis.** Em primitivas unidas, ombro/cotovelo/quadril têm leves
  vãos — aceitável para a v1 (prioridade: arquitetura, não acabamento).
- **Aviso "Mesh is not valid" no export.** Algumas malhas (uniões de primitivas)
  não são *manifold*; o glTF emite aviso mas exporta corretamente — confirmado:
  o `.glb` tem exatamente **7 meshes** (verificado no JSON do arquivo).
- **Artefato do importador.** O **importador** glTF do Blender adiciona um
  placeholder cosmético (`Icosphere`, ~80 tris) ao **reimportar** o armature; ele
  **não existe** no arquivo. Ferramentas que medem após import (`inspect_glb`/
  `validate_glb`) podem reportar 8 meshes / dimensão maior — é artefato de leitura.
- **>4 influências por vértice** em `Pants`: o exportador glTF normaliza para as
  4 maiores (dentro do contrato glTF).
- **Pesos automáticos**: skinning funcional, sem ajuste fino de ombro/quadril.

## 9. Próximos passos

1. **Fase 6 — React Three Fiber:** carregar o `.glb` no app (`NathaliaModel.tsx`),
   ligar `canRender3D()` e reconciliar nomes de clipe em `nathaliaAnimations.ts`.
2. **Refino visual incremental:** esculpir face (loops de boca/olhos), melhorar
   junções e dobras de roupa — sobre a **mesma** base modular.
3. **Completar actions** (`Pointing`/`Explaining`/`Celebrate`/`Typing`/`Alert`)
   e enriquecer shape keys (Fase 7 — Emotion Engine 3D).
4. **Promoção a `master.glb`** somente após cumprir o
   [`MASTER_GLB_ACCEPTANCE_CHECKLIST.md`](./MASTER_GLB_ACCEPTANCE_CHECKLIST.md)
   (ADR-010) e `validate_glb.py --strict`.
