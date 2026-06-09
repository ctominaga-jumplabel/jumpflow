# Prompt para Claude Code - Redesign Playful Ops

Use o prompt abaixo em uma nova conversa com Claude Code para executar o desenvolvimento.

```text
Voce esta no repositorio JumpFlow.

Objetivo:
Implementar a nova identidade visual "JumpFlow Playful Ops": uma aplicacao interna de trabalho com energia inspirada em Neo Brutalism, mas otimizada para produtividade, legibilidade e uso diario.

Contexto obrigatorio:
- Leia `CLAUDE.md`.
- Leia `docs/design-system.md`.
- Leia `docs/identidade-visual-playful-ops.md`.
- Leia `docs/plano-redesign-playful-ops.md`.
- Leia `docs/agentes.md`.
- Leia `docs/orquestracao-claude-code.md`.

Direcao de produto:
- O JumpFlow e uma ferramenta interna para consultores, gestores, RH, financeiro e operacao.
- Nao criar landing page publica neste momento.
- A pagina de login deve carregar a identidade visual principal.
- A rota `/` deve deixar de parecer landing page publica. Preferencialmente, redirecione para `/app/dashboard` quando autenticado ou `/login` quando nao autenticado; se isso nao for simples com a arquitetura atual, transforme em splash interno minimo.
- Mantenha o foco em login, app shell, dashboard, componentes compartilhados e placeholders.

Agentes:
1. Use `jump-product-owner` para confirmar escopo: sem landing publica, foco em login + app interno.
2. Use `jump-visual-identity` para refinar a direcao Playful Ops e decidir se Three.js entra nesta primeira entrega.
3. Use `jump-design-system` para atualizar tokens, regras visuais e componentes base.
4. Use `jump-frontend-ux` para redesenhar telas e preservar ergonomia.
5. Use `jump-fullstack-engineer` para implementar os ajustes em Next.js/React/Tailwind.
6. Use `jump-qa-engineer` para definir e executar validacoes.
7. Use `jump-code-reviewer` antes de finalizar e corrija achados relevantes.

Implementacao esperada:
- Atualizar `docs/design-system.md` para registrar Playful Ops como direcao atual.
- Atualizar tokens em `apps/web/src/app/globals.css`.
- Criar ou ajustar utilitarios em `apps/web/src/lib/styles.ts` para:
  - foco acessivel;
  - sombra brutalista;
  - borda forte;
  - botao tatil.
- Redesenhar:
  - `apps/web/src/app/login/login-view.tsx`
  - `apps/web/src/app/home-page.tsx` ou a rota `/`
  - `apps/web/src/app/access-denied/page.tsx`
  - `apps/web/src/components/app-shell/AppShell.tsx`
  - `apps/web/src/components/app-shell/Sidebar.tsx`
  - `apps/web/src/components/app-shell/Topbar.tsx`
  - `apps/web/src/components/app-shell/NavItem.tsx`
  - `apps/web/src/components/ui/MetricCard.tsx`
  - `apps/web/src/components/dashboard/SectionPanel.tsx`
  - `apps/web/src/components/ui/StatusBadge.tsx`
  - `apps/web/src/components/ui/EmptyState.tsx`
  - `apps/web/src/components/ui/ModulePlaceholder.tsx`
- Atualizar dashboard se necessario:
  - `KpiGrid`
  - `PendingList`
  - `AllocationSummary`
  - `UpcomingClosings`

Three.js:
- Three.js e permitido, mas nao obrigatorio.
- Se usar, instale `three`, `@react-three/fiber` e `@react-three/drei`.
- Use 3D somente no login ou em um componente visual isolado.
- Inclua fallback sem WebGL.
- Respeite `prefers-reduced-motion`.
- Valide visualmente desktop e mobile.
- Nao use 3D nos fluxos operacionais de horas, aprovacoes, tabelas, formularios ou financeiro.

Regras visuais:
- Use Playful Ops: Neo Brutalism controlado + produtividade.
- Use bordas fortes e sombras duras em elementos de alto valor: CTA, KPIs, cards principais e estados vazios.
- Preserve listas, formularios e tabelas escaneaveis.
- Evite decoracao que atrapalhe leitura.
- Nao use hero de marketing.
- Nao use gradientes/orbs decorativos como base da identidade.
- Garanta mobile sem texto cortado ou sobreposto.
- Respeite acessibilidade e foco de teclado.

Validacoes:
- Rode `npm run lint`.
- Rode `npm run typecheck`.
- Rode `npm run test` se viavel.
- Inicie o dev server e valide manualmente as telas principais:
  - `/login`
  - `/`
  - `/access-denied`
  - `/app/dashboard`
  - `/app/horas`
  - `/app/aprovacoes`
- Se houver falhas de ambiente, documente claramente.

Antes de finalizar:
- Use `jump-code-reviewer`.
- Corrija bugs ou riscos relevantes.
- Entregue um resumo com:
  - arquivos alterados;
  - decisao sobre Three.js;
  - validacoes executadas;
  - riscos restantes;
  - URL local para teste, se o servidor estiver rodando.
```
