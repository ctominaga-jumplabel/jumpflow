# Nathal.IA — Sugestões Rápidas Contextuais (Fase 8.1, Etapa 5)

## Problema

As sugestões rápidas não usavam todo o potencial do Context Engine — eram
estáticas demais para o contexto e nem sempre alinhadas às tarefas da tela.

## Objetivo

As sugestões mudam por contexto e refletem o que o usuário realmente faz ali.

## Conjuntos por contexto

Definidos em `nathaliaContext.ts` (`suggestions` de cada contexto):

| Contexto    | Sugestões                                                              |
| ----------- | ---------------------------------------------------------------------- |
| Home/Geral  | Lançar horas · Ver aprovações · Abrir projetos                         |
| Horas       | Como lançar horas? · O que significa cada status? · Como enviar apontamentos? · Tenho horas pendentes? · Me mostre a tela |
| Projetos    | Explicar status · Projetos ativos · Como criar projeto?                |
| Aprovações  | Como aprovar? · O que está pendente? · Explicar fluxo · Me mostre a fila |
| Relatórios  | Como gerar relatório? · Exportações · Filtros                          |

(As demais telas — Despesas, Clientes, Consultores, Financeiro, Acessos —
mantêm sugestões próprias coerentes com o seu conteúdo.)

## Filtro por RBAC (duas camadas)

No `NathaliaChatPanel`:

1. **Acesso à tela**: se o perfil não acessa o contexto atual
   (`canAccessContext`), nenhuma sugestão aparece.
2. **Ação permitida**: chips com `action` só aparecem se
   `canExecuteAction(user, action).allowed`. Assim "Ver aprovações" não é
   oferecido a quem não pode abrir a fila, em vez de oferecer e bloquear.

As **perguntas relacionadas** ("Você também pode perguntar") continuam vindo do
FAQ, já filtradas por perfil.

## Copy (alinhado à Etapa 7)

Os `mockReply` foram encurtados e, quando ajuda, usam bullets (`•`) com
`white-space: pre-line` no render — passos e status ficam escaneáveis.

## Código

- `packages/character-nathalia/src/nathaliaContext.ts`
- `packages/character-nathalia/src/NathaliaChatPanel.tsx`
- `packages/character-nathalia/src/nathaliaPermissions.ts`
