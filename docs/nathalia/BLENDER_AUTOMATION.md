# Nathal.IA — Automação no Blender

> O Blender é a **fábrica de ativos** da Nathal.IA: é onde o modelo base (Tripo)
> vira o `master.glb` canônico e onde as variantes/validações são produzidas de
> forma reproduzível, via linha de comando.
>
> Pipeline completo: [`THREE_D_PIPELINE.md`](./THREE_D_PIPELINE.md).
> Scripts: [`../../scripts/nathalia/`](../../scripts/nathalia/).

## Por que automação?

- **Reprodutibilidade:** o mesmo comando produz o mesmo resultado, sem cliques manuais.
- **Validação em CI (futuro):** rodar `validate_glb.py` em pipeline antes de aceitar um modelo.
- **Variantes derivadas:** LODs, poses e thumbnails sempre saem do `master.glb`.
- **Documentação executável:** os scripts descrevem o contrato técnico em código.

## Pré-requisitos

- **Blender 3.6 LTS+** instalado (com Python embutido).
- Scripts em `scripts/nathalia/` (versionados; **sem binários**).
- Um `master.glb` (ainda **não** existe nesta fase — scripts falham de forma amigável).

> O Python do Blender (`bpy`) **não** roda no Python comum. Scripts que dependem
> de `bpy` detectam o ambiente e degradam para um modo informativo quando
> executados fora do Blender.

## Modo de execução

Forma geral (note o `--` separando args do Blender dos args do script):

```bash
blender --background --python <script.py> -- <argumentos>
```

### Exemplos (comandos futuros)

Validar o modelo canônico:

```bash
blender --background --python scripts/nathalia/validate_glb.py -- assets/nathalia/master.glb
```

Exportar variantes a partir do canônico:

```bash
blender --background --python scripts/nathalia/export_variants.py -- assets/nathalia/master.glb
```

Inspecionar (relatório textual, pode rodar fora do Blender de forma limitada):

```bash
python scripts/nathalia/inspect_glb.py assets/nathalia/master.glb
# ou, com bpy disponível:
blender --background --python scripts/nathalia/inspect_glb.py -- assets/nathalia/master.glb
```

Normalizar escala/origem/nomes (não destrutivo sem confirmação):

```bash
blender --background --python scripts/nathalia/normalize_master.py -- assets/nathalia/master.glb --apply
```

Gerar thumbnails (futuro):

```bash
blender --background --python scripts/nathalia/generate_thumbnails.py -- assets/nathalia/master.glb
```

## Scripts disponíveis

| Script | Papel | Altera arquivo? |
| --- | --- | --- |
| `validate_glb.py` | Valida objetos/materiais/animações/shape keys/escala/polycount; imprime relatório | ❌ Não |
| `inspect_glb.py` | Relatório textual simples; base para validação | ❌ Não |
| `export_variants.py` | (futuro) Exporta LODs/poses a partir do `master.glb` | Escreve derivados |
| `normalize_master.py` | Stubs para escala/origem/nomes/materiais; só altera com `--apply` | Só com confirmação |
| `generate_thumbnails.py` | (futuro) Renderiza thumbnails 2D de fallback | Escreve PNGs |
| `nathalia_assets.config.json` | Contrato (caminhos, estados, animações, materiais, objetos, limites) | — |

Todos lêem o contrato de `nathalia_assets.config.json` quando possível, para que
os limites (polycount, texturas, nomes) tenham **uma única fonte**.

## Convenções dos scripts

- **Tolerantes:** reportam divergências sem quebrar; só reprovam em violações
  duras (ex.: polycount acima do máximo).
- **Não destrutivos por padrão:** alterações exigem flag explícita (`--apply`).
- **Seguros fora do Blender:** detectam ausência de `bpy` e seguem em modo informativo.
- **Sem dependências pesadas:** Python puro + `bpy` quando disponível.

## Futuro (CI)

Quando houver um `master.glb`, um job de CI poderá:

1. Baixar o `master.glb` do storage/LFS.
2. Rodar `validate_glb.py` em modo `--strict`.
3. Falhar o build se o contrato de [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md) for violado.
4. (Opcional) Regenerar thumbnails e variantes.

Nada disso está ativo nesta fase — ver [`NEXT_PHASES.md`](./NEXT_PHASES.md).
