# Design System - JumpFlow

## 1. Direcao Visual

> Direcao atual: **Playful Ops** (implementada). Detalhes em `docs/identidade-visual-playful-ops.md`. Este documento permanece como fonte de verdade dos principios operacionais; a camada Playful Ops define paleta, tokens e tratamento visual ativos.

JumpFlow deve parecer uma aplicacao de trabalho interna rapida e confiavel, com energia visual inspirada em Neo Brutalism controlado: bordas fortes e sombras duras reservadas para elementos de alto valor (CTA, KPIs, cards principais e estados vazios), enquanto listas, tabelas e formularios permanecem limpos e escaneaveis. A experiencia deve transmitir confianca, velocidade e dominio tecnico, sem virar uma landing page de marketing.

Usar o portal da Jump como base de marca, mas nao como copia direta de layout. O portal e institucional; o JumpFlow e uma ferramenta de trabalho diario.

### Tokens e utilitarios

- Tokens vivem em `apps/web/src/app/globals.css` (`@theme inline`).
- Cor `--color-ink` (#111814) e a borda forte e a cor das sombras brutalistas.
- Fragmentos reutilizaveis em `apps/web/src/lib/styles.ts`: `brutalBorder`, `brutalShadow`, `brutalShadowSm`, `brutalShadowPressed`, `tactileButton`, alem de `focusRing` e `focusRingInput`.
- Aplicar borda forte + sombra dura apenas em elementos de alto valor; nunca em linhas de tabela, itens de lista ou campos de formulario.

### Direcao alternativa em validacao: Operational Minimal

> Status: **em validacao lado a lado**, nao aprovada. Playful Ops continua sendo a direcao padrao do produto.

A partir de referencias funcionais trazidas pelo time, existe um segundo tratamento visual servido em rotas paralelas, para o usuario comparar em uso real:

| Tela | Playful Ops (padrao) | Operational Minimal (validacao) |
| --- | --- | --- |
| Horas | `/app/horas` | `/app/horas/nova` |
| Aprovacoes | `/app/aprovacoes` | `/app/aprovacoes/nova` |

As duas rotas de cada par renderizam **o mesmo componente**, com os mesmos dados, os mesmos guards e as mesmas server actions — muda apenas a prop `presentation` (`"brutal"` | `"quiet"`). Isso e deliberado: qualquer divergencia de comportamento entre as rotas contaminaria a comparacao.

O que a direcao quiet muda:

- Moldura: hairline de 1px e raio `--radius-panel` (12px) no lugar da borda ink de 2px + sombra dura.
- Cabecalho de painel: opcional. O titulo sai de dentro do painel e vira `SectionLabel` acima dele.
- Numeros de tempo em `font-mono` (`opsNum`), micro-rotulos em caixa alta com tracking (`opsLabel`).
- KPI sem caixa (`StatTile`) no lugar do `MetricCard`; contagem de fila como `CounterPill`.
- Botoes planos (`ActionButton tactile={false}`).
- Aprovacoes ganha `MonthHeatmap` (panorama consultor x dia) e filtros em disclosure fechado.
- Horas ganha `DayStatusBanner` (estado de hoje em uma frase) e destaque da coluna do dia corrente.

O que a direcao quiet **nao** muda, de proposito:

- A cor de acao continua `--brand` (azul). A referencia usa laranja, mas la o laranja e ao mesmo tempo CTA e "pendente" — no JumpFlow pendencia ja e ambar. Trocar as duas coisas de uma vez impediria atribuir o resultado da validacao a uma causa. Decisao em aberto.
- A sidebar continua clara. Ela e do shell, nao da tela: uma sidebar escura valeria para as duas rotas do par e destruiria a comparacao.
- O lancamento continua em modal (`TimeEntryForm`). O formulario inline da referencia exigiria reescrever a validacao do form; decisao em aberto.

Regra para quem for mexer nessas telas: **nao "corrigir" as rotas `/nova` para o tratamento Playful Ops**. Elas estao assim de proposito ate a direcao ser decidida. Quando for, a rota perdedora, o `ViewSwitch` e a prop `presentation` saem juntos, e esta secao e substituida pela direcao vencedora.

## 2. Principios

- Operacional antes de decorativo.
- Premium por acabamento, nao por excesso.
- Movimento deve explicar estado, foco ou transicao.
- Dashboards devem favorecer leitura rapida.
- Tabelas, filtros e formularios devem ser densos, previsiveis e confortaveis.
- Componentes devem funcionar bem em desktop e mobile.
- Acessibilidade e legibilidade sao obrigatorias.

## 3. Identidade

### Nome

- Nome atual: `JumpFlow`.
- O nome deve permanecer configuravel por `NEXT_PUBLIC_APP_NAME`.

### Marca

- Usar Jump como marca matriz.
- JumpFlow pode ter identidade propria, derivada da Jump.
- Evitar que a interface dependa de uma unica cor.

### Tom Visual

- Corporativo moderno.
- Data/AI/Cloud oriented.
- Limpo, com contraste forte e detalhes refinados.
- Superficies discretas, bordas de 1px e raio baixo.

## 4. Paleta (Playful Ops)

### Cores Base

- Canvas: `#f7f5ea`
- Surface: `#ffffff`
- Surface secundaria: `#eceff3`
- Texto forte / Ink: `#111814`
- Texto medio: `#42524a`
- Texto suave: `#6d756f`
- Borda suave (1px): `#d7d8cf`
- Borda forte / Ink (2px e sombras): `#111814`

### Cores de Acao

- Azul acao: `#2457ff`
- Azul escuro: `#1237b8`
- Azul suave: `#dde4ff`
- Verde sucesso (texto): `#166534`
- Amarelo alerta (texto): `#92400e`
- Vermelho erro (texto): `#b91c1c`

Tons semanticos de texto sao escurecidos para garantir contraste AA (>= 4.5:1) sobre os fundos `*-soft`.

### Acentos Playful Ops (blocos e marcadores, nao texto)

Os acentos vivos abaixo (incluindo o coral `#ff5a5f` da identidade) sao para blocos, chips e marcadores. Nao usar como cor de texto em fundo claro — o contraste e insuficiente.

- Flow green: `#32d583`
- Marker yellow: `#ffd43b`
- Cyan info: `#39c6d6`
- Lilac accent: `#a78bfa`

### Uso

- Azul deve indicar acao, navegacao ativa e destaque operacional.
- Verde deve indicar aprovacao/conclusao.
- Amarelo deve indicar pendencia/risco.
- Vermelho deve indicar erro/reprovacao.
- Backgrounds devem ser neutros para nao competir com dados.

## 5. Tipografia

- Fonte principal: Geist Sans.
- Fonte mono: Geist Mono.
- Evitar letter spacing negativo.
- Evitar escalar fonte por viewport.
- Headings dentro de dashboards devem ser contidos.
- Hero-scale type deve aparecer apenas em telas institucionais, onboarding ou login.

## 6. Layout

### Aplicacao

- Usar shell com sidebar ou topbar conforme fase.
- Conteudo principal com largura responsiva.
- Formularios em paineis simples.
- Tabelas com filtros persistentes e estados claros.
- Dashboards com bandas e grids, evitando card dentro de card.

### Cards

- Raio maximo sugerido: 6px a 8px.
- Usar cards para itens repetidos, KPIs, modais e ferramentas enquadradas.
- Evitar paginas compostas so por cards decorativos.

## 7. Componentes

Componentes iniciais esperados:

- Button.
- Input.
- Select.
- Textarea.
- Checkbox.
- Switch.
- Badge.
- Table.
- Tabs.
- Dialog.
- Toast.
- Empty state.
- KPI tile.
- Data filter bar.

Componentes podem ser inspirados por 21st.dev, mas devem ser adaptados ao design system JumpFlow.

## 8. Movimento

### Biblioteca

- Usar `motion`.
- Importar de `motion/react`.

### Permitido

- Entrada suave de paineis.
- Transicao de abas.
- Hover/focus em botoes e itens clicaveis.
- Abertura/fechamento de dialogs.
- Skeleton/loading refinado.
- Microinteracoes em cards de KPI.

### Evitar

- Parallax no fluxo principal de trabalho.
- Scroll effects em telas de lancamento/aprovacao de horas.
- Animacoes longas.
- Movimento que atrase acao do usuario.
- Animacoes que prejudiquem acessibilidade ou legibilidade.

### Onde Parallax Pode Fazer Sentido

- Login.
- Onboarding.
- Tela de apresentacao executiva.
- Pagina publica futura do produto.

## 9. Referencias e Ferramentas

### Portal Jump

Usar como referencia de marca, narrativa e setor.

### UI/UX Pro Max Skill

Usar como apoio para:

- gerar/revisar design system;
- validar anti-patterns;
- comparar estilos;
- revisar acessibilidade;
- polir telas importantes.

A skill esta instalada em `.claude/skills/ui-ux-pro-max/`.

Nao usar para substituir as decisoes documentadas aqui. Ela deve funcionar como repertorio e auditoria.

### 21st.dev

Usar para buscar componentes React/Tailwind quando acelerar a entrega. Todo componente importado/adaptado deve:

- respeitar a paleta JumpFlow;
- passar por revisao de acessibilidade;
- nao adicionar dependencias desnecessarias;
- nao criar estilos incompatíveis com o app.

## 10. Checklist de Qualidade Visual

- A tela permite completar a tarefa sem friccao?
- Existe contraste suficiente?
- Estados de loading, vazio, erro e sucesso foram tratados?
- O texto cabe no componente em mobile e desktop?
- A animacao ajuda a entender a interface?
- O componente parece parte do JumpFlow?
- O design continua utilizavel sem animacao?
