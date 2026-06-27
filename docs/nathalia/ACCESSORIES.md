# Nathal.IA — Acessórios (Accessory Sheet)

> Catálogo definitivo dos **acessórios/props oficiais** da Nathal.IA. Objetos
> opcionais que a personagem segura ou que aparecem ao lado dela para reforçar
> contexto operacional (horas, aprovações, projetos, relatórios). Não gera código
> nem GLB.
>
> Regra-mãe: acessórios são **opcionais e derivados** — a personagem-base
> (`master.glb`) é completa e legível **sem** nenhum deles. Acessórios entram na
> **Fase 6** (animações, shape keys e acessórios), nunca redesenhando a
> personagem (D-001). Cada acessório é um objeto próprio, com material próprio,
> que pode ser anexado à mão (bone `Hand.L`/`Hand.R`) ou posicionado na cena.
>
> Paleta e estilo: [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md).
> Contexto de uso ↔ telas: `nathaliaContext.ts`.
>
> Última atualização: **2026-06-16**.

## Princípios de design dos acessórios

- **Estilizados e foscos**, no mesmo registro da personagem (Playful Ops / Neo
  Brutalism controlado). Silhueta simples, leitura clara em tamanho pequeno.
- **Baixa poligonagem** — somados, não devem comprometer o orçamento web (ver
  [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md) §2/§9). Carregar sob demanda.
- **Paleta restrita:** base preto/branco + **laranja Jump** como acento; cores
  vivas (verde/amarelo/cyan/lilás/coral) **só** para codificar significado
  (sucesso, alerta, info), nunca decorativas.
- **Materiais próprios** por acessório (não reaproveitar `MAT_Body` etc.).
  Convenção sugerida: `MAT_Acc_<Nome>`.
- **Anexáveis:** props de mão seguem o bone da mão; props "de cena" (kanban,
  chart) flutuam ao lado num plano fixo. Nada preso ao corpo de forma fixa.
- **Sem texto real legível** quando possível (usar barras/blocos abstratos) para
  não borrar nem exigir localização/i18n.

---

## 1. clipboard (prancheta)

- **Formato:** prancheta retangular com clipe no topo e uma folha; cantos
  levemente arredondados. Algumas linhas/checkboxes abstratas na folha (sem texto
  real); um ou dois **checks** em verde (`#32d583`).
- **Materiais:** `MAT_Acc_Clipboard` (prancheta off-white/ink), clipe em cinza
  neutro, acento laranja opcional no clipe.
- **Contexto de uso:** horas, aprovações, checklists, tours/onboarding —
  "vamos conferir suas pendências". Segura na mão (`Hand.L`).
- **Requisitos de modelagem:** placa fina (low-poly), folha como plano com leve
  curvatura; checkboxes como decals na textura, não geometria.

## 2. clock (relógio)

- **Formato:** relógio redondo simples (estilo despertador minimalista ou
  relógio de parede), ponteiros grossos legíveis, marca de 12h. Pode ser também
  um relógio de ponto estilizado (cartão + slot) — variante.
- **Materiais:** `MAT_Acc_Clock` (mostrador branco, aro ink), ponteiros escuros,
  acento laranja no ponteiro de segundos opcional.
- **Contexto de uso:** lançamento de horas, prazos, lembretes de prazo, relógio
  de ponto. Segura ou flutua ao lado.
- **Requisitos de modelagem:** disco low-poly, ponteiros como geometria simples
  ou decal; legível a 40–64 px (poucos elementos, alto contraste).

## 3. kanban (quadro kanban)

- **Formato:** mini-quadro com **3 colunas** e alguns **cards** (blocos
  retangulares) distribuídos. Cards em cores de status: cinza (a fazer),
  amarelo/cyan (em andamento), verde (feito). Sem texto.
- **Materiais:** `MAT_Acc_Kanban` (quadro ink/branco), cards coloridos por status
  (verde `#32d583`, amarelo `#ffd43b`, cyan `#39c6d6`).
- **Contexto de uso:** projetos, alocações, acompanhamento de tarefas. Prop "de
  cena" (flutua ao lado da personagem), normalmente **não** segurado.
- **Requisitos de modelagem:** placa + cards como pequenos blocos extrudados;
  manter ≤ ~6–8 cards para leitura limpa.

## 4. report (relatório / documento)

- **Formato:** folha/documento com um **gráfico de barras pequeno** no topo e
  linhas de texto abstratas abaixo; canto superior pode ter um dobra (dog-ear).
- **Materiais:** `MAT_Acc_Report` (papel off-white), barras coloridas discretas,
  acento laranja no cabeçalho opcional.
- **Contexto de uso:** relatórios, indicadores, "te mostro onde ler isso".
  Segura na mão ou apresenta com gesto `explain`.
- **Requisitos de modelagem:** plano fino com leve curvatura; gráfico e linhas
  como decals na textura, não geometria.

## 5. chart (gráfico)

- **Formato:** elemento de dado isolado — **gráfico de barras** (3–4 barras de
  alturas diferentes) **ou** uma seta de tendência para cima. Mais icônico/limpo
  que o `report` (que é um documento inteiro).
- **Materiais:** `MAT_Acc_Chart`; barras em ink/branco com **uma** barra de
  destaque laranja (`#ff7a18`) ou verde (`#32d583`) para tendência positiva.
- **Contexto de uso:** dashboard, financeiro (sem expor valores reais — apenas
  ícone), métricas, "os números estão melhorando". Prop "de cena".
- **Requisitos de modelagem:** barras como blocos extrudados low-poly; seta como
  geometria simples. Foco em silhueta legível em miniatura.

## 6. approval_stamp (carimbo de aprovação)

- **Formato:** carimbo de mão clássico (cabo + base redonda) com um **check** na
  base. Variante "aprovado/reprovado" pela cor: verde (`#32d583`) aprovado,
  coral (`#ff5a5f`) reprovado.
- **Materiais:** `MAT_Acc_Stamp` (cabo ink, base com tinta verde/coral), check
  branco em relevo.
- **Contexto de uso:** aprovações — reforça a ação de aprovar/reprovar
  (sempre com confirmação no produto; o carimbo é visual, não executa nada).
  Segura na mão (`Hand.R`), combina com gesto de "carimbar" (variação de `point`).
- **Requisitos de modelagem:** cabo cilíndrico low-poly + disco da base; o check
  é decal/relevo simples.

---

## Mapa rápido: acessório → contexto → material → modo

| Acessório | Contexto principal | Material | Modo | Acento |
| --- | --- | --- | --- | --- |
| clipboard | horas, aprovações, onboarding | `MAT_Acc_Clipboard` | mão | verde (check) |
| clock | horas, prazos, ponto | `MAT_Acc_Clock` | mão/cena | laranja |
| kanban | projetos, alocações | `MAT_Acc_Kanban` | cena | verde/amarelo/cyan |
| report | relatórios, indicadores | `MAT_Acc_Report` | mão | laranja |
| chart | dashboard, financeiro, métricas | `MAT_Acc_Chart` | cena | laranja/verde |
| approval_stamp | aprovações | `MAT_Acc_Stamp` | mão | verde / coral |

---

## Regras de uso (produto)

- **Nunca obrigatórios:** a personagem funciona 100% sem acessórios; eles são
  reforço de contexto, não dependência.
- **Um de cada vez** (em geral): evitar a personagem "carregada" de props.
- **Coerência de contexto:** o acessório deve casar com a tela atual
  (`nathaliaContext`) — clipboard em horas, kanban em projetos, etc.
- **Sem dado real / sem valor financeiro** nos props (RBAC): gráficos e
  relatórios são **ilustrativos** (barras abstratas), nunca números reais.
- **Derivados do master:** acessórios são modelados/exportados à parte e
  anexados em runtime; **não** alteram o `master.glb` (D-001). Entram na Fase 6.
- **Performance:** carregar sob demanda, low-poly, e contar no orçamento total
  da cena.
