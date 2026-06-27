# Nathal.IA — Tooling Guide (Fase 8)

> Como adicionar ferramentas (tools) com segurança. Código em
> `packages/character-nathalia/src/intelligence/tools/` e
> `packages/character-nathalia/src/nathaliaActions.ts`.

## Regra de ouro

Nesta fase **não existe tool de escrita**. Tudo é navegação, UI (destaque) ou
tour. Qualquer tool sensível fica **bloqueada** e, se um dia habilitada, **exige
confirmação explícita**. Nenhuma ação ocorre sem passar pelo RBAC.

## Camadas

- `nathaliaActions.ts` — define a `NathaliaActionId`, a metadata
  (`sensitivity`, `requiresConfirmation`) e o **runtime bound** (router, DOM,
  store) via `createNathaliaActions`.
- `tools/ToolRegistry.ts` — a camada de descoberta/segurança: metadados de tool
  (`kind`, `targetContext`), busca por contexto e `canRun` (delegado a
  `canExecuteAction`).

A tool referencia uma `NathaliaActionId`, então execução e RBAC reusam o que já
existe.

## `NathaliaTool`

```ts
interface NathaliaTool {
  id: NathaliaActionId;          // = id da action
  kind: "navigation" | "ui" | "tour";
  label: string;
  description: string;
  sensitivity: "safe" | "navigation" | "sensitive";
  requiresConfirmation: boolean;
  targetContext?: NathaliaContextKey; // navegação/tour → tela alvo
}
```

O brain usa `targetContext` para escolher a composição visual (acessório/clipe) e
para bloquear navegação a uma tela sem permissão (`canAccessContext`).

## Adicionando uma tool segura

1. **Action** em `nathaliaActions.ts`: adicione a `NathaliaActionId`, a entrada
   em `nathaliaActions`, o runner em `createNathaliaActions` (apenas
   navegação/destaque/tour — **sem escrita**).
2. **Registry** em `ToolRegistry.ts`: adicione o `NathaliaTool` com `kind` e
   `targetContext`.
3. **RBAC**: navegação para tela restrita já é barrada por `canAccessContext`; se
   a tool tocar tópico sensível, marque `sensitivity: "sensitive"` (ficará
   bloqueada por `canExecuteAction`).
4. Teste no Lab e confirme o gate com um perfil sem acesso.

## Se um dia precisar de uma tool sensível (futuro)

- `sensitivity: "sensitive"` + `requiresConfirmation: true`.
- `canExecuteAction` deve liberar só após **confirmação explícita** do usuário.
- A execução deve gerar **auditoria** (como aprovações/alocações).
- Documente a ameaça em [`INTELLIGENCE_SECURITY.md`](./INTELLIGENCE_SECURITY.md).

## Execução no host

O `NathaliaProvider` só roda automaticamente tools que **não** pedem confirmação
(navegação/tour). Tools com `requiresConfirmation` nunca rodam sozinhas — o fluxo
de confirmação é responsabilidade do host.
