# Nathal.IA — Checklist de Aceite do `master.glb`

> Critérios que um `.glb` **precisa cumprir** antes de ser promovido a
> `master.glb` (a fonte única de verdade visual — D-001). Enquanto não passa
> nesta lista, é apenas um _raw candidate_ (ver
> [`ASSET_INTAKE_REPORT.md`](./ASSET_INTAKE_REPORT.md) e **ADR-010** em
> [`DECISIONS.md`](./DECISIONS.md)).
>
> Complementa o contrato técnico em
> [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md) com o foco em **decisão de
> aceite**. Os limites numéricos vêm de
> [`../../scripts/nathalia/nathalia_assets.config.json`](../../scripts/nathalia/nathalia_assets.config.json).

## Como usar

1. Rode a validação automática (idealmente no Blender, `--strict`):
   ```bash
   blender --background --python scripts/nathalia/validate_glb.py -- <arquivo.glb> --strict
   python scripts/nathalia/generate_asset_report.py <arquivo.glb> --date <YYYY-MM-DD>
   ```
2. Marque os itens abaixo. **Itens obrigatórios (🔴) reprovam se falharem.**
   Itens recomendados (🟡) geram aviso e exigem justificativa para passar.
3. Só com todos os 🔴 marcados o arquivo pode virar `master.glb` e ser promovido a
   `packages/character-nathalia/assets/models/master.glb`.

## Critérios

### Geometria

- [ ] 🔴 **Até 60.000 triângulos** (máximo absoluto; acima disso a validação reprova).
- [ ] 🟡 **Preferencialmente até 40.000 triângulos** (ideal web); ótimo ≤ 25.000 (MVP).
- [ ] 🟡 **Sem geometrias desnecessárias** (faces internas escondidas, pedestal,
      base, props, fundo, partículas, duplicatas).
- [ ] 🟡 **Topologia com possibilidade realista de rigging** (malha limpa o
      suficiente para deformar em juntas — ombro, cotovelo, joelho, pescoço).

### Estrutura / separação

- [ ] 🔴 **Objetos/materiais minimamente separáveis** — dá para isolar partes
      (corpo, cabelo, camiseta, calça, tênis, olhos). Um único blob fundido
      reprova até ser separável.
- [ ] 🟡 Caminho viável para os **materiais nomeados** (`MAT_Body`, `MAT_Hair`,
      `MAT_Shirt`, `MAT_Pants`, `MAT_Shoes`, `MAT_Eyes`, `MAT_Logo`).
- [ ] 🔴 **Possibilidade de aplicar o logo jump** — existe uma área limpa e plana
      no peito da camiseta para o wordmark (sem costuras/relevo que atrapalhem).

### Transform (escala / origem / orientação)

- [ ] 🔴 **Escala normalizada** — 1 unidade = 1 metro; altura plausível de pessoa.
- [ ] 🔴 **Origem no chão** — base dos pés em `(0, 0, 0)`, personagem centralizada.
- [ ] 🔴 **Orientação padronizada** — olhando para `-Z`, eixo "para cima" `+Y`
      (padrão glTF / three.js).

### Fidelidade visual

- [ ] 🔴 **Visual coerente com o [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md)** —
      cabelo longo escuro, camiseta preta, tom amigável/caricato; é a Nathal.IA,
      não outra personagem.
- [ ] 🟡 Proporções estilizadas conforme a Bible (cabeça levemente maior, traços
      limpos, leitura clara em tamanho pequeno).

### Web / performance

- [ ] 🔴 **Compatibilidade com WebGL** — glTF 2.0 binário válido, importa sem erro,
      sem câmeras/luzes embutidas.
- [ ] 🟡 **Sem excesso de texturas** — preferir atlas/poucas texturas; ≤ 2048²
      (ideal 1024²); evitar múltiplos mapas grandes.
- [ ] 🟡 **Arquivo final ≤ ~1.5 MB** (ideal < 1 MB) após compressão (Draco/Meshopt).
      _Obs.: brutos do Tripo costumam estourar isso — a redução é trabalho da Fase 4._

### Higiene

- [ ] 🟡 **Sem rig/animações/shape keys herdados problemáticos** — ou estão ausentes
      (bruto) ou seguem os nomes do contrato (Fase 4); nada lixo no meio.
- [ ] 🟡 Sem `n-gons` excessivos / normais invertidas / UVs sobrepostas que
      impeçam texturização.

## Veredito

- [ ] **APROVADO** — todos os 🔴 marcados e 🟡 com justificativa → pode virar
      `master.glb`.
- [ ] **REPROVADO** — pelo menos um 🔴 falhou → permanece _raw candidate_;
      registrar decisão em [`ASSET_INTAKE_REPORT.md`](./ASSET_INTAKE_REPORT.md).

> **Estado atual (2026-06-16):** nenhum candidato aprovado. O único candidato
> (`nathalia_tripo_raw.glb`) **reprova** hoje (blob único, 54.5 MB, sem
> separação) — ver [`ASSET_INTAKE_REPORT.md`](./ASSET_INTAKE_REPORT.md).
