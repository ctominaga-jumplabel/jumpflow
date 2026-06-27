# Nathal.IA — Workspace de Intake de Assets 3D

Esta pasta é a **bancada de entrada e validação** dos modelos `.glb` da
Nathal.IA. É onde um modelo bruto (ex.: gerado no Tripo) **chega, é inspecionado,
validado tecnicamente e tem sua decisão registrada** — **antes** de qualquer
arquivo ser promovido a `master.glb`.

> Fase 3A — Asset Intake & Technical Validation.
> Ver [`../../docs/nathalia/ASSET_INTAKE_REPORT.md`](../../docs/nathalia/ASSET_INTAKE_REPORT.md)
> e o checklist [`MASTER_GLB_ACCEPTANCE_CHECKLIST.md`](../../docs/nathalia/MASTER_GLB_ACCEPTANCE_CHECKLIST.md).

## Por que esta pasta existe (decisão de local)

Os ativos **publicados em runtime** continuam em
`packages/character-nathalia/assets/models/` (convenção atual; ver
[`ASSET_GUIDE.md`](../../docs/nathalia/ASSET_GUIDE.md) e o contrato
[`scripts/nathalia/nathalia_assets.config.json`](../../scripts/nathalia/nathalia_assets.config.json)).

`assets/nathalia/` é **separada de propósito**: é um espaço de _staging_ de
fluxo de trabalho (candidatos crus, relatórios, thumbnails de revisão). Um modelo
só vira `master.glb` no pacote **depois** de aprovado aqui. Isso mantém o pacote
de runtime limpo e o processo de aceite explícito e auditável.

Essa decisão está registrada como **ADR-010** em
[`DECISIONS.md`](../../docs/nathalia/DECISIONS.md).

## Estrutura

| Pasta         | Conteúdo                                                                 |
| ------------- | ------------------------------------------------------------------------ |
| `raw/`        | Candidatos crus, exatamente como saíram do gerador (Tripo). Nunca editar. |
| `base/`       | Modelos aceitos para refinamento (`nathalia_base.glb`).                  |
| `master/`     | Candidatos a master normalizados, antes de promover ao pacote de runtime. |
| `reports/`    | Relatórios de validação gerados (`*.report.md`) — **versionados**.       |
| `thumbnails/` | Thumbnails de revisão geradas no intake — leves, para inspeção humana.   |

## Política de binários (D-004 / ADR-010)

**Binários grandes (`.glb`, `.fbx`, `.blend`, texturas pesadas) NÃO vão para o
Git** nesta fase — ver [`DECISIONS.md`](../../docs/nathalia/DECISIONS.md) D-004.
O `.gitignore` da raiz ignora esses binários dentro de `assets/nathalia/` e
mantém apenas READMEs, `.gitkeep`, configs e relatórios em markdown.

Para trazer um modelo do Tripo: baixe o `.glb` e coloque em `raw/` localmente
(o arquivo não será commitado). Quando for adotado storage/LFS, este README é
atualizado.

## Fluxo de intake (resumo)

```text
Tripo (cloud)
   │  download manual
   ▼
assets/nathalia/raw/<arquivo>.glb        (candidato cru)
   │  inspect_glb.py / validate_glb.py / generate_asset_report.py
   ▼
assets/nathalia/reports/<arquivo>.report.md   +   ASSET_INTAKE_REPORT.md
   │  decisão (aceitar refinar / referência / rejeitar / nova sheet)
   ▼
assets/nathalia/base/nathalia_base.glb   (se aceito para refinamento)
   │  Blender (Fase 4): retopo, rig, shape keys, materiais, normalize
   ▼
assets/nathalia/master/master.glb        (candidato a master)
   │  validate_glb.py + MASTER_GLB_ACCEPTANCE_CHECKLIST.md
   ▼
packages/character-nathalia/assets/models/master.glb   (promovido / runtime)
```
