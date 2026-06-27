# Nathal.IA — Accessory Runtime (acessórios em tempo de execução)

> Como os **acessórios oficiais** da Nathal.IA são construídos, servidos,
> mapeados ao contexto, anexados em runtime e como eles **falham suave**.
> Documenta o que o código realmente faz (Fase 7, Etapa 9). Este é o documento
> que **implementa** o catálogo e o pipeline de acessórios.
>
> Hierarquia de canon (do mais forte ao mais fraco):
>
> 1. Código de runtime — `packages/character-nathalia/src/nathaliaAccessories.ts`
>    + o render de acessórios em `NathaliaModel.tsx`.
> 2. Este documento (descreve o runtime).
> 3. Catálogo visual — [`ACCESSORIES.md`](./ACCESSORIES.md) — e pipeline de
>    construção — [`ACCESSORY_PIPELINE.md`](./ACCESSORY_PIPELINE.md).
>
> Regra-mãe (D-001): acessórios são **opcionais e derivados**. Cada um é um
> `.glb` próprio, carregado sob demanda — **nunca** embutido no master.
>
> Última atualização: **2026-06-17**.

---

## 1. Os seis acessórios oficiais

`clipboard`, `clock`, `kanban`, `report`, `chart`, `approval_stamp`.

Construídos por `scripts/nathalia/blender/construct_accessories.py`. Direção
visual em [`ACCESSORIES.md`](./ACCESSORIES.md); convenções de modelagem/escala
em [`ACCESSORY_PIPELINE.md`](./ACCESSORY_PIPELINE.md).

Cada acessório é **leve**: ~60–270 triângulos e ~7–18 KB por `.glb`, carregado
**sob demanda** (nunca no bundle inicial).

---

## 2. Convenções de arquivo e URL

| Item | Convenção | Exemplo |
| --- | --- | --- |
| Arquivo GLB | `accessory-<key>.glb` | `accessory-clipboard.glb` |
| Objeto raiz | `Acc_<PascalKey>` | `Acc_Clipboard` |
| Material | `MAT_Acc_<PascalKey>` | `MAT_Acc_Clipboard` |
| Base servida (default) | `/nathalia/accessories/` | `DEFAULT_NATHALIA_ACCESSORIES_BASE_URL` |

- `key` em `snake_case` minúsculo (igual ao catálogo e ao `nathaliaContext`).
- A base é **configurável** por env var
  `NEXT_PUBLIC_NATHALIA_ACCESSORIES_URL` (ex.: um CDN/bucket). O acesso literal
  ao env é necessário para o Next inlinear no build.
- `nathaliaAccessoriesBaseUrl()` normaliza a base garantindo a barra final;
  `accessoryFileName(key)` e `accessoryUrl(key)` montam o nome e a URL completa.

---

## 3. Registro (`nathaliaAccessories`)

Cada definição (`NathaliaAccessoryDefinition`) guarda o ponto de encaixe, a
escala uniforme e um offset no **espaço métrico do modelo, eixos three.js**
(`x = lado`, `y = cima`, `z = profundidade`). Valores reais do código:

| Acessório | `root` | `attach` | `scale` | `offset` [x, y, z] | Label |
| --- | --- | --- | --- | --- | --- |
| `clipboard` | `Acc_Clipboard` | `hand.L` | 1 | `[0.42, 0.6, 0.18]` | Prancheta |
| `clock` | `Acc_Clock` | `hand.R` | 1 | `[-0.42, 0.6, 0.18]` | Relógio |
| `kanban` | `Acc_Kanban` | `scene` | 1 | `[0.6, 1.0, 0.05]` | Quadro Kanban |
| `report` | `Acc_Report` | `hand.L` | 1 | `[0.42, 0.6, 0.18]` | Relatório |
| `chart` | `Acc_Chart` | `scene` | 1 | `[0.6, 1.0, 0.05]` | Gráfico |
| `approval_stamp` | `Acc_ApprovalStamp` | `hand.R` | 1 | `[-0.42, 0.6, 0.18]` | Carimbo de aprovação |

- `attach` pode ser `hand.L`, `hand.R` ou `scene` (flutua ao lado).
- `nathaliaAccessoryKeys` dá a lista ordenada estável; `isAccessoryKey(value)` é
  o type guard para strings arbitrárias (usado antes de resolver a definição).

> **Nota de implementação atual:** no render, o acessório é posicionado pelo
> `offset` e `scale` **dentro do group do modelo** (não parented ao bone). O
> campo `attach` é o contrato semântico (mão.L/mão.R/cena) já gravado no
> registro; o parent real ao bone fica como refinamento futuro. Os offsets foram
> escolhidos para ler bem ao lado da personagem no painel/widget.

---

## 4. Mapa acessório → contexto

`accessoryForContext(context)` resolve a melhor prop para a tela; contextos sem
prop útil retornam `null` (para não poluir). Mapa real (`contextAccessory`):

| Contexto | Acessório |
| --- | --- |
| `hours` (Horas) | `clipboard` |
| `expenses` (Despesas) | `clipboard` |
| `projects` (Projetos) | `kanban` |
| `approvals` (Aprovações) | `approval_stamp` |
| `reports` (Relatórios) | `report` |
| `finance` (Financeiro) | `chart` |
| `dashboard` (Dashboard) | `chart` |
| `general`, `clients`, `consultants`, `settings` | `null` |

> O `clock` existe no catálogo/registro mas **não** é mapeado por
> `accessoryForContext` hoje — fica disponível para uso explícito.

---

## 5. Anexação em runtime (`NathaliaModel`)

1. `NathaliaModel` recebe a prop `accessory?: string` e resolve a definição com
   `isAccessoryKey(accessory) ? nathaliaAccessories[accessory] : null`. String
   inválida → sem acessório, sem erro.
2. Se há definição, renderiza `<NathaliaAccessory def=...>` **dentro do group do
   modelo**, envolto em:
   - `NathaliaErrorBoundary fallback={null}` (soft-fail), e
   - `Suspense fallback={null}` (carregamento lazy do GLB).
3. `NathaliaAccessory` faz `useGLTF(accessoryUrl(def.key))`, **clona** a cena
   (`scene.clone(true)` — instâncias nunca colidem) e a posiciona em
   `<group position={def.offset} scale={def.scale}>`.

Assim o GLB do acessório só é buscado **quando** um acessório é pedido, e a
clonagem permite o mesmo acessório em múltiplos avatares simultâneos.

---

## 6. Falha suave (soft-fail)

Um acessório ausente, com 404 ou quebrado **nunca** pode derrubar o avatar:

| Situação | Resultado |
| --- | --- |
| `accessory` undefined / string inválida | nada renderiza (sem erro) |
| Contexto sem prop (`accessoryForContext` → null) | nenhum acessório |
| GLB 404 / quebrado / erro de render | `Suspense` + `NathaliaErrorBoundary` → `fallback={null}`; o avatar segue |
| Erro maior no stack 3D | regras de fallback 2D do avatar continuam valendo (ver R3F §6) |

A garantia em camadas: o erro do acessório é contido **acima** do avatar, então
no pior caso a Nathal.IA aparece **sem** o prop — nunca quebrada.

---

## 7. Relação com master e bundle

- Acessórios são **derivados** e **nunca embutidos** no master (D-001).
- Cada um é um `.glb` independente, servido por HTTP e carregado sob demanda;
  three.js já está num chunk separado (ver R3F §1), e os GLBs de acessório nunca
  entram no bundle inicial.
- Sem dado real / sem valor financeiro nos props (RBAC): gráficos e relatórios
  são **ilustrativos** (barras abstratas), conforme [`ACCESSORIES.md`](./ACCESSORIES.md).

---

## 8. Arquivos desta etapa

| Arquivo | Papel |
| --- | --- |
| `src/nathaliaAccessories.ts` | registro, mapa contexto→acessório, resolvedor de URL |
| `src/NathaliaModel.tsx` | `NathaliaAccessory` (load lazy + clone + offset) sob error boundary + Suspense |
| `scripts/nathalia/blender/construct_accessories.py` | construção dos 6 GLBs |
| `apps/web/public/nathalia/accessories/` | GLBs servidos por HTTP (gitignored) |
