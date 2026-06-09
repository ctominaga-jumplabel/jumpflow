# Identidade Visual - JumpFlow Playful Ops

## 1. Decisao

A nova direcao visual do JumpFlow sera **Playful Ops**: uma aplicacao operacional, rapida e confiavel, com energia visual inspirada em Neo Brutalism, mas controlada para uso diario.

O objetivo nao e transformar o produto em uma experiencia decorativa. O objetivo e fazer uma rotina naturalmente repetitiva, como lancamento e aprovacao de horas, parecer mais clara, tatil e menos cansativa.

## 2. Por que nao uma landing page

Como o JumpFlow e uma ferramenta interna, uma landing page publica nao e prioridade.

Direcao recomendada:

- A pagina de login deve carregar a identidade visual principal.
- A rota `/` pode redirecionar para `/app/dashboard` quando autenticado ou `/login` quando nao autenticado.
- Se a rota `/` continuar existindo durante o MVP, ela deve funcionar como splash interno simples, nao como pagina de marketing.
- A identidade mais expressiva deve aparecer em login, onboarding futuro, empty states e estados de sucesso.

## 3. Personalidade

- Direta.
- Leve.
- Energetica.
- Profissional.
- Um pouco divertida, sem perder confianca.

Frase-guia:

> Trabalho operacional nao precisa parecer arrastado.

## 4. Principios Visuais

- Usar Neo Brutalism como sotaque, nao como excesso.
- Priorizar legibilidade em tabelas, formularios e dashboards.
- Dar mais presenca a acoes, status, KPIs e estados vazios.
- Criar uma sensacao tatil: botoes que parecem pressionaveis, cards com peso, badges como etiquetas.
- Evitar uma paleta de uma cor so.
- Usar movimento para feedback, transicao e recompensa curta.
- Preservar acessibilidade e responsividade.

## 5. Paleta Proposta

### Base

- Canvas: `#f7f5ea`
- Surface: `#ffffff`
- Surface muted: `#eceff3`
- Ink: `#111814`
- Text medium: `#42524a`
- Text soft: `#6d756f`
- Border strong: `#111814`
- Border soft: `#d7d8cf`

### Acentos

- Action blue: `#2457ff`
- Action blue dark: `#1237b8`
- Flow green: `#32d583`
- Marker yellow: `#ffd43b`
- Coral danger: `#ff5a5f`
- Cyan info: `#39c6d6`
- Lilac accent: `#a78bfa`

## 6. Tokens e Estilo

Aplicar no Tailwind via `apps/web/src/app/globals.css`.

Regras recomendadas:

- Raio baixo: `6px` a `8px`.
- Borda padrao operacional: `1px solid var(--color-border)`.
- Borda de elementos Playful Ops: `2px solid var(--color-ink)`.
- Sombra brutalista: `4px 4px 0 var(--color-ink)`.
- Sombra pressionada: `1px 1px 0 var(--color-ink)`.
- Transicao curta: `120ms` a `180ms`.
- Evitar letter spacing negativo.
- Nao escalar fonte com viewport.

## 7. Uso por Area

### Login

Tela mais expressiva da fase inicial.

Deve conter:

- Marca JumpFlow em bloco forte.
- Card de login com borda forte e sombra dura.
- Fundo com composicao visual propria.
- Opcional: cena Three.js ou composicao CSS com blocos, linhas e fluxo.
- CTA tatil.

### App Shell

Deve ficar mais marcante, mas ainda denso.

Mudancas:

- Sidebar com bordas mais fortes.
- Item ativo com bloco colorido e borda escura.
- Monograma com sombra dura.
- Topbar mais limpa, com busca e acoes consistentes.

### Dashboard

Deve ser o primeiro exemplo da nova linguagem operacional.

Mudancas:

- KPIs com sombra dura discreta.
- Icones em blocos coloridos.
- Status mais contrastados.
- Paineis com bordas fortes apenas quando forem containers importantes.
- Listas internas continuam limpas para leitura.

### Horas

Quando o fluxo for implementado, deve ser o principal caso de Playful Productivity.

Direcao:

- Lancamento semanal rapido.
- Semana como grade clara.
- Acoes recorrentes como "copiar semana anterior" bem visiveis.
- Feedback visual curto ao salvar/enviar.
- Sem 3D, parallax ou decoracao que atrapalhe preenchimento.

### Aprovacoes

Direcao:

- Fluxo de triagem.
- Status em etiquetas fortes.
- Acoes em lote claras.
- Diferenciar pendente, aprovado, reprovado e autoaprovado visualmente.

### Modulos Placeholder

Hoje muitos modulos ainda usam `ModulePlaceholder`.

Atualizar para:

- Empty states com mais personalidade.
- Blocos de proximos passos com borda forte.
- Pequenas ilustracoes CSS/SVG ou assets bitmap leves.

## 8. Three.js

Three.js deve ser usado apenas onde agrega marca ou compreensao.

Usar em:

- Login.
- Onboarding futuro.
- Empty states especiais.
- Visualizacao executiva futura de fluxo/capacidade.

Evitar em:

- Lancamento de horas.
- Aprovacoes.
- Tabelas.
- Formularios.
- Financeiro operacional.

Dependencias sugeridas:

- `three`
- `@react-three/fiber`
- `@react-three/drei`

Validacao obrigatoria se usar 3D:

- Renderiza em desktop e mobile.
- Respeita `prefers-reduced-motion`.
- Nao bloqueia login.
- Nao causa layout shift.
- Tem fallback visual sem WebGL.

## 9. Ferramentas Recomendadas

- Figma: exploracao de identidade, tokens e componentes.
- Tokens Studio: sincronizacao futura de tokens.
- React Three Fiber + Drei: 3D dentro de React.
- Spline: prototipacao rapida de cenas 3D.
- Rive: microinteracoes e ilustracoes animadas.
- Motion: transicoes funcionais ja existentes no projeto.
- Lucide React: iconografia principal.
- Storybook: catalogo de componentes, se o design system crescer.
- Playwright: screenshots de regressao visual.
- 21st.dev: inspiracao/adaptacao de componentes React/Tailwind.

## 10. Criterios de Qualidade

- A tela ficou mais gostosa de usar sem ficar mais lenta?
- O usuario entende rapidamente o que precisa fazer?
- A informacao principal continua legivel?
- O estilo aparece nos lugares certos?
- O texto cabe em mobile e desktop?
- O movimento tem funcao?
- O app continua profissional para gestores e financeiro?
