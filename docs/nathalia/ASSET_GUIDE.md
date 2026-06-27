# Nathal.IA — Guia de Assets 2D

A Nathal.IA é uma **companheira de trabalho 2D animada**. Os assets são bustos
ilustrados (expressões emocionais) e formas de boca (visemas) recortados das
folhas de referência oficiais. **Não há mais assets 3D em runtime** — o pipeline
Blender/GLB foi descontinuado (ver [`ROADMAP.md`](./ROADMAP.md) e
[`../../archive/nathalia-3d/README.md`](../../archive/nathalia-3d/README.md)).

## Onde ficam os assets

Servidos estaticamente pelo app, a partir de:

```
apps/web/public/nathalia/expressions/
  <expressao>.webp        # bustos de expressão (ex.: confiante.webp)
  vis-<viseme>.webp       # formas de boca (ex.: vis-a.webp, vis-fv.webp)
  icon-<objeto>.webp      # badges de tela (icon-horas, icon-relatorios, …)
```

Base URL em runtime: `/nathalia/expressions` (constante
`NATHALIA_EXPRESSIONS_BASE_URL` em
[`src/nathaliaExpressions.ts`](../../packages/character-nathalia/src/nathaliaExpressions.ts)).

## Catálogo

**Expressões** (`NATHALIA_EXPRESSIONS`): `preocupada`, `alerta`, `comemorando`,
`empolgada`, `pensativa`, `curiosa`, `surpresa`, `confiante`, `satisfeita`,
`grata`, `animada`, `triste`, `zangada`, `focada`, `eureka`, `duvida`,
`encorajando`.

**Visemas** (`NATHALIA_VISEMES`): `a e i o u s m l fv r tdn rest`.
> O spec público nomeia os visemas em maiúsculo (`A E I O U M F L R S` + `rest`).
> O adapter `specVisemeToKey` / `keyToSpecViseme`
> ([`nathaliaSpecAliases.ts`](../../packages/character-nathalia/src/nathaliaSpecAliases.ts))
> converte entre os dois (`A→a`, `F→fv`, …).

**Objetos de tela**: `horas`, `projetos`, `aprovacoes`, `relatorios`.

## Especificação técnica dos arquivos

- Formato: **WebP** (PNG aceito como origem antes do recorte/otimização).
- Quadrado, rosto **centralizado** (≈ `object-position: 50% 46%`); o componente
  recorta em círculo. Sugerido 512×512.
- Fundo **transparente ou neutro** — o disco colorido por intenção vem do tema.
- Mesma moldura/escala entre expressões e visemas para que o crossfade e o
  mouth-swap não "pulem".
- Otimizar para leitura em ~40–96px (o launcher usa ~80px).

## Como substituir / adicionar arte

1. Recorte o busto/boca centralizado e exporte como `.webp` para
   `apps/web/public/nathalia/expressions/` usando o nome exato do catálogo.
2. Para uma **nova** expressão, acrescente a chave em `NATHALIA_EXPRESSIONS`
   (e, se for um estado/contexto novo, atualize `STATE_EXPRESSION` /
   `CONTEXT_EXPRESSION` em `nathaliaExpressions.ts`).
3. Para um **novo** visema, acrescente a chave em `NATHALIA_VISEMES`, mapeie em
   `visemeForChar` e, se relevante, no adapter do spec.
4. Verifique no Lab (`/app/dev/nathalia`) — seção Expressões/Visemas.

## Resolução em runtime

A expressão exibida é resolvida por `expressionFor(state, context, override?)`:
override explícito → expressão do **estado** ativo → expressão de **descanso da
tela** → padrão. Por isso o rosto muda tanto ao **navegar** quanto ao **reagir**.
Detalhes em [`TECHNICAL_ARCHITECTURE.md`](./TECHNICAL_ARCHITECTURE.md).
