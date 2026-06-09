# Plano de Desenvolvimento - Redesign Playful Ops

## 1. Objetivo

Aplicar a identidade **JumpFlow Playful Ops** na aplicacao atual, priorizando login, shell, dashboard e componentes compartilhados, sem expandir escopo funcional do MVP.

## 2. Inventario Atual de Telas

### Publicas ou semi-publicas

- `/`: `apps/web/src/app/home-page.tsx`
  - Hoje funciona como uma home/splash com discurso de produto.
  - Recomendacao: remover papel de landing page publica. Redirecionar para login/app ou transformar em splash interno minimo.

- `/login`: `apps/web/src/app/login/login-view.tsx`
  - Tela mais importante para identidade visual nesta fase.
  - Deve receber a camada mais expressiva: Playful Ops, fundo proprio, CTA tatil e possivel 3D/fallback.

- `/access-denied`: `apps/web/src/app/access-denied/page.tsx`
  - Deve seguir a nova linguagem com card forte, mensagem clara e acoes consistentes.

### Area autenticada

- Shell: `AppShell`, `Sidebar`, `Topbar`, `NavItem`
  - Base ja existe e esta consistente.
  - Precisa receber tokens novos, active state mais forte e affordance tatil.

- `/app/dashboard`
  - Tela mais madura hoje.
  - Deve ser usada como referencia para o novo visual operacional.

- `/app/horas`
- `/app/projetos`
- `/app/consultores`
- `/app/skills`
- `/app/certificados`
- `/app/aprovacoes`
- `/app/financeiro`
  - Hoje sao placeholders via `ModulePlaceholder`.
  - Devem receber empty states e paineis de proximos passos alinhados a Playful Ops.

## 3. Componentes Afetados

Prioridade alta:

- `globals.css`
- `focusRing` e fragmentos em `apps/web/src/lib/styles.ts`
- `LoginView`
- `HomePage` ou redirect da rota `/`
- `AppShell`
- `Sidebar`
- `Topbar`
- `NavItem`
- `MetricCard`
- `SectionPanel`
- `StatusBadge`
- `EmptyState`
- `ModulePlaceholder`

Prioridade media:

- `PendingList`
- `AllocationSummary`
- `UpcomingClosings`
- Mock data visual labels, se necessario.

## 4. Fases

### Fase 1 - Fundacao Visual

Entregas:

- Atualizar `docs/design-system.md` com a decisao Playful Ops.
- Atualizar tokens em `globals.css`.
- Criar utilitarios de estilo para borda forte, sombra brutalista e botao tatil.
- Ajustar foco acessivel para nova paleta.

### Fase 2 - Login como Tela de Marca

Entregas:

- Redesenhar `/login`.
- Decidir se usa Three.js nesta fase.
- Se usar Three.js, instalar dependencias e criar componente isolado com fallback.
- Se nao usar Three.js, criar composicao CSS responsiva com blocos/linhas/fluxos.
- Garantir que login funcione em `dev`, `entra` e `unconfigured`.

Recomendacao:

- Comecar sem Three.js se o objetivo for entrega rapida.
- Usar Three.js em uma segunda iteracao se houver tempo para validar renderizacao e performance.

### Fase 3 - Shell e Navegacao

Entregas:

- Sidebar com monograma mais forte.
- Item ativo com borda/sombra Playful Ops.
- Topbar com busca, badges e botoes consistentes.
- Mobile drawer com visual equivalente e foco preservado.

### Fase 4 - Dashboard

Entregas:

- KPIs com borda/sombra/tatilidade.
- Paineis com hierarquia mais clara.
- Badges mais expressivos.
- Listas continuam escaneaveis.

### Fase 5 - Placeholders e Estados Vazios

Entregas:

- Atualizar `ModulePlaceholder`.
- Atualizar `EmptyState`.
- Aplicar novo visual nas rotas ainda nao implementadas.
- Evitar texto explicativo demais dentro da UI.

### Fase 6 - QA e Revisao

Entregas:

- Rodar lint, typecheck e testes existentes.
- Se houver Playwright disponivel ou puder ser adicionado sem excesso, gerar screenshots basicos.
- Usar `jump-code-reviewer` no final.
- Corrigir achados relevantes.

## 5. Agentes Recomendados

Orquestracao principal:

- Claude Code como coordenador.

Agentes:

- `jump-product-owner`: confirmar que nao criaremos landing page publica e que o foco e ferramenta interna.
- `jump-visual-identity`: explorar a direcao Playful Ops e decidir uso de 3D/assets.
- `jump-design-system`: consolidar tokens, componentes e criterios visuais.
- `jump-frontend-ux`: aplicar nas telas e preservar ergonomia.
- `jump-fullstack-engineer`: ajustar rotas, imports, dependencias e integracao Next.js.
- `jump-qa-engineer`: validar testes e cenarios visuais essenciais.
- `jump-code-reviewer`: revisao final.

## 6. Decisoes

- Landing page publica: nao fazer agora.
- Login: sim, deve concentrar a identidade.
- Three.js: permitido, mas nao obrigatorio na primeira entrega.
- Fluxos operacionais: manter limpos, densos e sem efeitos decorativos pesados.
- Neo Brutalism: usar como camada Playful Ops, nao como estilo integral.

## 7. Criterios de Aceite

- O app tem uma identidade visual mais divertida e memoravel.
- Login, shell e dashboard parecem parte do mesmo sistema.
- A rotina operacional continua clara e rapida.
- Nao ha sobreposicao de texto em mobile ou desktop.
- Foco de teclado esta visivel.
- `prefers-reduced-motion` e respeitado.
- Rotas existentes continuam funcionando.
- Lint, typecheck e testes existentes passam ou falhas sao documentadas.
