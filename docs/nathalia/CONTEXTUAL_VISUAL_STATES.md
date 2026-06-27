# Nathal.IA — Contextual Visual States (composição por tela)

> Como a Nathal.IA **se apresenta** em cada tela do JumpFlow: qual estado
> emocional de repouso, qual clipe corporal e qual acessório. Documenta o que o
> código faz (Fase 7, Etapa 10). Esta camada **compõe** as anteriores — não as
> substitui.
>
> Hierarquia de canon (do mais forte ao mais fraco):
>
> 1. Código de runtime — `packages/character-nathalia/src/nathaliaVisualStates.ts`.
> 2. Este documento (descreve o runtime).
> 3. Camadas compostas: motor de contexto (`nathaliaContext.ts`), catálogo de
>    estados (`nathaliaStates.ts`) e mapas de clipe/morph (`nathaliaAnimations.ts`).
>
> Documentos relacionados: [`ACCESSORY_RUNTIME.md`](./ACCESSORY_RUNTIME.md),
> [`IDLE_BEHAVIOR.md`](./IDLE_BEHAVIOR.md),
> [`REACT_THREE_FIBER_INTEGRATION.md`](./REACT_THREE_FIBER_INTEGRATION.md).
>
> Última atualização: **2026-06-17**.

---

## 1. O que esta camada faz

`visualStateForContext(context)` devolve uma `NathaliaVisualState` —
`{ state, clip?, accessory }` — a **composição visual por tela**. É a fonte única
que traduz "onde estou no app" em "como a Nathal.IA aparece aqui". O header do
painel de chat (e o widget) já consome isso para mostrar a personagem com o
acessório contextual.

O módulo é **puro e sem three.js** — seguro de importar em qualquer lugar.

---

## 2. Como compõe (sem substituir) as outras camadas

Cada camada continua dona da sua responsabilidade; esta só **fixa a composição
visual**:

| Camada | Continua dona de | Arquivo |
| --- | --- | --- |
| Motor de contexto | rota → contexto, saudação, sugestões, ações | `nathaliaContext.ts` |
| Catálogo de estados | intenção de expressão por estado | `nathaliaStates.ts` |
| Mapas clipe/morph | estado → clipe GLB e pesos de morph | `nathaliaAnimations.ts` |
| **Visual states** | **acessório + clipe + estado por tela** | `nathaliaVisualStates.ts` |

O `accessory` faz default para `accessoryForContext(context)` (ver
[`ACCESSORY_RUNTIME.md`](./ACCESSORY_RUNTIME.md) §4), mas pode ser **fixado
explicitamente** no registro. O `clip` é opcional: quando ausente, é derivado do
`state` por `clipForState` (`nathaliaAnimations.ts`).

---

## 3. Tabela por tela (registro real `visualStates`)

| Tela | Contexto | Estado | Clipe | Acessório |
| --- | --- | --- | --- | --- |
| Geral | `general` | `idle` | _(derivado: Idle)_ | — |
| Dashboard | `dashboard` | `explaining` | `Explaining` | `chart` |
| Horas | `hours` | `explaining` | `Explaining` | `clipboard` |
| Despesas | `expenses` | `explaining` | `Explaining` | `clipboard` |
| Projetos | `projects` | `explaining` | `Explaining` | `kanban` |
| Clientes | `clients` | `explaining` | `Explaining` | — |
| Consultores | `consultants` | `explaining` | `Explaining` | — |
| Aprovações | `approvals` | `pointing` | `Pointing` | `approval_stamp` |
| Relatórios | `reports` | `explaining` | `Explaining` | `report` |
| Financeiro | `finance` | `explaining` | `Explaining` | `chart` |
| Configurações | `settings` | `explaining` | `Explaining` | — |

Notas de leitura:

- **Geral** é o único estado de repouso `idle` (sem clipe explícito → `Idle` em
  loop) e **sem** acessório: a personagem neutra, sem reforço de contexto.
- **Aprovações** é o único `pointing` / `Pointing` (gesto de apontar/carimbar),
  combinando com o `approval_stamp`.
- **Clientes**, **Consultores** e **Configurações** são `explaining`/`Explaining`
  mas **sem** acessório — telas de cadastro/admin onde um prop só faria ruído.
- **Despesas** e **Horas** compartilham o `clipboard`; **Dashboard** e
  **Financeiro** compartilham o `chart`.

---

## 4. Resolução e fallback

```text
visualStateForContext(context)
  → visualStates[context]            // entrada fixada (tabela acima)
  → senão { state: "idle",           // fallback seguro
            accessory: accessoryForContext(context) }
```

Se um contexto não estiver no registro, cai para um repouso `idle` com o
acessório derivado do mapa de contexto — nunca lança.

---

## 5. Coerência com o roteamento

Os contextos vêm de `contextForPath` (`nathaliaContext.ts`), que casa prefixos de
rota pt-BR do app shell. Note que `/app/pagamentos` também resolve para `finance`,
então a tela de pagamentos herda a composição de **Financeiro** (`explaining` +
`chart`). Manter as entradas de `visualStates` alinhadas com `nathaliaContexts`.

---

## 6. Arquivos desta etapa

| Arquivo | Papel |
| --- | --- |
| `src/nathaliaVisualStates.ts` | `visualStateForContext`, registro `visualStates` |
| `src/nathaliaContext.ts` | rota → contexto, saudações, sugestões |
| `src/nathaliaAnimations.ts` | `clipForState`, `morphTargetsForState` |
| `src/nathaliaAccessories.ts` | `accessoryForContext` (default do acessório) |
