# Prompt Claude Code - Backlog Consultor, Despesas e Launcher

Use este prompt no Claude Code a partir de `C:\Code\jumpflow`.

```text
Leia primeiro o arquivo CLAUDE.md.

Depois leia, nesta ordem:
- docs/backlog-refinado-consultor-operacoes.md
- docs/backlog-correcoes-e-modulos-consultor.md
- docs/backlog-mvp.md
- docs/modelo-dados.md
- docs/arquitetura.md
- docs/auth-foundation.md
- docs/database-foundation.md
- docs/aprovacao-automatica.md
- docs/design-system.md
- docs/identidade-visual-playful-ops.md
- docs/agentes.md
- docs/orquestracao-claude-code.md

Objetivo desta rodada:
Executar a Rodada 1 do backlog refinado: corrigir acoes inertes de Horas, adicionar o modulo Despesas em modo MVP funcional/mockado e transformar `/app` em um launcher operacional por perfil, preservando a sidebar.

Antes de implementar:
1. Rode `git status --short --branch`.
2. Nao sobrescreva alteracoes locais.
3. Se houver arquivos pendentes, analise se sao documentos/agentes esperados. Se forem coerentes, preserve-os.
4. Apresente um plano breve.

Use os agentes:
- jump-product-owner para confirmar escopo e criterios.
- jump-legacy-portal-analyst para comparar com o portal antigo sem expor credenciais.
- jump-timesheet-agent para regras de horas.
- jump-expenses-agent para modulo de despesas.
- jump-operational-launcher-agent para `/app` e atalhos por perfil.
- jump-architect para rotas, RBAC e limites entre mock/persistencia.
- jump-fullstack-engineer para implementacao.
- jump-frontend-ux para experiencia, formularios e responsividade.
- jump-design-system para Playful Ops e acessibilidade.
- jump-qa-engineer para testes.
- jump-code-reviewer para revisao final.

Regras importantes:
- Nao exponha credenciais de `.env.jump`.
- Nao commite `.env`, `.env.jump` ou qualquer segredo.
- Nao quebre Auth Foundation, Database Foundation, automacoes ou deploy Vercel.
- Nao implemente persistencia real em banco nesta rodada, salvo se o plano justificar e for pequeno. O foco e MVP funcional/mockado, com troca futura por Prisma bem preparada.
- Nao deixe botoes visiveis inertes sem feedback.
- Se uma acao ainda nao persistir, ela deve alterar estado local/mock e/ou exibir feedback honesto.
- Manter RBAC em Financeiro e Aprovacoes.
- Adicionar Despesas ao RBAC/navegacao de forma segura.
- Manter Playful Ops sem parallax nos fluxos operacionais.
- Corrigir strings com encoding quebrado que aparecerem nos arquivos tocados.

Escopo de implementacao:

1. Horas - acoes funcionais no MVP
- `Novo lancamento` abre modal/form.
- Form exige projeto, atividade, dia/data, horas e descricao.
- Salvar adiciona/atualiza lancamento em estado local como rascunho.
- `Copiar semana anterior` executa comportamento local/mock e mostra feedback.
- Navegacao semana anterior/proxima altera a semana exibida ou mostra feedback funcional.
- `Enviar para aprovacao` valida a semana e muda status local para enviado.
- Itens enviados/aprovados/fechados nao devem parecer editaveis.
- Criar testes para os fluxos principais.

2. Despesas - modulo MVP
- Criar rota `/app/despesas`.
- Adicionar item Despesas na navegacao.
- Criar mock data centralizado em `apps/web/src/lib/mock-data/expenses.ts`.
- Criar componentes:
  - `ExpenseList`
  - `ExpenseForm`
  - `ExpenseStatusBadge`
  - `ExpensePaymentBadge`
  - `ExpenseSummaryCards`
  - `ExpenseAttachmentField`
- Campos minimos:
  - projeto;
  - cliente;
  - consultor;
  - data;
  - valor;
  - descricao;
  - numero da nota fiscal;
  - comprovante/anexo mockado;
  - status de aprovacao;
  - status de pagamento.
- Acoes MVP:
  - nova despesa;
  - salvar rascunho;
  - enviar para aprovacao;
  - filtrar por status/projeto/periodo quando simples;
  - visualizar comprovante mockado/metadata.
- Criar testes.

3. Aprovacoes
- Preparar a fila para distinguir horas e despesas, mesmo que despesas usem mock nesta rodada.
- Aprovar/reprovar devem ter comportamento local/mock ou feedback funcional.
- Reprovar exige justificativa.
- Garantir que `/app/aprovacoes` continua protegido por role.
- Criar/ajustar testes.

4. Financeiro
- Incluir despesas aprovadas/pagas nos mocks/resumos financeiros, se fizer sentido nesta rodada.
- Nao expor dados financeiros a roles indevidas.
- Criar/ajustar testes quando houver mudanca.

5. Launcher `/app`
- Transformar `/app` em tela inicial com atalhos grandes por perfil.
- Atalhos minimos:
  - Lancar horas;
  - Lancar despesas;
  - Minhas skills/certificados;
  - Meus projetos;
  - Aprovacoes, se role permitir;
  - Financeiro, se role permitir.
- Incluir badges/contadores de pendencias usando dados mockados centralizados.
- Manter sidebar/topbar existentes.
- Criar testes de atalhos por role quando possivel.

6. Documentacao
- Atualizar `docs/backlog-refinado-consultor-operacoes.md` se alguma decisao mudar.
- Se criar convencao nova de mock/interacao, documentar no arquivo mais adequado.

Validações obrigatorias:
- npm run typecheck
- npm run test
- npm run lint
- npm run build

Revisao final:
Use `jump-code-reviewer` e verifique:
- botoes ainda inertes;
- estados locais que fingem persistencia;
- RBAC em Aprovacoes, Financeiro e Despesas;
- acessibilidade dos modais/forms;
- encoding quebrado;
- testes faltantes;
- impacto em automacoes/jobs;
- navegacao e launcher mobile.

Resultado esperado:
- Horas com acoes funcionais no MVP.
- `/app/despesas` criado e navegavel.
- `/app` launcher operacional por perfil.
- Aprovacoes preparadas para horas e despesas.
- Testes, typecheck, lint e build passando.
- Commit:
  `feat: add consultant actions launcher and expenses`
- Push para `origin/main`.

Depois de implementar, valide, revise, commite e faça push.
```

