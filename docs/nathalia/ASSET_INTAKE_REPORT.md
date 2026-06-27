# Nathal.IA — Asset Intake Report

> Registro humano (e auditável) dos modelos `.glb` recebidos para a Nathal.IA e
> da decisão tomada sobre cada um. Faz parte da **Fase 3A — Asset Intake &
> Technical Validation**.
>
> Os relatórios técnicos por arquivo são gerados em
> [`../../assets/nathalia/reports/`](../../assets/nathalia/reports/) por
> `scripts/nathalia/generate_asset_report.py`. Este documento consolida e
> **decide**.
>
> Última atualização: **2026-06-16**.

## Como um modelo entra (intake)

1. Baixar o `.glb` do gerador (Tripo) para `assets/nathalia/raw/` (ou onde o
   arquivo bruto estiver — binários **não são versionados**, ver ADR-010 / D-004).
2. Rodar a validação:
   ```bash
   python scripts/nathalia/inspect_glb.py <arquivo.glb>
   blender --background --python scripts/nathalia/validate_glb.py -- <arquivo.glb>
   python scripts/nathalia/generate_asset_report.py <arquivo.glb> --date <YYYY-MM-DD>
   ```
3. Registrar o resultado abaixo e escolher uma decisão.
4. **Nada vira `master.glb` sem passar** no
   [`MASTER_GLB_ACCEPTANCE_CHECKLIST.md`](./MASTER_GLB_ACCEPTANCE_CHECKLIST.md)
   (ADR-010).

Decisões possíveis:

- **aceitar para refinamento** — vai para `assets/nathalia/base/` e segue ao Blender (Fase 4).
- **aceitar apenas como referência visual** — serve de guia de silhueta/likeness; não é base de geometria.
- **rejeitar e gerar novo Tripo** — usar [`TRIPO_REGENERATION_PROMPT.md`](./TRIPO_REGENERATION_PROMPT.md).
- **gerar novo Character Sheet antes de outro Tripo** — o problema é de direção visual, não de geometria.

---

## Candidato #1 — `nathalia_tripo_raw.glb`

| Campo | Valor |
| --- | --- |
| **Nome do arquivo** | `nathalia_tripo_raw.glb` |
| **Caminho** | `packages/character-nathalia/assets/raw/nathalia_tripo_raw.glb` |
| **Origem** | Tripo (primeira geração image-to-3D) |
| **Status** | **rejeitado** (= v01; substituído pela v02 — ver Candidato #2) |
| **Data da análise** | 2026-06-16 |
| **Modo de análise** | `structural` (Blender não instalado nesta máquina) |
| **Relatório técnico** | [`../../assets/nathalia/reports/nathalia_tripo_raw.glb.report.md`](../../assets/nathalia/reports/nathalia_tripo_raw.glb.report.md) |

### Medições

| Item | Valor | Observação |
| --- | --- | --- |
| Possui rig | **não** | esperado num bruto do Tripo |
| Possui animações | **não** | — |
| Possui shape keys | **não** | — |
| Quantidade de meshes | **1** | objeto único (`tripo_node_…`) |
| Quantidade de materiais | **1** | material único (`tripo_material_…`) |
| Texturas / imagens | **3 / 3** | provável conjunto PBR (base/normal/roughness) em alta resolução |
| Tamanho do arquivo | **54.5 MB** | **~36× acima** do orçamento de 1.5 MB |
| Polycount estimado | **não medido** | exige Blender; o tamanho sugere malha muito densa + texturas grandes |

### Problemas encontrados

- **Tamanho gigante (54.5 MB)** — incompatível com web/WebGL sob demanda; o
  orçamento é ≤ 1.5 MB. Vem de malha de alta densidade e/ou texturas 2K–4K.
- **Objeto/material único** — corpo, cabelo, roupa, olhos e tênis estão fundidos.
  Aplicar materiais nomeados (`MAT_*`), separar partes e colocar o **logo jump**
  exigirá retopo/recorte no Blender.
- **Sem rig / shape keys / animações** — normal para um bruto, mas significa que
  todo o esqueleto e expressões ainda precisam ser construídos (Fase 4).
- **Polycount não confirmado** — sem Blender nesta máquina, não foi possível
  medir triângulos/vértices nem checar escala/origem/orientação.

### Decisão

- **Decisão automática do script:** `aceitar apenas como referência visual`.
- **Recomendação humana (registrada):** **NÃO promover a `master.glb`.** Tratar
  como **raw candidate / referência visual**. O modelo é um _sculpt_ denso de
  blob único — típico do Tripo — e não é, na forma atual, uma base limpa para
  rig/web.

  Dois caminhos viáveis, a confirmar após inspeção no Blender + comparação com o
  [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md):

  1. **Se a aparência/silhueta combinar com a Bible:** manter como **referência
     visual** e fazer **retopo + decimação + re-UV + split de materiais + downscale
     de texturas** no Blender (Fase 4). É trabalho pesado, mas aproveita o likeness.
  2. **Se a aparência divergir da Bible** (proporções, roupa, cabelo, pose):
     **rejeitar e regenerar** com o
     [`TRIPO_REGENERATION_PROMPT.md`](./TRIPO_REGENERATION_PROMPT.md) — pedindo
     malha game-ready, baixa/média poligonagem, partes separadas e A-Pose leve.

- **Bloqueio para decisão final:** o veredito completo depende de (a) abrir no
  **Blender** para medir polycount/escala/topologia e (b) revisão visual contra a
  Bible. Até lá, **status = raw candidate, não aprovado**.

> ⚠️ Este candidato **não** atende o
> [`MASTER_GLB_ACCEPTANCE_CHECKLIST.md`](./MASTER_GLB_ACCEPTANCE_CHECKLIST.md)
> hoje (tamanho, blob único, sem separação). **Não** deve virar `master.glb`.

### Próximos passos para este candidato

1. Instalar Blender e rodar a validação completa (polycount/escala/topologia):
   ```bash
   blender --background --python scripts/nathalia/validate_glb.py -- packages/character-nathalia/assets/raw/nathalia_tripo_raw.glb
   ```
2. Revisão visual contra o `CHARACTER_BIBLE.md` (likeness, roupa, cabelo, pose).
3. Escolher caminho 1 (refinar) ou 2 (regenerar) e atualizar a decisão acima.

---

## Candidato #2 — `nathalia_tripo_v02.glb`

| Campo | Valor |
| --- | --- |
| **Nome do arquivo** | `nathalia_tripo_v02.glb` |
| **Caminho** | `packages/character-nathalia/assets/raw/nathalia_tripo_v02.glb` |
| **Origem** | Tripo (segunda geração image-to-3D) |
| **Status** | **referência visual oficial aprovada** (não é `master.glb`) |
| **Data da análise** | 2026-06-16 |
| **Modo de análise** | `structural` (Blender não instalado nesta máquina) |

### Medições

| Item | Valor | Observação |
| --- | --- | --- |
| Possui rig | **não** | esperado num bruto do Tripo |
| Possui animações | **não** | — |
| Possui shape keys | **não** | — |
| Quantidade de meshes | **1** | objeto único (`tripo_node_…`) |
| Quantidade de materiais | **1** | material único (`tripo_mat_…`) |
| Texturas / imagens | **3 / 3** | provável conjunto PBR |
| Tamanho do arquivo | **57.1 MB** | **~38× acima** do orçamento de 1.5 MB |
| Polycount estimado | **não medido** | exige Blender |

### Decisão

- **v02 = referência visual oficial aprovada.** O likeness/silhueta combina com o
  [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md) e é adotado como **alvo de forma**
  para o refinamento — confirma o **Caminho 1** (refinar) descrito no Candidato #1.
- **v01 (`nathalia_tripo_raw.glb`) = rejeitado** como direção (substituído pela v02).
- **"Aprovado" NÃO significa `master.glb`:** a v02 continua sendo blob único de
  ~57 MB, sem partes separadas, rig ou expressões — **não** atende ao
  [`MASTER_GLB_ACCEPTANCE_CHECKLIST.md`](./MASTER_GLB_ACCEPTANCE_CHECKLIST.md).
  Serve **apenas** como referência de likeness/silhueta para o Blender (Fase 4).
- **Próximo passo:** retopo + split + rig + shape keys + actions no Blender,
  usando a v02 como guia, conforme
  [`MASTER_GLB_BLUEPRINT.md`](./MASTER_GLB_BLUEPRINT.md) e a
  [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md).

> Revisão de direção completa em [`CHARACTER_REVIEW.md`](./CHARACTER_REVIEW.md).

---

## Histórico

| Data | Arquivo | Decisão | Quem |
| --- | --- | --- | --- |
| 2026-06-16 | `nathalia_tripo_raw.glb` (v01) | raw candidate → **rejeitado** (substituído pela v02) | intake automático + revisão |
| 2026-06-16 | `nathalia_tripo_v02.glb` (v02) | **referência visual oficial aprovada** (não `master.glb`) | revisão Fase 3B |
