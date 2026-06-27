# Nathal.IA — Plano de Refinamento das Roupas (Fase 7 · Etapa 4)

> **Plano de refinamento do vestuário** da Nathal.IA — camiseta (com wordmark
> `jump`), calça e tênis. Documenta o que o builder V2 (`construct_master_v2.py`)
> já entregou, o que ainda está simples e os próximos passos. Objetivo: roupa
> **casual-profissional, legível em tamanho pequeno**, com identidade Jump no
> ponto certo (acento, nunca decoração).
>
> Hierarquia de canon: [`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md) **vence**; a
> [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md) é a folha visual
> definitiva (roupa, paleta, materiais); este plano detalha a evolução do
> vestuário dentro desse canon e do contrato técnico
> ([`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md): 7 objetos, 7 materiais,
> 16 bones). Não gera código nem GLB.
>
> Última atualização: **2026-06-17**.

---

## Resumo em uma frase

A V2 deu **gola careca, mangas curtas com punho e ombro/colarinho** à camiseta
(com o wordmark `jump` redimensionado e recentralizado no peito), **joelho,
panturrilha e punho de tornozelo** à calça, e **solado + biqueira** ao tênis —
deixando a roupa mais "real" e tátil sem estourar o contrato de 7 materiais
(o laranja Jump fica **reservado** para um decal futuro / acessórios).

---

## Princípios (inegociáveis)

- **Casual-profissional.** Confortável, nunca terno engessado, nunca
  sensual/justo. Caimento natural (não justo, não oversized).
- **Base escura + branco.** Preto/branco como base; **laranja Jump é o único
  destaque de marca** e entra só como acento pontual (1 detalhe).
- **Leitura pequena.** Silhueta tem que fechar a 40–64 px: tênis claro contra
  calça escura "ancora" a figura embaixo; logo legível, não borrado.
- **Logo protegido.** Wordmark `jump` branco em UV/superfície própria
  (`MAT_Logo`), na área reservada do peito — não distorce com o caimento e não
  some em tamanho pequeno.
- **Contrato preservado.** Roupa = 3 objetos (`Shirt`, `Pants`, `Shoes`) +
  `Logo`; materiais `MAT_Shirt`/`MAT_Pants`/`MAT_Shoes`/`MAT_Logo`. **Sem novo
  material** para o acento laranja na base.

---

## Camiseta (`MAT_Shirt` `#111814` · logo `MAT_Logo` `#ffffff`)

### Feito na V2

| Item | O que a V2 fez | Como (no builder) | Estado |
| --- | --- | --- | --- |
| **Torso** | Cilindro de tronco com caimento solto. | `_shirt_torso` (cilindro `r=0.165`, escala achatada). | **Feito** |
| **Gola careca** | Anel raso e largo de gola, lido como abertura crew (não "gravata"). | `torus` baixo em `z≈Z_SHOULDER`, achatado. | **Feito** |
| **Mangas curtas** | Manga modelada por lado + **anel de punho**. | `capsule` ombro→meio-braço + `torus` punho por lado. | **Feito** |
| **Ombro/colarinho** | Massa de ombro fechando a gola. | `sphere` achatada em `z=Z_SHOULDER`. | **Feito** |
| **Wordmark `jump`** | Redimensionado para **0.055** e **recentralizado** no peito. | `_make_logo` (texto → mesh, `MAT_Logo`). | **Feito** |

### Simples ainda / futuro

- **Costas lisas** (correto no canon) — nenhuma estampa traseira no MVP.
- **Dobras de pano** ainda são insinuadas pela forma, não modeladas/texturizadas.
- **Futuro:** **costuras estilizadas** (gola, mangas, barra) como linha discreta
  via textura/decal, não geometria; **volume leve** de tecido (dobras suaves nos
  punhos e barra); leve sombra de dobra estilizada no material (ver
  [`MATERIAL_REFINEMENT_PLAN.md`](./MATERIAL_REFINEMENT_PLAN.md)).
- **Futuro:** manter a **área reservada** do peito (~1,2 HU × 0,4 HU) livre para
  rebrand — o logo é configurável (ver `CLAUDE.md`).

---

## Calça (`MAT_Pants` `#2b3340`)

### Feito na V2

| Item | O que a V2 fez | Como (no builder) | Estado |
| --- | --- | --- | --- |
| **Quadril** | Bloco de quadril ancorando as pernas. | `box` em `z≈Z_HIP`. | **Feito** |
| **Coxa/panturrilha** | Cápsulas de coxa e canela por perna. | `capsule` quadril→joelho e joelho→tornozelo. | **Feito** |
| **Joelho** | Esfera de joelho dando dobra/leitura. | `sphere` no joelho por lado. | **Feito** |
| **Punho de tornozelo** | Anel de barra no tornozelo. | `torus` no tornozelo por lado. | **Feito** |

### Simples ainda / futuro

- **Cor dessaturada** correta (`#2b3340`) — escura para não competir com o
  laranja Jump. Alt. sarja `#2f3338` permanece opção de canon.
- **Futuro:** dobras suaves estilizadas em joelho/tornozelo (geometria leve ou
  material); leve afunilamento até o tornozelo para reforçar o caimento "reto/
  levemente afunilado" do canon; melhorar a **leitura visual** da transição
  quadril→coxa (hoje o bloco de quadril aparece um pouco "caixa" no 3/4).

---

## Tênis (`MAT_Shoes` `#ece9e0`)

### Feito na V2

| Item | O que a V2 fez | Como (no builder) | Estado |
| --- | --- | --- | --- |
| **Corpo low-top** | Caixa do corpo do tênis, baixa e arredondada. | `box` corpo por pé. | **Feito** |
| **Solado** | Caixa de solado **mais clara/larga** que o corpo. | `box` solado (mais largo) por pé. | **Feito** |
| **Biqueira** | Capa de biqueira arredondada. | `sphere` achatada na ponta por pé. | **Feito** |

### Simples ainda / futuro

- **Acento laranja Jump (`#ff7a18`) NÃO foi adicionado na V2** — reservado de
  propósito para **manter o contrato de 7 materiais**.
- **Futuro — identidade mais forte (o tênis é onde a marca pode "assinar"):**
  - **Decal laranja** (cadarço **ou** etiqueta — 1 detalhe só) como **UV/decal
    separada** no objeto `Shoes`, **sem** criar um 8º material da base — o laranja
    deve viver em **textura/decal** ou nos **acessórios GLB**, nunca como material
    base da personagem.
  - **Cadarços como massa** (não fios) para leitura a 40–64 px.
  - Solado levemente mais claro que o corpo (já insinuado) reforçado no material.

---

## Próximos passos concretos (prioridade)

1. **Decal laranja no tênis** (cadarço/etiqueta) como UV separada — assinatura de
   marca embaixo, mantendo 7 materiais. **Maior ganho de identidade.**
2. **Costuras estilizadas da camiseta** (gola/mangas/barra) via textura/decal.
3. **Dobras suaves de pano** (camiseta e calça) — geometria leve + material.
4. **Afunilamento da calça** até o tornozelo e suavização do bloco de quadril.

> Regra de composição: a personagem **não pode ficar colorida demais**. Laranja
> Jump é o único destaque de marca e entra como **acento pontual**; tudo o mais
> é base escura + branco + pele.

---

## Critérios de aceite (roupa)

- [ ] Camiseta preta `#111814` + wordmark `jump` branco minúsculo, centralizado e
      **legível a 40–64 px**, sem distorção.
- [ ] Calça escura dessaturada (`#2b3340`); silhueta fecha com tênis claro.
- [ ] Tênis claro `#ece9e0` legível contra a calça escura.
- [ ] Laranja Jump **só** como acento (1 detalhe), **fora** dos 7 materiais base
      (decal/UV ou acessório).
- [ ] Costas da camiseta lisas; área reservada do peito preservada.
- [ ] Roupa casual-profissional — nunca terno, nunca justa/sensual.
- [ ] Contrato preservado: 7 objetos / 7 materiais / 16 bones.
- [ ] Alinhado à seção **ROUPA** e **PALETA** da
      [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md).
