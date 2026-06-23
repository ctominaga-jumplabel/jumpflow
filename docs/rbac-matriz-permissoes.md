# Controle de Acesso — Matriz de Permissões (RBAC configurável)

Documentação técnica do módulo de Controle de Acesso baseado em matriz de
permissões. Decisões arquiteturais em [adr/0001-rbac-matriz-permissoes.md](adr/0001-rbac-matriz-permissoes.md).

## 1. Objetivo

Permitir que um administrador **não técnico** configure, por grupo de acesso,
o que cada funcionalidade do sistema permite (**Ver / Criar / Editar /
Excluir**) — sem alterar código nem fazer deploy. A configuração vive no banco
e é a fonte de verdade lida em tempo de execução para **menu** e **proteção de
rota**.

A solução é **aditiva**: o RBAC estático anterior (arrays de papéis em
`apps/web/src/lib/auth/route-permissions.ts` e módulos de *visibility* por
domínio) continua válido e migra de forma incremental. O seed reproduz o
comportamento estático, então ligar a matriz **não muda nada no dia 1**.

## 2. Modelo de dados (`packages/database/prisma/schema.prisma`)

| Entidade | Papel |
| --- | --- |
| `Role` (estendida) | Grupo de acesso. `name` (enum `RoleName`) só para os 7 grupos do sistema; grupos dinâmicos têm `name = null` e usam `key` (slug). Campos: `key`, `label`, `description`, `active`, `isSystem`, `createdAt`, `updatedAt`. |
| `Permission` | Funcionalidade (módulo/submódulo). `code` (estável, UPPER_SNAKE), `name`, `module` (rótulo do grupo), `description`, `active`, `parentId` (hierarquia self-relation), `sortOrder`. |
| `RolePermission` | Célula da matriz: `@@id([roleId, permissionId])` + `canView/canCreate/canEdit/canDelete`. Ausência de linha = tudo negado. |
| `AuditEvent` (reutilizada) | Trilha de auditoria de toda mudança (não há tabela `PermissionAudit` própria — ver ADR). |

Migration: `prisma/migrations/20260623120000_rbac_permission_matrix`. Puramente
aditiva; faz backfill de `key/label/isSystem` nos 7 grupos e relaxa `Role.name`
para nullable.

## 3. Resolução de permissões (por `roleId`, não pelo enum)

O princípio central: a permissão efetiva de um usuário é resolvida pelas
**linhas de papel do usuário** (`User → UserRole → Role → RolePermission`), e
**não** pelo enum `RoleName`. Isso faz a matriz funcionar igualmente para grupos
do sistema e para grupos dinâmicos futuros.

- `apps/web/src/lib/auth/permission-codes.ts` (puro, edge-safe): `PermissionAction`,
  `PermissionMatrix`, `aggregateRolePermissions` (regra de **união** entre papéis —
  concede se qualquer papel conceder), `matrixAllows`, `filterViewableCodes`,
  `fullControlMatrix`, e a constante `MANAGE_PERMISSIONS_CODE = "CONFIGURACOES_PERMISSOES"`.
- `apps/web/src/lib/db/permissions.ts` (server/Prisma): `loadPermissionMatrixForUser`,
  reads para a tela (`listRoles`, `listPermissions`, `listAllRoleMatrices`) e o
  CRUD auditado (`setRolePermissions`, `upsertPermission`, `setPermissionActive`,
  `upsertRole`, `setRoleActive`).
- `apps/web/src/lib/auth/permissions.ts` (integra usuário atual): `getCurrentMatrix`
  (memoizado por request com `cache()`) e `can(code, action)`.

### Semântica de resolução

| Contexto | Matriz efetiva |
| --- | --- |
| Dev mode (`AUTH_DEV_MODE`) | **Controle total** (DEV_USER tem todos os papéis). |
| Sem banco configurado | **Controle total** — não há matriz; os guards estáticos seguem valendo (sem regressão offline). |
| Sessão real + banco | Matriz **persistida** é autoritativa. Erro de banco → **falha fechada** (matriz vazia), igual à resolução de papéis. |

## 4. Middleware de autorização

```ts
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/guards";

await can("HORAS", "edit");            // boolean
await requirePermission("HORAS", "view"); // redirect → /access-denied (403) se negar
```

`requirePermission` é o par configurável de `requireRole`. Ambos convivem.

## 5. Proteção de rotas (403)

- `apps/web/src/auth.config.ts` (`authorized`): após autenticar, anota a
  requisição com o header `x-pathname` (edge-safe — só headers, sem Prisma).
- `apps/web/src/app/app/layout.tsx`: lê `x-pathname`, resolve o item de nav ativo
  (`findActiveNav`) e, havendo `permissionCode`, aplica `requirePermission(code, "view")`.
  Isso cobre **acesso direto por URL** para toda rota mapeada, em um único lugar.

> Nota: o layout compartilhado de `/app` roda no carregamento da URL (hard load),
> não em navegação client-side entre irmãos. Por isso rotas sensíveis mantêm
> também seus guards de página (`requireRole`/`requirePermission`). Recomenda-se
> adicionar `requirePermission` nas novas páginas sensíveis (migração incremental).

## 6. Proteção de menus

`NavItemDef` ganhou `permissionCode`. No `layout`, `filterViewableCodes` calcula
os códigos que o usuário pode **ver** (escopo do catálogo de nav) e passa via
`AppShell → Sidebar`. Itens **com** `permissionCode` são exibidos só se a matriz
conceder `view` (assim o admin controla a visibilidade pela própria matriz);
itens **sem** código mantêm o gate de papel legado.

## 7. Auditoria

Toda mudança chama `recordAuditEvent` (`apps/web/src/lib/db/audit.ts`) gravando
`actorUserId` (id real via `resolveDbUser`), `entityType`, `entityId`, `action`,
`before`, `after`. Ações: `PERMISSION_MATRIX_UPDATED`, `PERMISSION_CREATED/UPDATED/
ACTIVATED/DEACTIVATED`, `ROLE_CREATED/UPDATED/ACTIVATED/DEACTIVATED`.

## 8. Segurança / invariantes

- **Somente ADMIN edita permissões**: todas as server actions em
  `app/app/admin/permissoes/actions.ts` são gateadas por `requireRole(["ADMIN"])`.
- **Anti auto-elevação / lockout**: alterar o grupo *Administrador* exige
  `confirmAdminChange: true` (modal de confirmação extra).
- **Última permissão administrativa**: `setRolePermissions`/`setRoleActive`
  rejeitam (`LAST_ADMIN_PERMISSION`) qualquer mudança que deixe **zero** grupos
  ativos com `view+edit` em `CONFIGURACOES_PERMISSOES`. Não é possível desativar
  um grupo do sistema (`SYSTEM_ROLE_PROTECTED`) nem desativar a própria
  funcionalidade de gestão da matriz.

## 9. Tela administrativa

`/app/admin/permissoes` (item "Matriz de Permissões" em Administração). Componente
`components/admin/PermissionMatrixView.tsx`: seletor de grupo, busca, módulos
recolhíveis, grid de checkboxes (Ver/Criar/Editar/Excluir), ações em lote
(Controle total, Somente leitura, Marcar/Desmarcar tudo), rascunho + "Salvar
alterações" (envia apenas o diff → auditoria com before/after) e confirmação
extra para o grupo Administrador.

## 10. Seed inicial

`packages/database/prisma/seed.mjs`: `seedRoles` (metadados), `seedPermissions`
(catálogo de módulos/submódulos) e `seedRolePermissions` (matriz inicial que
espelha os arrays estáticos atuais; ADMIN = controle total). Idempotente.

## 11. Evolução futura (schema já preparado)

Sem refatoração estrutural, dá para adicionar: **permissões por projeto/cliente/
unidade**, **field-level (FLS)** e **row-level (RLS)** via colunas
`scopeType/scopeId` nullable em `RolePermission` ou uma tabela `PermissionScope`;
e **grupos dinâmicos** completos (criação + atribuição a usuários) — a resolução
por `roleId` já suporta. Integração com **Entra ID** (mapear app roles/groups →
`Role`) também encaixa sem mudar o motor.

## Deploy

Esta máquina não roda `db:deploy` (rede restrita ao banco). Antes de mergear na
`main` (auto-deploy Vercel não roda migrate): aplicar
`npm run -w @jumpflow/database db:deploy` e depois `db:seed` a partir de um
ambiente com acesso ao banco. Ver memória `deploy-migrations-gate`.
