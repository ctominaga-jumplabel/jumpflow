# ADR 0001 — RBAC configurável por matriz de permissões

- **Status:** Aceito
- **Data:** 2026-06-23
- **Contexto técnico:** [rbac-matriz-permissoes.md](../rbac-matriz-permissoes.md)

## Contexto

O JumpFlow tinha RBAC funcional porém **estático em código**: os 7 grupos no
enum `RoleName` e as regras de acesso espalhadas em arrays de papéis
(`FINANCIAL_ROLES`, `PROJECT_WRITE_ROLES`, …) em `route-permissions.ts` e em ~12
módulos de *visibility* por domínio. Mudar quem acessa o quê exigia editar
código e fazer deploy. O pedido: uma tela administrativa para configurar
permissões por grupo (Ver/Criar/Editar/Excluir), com hierarquia de módulos,
grupos e funcionalidades dinâmicos, proteção de menu e rota, auditoria e
segurança contra auto-elevação — adaptado ao padrão existente, sem duplicar
mecanismos de auth.

## Decisões

### D1 — Camada aditiva, não substituição

A matriz no banco vira a fonte configurável que dirige o **menu** e um novo
**guard de rota** (`requirePermission`); os guards estáticos atuais continuam
intactos e migram incrementalmente. O seed reproduz o comportamento estático.

**Por quê:** reescrever os 40+ pontos de gating (financeiro, talentos,
aprovações) de uma vez é alto risco de regressão e retrabalho de testes, sem
ganho imediato. A camada aditiva entrega a configurabilidade pedida com
risco baixo e permite migração gradual. (Trade-off: por um período os dois
mecanismos coexistem; o seed garante que não divergem no dia 1.)

### D2 — Resolver permissões por `roleId`, não pelo enum `RoleName`

A permissão efetiva é resolvida pelas linhas de papel do usuário
(`User → UserRole → Role → RolePermission`), independentemente do enum.

**Por quê:** desacopla o motor do conjunto fixo de 7 papéis. Grupos criados
dinamicamente (sem `name` de enum, identificados por `key`) concedem permissões
pelo mesmo caminho — sem refatorar a camada de auth. O enum permanece só para
os guards estáticos legados e para o pipeline `AppUser.roles` existente.

### D3 — Reutilizar `AuditEvent` em vez de criar `PermissionAudit`

A auditoria usa o `AuditEvent` genérico (`actor`, `entityType`, `entityId`,
`action`, `before`, `after`, `createdAt`).

**Por quê:** o `AuditEvent` já existe e seu próprio comentário o destina a
mudanças de papel/permissão; `setUserRoles` já o usa (`ROLE_GRANTED/REVOKED`).
Criar uma tabela paralela duplicaria infraestrutura e fragmentaria a trilha de
auditoria. Os campos pedidos para `PermissionAudit` (usuário, role, ação, antes,
depois, data_hora) mapeiam 1:1 nos campos do `AuditEvent`.

### D4 — Enforcement de rota no layout via `x-pathname`, não na proxy edge

A `proxy.ts` continua só com autenticação (edge, sem Prisma — restrição
deliberada documentada em `auth-foundation`). O callback `authorized`
(já o ponto de decisão de acesso) anota a requisição com o header `x-pathname`;
o layout de `/app` lê esse header e aplica `requirePermission` para a rota ativa.

**Por quê:** a matriz precisa de Prisma para ser consultada, o que é proibido no
edge. Pôr o header no `authorized` mantém o gate no lugar que já existe (sem
duplicar lógica no proxy) e dá ao server component o pathname de forma edge-safe.
**Limitação aceita:** o layout compartilhado roda em hard load (acesso direto à
URL — exatamente o requisito "proteger URL diretamente"), não em navegação
client-side entre irmãos; por isso rotas sensíveis mantêm seus guards de página
e recomenda-se `requirePermission` nas novas páginas sensíveis.

### D5 — "Somente ADMIN edita permissões" + invariante da última autoridade

As actions da matriz são gateadas por `requireRole(["ADMIN"])`; alterar o grupo
Administrador exige confirmação extra; e o domínio rejeita qualquer mudança que
deixe zero grupos ativos com `view+edit` em `CONFIGURACOES_PERMISSOES`
(`LAST_ADMIN_PERMISSION`), além de proteger grupos do sistema.

**Por quê:** atende literalmente os requisitos de segurança (auto-elevação,
lockout, "não remover a última permissão administrativa") reusando o espírito do
invariante last-admin já presente em `invitations.ts`.

### D6 — Server Actions, não REST

As APIs CRUD são Server Actions retornando `ActionResult<T>`, seguindo o padrão
de `app/app/admin/acessos/actions.ts`.

**Por quê:** consistência com toda a base; validação server-side com Zod,
autorização no servidor e mapeamento uniforme de erros já são o padrão do projeto.

## Consequências

- **Positivas:** configuração sem deploy; grupos/funcionalidades dinâmicos;
  trilha de auditoria única; risco de regressão baixo; caminho claro para FLS/RLS,
  escopo por projeto/cliente e Entra ID.
- **Negativas / dívidas:** coexistência temporária do RBAC estático e da matriz
  (o seed os mantém alinhados); enforcement de rota forte só em hard load até a
  migração das páginas; atribuição de usuários a grupos **dinâmicos** ainda passa
  pela tela de Acessos (que hoje lida com os 7 do sistema) — próximo incremento.
