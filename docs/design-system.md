# Design System - JumpFlow

## 1. Direcao Visual

JumpFlow deve parecer uma aplicacao SaaS empresarial premium: clara, precisa, moderna e operacional. A experiencia deve transmitir confianca, velocidade e dominio tecnico, sem virar uma landing page animada.

Usar o portal da Jump como base de marca, mas nao como copia direta de layout. O portal e institucional; o JumpFlow e uma ferramenta de trabalho diario.

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

## 4. Paleta Inicial

### Cores Base

- Background principal: `#f6f7f2`
- Surface: `#ffffff`
- Surface secundaria: `#eef3f7`
- Texto forte: `#111814`
- Texto medio: `#4b6358`
- Texto suave: `#6f7f77`
- Borda: `#d9ded4`

### Cores de Acao

- Azul acao: `#2563eb`
- Azul escuro: `#1d4ed8`
- Verde sucesso: `#16a34a`
- Amarelo alerta: `#d97706`
- Vermelho erro: `#dc2626`

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
